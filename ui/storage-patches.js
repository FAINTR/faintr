(function(root){
  const ivs=value=>value?[value.atk,value.def,value.hp]:null;
  function basis(entry,kind) {
    return JSON.stringify(kind==='roster'?[entry.id,ivs(entry.ivs),entry.cp,entry.levelCap]:[entry.f,(entry.members||[]).map(m=>[m.id,m.moveset||[],ivs(m.ivs),m.levelCap||50]),entry.history?.[0]?.version]);
  }
  function refresh(list,updates,kind) {
    const key=kind==='roster'?'uid':'id',field=kind==='roster'?'eval':'history';
    const byId=new Map(updates.map(update=>[update[key],update]));
    return list.map(entry=>{
      const update=byId.get(entry[key]);
      return update&&basis(entry,kind)===update.basis?{...entry,[field]:update[field]}:entry;
    });
  }
  function contentBasis(e) {
    return JSON.stringify([e.id,e.nickname||'',ivs(e.ivs),e.cp||null,e.levelCap||50,e.moveset||[],!!e.shiny,e.ball||'poke',e.notes||'',!!e.pinned,e.leagues||null]);
  }
  function assertCurrent(current,expected) {
    if(expected!==undefined&&(!current||contentBasis(current)!==expected))throw Error('This Pokémon was changed or removed on another tab or device. Your edit is still here. Copy any changes, close this form, and reopen the Pokémon to use its latest version.');
  }
  function insertRoster(list,entries,max=2000) {
    const ids=new Set(list.map(e=>e.uid)),next=list.slice();
    for(const e of entries)if(!ids.has(e.uid)){ids.add(e.uid);next.push(e);}
    if(next.length>max)throw Error('Your Roster changed while importing and no longer has enough room. Your pending entries are still here.');
    return next;
  }
  const api={basis,refresh,contentBasis,assertCurrent,insertRoster};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FAINTR_STORAGE_PATCHES=api;
})(typeof globalThis==='object'?globalThis:this);
