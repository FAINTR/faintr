(function(root){
  const CAPS=[500,1500,2500,10000];
  const normalize=value=>Array.isArray(value)?CAPS.filter(cp=>value.includes(cp)):null;
  const choices=entry=>normalize(entry.leagues)||(!entry.cp?CAPS:[CAPS.find(cp=>Number(entry.cp)<=cp)||10000]);
  function usable(entry,cp){
    return choices(entry).includes(cp) && (!entry.cp||cp>=10000||Number(entry.cp)<=cp);
  }
  const api={CAPS,normalize,choices,usable};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FAINTR_ROSTER_LEAGUES=api;
})(typeof globalThis==='object'?globalThis:this);
