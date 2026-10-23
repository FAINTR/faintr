// Entirely disposable, in-memory PostgreSQL. NEVER connects to Supabase.
// Install PGlite separately for this optional review test and set FAINTR_PGLITE_MODULE
// to its local package directory, or install it as a development dependency.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.FAINTR_PGLITE_MODULE||'@electric-sql/pglite');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
test('disposable PostgreSQL verifies account policies and proposed analytics SQL',async t=>{
 const db=new PGlite();
 const role=async(user,who='authenticated')=>{await db.exec(`reset role;set role ${who};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);};
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
   grant usage on schema auth to anon,authenticated;`);
  for(const file of ['001_init.sql','002_billing.sql','004_vip_tools.sql','005_free_access.sql','006_short_team_links.sql','007_mega_team_links.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$3),($2,$4)',[A,B,'a@example.invalid','b@example.invalid']);
  await db.query('insert into public.user_storage(user_id,roster) values($1,$3),($2,$4)',[A,B,JSON.stringify([{uid:'a-fixture'}]),JSON.stringify([{uid:'b-fixture'}])]);
  await t.test('anonymous cannot read any private table or call account exports',async()=>{
   await role(null,'anon');
   for(const table of ['profiles','user_storage','bug_reports','billing_customers','billing_purchases'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
   await assert.rejects(db.query('select public.export_my_storage()'),/permission denied/);
  });
  await t.test('each account can read/export only itself and cannot alter another account',async()=>{
   await role(A);const rows=await db.query('select user_id from public.user_storage');assert.deepEqual(rows.rows,[{user_id:A}]);
   assert.deepEqual((await db.query('select public.export_my_storage() as data')).rows[0].data.roster,[{uid:'a-fixture'}]);
   assert.equal((await db.query('update public.user_storage set roster=$1 where user_id=$2 returning user_id',['[]',B])).rows.length,0);
   assert.equal((await db.query('delete from public.user_storage where user_id=$1 returning user_id',[B])).rows.length,0);
   await assert.rejects(db.query('update public.user_storage set user_id=$1 where user_id=$2',[B,A]),/row-level security/);
   await role(B);assert.deepEqual((await db.query('select user_id from public.user_storage')).rows,[{user_id:B}]);
  });
  await t.test('a normal trainer can edit a name but cannot become an administrator',async()=>{
   await role(A);await db.query("update public.profiles set display_name='Synthetic trainer' where id=$1",[A]);
   await assert.rejects(db.query('update public.profiles set is_admin=true where id=$1',[A]),/permission denied/);
  });
  await t.test('approved bug limiter compiles and keeps server-stamped identity/status and existing limits',async()=>{
   await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/008_report_serialization.sql','utf8'));await role(null,'anon');
   for(let i=0;i<10;i++)await db.query("insert into public.bug_reports(title,details) values('Synthetic report','Disposable local test details')");
   await assert.rejects(db.query("insert into public.bug_reports(title,details) values('Synthetic report','Disposable local test details')"),/Lots of reports/);
   await db.exec('reset role');const result=await db.query('select count(*)::int n,bool_and(user_id is null and status=\'new\') as stamped from public.bug_reports');
   assert.equal(result.rows[0].n,10);assert.equal(result.rows[0].stamped,true);
   await role(A);
   for(let i=0;i<20;i++)await db.query("insert into public.bug_reports(title,details,user_id,status) values('Synthetic trainer report','Disposable local test details',$1,'fixed')",[B]);
   await assert.rejects(db.query("insert into public.bug_reports(title,details) values('Synthetic report','Disposable local test details')"),/this hour/);
   await db.exec('reset role');const trainer=await db.query('select count(*)::int n,bool_and(status=\'new\') as stamped from public.bug_reports where user_id=$1',[A]);
   assert.equal(trainer.rows[0].n,20);assert.equal(trainer.rows[0].stamped,true);
   assert.equal((await db.query('select count(*)::int n from public.bug_reports where user_id=$1',[B])).rows[0].n,0);
  });
  await t.test('shared lookup strips private fields and direct private-schema reads are denied',async()=>{
   await db.exec('reset role');await db.query("insert into faintr_private.share_settings(write_key_hash) values(sha256(convert_to($1,'UTF8')))",['synthetic-share-test-value']);
   const team={v:1,f:'all-1500',m:['azumarill','clodsire','mandibuzz'].map(id=>({id,moveset:['TEST_FAST','TEST_CHARGE'],levelCap:50,ivs:null,notes:'private fixture'})),w:{coverage:3},user_id:A};
   await role(null,'anon');await assert.rejects(db.query('select * from faintr_private.shared_teams'),/permission denied/);
   const id=(await db.query('select public.create_shared_team($1,$2,$3) id',[team,'synthetic-share-test-value','a'.repeat(64)])).rows[0].id;
   const saved=(await db.query('select public.get_shared_team($1) team',[id])).rows[0].team;
   assert(!JSON.stringify(saved).includes('private fixture'));assert(!JSON.stringify(saved).includes(A));
  });
  await t.test('analytics proposal compiles; credential, schema privacy, validation and idempotency work',async()=>{
   await db.exec('reset role');await db.exec(fs.readFileSync('supabase/review/usage-analytics.sql','utf8'));
   await db.query("insert into faintr_usage.settings(write_key_hash) values(sha256(convert_to($1,'UTF8')))",['synthetic-usage-test-value']);
   const event={id:'20000000-0000-4000-8000-000000000001',visitor:'a'.repeat(64),session:'b'.repeat(64),event:'grade_completed',tool:'grade',source:'direct',returning:false,consent:'2026-10-23'};
   await role(null,'anon');await assert.rejects(db.query('select * from faintr_usage.events'),/permission denied/);
   await assert.rejects(db.query('select public.record_usage_event($1,$2,$3)',[event,'wrong-test-value','c'.repeat(64)]),/Denied/);
   await assert.rejects(db.query('select public.record_usage_event($1,$2,$3)',[{...event,tool:'not_allowed'},'synthetic-usage-test-value','c'.repeat(64)]),/Invalid event/);
   for(let i=0;i<2;i++)await db.query('select public.record_usage_event($1,$2,$3)',[event,'synthetic-usage-test-value','c'.repeat(64)]);
   await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from faintr_usage.events')).rows[0].n,1);
   await db.query("update faintr_usage.events set received_at=now()-interval '31 days'");
   await db.query('select public.record_usage_event($1,$2,$3)',[{...event,id:'20000000-0000-4000-8000-000000000002'},'synthetic-usage-test-value','c'.repeat(64)]);
   assert.equal((await db.query('select count(*)::int n from faintr_usage.events')).rows[0].n,1);
  });
  await t.test('account deletion affects only the signed-in synthetic account and cascades its storage',async()=>{
   await role(B);await db.query('select public.delete_my_account()');await db.exec('reset role');
   assert.deepEqual((await db.query('select id from auth.users')).rows,[{id:A}]);assert.deepEqual((await db.query('select user_id from public.user_storage')).rows,[{user_id:A}]);
  });
 }finally{await db.close();}
});
