// Run in the authorized setup workflow; never print or write credentials to files.
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const key=crypto.randomBytes(32).toString('hex');
console.log('::add-mask::'+key);
const sql=fs.readFileSync('supabase/migrations/006_short_team_links.sql','utf8');
const setup=spawnSync('psql',[process.env.DB_URL,'-q','-v','ON_ERROR_STOP=1'],{encoding:'utf8',input:'begin;\n'+sql+`\ninsert into faintr_private.share_settings(singleton,write_key_hash) values(true,sha256(convert_to('${key}','UTF8'))) on conflict(singleton) do update set write_key_hash=excluded.write_key_hash;\ncommit;\n`});
if(setup.status!==0){console.error('Short-link database setup failed. '+(setup.stderr||'').replaceAll(key,'[redacted]'));process.exit(1);}
const secret=spawnSync('npx',['--yes','wrangler@4','pages','secret','put','FAINTR_SHARE_WRITE_KEY','--project-name',process.env.CF_PROJECT||'faintr'],{encoding:'utf8',input:key+'\n'});
if(secret.status!==0){console.error('Could not save the short-link server credential. '+(secret.stderr||'').replaceAll(key,'[redacted]'));process.exit(1);}
console.log('Public team lookup and server-only creation credential configured.');
