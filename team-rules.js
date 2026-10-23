function teamError(stats) {
  const species=stats.map(p=>p.base||'dex'+p.dex);
  if(new Set(species).size!==stats.length)return 'A team can contain only one Pokémon of each Pokédex species, including its forms and Shadow versions.';
  if(stats.filter(p=>p.mega).length>1)return 'A team can contain at most one Mega Pokémon.';
  return null;
}
module.exports={teamError};
