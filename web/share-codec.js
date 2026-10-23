// Public team links contain game settings only, never account IDs, labels or notes.
(function (root) {
  const id = /^[a-z0-9_]{1,70}$/, move = /^[A-Z0-9_]{1,70}$/;
  const fail = () => { throw new Error('This team link is invalid or incomplete.'); };
  function clean(value) {
    if (!value || value.v !== 1 || !/^[a-z0-9-]{1,64}$/.test(value.f) || !Array.isArray(value.m) || value.m.length !== 3) fail();
    const m = value.m.map(p => {
      if (!p || !id.test(p.id) || !Array.isArray(p.moveset) || p.moveset.length < 2 || p.moveset.length > 4 || p.moveset.some(x => typeof x !== 'string' || !move.test(x))) fail();
      const ivs = p.ivs == null ? null : { atk: p.ivs.atk, def: p.ivs.def, hp: p.ivs.hp };
      if (ivs && Object.values(ivs).some(x => !Number.isInteger(x) || x < 0 || x > 15)) fail();
      const levelCap = p.levelCap == null ? 50 : p.levelCap;
      if (![40,41,50,51].includes(levelCap)) fail();
      return { id:p.id, moveset:p.moveset.slice(), ivs, levelCap };
    });
    if (new Set(m.map(p=>p.id)).size !== 3) fail();
    const w = {};
    for (const key of ['coverage','bulk','safety','consistency','blindSpots','twoAnswers','resilience','sharedWeak','pilot','metaWins']) {
      if (value.w && Object.hasOwn(value.w,key)) {
        if (!Number.isInteger(value.w[key]) || value.w[key]<0 || value.w[key]>5) fail();
        w[key]=value.w[key];
      }
    }
    return {v:1,f:value.f,m,...(Object.keys(w).length ? {w} : {})};
  }
  function encode(value) { return btoa(JSON.stringify(clean(value))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function decode(token) {
    if (typeof token !== 'string' || token.length>2200 || !/^[A-Za-z0-9_-]+$/.test(token)) fail();
    try { return clean(JSON.parse(atob(token.replace(/-/g,'+').replace(/_/g,'/')))); } catch (_) { return fail(); }
  }
  const api={clean,encode,decode};
  if (typeof module !== 'undefined') module.exports=api; else root.FAINTR_SHARE=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
