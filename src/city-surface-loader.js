// Request and triangulate public source data off the game's main thread.
export function createCitySurfaceLoader(){
  let worker=null,nextId=0;const pending=new Map();
  function stop(reason=Error('City surface loader stopped')){
    worker?.terminate();worker=null;
    for(const job of pending.values()){job.cleanup();job.reject(reason);}pending.clear();
  }
  function load(x,y,signal){
    if(signal?.aborted)return Promise.reject(new DOMException('Cancelled','AbortError'));
    if(!worker){
      worker=new Worker(new URL('./city-surface-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;pending.delete(data.id);job.cleanup();data.error?job.reject(Error(data.error)):job.resolve(data.cell);};
      worker.onerror=()=>stop(Error('City surface worker failed'));
    }
    return new Promise((resolve,reject)=>{
      const id=++nextId,cancel=()=>{worker?.postMessage({id,cancel:true});pending.delete(id);reject(new DOMException('Cancelled','AbortError'));};
      pending.set(id,{resolve,reject,cleanup:()=>signal?.removeEventListener('abort',cancel)});
      signal?.addEventListener('abort',cancel,{once:true});worker.postMessage({id,x,y});
    });
  }
  return {load,destroy:stop};
}
