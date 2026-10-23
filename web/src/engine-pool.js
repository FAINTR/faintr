// A failed engine must release its jobs. The core already has an inline engine fallback.
const PRIORITY = new Set(['ivInfo','battleDetail','memberStatic','memberVs','rosterEval','ivTable','familyRanks']);
class Pool {
  constructor(n, { WorkerClass, url, manifest, runInline, lazy=false }) {
    this.queue=[];this.idle=[];this.jobs=new Map();this.workers=new Set();this.seq=0;this.inline=false;this.runInline=runInline;
    this.limit=n;this.started=0;this.options={WorkerClass,url,manifest};
    if(!WorkerClass)this.inline=true;
    else if(!lazy)for(let i=0;i<n&&!this.inline;i++)this.spawn();
  }
  spawn(){
    const {WorkerClass,url,manifest}=this.options;this.started++;
    let w;
    try{
        w=new WorkerClass(url);this.workers.add(w);
        w.onmessage=e=>this.onMessage(w,e.data);
        w.onerror=()=>this.fail(w,'A battle engine stopped. Please try the calculation again.');
        w.postMessage({type:'init',manifest});
    }catch(_){
      if(w){this.workers.delete(w);w.terminate();}
      // Preserve healthy workers if creating an additional one is unsupported.
      this.limit=this.started;if(!this.workers.size)this.inline=true;
    }
  }
  fail(w,message) {
    if(!this.workers.delete(w))return;
    w.terminate();this.idle=this.idle.filter(x=>x!==w);
    for(const [id,job] of this.jobs)if(job.worker===w){this.jobs.delete(id);job.reject(Error(message));}
    if(!this.workers.size)this.inline=true;
    this.pump();
  }
  onMessage(w,m) {
    if(!this.workers.has(w))return;
    if(m.type==='fatal')return this.fail(w,m.error||'A battle engine could not start.');
    if(m.type==='ready'){this.idle.push(w);return this.pump();}
    const job=this.jobs.get(m.id);if(!job||job.worker!==w)return;
    this.jobs.delete(m.id);this.idle.push(w);this.pump();
    if(m.error)job.reject(Error(m.error));else job.resolve(m.result);
  }
  run(fn,...args) {
    return new Promise((resolve,reject)=>{
      const job={id:++this.seq,fn,args,resolve,reject};
      const i=PRIORITY.has(fn)?this.queue.findIndex(j=>!PRIORITY.has(j.fn)):-1;
      this.queue.splice(i<0?this.queue.length:i,0,job);this.pump();
    });
  }
  pump() {
    // Rankings use precomputed rows and need no extra engine workers. Start only
    // enough workers to service real calculations, avoiding four game-data copies
    // and their downloads on every first visit.
    let starting=this.workers.size-this.jobs.size-this.idle.length;
    while(!this.inline&&this.queue.length>this.idle.length+starting&&this.started<this.limit){
      this.spawn();starting=this.workers.size-this.jobs.size-this.idle.length;
    }
    if(this.inline) {
      while(this.queue.length){const j=this.queue.shift();try{j.resolve(this.runInline(j.fn,...j.args));}catch(e){j.reject(e);}}
      return;
    }
    while(this.idle.length&&this.queue.length) {
      const w=this.idle.shift(),j=this.queue.shift();j.worker=w;this.jobs.set(j.id,j);
      try{w.postMessage({id:j.id,fn:j.fn,args:j.args});}catch(_){this.fail(w,'A battle engine stopped. Please try again.');}
    }
  }
}
module.exports={Pool};
