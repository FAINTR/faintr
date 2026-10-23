// Real simulator + report regression for the supplied feedback; no account access.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {makeCtx,unpackMatrix}=require('../build'),{loadTeams}=require('../teamdata'),{createCore}=require('../appcore');
const src=process.env.FAINTR_TEST_SRC||(fs.existsSync('.webcache/src/js/GameMaster.js')?'.webcache/src':'assets/pvpoke-src'),ctx=makeCtx(src);
const formats=[{key:'all-10000',cup:'all',cp:10000,meta:'master',title:'Master League'}];
const core=createCore({ev:code=>vm.runInContext(code,ctx),formats,storage:{rosterAll:async()=>[],savedAll:async()=>[]},
  pool:{run:(fn,...args)=>Promise.resolve().then(()=>{ctx.__args=args;return vm.runInContext(fn+'.apply(null,__args)',ctx);})},
  loadFormatData:async F=>{const dir=fs.existsSync('.webcache/data/'+F.key+'/teams.bin')?'.webcache/data/'+F.key:'assets/data/'+F.key;return {D:loadTeams(dir),matrix:unpackMatrix(JSON.parse(fs.readFileSync(dir+'/matrix.json')))};}});
const reported=[
 {id:'garchomp',moveset:['DRAGON_TAIL','EARTH_POWER','TWISTER'],ivs:{atk:15,def:14,hp:12}},
 {id:'gyarados',moveset:['DRAGON_BREATH','AQUA_TAIL','CRUNCH'],ivs:{atk:15,def:13,hp:14}},
 {id:'metagross',moveset:['BULLET_PUNCH','METEOR_MASH','EARTHQUAKE'],ivs:{atk:15,def:14,hp:10}}];
(async()=>{
 for(const members of [reported,reported.map(m=>({...m,ivs:null})),reported.map(m=>({...m,ivs:{atk:15,def:15,hp:15}})),reported]){
   const report=await core.handle('POST','/api/report',{}, {f:'all-10000',members});
   assert(Number.isFinite(report.composite)); assert(report.summary.length); assert.equal(report.members.length,3);
 }
 console.log('PASS: reported custom IVs, defaults, perfect IVs and repeated grading in the same engine.');
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
