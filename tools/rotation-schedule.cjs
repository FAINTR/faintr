// Read public official schedule facts only. No third-party code is executed.
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const SOURCE='https://pokemongo.com/news/go-battle-league-twilight-trails';
const official=url=>/^https:\/\/pokemongo\.com\/(?:en\/)?news\/go-battle-league-[a-z0-9-]+$/.test(url);
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const title=s=>plain(s).replace(/\*/g,'').replace(/:\s*(?:Great|Ultra|Master) League Edition/i,'').trim();
function pacificDate(year,month,day){
 const base=new Date(Date.UTC(year,month,day,12));
 if(base.getUTCMonth()!==month||base.getUTCDate()!==day)throw Error('Invalid official date');
 const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',timeZoneName:'shortOffset'}).formatToParts(base).find(p=>p.type==='timeZoneName').value;
 const hours=Number(offset.match(/GMT-(\d+)/)?.[1]);if(![7,8].includes(hours))throw Error('Unsupported Pacific offset');
 return new Date(Date.UTC(year,month,day,13+hours)).toISOString();
}
function formatFor(label,known=[]){
 const cp=/Little/i.test(label)?500:/Ultra League/i.test(label)?2500:/Master League/i.test(label)?10000:1500;
 const standard=label.match(/^(Great|Ultra|Master) League(?:: Mega Edition)?$/i);
 if(standard)return [(label.includes('Mega')?'mega':'all')+'-'+cp,standard[1]+(label.includes('Mega')?' (Mega)':'')];
 const normalized=s=>(title(s).toLowerCase().match(/[a-z0-9]+/g)||[]).sort().join('');
 const found=known.find(f=>f.cp===cp&&normalized(f.title||f.short||'')===normalized(label));
 if(found)return [found.key,title(label)];
 // Names identify pending menu entries only: never invent rules or rankings.
 const aliases={'Mega Halloween Cup':'halloween','Mega Color Cup':'megacolor','Mega Catch Cup':'catch','2026 GO LAIC Cup':'laic2026','Little Cup':'little'};
 const name=title(label),derived=name.toLowerCase().replace(/ cup$/,'').replace(/[^a-z0-9]+/g,'');
 let cup=aliases[name]||derived;
 if(known.some(f=>f.key===cup+'-'+cp&&normalized(f.title||'')!==normalized(label)))cup=derived;
 if(!cup||cup.length>60)throw Error('Unrecognized official cup name');
 return [cup+'-'+cp,name];
}
function parseOfficial(html,url,known=[]){
 if(!official(url)||!plain(html).match(/begin and end at 1:00 p\.m\. P[DS]T/))throw Error('Official schedule format changed');
 const blocks=html.split(/(?=<div\b[^>]*data-slot="GblScheduleBlockItem")/).slice(1);
 const periods=blocks.map(block=>{
  const year=Number(block.match(/data-start-date="(\d{4})-/)?.[1]);
  const dates=plain(block.match(/data-slot="GblScheduleBlockDates"[^>]*>([\s\S]*?)<\/span>/)?.[1]||'');
  const m=dates.match(/^([A-Za-z]+) (\d{1,2})\s*[-–]\s*([A-Za-z]+) (\d{1,2})$/);
  if(!m||!year)throw Error('Missing official period dates');
  const a=MONTHS.indexOf(m[1]),b=MONTHS.indexOf(m[3]);if(a<0||b<0)throw Error('Unknown official month');
  // Visible dates and the article's explicit 1pm Pacific rule are authoritative.
  // Some source data-* timestamps have stray times; do not publish those times.
  const start=pacificDate(year,a,+m[2]),end=pacificDate(year+(b<a?1:0),b,+m[4]);
  const days=(Date.parse(end)-Date.parse(start))/86400000;if(days<1||days>15)throw Error('Unexpected official period length');
  const labels=[...block.matchAll(/<div>([^<>]*(?:League|Cup)[^<>]*)<\/div>/g)].map(m=>plain(m[1]).replace(/\*/g,'').trim());
  const formats=[...new Set(labels)].map(label=>formatFor(label,known)).sort((a,b)=>{
   const league=key=>/^(all|mega)-(1500|2500|10000)$/.test(key)?1:0;
   return league(a[0])-league(b[0])||Number(a[0].split('-').pop())-Number(b[0].split('-').pop());
  });
  if(!formats.length||formats.length>6)throw Error('Missing official league names');
  return {start,end,formats};
 });
 if(periods.length<2||periods.length>30)throw Error('Incomplete official schedule');
 periods.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 const season=plain(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/^GO Battle League:\s*/i,'').replace(/ Update.*$/,'').trim();
 if(!season||season.length>100)throw Error('Missing season title');
 return {season,source:url,periods};
}
function nextPeriod(schedule,when=Date.now()){
 return (schedule.periods||[]).filter(p=>Date.parse(p.start)>when).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0]||null;
}
function preparationKeys(schedule,when=Date.now()){
 const next=nextPeriod(schedule,when);
 return [...new Set((schedule.periods||[]).filter(p=>Date.parse(p.start)<=when&&Date.parse(p.end)>when||p===next&&Date.parse(p.start)-when<=8*86400000).flatMap(p=>p.formats.map(([key])=>key)))];
}
function pendingFormats(schedule,formats,when=Date.now()){
 const have=new Set(formats.map(f=>f.key)),keys=new Set(preparationKeys(schedule,when));
 return [...new Map((schedule.periods||[]).flatMap(p=>p.formats).filter(([key])=>keys.has(key)&&!have.has(key)).map(([key,label])=>[key,{key,title:label,unavailable:true}])).values()];
}
async function refreshSchedule(previous,known,fetcher=fetch,when=Date.now()){
 const read=async url=>{const r=await fetcher(url,{signal:AbortSignal.timeout(15000)});if(!r.ok||new URL(r.url||url).hostname!=='pokemongo.com')throw Error('Official schedule unavailable');const h=await r.text();if(h.length>2500000)throw Error('Official page too large');return h;};
 const urls=new Set([SOURCE,...[previous.source,...(previous.sources||[])].filter(s=>typeof s==='string'&&official(s))]);
 // The official news index is paginated; scan a bounded 120 recent articles.
 await Promise.all([0,30,60,90].map(async offset=>{try{const h=await read('https://pokemongo.com/news?no='+offset+'&nr=30');for(const m of h.matchAll(/href=["']([^"']*\/news\/go-battle-league-[a-z0-9-]+)["']/g)){const url=new URL(m[1],'https://pokemongo.com').href;if(official(url)&&urls.size<8)urls.add(url);}}catch(_){/* Known official source remains a fallback. */}}));
 const parsed=[];
 for(const url of urls){try{const s=parseOfficial(await read(url),url,known);if(s.periods.some(p=>Date.parse(p.end)>when))parsed.push(s);}catch(_){/* Preserve last validated schedule. */}}
 const current=parsed.filter(s=>s.periods.some(p=>Date.parse(p.start)<=when&&Date.parse(p.end)>when)).sort((a,b)=>Date.parse(b.periods[0].start)-Date.parse(a.periods[0].start))[0];
 if(!current)return {...previous,sync:{checkedAt:new Date(when).toISOString(),status:'fallback',message:'Official schedule could not be validated; retaining the last known schedule.'}};
 const future=parsed.filter(s=>Date.parse(s.periods[0].start)>when&&Date.parse(s.periods[0].start)<when+120*86400000).sort((a,b)=>Date.parse(a.periods[0].start)-Date.parse(b.periods[0].start));
 const periods=[...new Map([current,...future].flatMap(s=>s.periods).map(p=>[p.start,p])).values()].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 return {...current,periods,sources:[current,...future].map(s=>s.source),sync:{checkedAt:new Date(when).toISOString(),status:'verified'}};
}
function scheduledUpdate(schedule,event,cron,when=Date.now()){
 if(event!=='schedule')return true;
 if(['0 5 * * *','0 6 * * *'].includes(cron)){
  const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',timeZoneName:'shortOffset'}).formatToParts(new Date(when)).find(p=>p.type==='timeZoneName').value;
  return cron===(offset==='GMT-5'?'0 5 * * *':'0 6 * * *');
 }
 const match=cron.match(/^0 (20|21) \* \* \*$/);if(!match)return false;
 const date=new Date(when);date.setUTCHours(+match[1],0,0,0);
 // Both UTC slots accommodate Pacific daylight saving; official dates cover
 // every GL/UL/ML turnover, including changes that aren't on a Tuesday.
 return (schedule.periods||[]).some(p=>{
  const start=new Date(p.start);
  return [20,21].includes(start.getUTCHours())&&start.toISOString().slice(0,10)===date.toISOString().slice(0,10);
 });
}
module.exports={parseOfficial,formatFor,pacificDate,nextPeriod,preparationKeys,pendingFormats,refreshSchedule,scheduledUpdate};
if(require.main===module){
 const fs=require('node:fs');
 const file=fs.existsSync('.webcache/schedule.json')?'.webcache/schedule.json':'schedule.json';
 const run=scheduledUpdate(JSON.parse(fs.readFileSync(file)),process.env.UPDATE_EVENT,process.env.UPDATE_CRON);
 fs.appendFileSync(process.env.GITHUB_OUTPUT,'skip='+!run+'\n');
 console.log(run?'Scheduled update due.':'No league changeover in this schedule slot.');
}
