const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../metrics'),{summarize}=require('../report'),L=require('../ui/roster-leagues'),codec=require('../web/share-codec');
for(const key of Object.keys(M.GRADES))for(const strong of [false,true])test(`${key} can be the report's ${strong?'strength':'weakness'}`,()=>{
  const grades=Object.fromEntries(Object.keys(M.GRADES).map(k=>[k,{letter:'B',q:.8}]));
  grades[key]={letter:strong?'A':'C',q:strong?1:.7};
  const summary=summarize(grades,80,[],[],[],[],{key:'fair'},'Master League');
  assert(summary.some(line=>line.startsWith(strong?'Strengths:':'Watch out:')));
  assert(!summary.join(' ').includes('undefined'));
});
test('legacy CP assigns the closest league without promising XL investment',()=>{
  assert.deepEqual(L.choices({cp:1498}),[1500]); assert(!L.usable({cp:1498},2500));
  assert.deepEqual(L.choices({cp:2499}),[2500]); assert(!L.usable({cp:3737},1500));
  assert(L.usable({cp:3737},10000));
});
test('league choices allow multiple leagues, but never bypass current CP',()=>{
  assert(L.usable({cp:1450,leagues:[1500,2500]},2500));
  assert(!L.usable({cp:3737,leagues:[1500]},1500));
  assert(!L.usable({cp:1450,leagues:[]},1500));
  assert(L.usable({cp:null},1500));
});
test('Mega Master links preserve all charged moves',()=>{
  const setup={v:1,f:'mega-10000',m:[
    {id:'mewtwo_mega_y',moveset:['PSYCHO_CUT','PSYSTRIKE','THUNDERBOLT','FUTURE_SIGHT_PLUS']},
    {id:'melmetal',moveset:['THUNDER_SHOCK','DOUBLE_IRON_BASH','DYNAMIC_PUNCH']},
    {id:'palkia_origin',moveset:['DRAGON_BREATH','AQUA_TAIL','SPACIAL_REND']} ]};
  assert.deepEqual(codec.decode(codec.encode(setup)).m[0].moveset,setup.m[0].moveset);
  assert.throws(()=>codec.clean({...setup,m:setup.m.map(m=>({...m,moveset:[...m.moveset,'EXTRA','EXTRA']}))}));
});
