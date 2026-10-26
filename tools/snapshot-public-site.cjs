// Copy only FAINTR public assets into a new local lab snapshot. No user data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const base='https://faintr.com',target=path.resolve(process.argv[2]||'../output/great-250-site');
async function bytes(url){const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Public asset unavailable ('+r.status+')');return Buffer.from(await r.arrayBuffer());}
function destination(rel){const dest=path.resolve(target,rel);if(!dest.startsWith(target+path.sep)||rel.split(/[\\/]/).includes('..'))throw Error('Unsafe asset path');return dest;}
(async()=>{
 if(fs.existsSync(target))throw Error('Snapshot already exists; choose a new directory to preserve evidence.');
 const raw=await bytes(base+'/manifest.json'),manifest=JSON.parse(raw);
 const metadata=JSON.parse(await bytes(base+'/'+manifest.files['formats/all-1500/teams.json']));
 if(metadata.cands.length!==250)throw Error('Expanded Great League is not published yet.');
 fs.cpSync(path.resolve('site'),target,{recursive:true,errorOnExist:true,force:false});
 let downloaded=0,reused=0;
 const files=[...new Set(Object.values(manifest.files))];
 await Promise.all(Array.from({length:4},async()=>{while(files.length){
  const rel=files.shift();if(!/^d\/[a-f0-9]{16}\.[a-z0-9.]+$/.test(rel))throw Error('Unexpected public data path');
  const dest=destination(rel),expected=path.basename(rel).slice(0,16);
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,16);
  if(fs.existsSync(dest)&&hash(fs.readFileSync(dest))===expected){reused++;continue;}
  const data=await bytes(base+'/'+rel);if(hash(data)!==expected)throw Error('Public data checksum mismatch');
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data);downloaded+=data.length;
 }}));
 const html=(await bytes(base+'/')).toString('utf8');
 const assets=[...new Set([...html.matchAll(/(?:src|href)="(\/(?:static\/[^"<>]+|metrics\.js[^"<>]*))"/g)].map(m=>m[1]))];
 for(const asset of assets){const rel=new URL(asset,base).pathname.slice(1),dest=destination(rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,rel==='static/config.js'?'window.FAINTR_CONFIG={};':await bytes(base+asset));}
 fs.writeFileSync(destination('manifest.json'),raw);fs.writeFileSync(destination('index.html'),html);
 const record={capturedAt:new Date().toISOString(),build:manifest.built,pvpoke:manifest.pvpoke,candidates:metadata.cands.length,teams:metadata.nTeams,downloadedDataBytes:downloaded,reusedImmutableFiles:reused,scope:'Public website assets only; account/analytics configuration disabled for isolated local measurement.'};
 fs.writeFileSync(destination('snapshot.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
