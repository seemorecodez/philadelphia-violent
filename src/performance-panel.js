export function createPerformancePanel(toolbar) {
  const button=document.createElement('button');
  button.className='quiet';button.textContent='Performance';button.type='button';
  button.setAttribute('aria-expanded','false');
  toolbar.append(button);
  const panel=document.createElement('aside');
  panel.className='performance-panel';panel.hidden=true;
  panel.innerHTML='<strong>Measured game performance</strong><p>Local frame cadence and CPU elapsed time. GPU time is not measured. Collision time is included in simulation; do not add the rows.</p><pre aria-label="Game performance measurements">Collecting samples…</pre><button type="button" class="quiet">Download measurements</button>';
  toolbar.parentElement.append(panel);
  let snapshot;
  button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));render();});
  panel.querySelector('button').addEventListener('click',()=>{
    if(!snapshot)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='philadelphia-performance.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const ms=value=>Number.isFinite(value)?value.toFixed(2)+' ms':'—';
  function render(){
    if(panel.hidden||!snapshot)return;
    const data=snapshot.sectionsMs;
    panel.querySelector('pre').textContent=[
      `${snapshot.mode}${snapshot.gamePaused?' · paused':''} · ${snapshot.fps?.toFixed(1)??'—'} FPS · ${snapshot.frameIntervalMs.samples} frame samples`,
      `Frame interval  p50 ${ms(snapshot.frameIntervalMs.p50)} / p95 ${ms(snapshot.frameIntervalMs.p95)}`,
      `Simulation      p50 ${ms(data.simulation.p50)} / p95 ${ms(data.simulation.p95)}`,
      `Collision query p50 ${ms(data.collision.p50)} / p95 ${ms(data.collision.p95)}`,
      `Scene elapsed   p50 ${ms(data.sceneRenderSubmission.p50)} / p95 ${ms(data.sceneRenderSubmission.p95)}`,
      ...Object.entries(snapshot.budgets).map(([kind,b])=>`${kind}: ${b.count} / ${b.limit}`),
      `WebGL draw calls: ${snapshot.render?.drawCalls??'unavailable'} · submitted triangles: ${snapshot.render?.submittedTriangles??'unavailable'}`,
      `JS heap: ${snapshot.render?.jsHeapBytes? (snapshot.render.jsHeapBytes/1048576).toFixed(1)+' MiB':'unavailable'} · total RAM / VRAM: unavailable`,
      ...(snapshot.district?.enabled?[`District cells: ${snapshot.district.loadedCells} ready / ${snapshot.district.pendingCells} pending`,
        `District geometry: ${snapshot.district.triangles} triangles · ${(snapshot.district.meshBufferBytes/1048576).toFixed(1)} MiB buffer estimate`,
        `Last cell ready: ${ms(snapshot.district.lastCellLatencyMs)} · transitions: ${snapshot.district.transitions} · failed loads: ${snapshot.district.failures}`]:[]),
    ].join('\n');
  }
  return {update(state){if(!state.performance)return;snapshot={...state.performance,mode:state.mode,gamePaused:state.paused,vehicle:state.vehicleName,capturedAt:new Date().toISOString()};render();}};
}
