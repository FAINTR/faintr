/* FAINTR website bridge (main thread). Loads before app.js.
   - Starts the core worker, which runs FAINTR's engine and app logic on the visitor's device.
   - Answers the same /api/... calls the desktop app's server does, so app.js works unchanged.
   - Keeps the Roster and saved teams in this browser for guests, or in Supabase for signed-in users.
   - Sign in / sign up, bug reports and the admin "update data now" button. */
(function () {
  const CFG = window.FAINTR_CONFIG || {};
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } } };
  const listeners = new Set();
  const state = { manifest: null, worker: null, user: null, profile: null, sb: null, doc: null, progress: null };
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
    rosterUpsert: async (e) => { if (sbReady) needAccount(); return local.rosterUpsertMany([e]).then(() => e); },
    rosterUpsertMany: async (list) => {
      if (sbReady) needAccount();
      const l = LS.get(KEY_R, []);
      for (const e of list) { const i = l.findIndex((x) => x.uid === e.uid); if (i >= 0) l[i] = e; else l.push(e); }
      if (!LS.set(KEY_R, l)) throw new Error('This browser is out of storage space.');
    },
    rosterRemove: async (uid) => { if (sbReady) needAccount(); const l = LS.get(KEY_R, []); const gone = l.find((x) => x.uid === uid) || null; LS.set(KEY_R, l.filter((x) => x.uid !== uid)); return gone; },
    savedAll: async () => LS.get(KEY_S, []),
    savedUpsert: async (t) => local.savedUpsertMany([t]).then(() => t),
    savedUpsertMany: async (list) => {
      const l = LS.get(KEY_S, []);
      for (const t of list) { const i = l.findIndex((x) => x.id === t.id); if (i >= 0) l[i] = t; else l.push(t); }
      if (!LS.set(KEY_S, l)) throw new Error('This browser is out of storage space. Sign in to save teams to your account.');
    },
    savedRemove: async (id) => { LS.set(KEY_S, LS.get(KEY_S, []).filter((x) => x.id !== id)); },
  };

  // Signed in: everything the trainer saves is ONE row in user_storage (roster and teams as JSON).
  // Each save bumps "version"; if another device saved in between, we reload and re-apply the change,
  // so two phones editing at once never wipe each other's Pokémon.
  // A copy is cached in this browser and only re-downloaded when the version changes (saves Supabase egress).
  const cacheKey = () => `faintr.cloud.${state.user.id}`;
  const cloud = {
    async load(fresh) {
      if (state.doc && !fresh) return state.doc;
      const cached = LS.get(cacheKey(), null);
      const head = await state.sb.from('user_storage').select('version').eq('user_id', state.user.id).maybeSingle();
      if (head.error) throw new Error(`Couldn't load your account data: ${head.error.message}`);
      if (!head.data) {
        const ins = await state.sb.from('user_storage').insert({ user_id: state.user.id, roster: [], teams: [], version: 1 });
        if (ins.error && ins.error.code !== '23505') throw new Error(`Couldn't set up your account storage: ${ins.error.message}`);
        if (ins.error) return cloud.load(true); // made by another tab a moment ago
        state.doc = { roster: [], teams: [], version: 1 };
      } else if (cached && cached.version === head.data.version) {
        state.doc = cached;
      } else {
        const full = await state.sb.from('user_storage').select('roster, teams, version').eq('user_id', state.user.id).single();
        if (full.error) throw new Error(`Couldn't load your account data: ${full.error.message}`);
        state.doc = { roster: full.data.roster || [], teams: full.data.teams || [], version: full.data.version };
      }
      LS.set(cacheKey(), state.doc);
      return state.doc;
    },
    async change(fn) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const doc = await cloud.load(attempt > 0);
        const next = { roster: doc.roster.slice(), teams: doc.teams.slice() };
        const result = fn(next);
        const size = JSON.stringify(next).length;
        if (size > 3000000) throw new Error('Your account storage is full (about 3 MB). Remove some Pokémon or teams.');
        const r = await state.sb.from('user_storage').update({ roster: next.roster, teams: next.teams, version: doc.version + 1, updated_at: new Date().toISOString() })
          .eq('user_id', state.user.id).eq('version', doc.version).select('version');
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
    rosterUpsert: (e) => cloud.rosterUpsertMany([e]).then(() => e),
    rosterUpsertMany: (list) => cloud.change((d) => { for (const e of list) { const i = d.roster.findIndex((x) => x.uid === e.uid); if (i >= 0) d.roster[i] = e; else d.roster.push(e); } }),
    rosterRemove: (uid) => cloud.change((d) => { const gone = d.roster.find((x) => x.uid === uid) || null; d.roster = d.roster.filter((x) => x.uid !== uid); return gone; }),
    savedAll: async () => (await cloud.load()).teams,
    savedUpsert: (t) => cloud.savedUpsertMany([t]).then(() => t),
    savedUpsertMany: (list) => cloud.change((d) => { for (const t of list) { const i = d.teams.findIndex((x) => x.id === t.id); if (i >= 0) d.teams[i] = t; else d.teams.push(t); } }),
    savedRemove: (id) => cloud.change((d) => { d.teams = d.teams.filter((x) => x.id !== id); }),
  };
  const store = () => (state.user ? cloud : local);

  // ---------- core worker
  let reqId = 0;
  const waiting = new Map();
  let readyResolve, readyReject;
  const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });
  async function startWorker() {
    const r = await fetch('/manifest.json', { cache: 'no-store' });
    if (!r.ok) throw new Error("FAINTR's data isn't published yet.");
    state.manifest = await r.json();
    const w = new Worker('/' + state.manifest.files['core.js']);
    state.worker = w;
    w.onmessage = async (e) => {
      const m = e.data;
      if (m.type === 'ready') return readyResolve();
      if (m.type === 'fatal') return readyReject(new Error(m.error));
      if (m.type === 'progress') { state.progress = m; emit('progress'); return; }
      if (m.type === 'storage') {
        try { const result = await store()[m.op](...m.args); w.postMessage({ type: 'storage-reply', id: m.id, result }); }
        catch (err) { w.postMessage({ type: 'storage-reply', id: m.id, error: err.message }); }
        return;
      }
      const p = waiting.get(m.id); if (!p) return;
      waiting.delete(m.id);
      if (m.error) { const err = new Error(m.error); err.code = m.code; err.stale = m.stale; p.reject(err); } else p.resolve(m.result);
    };
    w.onerror = (e) => readyReject(new Error(e.message || 'The FAINTR engine failed to start.'));
    w.postMessage({ type: 'init', manifest: state.manifest });
  }
  function callCore(method, path, q, body) {
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      waiting.set(id, { resolve, reject });
      state.worker.postMessage({ type: 'api', id, method, path, q, body });
    });
  }

  // ---------- the API app.js talks to
  async function api(url, body) {
    await ready;
    const u = new URL(url, location.origin);
    const p = u.pathname, q = Object.fromEntries(u.searchParams), method = body === undefined ? 'GET' : 'POST';
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
    const { data } = await state.sb.from('profiles').select('display_name, is_admin').eq('id', state.user.id).maybeSingle();
    state.profile = data || { display_name: null, is_admin: false };
  }
  async function onAuth(session) {
    const was = state.user && state.user.id;
    state.user = session ? session.user : null;
    state.doc = null;
    if ((state.user && state.user.id) !== was) {
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
    async oauth(provider) { const { error } = await state.sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin } }); if (error) throw error; },
    async resetPassword(email) { const { error } = await state.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin }); if (error) throw error; },
    async updatePassword(password) { const { error } = await state.sb.auth.updateUser({ password }); if (error) throw error; },
    async signOut() { try { if (state.user) localStorage.removeItem(cacheKey()); } catch (e) { /* ignore */ } await state.sb.auth.signOut(); },
    async setName(name) {
      const { error } = await state.sb.from('profiles').update({ display_name: String(name).slice(0, 40) }).eq('id', state.user.id);
      if (error) throw error;
      await loadProfile(); emit('auth');
    },
    // What's saved in this browser from before signing in
    localCounts: () => ({ roster: LS.get(KEY_R, []).length, saved: LS.get(KEY_S, []).length }),
    async moveLocalToAccount() {
      const r = LS.get(KEY_R, []), t = LS.get(KEY_S, []);
      await cloud.change((d) => {
        const haveR = new Set(d.roster.map((e) => e.uid)), haveT = new Set(d.teams.map((x) => x.id));
        d.roster.push(...r.filter((e) => !haveR.has(e.uid))); d.teams.push(...t.filter((x) => !haveT.has(x.id)));
      });
      LS.set(KEY_R, []); LS.set(KEY_S, []);
      return { roster: r.length, saved: t.length };
    },
    async deleteAccount() {
      const { error } = await state.sb.rpc('delete_my_account');
      if (error) throw new Error(`Couldn't delete the account: ${error.message}`);
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

  window.FAINTR_BRIDGE = { api, ready, auth, state, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, webInfo, setBugStatus, config: CFG };

  (async () => {
    try {
      if (sbReady) {
        const { data } = await state.sb.auth.getSession();
        await onAuth(data.session);
        state.sb.auth.onAuthStateChange((event, session) => {
          onAuth(session);
          if (event === 'PASSWORD_RECOVERY') emit('password-recovery');
        });
      }
      await startWorker();
    } catch (e) { readyReject(e); }
  })();
})();
