/* FAINTR website bridge (main thread). Loads before app.js.
   - Starts the core worker, which runs FAINTR's engine and app logic on the visitor's device.
   - Answers the same /api/... calls the desktop app's server does, so app.js works unchanged.
   - Keeps the Roster and saved teams in this browser for guests, or in Supabase for signed-in users.
   - Sign in / sign up, bug reports and the admin "update data now" button. */
(function () {
  const CFG = window.FAINTR_CONFIG || {};
  // Pure account tools are bundled into the bridge by the site builder.
  const VIP = window.FAINTR_VIP_TOOLS;
  const patches = window.FAINTR_STORAGE_PATCHES;
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
  const listeners = new Set();
  const state = { manifest: null, worker: null, user: null, profile: null, sb: null, doc: null, progress: null, membership: { active: false }, authNotice: null };
  // Keep a safe explanation before the SDK consumes the callback. Never display
  // arbitrary callback descriptions or credentials from the address bar.
  const callbackParams = new URL('https://callback.invalid/?' + (location.hash || '').replace(/^#/, '')).searchParams;
  if (callbackParams.has('error') || callbackParams.has('error_description')) {
    state.authNotice = callbackParams.get('error_code') === 'otp_expired'
      ? 'This email link is invalid or has expired. Request a new confirmation email below and use the newest message. If you already confirmed, try signing in.'
      : 'The sign-in link could not be completed. Try signing in, or request a new confirmation email below if your email is not confirmed.';
  }
  const emit = (reason) => listeners.forEach((fn) => { try { fn(state, reason); } catch (e) { /* ignore */ } });

  // ---------- Supabase (optional until configured)
  const sbReady = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
  if (sbReady) state.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

  // ---------- storage: this browser for guests, the account for signed-in users
  const KEY_R = 'faintr.web.roster', KEY_S = 'faintr.web.saved';
  // The Roster belongs to each trainer's account. Guests can browse everything else; their Roster is empty
  // until they sign in. (Before accounts are set up, e.g. a preview build, it falls back to this browser.)
  const needAccount = () => { throw new Error('Sign in to save Pokémon to your Roster. Each account has its own.'); };
  const local = {
    rosterAll: async () => (sbReady ? [] : LS.get(KEY_R, [])),
    rosterUpsert: async (e,expected) => { if (sbReady) needAccount();patches.assertCurrent(LS.get(KEY_R,[]).find(x=>x.uid===e.uid),expected); return local.rosterUpsertMany([e]).then(() => e); },
    rosterUpsertMany: async (list) => {
      if (sbReady) needAccount();
      const l = LS.get(KEY_R, []);
      for (const e of list) { const i = l.findIndex((x) => x.uid === e.uid); if (i >= 0) l[i] = e; else l.push(e); }
      if (!LS.set(KEY_R, l)) throw new Error('This browser is out of storage space.');
    },
    rosterInsertMany: async list=>{if(sbReady)needAccount();if(!LS.set(KEY_R,patches.insertRoster(LS.get(KEY_R,[]),list)))throw Error('This browser is out of storage space.');},
    rosterRemove: async (uid) => { if (sbReady) needAccount(); const l = LS.get(KEY_R, []); const gone = l.find((x) => x.uid === uid) || null; if(!LS.set(KEY_R, l.filter((x) => x.uid !== uid)))throw Error('Could not remove this Pokémon because browser storage is unavailable.'); return gone; },
    savedAll: async () => LS.get(KEY_S, []),
    savedUpsert: async (t) => local.savedUpsertMany([t]).then(() => t),
    savedUpsertMany: async (list) => {
      const l = LS.get(KEY_S, []);
      for (const t of list) { const i = l.findIndex((x) => x.id === t.id); if (i >= 0) l[i] = t; else l.push(t); }
      if (!LS.set(KEY_S, l)) throw new Error('This browser is out of storage space. Sign in to save teams to your account.');
    },
    savedRemove: async (id) => { if(!LS.set(KEY_S, LS.get(KEY_S, []).filter((x) => x.id !== id)))throw Error('Could not remove this team because browser storage is unavailable.'); },
    rosterRefreshMany: async updates=>{if(sbReady)needAccount();if(!LS.set(KEY_R,patches.refresh(LS.get(KEY_R,[]),updates,'roster')))throw Error('This browser is out of storage space.');},
    savedRefreshMany: async updates=>{if(!LS.set(KEY_S,patches.refresh(LS.get(KEY_S,[]),updates,'saved')))throw Error('This browser is out of storage space.');},
  };

  // Signed in: everything the trainer saves is ONE row in user_storage (roster and teams as JSON).
  // Each save bumps "version"; if another device saved in between, we reload and re-apply the change,
  // so two phones editing at once never wipe each other's Pokémon.
  // A copy is cached in this browser and only re-downloaded when the version changes (saves Supabase egress).
  const cacheKey = () => `faintr.cloud.${state.user.id}`;
  const cloud = {
    async load(fresh) {
      const userId = state.user.id;
      if (state.doc && !fresh) return state.doc;
      const cached = LS.get(cacheKey(), null);
      const head = await state.sb.from('user_storage').select('version').eq('user_id', userId).maybeSingle();
      if (state.user?.id !== userId) throw new Error('Your account changed. Please try again.');
      if (head.error) throw new Error(`Couldn't load your account data: ${head.error.message}`);
      if (!head.data) {
        const ins = await state.sb.from('user_storage').insert({ user_id: state.user.id, roster: [], teams: [], version: 1 });
        if (ins.error && ins.error.code !== '23505') throw new Error(`Couldn't set up your account storage: ${ins.error.message}`);
        if (state.user?.id !== userId) throw new Error('Your account changed. Please try again.');
        if (ins.error) return cloud.load(true); // made by another tab a moment ago
        state.doc = { roster: [], teams: [], battles: [], vip_settings: {}, version: 1 };
      } else if (cached && Array.isArray(cached.battles) && cached.vip_settings && cached.version === head.data.version) {
        state.doc = cached;
      } else {
        const full = await state.sb.from('user_storage').select('roster, teams, battles, vip_settings, version').eq('user_id', state.user.id).single();
        if (full.error) throw new Error(`Couldn't load your account data: ${full.error.message}`);
        if (state.user?.id !== userId) throw new Error('Your account changed. Please try again.');
        state.doc = { roster: full.data.roster || [], teams: full.data.teams || [], battles: full.data.battles || [], vip_settings: full.data.vip_settings || {}, version: full.data.version };
      }
      LS.set(cacheKey(), state.doc);
      return state.doc;
    },
    async change(fn) {
      const userId = state.user.id;
      for (let attempt = 0; attempt < 4; attempt++) {
        const doc = await cloud.load(attempt > 0);
        if (state.user?.id !== userId) throw new Error('Your account changed. Please try again.');
        const next = { roster: doc.roster.slice(), teams: doc.teams.slice(), battles: (doc.battles || []).slice(), vip_settings: { ...(doc.vip_settings || {}) } };
        const result = fn(next);
        const size = JSON.stringify(next).length;
        if (size > 3000000) throw new Error('Your account storage is full (about 3 MB). Remove some Pokémon or teams.');
        const r = await state.sb.from('user_storage').update({ ...next, version: doc.version + 1, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('version', doc.version).select('version');
        if (state.user?.id !== userId) throw new Error('Your account changed. Please reload.');
        if (r.error) throw new Error(`Couldn't save: ${r.error.message}`);
        if (r.data && r.data.length) {
          state.doc = { ...next, version: r.data[0].version };
          LS.set(cacheKey(), state.doc);
          return result;
        }
        // Someone else (another tab or device) saved first: reload and try again
      }
      throw new Error('Your data changed on another device. Reload the page and try again.');
    },
    rosterAll: async () => (await cloud.load()).roster,
    rosterInsertMany: list=>cloud.change(d=>{d.roster=patches.insertRoster(d.roster,list);}),
    rosterUpsert: (e,expected) => cloud.change(d=>{const i=d.roster.findIndex(x=>x.uid===e.uid);patches.assertCurrent(d.roster[i],expected);if(i>=0)d.roster[i]=e;else d.roster.push(e);return e;}),
    rosterUpsertMany: (list) => cloud.change((d) => { for (const e of list) { const i = d.roster.findIndex((x) => x.uid === e.uid); if (i >= 0) d.roster[i] = e; else d.roster.push(e); } }),
    rosterRemove: (uid) => cloud.change((d) => { const gone = d.roster.find((x) => x.uid === uid) || null; d.roster = d.roster.filter((x) => x.uid !== uid); return gone; }),
    savedAll: async () => (await cloud.load()).teams,
    savedUpsert: (t) => cloud.savedUpsertMany([t]).then(() => t),
    savedUpsertMany: (list) => cloud.change((d) => { for (const t of list) { const i = d.teams.findIndex((x) => x.id === t.id); if (i >= 0) d.teams[i] = t; else d.teams.push(t); } }),
    savedRemove: (id) => cloud.change((d) => { d.teams = d.teams.filter((x) => x.id !== id); }),
    rosterRefreshMany: updates=>cloud.change(d=>{d.roster=patches.refresh(d.roster,updates,'roster');}),
    savedRefreshMany: updates=>cloud.change(d=>{d.teams=patches.refresh(d.teams,updates,'saved');}),
  };
  const billing = {
    enabled: false,
    hasAccess: () => !billing.enabled || !!(state.user && state.membership.active && (state.membership.plan === 'lifetime' || Date.parse(state.membership.expiresAt) > Date.now())),
    async refresh() {
      const userId = state.user?.id;
      if (!userId || !billing.enabled) { state.membership = { active: false }; return state.membership; }
      const { data, error } = await state.sb.rpc('membership_status');
      if (error) throw new Error('Could not check membership. Please try again.');
      if (state.user?.id === userId) {
        const changed = JSON.stringify(state.membership) !== JSON.stringify(data || { active: false });
        state.membership = data || { active: false };
        if (changed) emit('membership');
      }
      return state.membership;
    },
    async call(body) {
      if (!state.user) throw new Error('Sign in before choosing a plan.');
      const { data, error } = await state.sb.functions.invoke('billing', { body });
      if (error) { let message = 'Billing is temporarily unavailable.'; try { message = (await error.context.json()).error || message; } catch (_) {} throw new Error(message); }
      return data;
    },
    async checkout() {
      if (!CFG.patreonReady) throw new Error('Patreon memberships are being connected. New signups are paused; your existing access is unchanged.');
      location.assign(CFG.patreonUrl);
    },
    async portal() { location.assign('https://www.patreon.com/settings/memberships'); },
    async exportData() {
      if (!state.user) throw new Error('Sign in to download your data.');
      const { data, error } = await state.sb.rpc('export_my_storage');
      if (error) throw new Error('Could not download your data.');
      return data;
    },
  };
  const requirePremium = () => { if (!billing.hasAccess()) { const e = new Error('FAINTR VIP unlocks Anti-Meta, Pokémon storage and saved teams.'); e.code = 402; throw e; } };
  const store = () => {
    const source = state.user ? cloud : local;
    return new Proxy(source, { get(target, name) { const fn = target[name]; return typeof fn === 'function' ? (...args) => { requirePremium(); return fn(...args); } : fn; } });
  };
  async function premiumAnti(format) {
    if (!billing.enabled) return null;
    requirePremium();
    const { data } = await state.sb.auth.getSession();
    if (!data.session) throw new Error('Sign in again.');
    const response = await fetch('/api/premium/antimeta?f=' + encodeURIComponent(format), { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load Anti-Meta. Check your membership and try again.');
    return response.json();
  }

  // ---------- core worker
  let reqId = 0, authEpoch = 0;
  const waiting = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  function rejectPending(error) {
    for(const p of waiting.values())p.reject(error);
    waiting.clear();
  }
  async function startWorker() {
    const epoch=authEpoch;
    let resolveBoot,rejectBoot;
    state.workerReady=new Promise((resolve,reject)=>{resolveBoot=resolve;rejectBoot=reject;});
    state.workerReady.catch(()=>{});
    state.workerError=null;
    try {
    if(!state.manifest) {
      const r = await fetch('/manifest.json', { cache: 'no-store' });
      if (!r.ok) throw new Error("FAINTR's data isn't published yet.");
      state.manifest = await r.json();
    }
    if(epoch!==authEpoch)throw new Error('Your account changed. Please try again.');
    const w = new Worker('/' + state.manifest.files['core.js']);
    state.worker = w;
    const fail=message=>{
      if(state.worker!==w)return;
      const error=new Error(message||'The FAINTR engine stopped. Reload the page and try again.');
      state.workerError=error;rejectBoot(error);readyReject(error);rejectPending(error);
      w.terminate();
    };
    w.onmessage = async (e) => {
      if(state.worker!==w||epoch!==authEpoch)return;
      const m = e.data;
      if (m.type === 'ready') { resolveBoot(); return readyResolve(); }
      if (m.type === 'fatal') return fail(m.error);
      if (m.type === 'progress') { state.progress = m; emit('progress'); return; }
      if (m.type === 'storage') {
        const reply=payload=>{if(state.worker===w&&epoch===authEpoch)w.postMessage(payload);};
        try { const result = m.op === 'premiumAnti' ? await premiumAnti(...m.args) : await store()[m.op](...m.args); reply({ type: 'storage-reply', id: m.id, result }); }
        catch (err) { reply({ type: 'storage-reply', id: m.id, error: err.message }); }
        return;
      }
      const p = waiting.get(m.id); if (!p) return;
      waiting.delete(m.id);
      if (m.error) { const err = new Error(m.error); err.code = m.code; err.stale = m.stale; p.reject(err); } else p.resolve(m.result);
    };
    w.onerror = () => fail('The FAINTR engine stopped. Reload the page and try again.');
    w.postMessage({ type: 'init', manifest: state.manifest });
    } catch(error) { rejectBoot(error);if(epoch===authEpoch){state.workerError=error;readyReject(error);rejectPending(error);}throw error; }
    return state.workerReady;
  }
  async function callCore(method, path, q, body) {
    const epoch=authEpoch;
    await state.workerReady;
    if(epoch!==authEpoch)throw new Error('Your account changed. Please try again.');
    if(state.workerError)throw state.workerError;
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      waiting.set(id, { resolve, reject });
      state.worker.postMessage({ type: 'api', id, method, path, q, body });
    });
  }

  // ---------- the API app.js talks to
  async function api(url,body){
    const epoch=authEpoch,result=await dispatchApi(url,body);
    if(epoch!==authEpoch)throw new Error('Your account changed. Please try again.');
    return result;
  }
  async function dispatchApi(url, body) {
    const epoch=authEpoch;
    await ready;
    if(epoch!==authEpoch)throw new Error('Your account changed. Please try again.');
    const u = new URL(url, location.origin);
    const p = u.pathname, q = Object.fromEntries(u.searchParams), method = body === undefined ? 'GET' : 'POST';
    if (p.startsWith('/api/vip/')) {
      requirePremium();
      if (!state.user) throw new Error('Sign in to save your battle history. All tools are free.');
      if (p === '/api/vip/battles' && method === 'GET') return (await cloud.load(true)).battles || [];
      if (p === '/api/vip/battles' && method === 'POST') return cloud.change(d => {
        if (d.battles.length >= 2000) throw new Error('Your battle log holds 2,000 entries. Download your data before removing older entries.');
        const entry = VIP.battleEntry(body, d.teams, state.manifest.formats); d.battles.push(entry); return entry;
      });
      if (p === '/api/vip/battles/delete') return cloud.change(d => { d.battles = d.battles.filter(b => b.id !== body.id); return { ok: true }; });
      if (p === '/api/vip/alerts') {
        await callCore('POST', '/core/regrade', {}, {});
        const doc = await cloud.load(); return VIP.teamAlerts(doc.teams, doc.vip_settings?.seenAlerts || []);
      }
      if (p === '/api/vip/alerts/read') return cloud.change(d => {
        const allowed = new Set(VIP.teamAlerts(d.teams).map(a => a.token));
        d.vip_settings.seenAlerts = [...new Set([...(d.vip_settings.seenAlerts || []), ...(body.tokens || []).filter(t => allowed.has(t))])].slice(-1000);
        return { ok: true };
      });
    }
    if (p === '/api/query' && body?.mode === 'anti') requirePremium();
    if (/^\/api\/(roster|saved)(\/|$)/.test(p)) {
      // Empty lists let free browsing start without loading private account data.
      if (!billing.hasAccess() && method === 'GET' && (p === '/api/roster' || p === '/api/saved')) return [];
      requirePremium();
      if(state.user&&method==='GET'&&(p==='/api/roster'||p==='/api/saved'))await cloud.load(true);
    }
    // Website-only answers
    if (p === '/api/status') {
      return { update: { running: false, stage: 'idle', message: '' }, builds: {}, settings: { autoUpdate: true, lastCheck: null },
        schedule: { supported: false }, platform: 'web', web: webInfo() };
    }
    if (p === '/api/settings' || p === '/api/schedule') return {};
    if (p === '/api/update') return devUpdate(body || {});
    if (p === '/api/dev/runs') return devRuns();
    if (p === '/api/format/build') return devUpdate({ force: true, formats: body.f });
    if (p === '/api/roster/export') return { app: 'FAINTR', version: state.manifest.appVersion, exported: new Date().toISOString(), roster: (await store().rosterAll()).map(({ image, ...e }) => e) };
    if (p === '/api/bugs') return method === 'GET' ? listBugs() : submitBug(body);
    try {
      return await callCore(method, p, q, body);
    } catch (e) {
      if (e.stale) { location.reload(); } // a new data version was published while this page was open
      throw e;
    }
  }
  function webInfo() {
    const m = state.manifest || {};
    return { built: m.built, pvpoke: m.pvpoke, admin: !!(state.profile && state.profile.is_admin), signedIn: !!state.user, cloud: sbReady, rosterNeedsAccount: sbReady && !state.user };
  }

  // ---------- accounts
  async function loadProfile() {
    state.profile = null;
    if (!state.user) return;
    const userId=state.user.id;
    const { data } = await state.sb.from('profiles').select('display_name, is_admin').eq('id', userId).maybeSingle();
    if(state.user?.id===userId)state.profile = data || { display_name: null, is_admin: false };
  }
  async function onAuth(session) {
    const was = state.user && state.user.id;
    state.user = session ? session.user : null;
    state.doc = null;
    if ((state.user && state.user.id) !== was) {
      authEpoch++;
      // Undo buffers and in-flight jobs belong to the account that created them.
      // Replace that worker so delayed storage calls cannot cross an account switch.
      if(state.worker||state.workerReady) {
        if(state.worker)state.worker.terminate();state.worker=null;
        rejectPending(new Error('Your account changed. Please try again.'));
        startWorker().catch(()=>{});
      }
      if(was)try{localStorage.removeItem(`faintr.cloud.${was}`);}catch(_){}
      state.profile=null;
      // Clear the previous account's visible data before a profile/network lookup
      // can delay the normal signed-in notification.
      emit('auth-changing');
      state.membership = { active: false };
      await billing.refresh().catch(() => {});
      await loadProfile().catch(() => {});
      emit('auth');
    }
  }
  const auth = {
    available: sbReady,
    async signUp(email, password, name) {
      const { data, error } = await state.sb.auth.signUp({ email, password, options: { data: { display_name: name || '' }, emailRedirectTo: location.origin } });
      if (error) throw error;
      return data;
    },
    async signIn(email, password) { const { error } = await state.sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
    async magicLink(email) { const { error } = await state.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } }); if (error) throw error; },
    async resendConfirmation(email) { const { error } = await state.sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: location.origin } }); if (error) throw error; },
    async oauth(provider) { const { error } = await state.sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } }); if (error) throw error; },
    async resetPassword(email) { const { error } = await state.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }); if (error) throw error; },
    async updatePassword(password) { const { error } = await state.sb.auth.updateUser({ password }); if (error) throw error; },
    async signOut() { const {error}=await state.sb.auth.signOut();if(error)throw new Error('Could not sign out. Please retry before leaving this device.');try{if(state.user)localStorage.removeItem(cacheKey());}catch(_){} },
    async setName(name) {
      const { error } = await state.sb.from('profiles').update({ display_name: String(name).slice(0, 40) }).eq('id', state.user.id);
      if (error) throw error;
      await loadProfile(); emit('auth');
    },
    // What's saved in this browser from before signing in
    localCounts: () => ({ roster: LS.get(KEY_R, []).length, saved: LS.get(KEY_S, []).length }),
    async moveLocalToAccount() {
      requirePremium();
      const r = LS.get(KEY_R, []), t = LS.get(KEY_S, []);
      await cloud.change((d) => {
        const haveR = new Set(d.roster.map((e) => e.uid)), haveT = new Set(d.teams.map((x) => x.id));
        d.roster.push(...r.filter((e) => !haveR.has(e.uid))); d.teams.push(...t.filter((x) => !haveT.has(x.id)));
      });
      LS.set(KEY_R, []); LS.set(KEY_S, []);
      return { roster: r.length, saved: t.length };
    },
    async deleteAccount() {
      if (billing.enabled) await billing.call({ action: 'delete-account' });
      else {
        const { error } = await state.sb.rpc('delete_my_account');
        if (error) throw new Error(`Couldn't delete the account: ${error.message}`);
      }
      try { localStorage.removeItem(cacheKey()); } catch (e) { /* ignore */ }
      await state.sb.auth.signOut().catch(() => {});
    },
    // Delete everything this account has saved (the account itself is removed from Supabase's dashboard)
    async deleteAccountData() {
      await cloud.change((d) => { d.roster = []; d.teams = []; });
      try { localStorage.removeItem(cacheKey()); } catch (e) { /* ignore */ }
    },
  };

  // ---------- admin: update the data now (runs the GitHub Action through a Supabase Edge Function)
  async function devCall(payload) {
    if (!sbReady || !state.user) throw new Error('Sign in with an admin account first.');
    const { data, error } = await state.sb.functions.invoke('trigger-update', { body: payload });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { /* keep message */ }
      throw new Error(msg);
    }
    return data;
  }
  async function devUpdate(body) {
    const r = await devCall({ action: 'run', force: !!body.force, formats: body.formats || '' });
    return { running: true, stage: 'queued', message: r && r.message ? r.message : 'Update started. New data goes live in about 5 to 60 minutes, depending on how much changed.' };
  }
  const devRuns = () => devCall({ action: 'status' });

  // ---------- bug reports
  async function submitBug(b) {
    if (!sbReady) throw new Error('Bug reports aren\'t connected yet. Please report it on Discord for now.');
    const row = {
      category: String(b.category || 'bug').slice(0, 30), title: String(b.title || '').slice(0, 120), details: String(b.details || '').slice(0, 5000),
      steps: String(b.steps || '').slice(0, 3000), email: state.user ? state.user.email : String(b.email || '').slice(0, 200) || null,
      page: String(b.page || '').slice(0, 200), format: String(b.format || '').slice(0, 60), app_version: state.manifest && state.manifest.appVersion,
      data_version: state.manifest && state.manifest.pvpoke, user_agent: navigator.userAgent.slice(0, 300),
    };
    if (!row.title || row.details.length < 10) throw new Error('Add a short title and a few words about what happened.');
    const { error } = await state.sb.from('bug_reports').insert(row);
    if (error) throw new Error(`Couldn't send the report: ${error.message}`);
    return { ok: true };
  }
  async function listBugs() {
    const { data, error } = await state.sb.from('bug_reports').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data;
  }
  async function setBugStatus(id, status) {
    const { error } = await state.sb.from('bug_reports').update({ status }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  window.FAINTR_BRIDGE = { api, ready, auth, billing, state, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, webInfo, setBugStatus, config: CFG };

  (async () => {
    try {
      if (sbReady) {
        const { data, error } = await state.sb.auth.getSession();
        if (error && !state.authNotice) state.authNotice = 'Your sign-in could not be completed. Please try signing in again. If your email is not confirmed, request a new confirmation email below.';
        if (state.authNotice && typeof history !== 'undefined') {
          const clean = new URL(location.href);
          for (const key of ['error', 'error_code', 'error_description']) callbackParams.delete(key);
          clean.hash = callbackParams.toString();
          history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
        }
        await onAuth(data?.session || null);
        state.sb.auth.onAuthStateChange((event, session) => {
          // Run requests after Supabase releases its auth callback lock.
          setTimeout(async () => { await onAuth(session); if (event === 'PASSWORD_RECOVERY') emit('password-recovery'); }, 0);
        });
      }
      await startWorker();
    } catch (e) { readyReject(e); }
  })();
})();
