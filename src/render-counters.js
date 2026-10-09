/** Counts actual WebGL submissions. Does not infer VRAM from asset size. */
export function createRenderCounters(canvas){
  const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');let calls=0,triangles=0,snapshot={};const restore=[];
  if(gl)for(const [name,countIndex,instancesIndex] of [['drawArrays',2,null],['drawElements',1,null],['drawArraysInstanced',2,3],['drawElementsInstanced',1,4]]){
    if(typeof gl[name]!=='function')continue;const original=gl[name];
    const wrapped=function(...args){calls++;const count=args[countIndex],instances=instancesIndex===null?1:args[instancesIndex];
      const n=args[0]===gl.TRIANGLES?Math.floor(count/3):[gl.TRIANGLE_STRIP,gl.TRIANGLE_FAN].includes(args[0])?Math.max(0,count-2):0;
      triangles+=n*instances;return original.apply(this,args);};
    gl[name]=wrapped;restore.push(()=>{if(gl[name]===wrapped)gl[name]=original;});
  }
  return {begin(){calls=0;triangles=0;},end(){snapshot={drawCalls:calls,submittedTriangles:triangles,jsHeapBytes:globalThis.performance?.memory?.usedJSHeapSize??null,ramBytes:null,vramBytes:null};},getStats:()=>({...snapshot}),destroy(){restore.forEach(f=>f());}};
}
