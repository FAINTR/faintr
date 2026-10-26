// Isolated local lab measurement. Blocks all third-party traffic and account APIs.
const {chromium}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(process.argv[2]||'site'),output=path.resolve(process.argv[3]||'../output/performance.json');
let servedBytes=0,servedPaths=[];
const types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}
  if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.existsSync(file)){res.writeHead(404).end();return;}
  servedBytes+=fs.statSync(file).size;servedPaths.push(new URL(req.url,'http://localhost').pathname);
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.setHeader('Cache-Control','no-store');fs.createReadStream(file).pipe(res);
});
(async()=>{
  await new Promise(resolve=>server.listen(4181,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),names=Object.fromEntries(Object.entries(manifest.files).map(([name,file])=>['/'+file,name]));
  const results=[];
  try {
    for(const profile of (process.argv[4]&&process.argv[4]!=='both'?[process.argv[4]]:['desktop','slower-phone'])) {
      const context=await browser.newContext({viewport:profile==='desktop'?{width:1440,height:1000}:{width:375,height:812}});
      if(process.argv[5]){
        const period=require('../formats').periodAt(manifest.schedule,manifest.formats).now;
        await context.addInitScript(({key,period})=>{localStorage.setItem('faintr.format',key);localStorage.setItem('faintr.period',period);},{key:process.argv[5],period:period?String(period.start):'none'});
      }
      await context.route('**/*',r=>new URL(r.request().url()).origin==='http://127.0.0.1:4181'?r.continue():r.abort());
      await context.route('**/config.js*',r=>r.fulfill({contentType:'text/javascript',body:'window.FAINTR_CONFIG={};'}));
      const page=await context.newPage(),cdp=await context.newCDPSession(page);
      if(profile!=='desktop') {
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
      }
      const transfers=new Map();let bytes=0;
      await cdp.send('Network.enable');
      cdp.on('Network.responseReceived',m=>transfers.set(m.requestId,m.response.url));
      cdp.on('Network.loadingFinished',m=>{bytes+=m.encodedDataLength;});
      await page.addInitScript(()=>{
        window.__lab={lcp:0,cls:0,events:[],shifts:[]};
        let shiftStart=0,lastShift=0,shiftWindow=0;
        new PerformanceObserver(list=>{for(const e of list.getEntries())window.__lab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput){if(e.startTime-lastShift>1000||e.startTime-shiftStart>5000){shiftStart=e.startTime;shiftWindow=0;}lastShift=e.startTime;shiftWindow+=e.value;window.__lab.cls=Math.max(window.__lab.cls,shiftWindow);window.__lab.shifts.push({value:e.value,time:e.startTime,sources:(e.sources||[]).map(s=>({id:s.node?.id,tag:s.node?.tagName,from:s.previousRect.y,to:s.currentRect.y}))});}}).observe({type:'layout-shift',buffered:true});
        new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.interactionId)window.__lab.events.push(e.duration);}).observe({type:'event',buffered:true,durationThreshold:16});
      });
      servedBytes=0;servedPaths=[];const start=Date.now();await page.goto('http://127.0.0.1:4181/');
      await page.locator('#teams .team').first().waitFor({timeout:240000});
      const teamReadyMs=Date.now()-start,readyBytes=servedBytes;
      if(process.argv[5]&&!((await page.locator('#findLede').innerText()).includes(manifest.formats.find(f=>f.key===process.argv[5]).title)))throw Error('Requested benchmark league did not load');
      const tabStart=Date.now();await page.getByRole('tab',{name:'Team Grader',exact:true}).click();
      await page.locator('#slots').waitFor();const tabMs=Date.now()-tabStart;
      const metrics=await page.evaluate(()=>({...window.__lab,resources:performance.getEntriesByType('resource').map(e=>({path:new URL(e.name).pathname,bytes:e.transferSize,duration:e.duration})),domReady:performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}));
      results.push({profile,format:process.argv[5]||'default',teamReadyMs,readyBytes,tabMs,lcpMs:metrics.lcp,cls:metrics.cls,shifts:metrics.shifts,largestObservedInteractionMs:Math.max(0,...metrics.events),dataFiles:[...new Set(servedPaths.map(p=>names[p]).filter(Boolean))],resources:metrics.resources.map(r=>({...r,path:names[r.path]||r.path}))});
      console.log(JSON.stringify({...results.at(-1),resources:undefined,dataFiles:results.at(-1).dataFiles.filter(f=>/formats.*teams.bin/.test(f))}));
      await context.close();
    }
    fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({measuredAt:new Date().toISOString(),method:'Local cold cache; phone: 150ms latency, 1.6Mbps down, 4x CPU slowdown. Not field CWV or INP.',results},null,2));
  } finally {await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>server.close());
