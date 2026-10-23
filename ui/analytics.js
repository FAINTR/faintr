(function(root){
  const EVENTS=['page_view','builder_started','builder_completed','grade_started','grade_completed','simulation_started','simulation_completed','roster_saved','roster_imported','roster_exported','iv_started','iv_completed','team_saved','action_failed'];
  const TOOLS=['find','grade','battle','roster','ivs','meta','saved','news','bugs','vip','supporters','privacy','terms','sources','licenses'];
  const PREFIX='faintr.analytics.',VERSION='2026-10-23',DAY=86400000;
  function create(env){
    let source='direct',lastPage='';
    const read=k=>{try{return JSON.parse(env.storage.getItem(PREFIX+k));}catch(_){return null;}};
    const write=(k,v)=>{try{env.storage.setItem(PREFIX+k,JSON.stringify(v));return true;}catch(_){return false;}};
    const remove=k=>{try{env.storage.removeItem(PREFIX+k);}catch(_){}};
    const blocked=()=>env.gpc()||env.dnt();
    function allowed(){const c=read('consent');return env.enabled&&!blocked()&&c?.yes===true&&c.version===VERSION&&env.now()-c.at<180*DAY;}
    function identity(){
      let v=read('visitor'),s=read('session'),now=env.now();
      if(!v||now-v.at>=30*DAY)v={id:env.uuid(),at:now};
      if(!s||s.visitor!==v.id||now-s.last>=30*60000)s={id:env.uuid(),visitor:v.id,returning:!!v.seenSession,source,last:now};
      v.seenSession=true;s.last=now;
      if(!write('visitor',v)||!write('session',s))return null;
      return {visitor:v.id,session:s.id,returning:s.returning,source:s.source};
    }
    function track(event,tool){
      // Strict allowlists: no paths, query strings, account details or game selections.
      if(!env.enabled||blocked()||!EVENTS.includes(event)||!TOOLS.includes(tool)||!allowed())return;
      const ids=identity();if(!ids)return;
      const body={id:env.uuid(),event,tool,source,...ids,consent:VERSION};
      try{Promise.resolve(env.send(body)).catch(()=>{});}catch(_){} // Never block tools or retry indefinitely.
    }
    function consent(yes){remove('visitor');remove('session');write('consent',{yes:!!yes,at:env.now(),version:VERSION});if(yes)track('page_view',lastPage||'find');}
    function page(tool){if(!TOOLS.includes(tool)||tool===lastPage)return;lastPage=tool;track('page_view',tool);}
    function acquisition(referrer,search){
      let host='',utm='';try{host=new URL(referrer).hostname;}catch(_){}
      try{utm=new URLSearchParams(search).get('utm_source')||'';}catch(_){}
      source=/^(discord|google|bing|patreon|reddit|youtube)$/i.test(utm)?({google:'search',bing:'search',discord:'discord',patreon:'supporter',reddit:'social',youtube:'social'}[utm.toLowerCase()]):
        /(^|\.)(google\.[a-z.]+|bing.com|duckduckgo.com)$/.test(host)?'search':/(^|\.)(discord.com|discord.gg)$/.test(host)?'discord':/(^|\.)(reddit.com|youtube.com|tiktok.com|facebook.com|instagram.com|x.com)$/.test(host)?'social':/(^|\.)patreon.com$/.test(host)?'supporter':host&&host!=='faintr.com'?'referral':'direct';
    }
    return {track,page,consent,allowed,blocked,acquisition,enabled:env.enabled};
  }
  const api={create,EVENTS,TOOLS,VERSION};
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  const tracker=create({enabled:root.FAINTR_CONFIG?.analyticsEnabled===true,storage:{getItem:k=>root.localStorage.getItem(k),setItem:(k,v)=>root.localStorage.setItem(k,v),removeItem:k=>root.localStorage.removeItem(k)},now:()=>Date.now(),uuid:()=>root.crypto.randomUUID(),gpc:()=>root.navigator.globalPrivacyControl===true,dnt:()=>root.navigator.doNotTrack==='1',send:body=>root.fetch('/a/event',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true})});
  root.FAINTR_ANALYTICS=tracker;
  if(!tracker.enabled)return;
  tracker.acquisition(root.document.referrer,root.location.search);
  root.document.addEventListener('DOMContentLoaded',()=>{
    const footer=root.document.querySelector('footer')||root.document.querySelector('main');if(!footer)return;
    const button=root.document.createElement('button');button.type='button';button.className='btn small';button.textContent='Analytics choices';button.style.cssText='min-height:44px;margin-top:12px';footer.append(button);
    const dialog=root.document.createElement('dialog');dialog.className='grade-help-dialog';dialog.setAttribute('aria-label','Optional usage analytics');
    dialog.innerHTML='<h2>Help improve FAINTR</h2><p>Optional usage analytics count visits and completed tool actions. They use a random browser identifier for up to 30 days and a session identifier that expires after 30 minutes of inactivity. We do not send your account details, searches, Pokémon, moves, IVs, roster or notes.</p><p>You can use every tool without agreeing. Change your choice here at any time. <a href="/privacy/">Privacy policy</a></p><p data-state role="status"></p><div class="actions"><button type="button" class="btn" data-no>Keep analytics off</button><button type="button" class="btn" data-yes>Allow usage analytics</button><button type="button" class="btn" data-close>Close</button></div>';
    root.document.body.append(dialog);
    dialog.style.cssText='width:min(580px,calc(100vw - 24px));box-sizing:border-box;max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:1px solid #5a6170;border-radius:12px;background:var(--surface,#2b2f3a);color:var(--ink,#f2f4f7);font:16px/1.5 system-ui';
    dialog.querySelector('.actions').style.cssText='display:flex;flex-wrap:wrap;gap:8px';
    dialog.querySelectorAll('button').forEach(b=>{b.style.cssText='min-height:44px;padding:8px 12px;white-space:normal';});
    button.addEventListener('click',()=>{dialog.querySelector('[data-state]').textContent=tracker.blocked()?'Your browser privacy signal keeps optional analytics off.':tracker.allowed()?'Optional analytics are on.':'Optional analytics are off.';dialog.querySelector('[data-yes]').disabled=tracker.blocked();dialog.showModal();});
    dialog.querySelector('[data-no]').onclick=()=>{tracker.consent(false);dialog.close();};dialog.querySelector('[data-yes]').onclick=()=>{tracker.consent(true);dialog.close();};dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    tracker.page(root.document.body.dataset.analyticsPage||'find');
  });
})(typeof window==='object'?window:globalThis);
