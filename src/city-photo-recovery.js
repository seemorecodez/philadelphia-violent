import { Axis, Cartesian3, Model, ShadowMode, Transforms } from 'cesium';

/** Restore only source-identified buildings after their original photos load.
 * I3SNode public fields supply source identity; Cesium's generated `index`
 * metadata maps each drawn feature back to that field array. No geographic
 * blanket clipping, guessed facade, or whole-tile removal is used.
 */
export function createCityPhotoRecovery(viewer, provider, descriptors, {
  createModel=options=>Model.fromGltfAsync(options), onStatus=()=>{},
}={}) {
  const scene=viewer.scene;
  const tileNodes=new WeakMap(); const fields=new WeakMap();
  const changed=new Map(); const jobs=[];
  let enabled=true, visible=true, destroyed=false;
  const byName=new Map(descriptors.map(item=>[item.name,item]));
  const candidateNodes=new Set(descriptors.flatMap(item=>item.nodeIndices));
  const redraw=()=>{if(!destroyed && !scene.isDestroyed?.())scene.requestRender();};
  function indexNodes(node){
    if(!node)return;
    if(node.tile)tileNodes.set(node.tile,node);
    for(const child of node.children??[])indexNodes(child);
  }
  function nodeFor(tile){
    if(!tileNodes.has(tile))for(const layer of provider.layers)indexNodes(layer.rootNode);
    return tileNodes.get(tile);
  }
  function restore(){
    for(const item of changed.values()){
      try { if(item.tile.content===item.content)item.feature.show=item.wasShown; } catch { /* unloaded tile */ }
    }
    changed.clear();
  }
  function disposeModel(job){
    for(const part of job.parts){
      part.removeReady?.(); part.removeError?.();
      if(!part.model.isDestroyed?.()){
        part.model.show=false;
        scene.primitives.remove(part.model);
        if(!part.model.isDestroyed?.())part.model.destroy();
      }
    }
    job.parts=[]; job.ready=false;
  }
  function fail(job,error){
    if(destroyed)return;
    job.failed=true; disposeModel(job); restore(); redraw();
    onStatus(`Original photographs for ${job.descriptor.name} could not load; the existing city is retained.`, 'error');
    console.warn('City photograph recovery:',error);
  }
  async function prepare(descriptor){
    const job={descriptor,parts:[],ready:false,failed:false}; jobs.push(job);
    const urls=descriptor.urls??[descriptor.url];
    try{
      for(const url of urls){
      const model=await createModel({url,
        modelMatrix:Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...descriptor.origin)),
        upAxis:Axis.Y,forwardAxis:Axis.X,scale:1,minimumPixelSize:0,
        show:false,allowPicking:true,incrementallyLoadTextures:false,shadows:ShadowMode.DISABLED,
      });
      if(destroyed || job.failed){if(!model.isDestroyed?.())model.destroy();return;}
      const part={model}; job.parts.push(part);
      const ready=()=>{if(!destroyed && !job.failed){job.ready=job.parts.length===urls.length && job.parts.every(p=>p.model.ready);redraw();}};
      part.removeReady=model.readyEvent.addEventListener(ready);
      part.removeError=model.errorEvent.addEventListener(error=>fail(job,error));
      scene.primitives.add(model);
      if(model.ready)ready();
      redraw();
      }
    }catch(error){fail(job,error);}
  }
  function loadFields(node){
    let entry=fields.get(node);
    if(entry)return entry;
    entry={ready:false,failed:false}; fields.set(node,entry);
    Promise.all([node.loadField('ObjName'),node.loadField('OBJECTID')]).then(()=>{
      if(destroyed)return;
      entry.names=node.fields.ObjName?.values; entry.ids=node.fields.OBJECTID?.values;
      entry.ready=!!entry.names && !!entry.ids; redraw();
    }).catch(()=>{entry.failed=true;});
    return entry;
  }
  const removers=provider.layers.map(layer=>layer.tileset.tileVisible.addEventListener(tile=>{
    if(destroyed || !enabled || !visible)return;
    const node=nodeFor(tile);
    if(!node || !candidateNodes.has(node.data.index))return;
    const entry=loadFields(node);
    if(!entry.ready)return;
    const content=tile.content;
    for(let i=0;i<(content?.featuresLength??0);i++){
      const feature=content.getFeature(i); const index=feature.getProperty('index');
      if(!Number.isInteger(index) || index<0)continue;
      const descriptor=byName.get(entry.names[index]);
      if(!descriptor || Number(entry.ids[index])!==descriptor.objectId)continue;
      if(descriptor.sourceVersion && node.data.version!==descriptor.sourceVersion)continue;
      const job=jobs.find(j=>j.descriptor===descriptor);
      if(!job?.ready || job.parts.some(p=>p.model.isDestroyed?.()))continue;
      // A false source visibility can belong to some other filter. Preserve it.
      if(!feature.show && !changed.has(feature))continue;
      if(feature.show){changed.set(feature,{tile,content,feature,wasShown:true});feature.show=false;}
      for(const part of job.parts)part.model.show=true;
    }
  }));
  for(const layer of provider.layers){
    if(layer.tileset.tileUnload)removers.push(layer.tileset.tileUnload.addEventListener(tile=>{
      // Do not retain dead feature/content objects through repeated tile reloads.
      // The next content instance is matched afresh by its own source fields.
      for(const [feature,item] of changed)if(item.tile===tile)changed.delete(feature);
    }));
  }
  const removeFrame=scene.preRender.addEventListener(()=>{
    for(const job of jobs)for(const part of job.parts)if(!part.model.isDestroyed?.())part.model.show=false;
  });
  for(const descriptor of descriptors)void prepare(descriptor);
  return {
    setEnabled(value){enabled=!!value;if(!enabled){restore();for(const j of jobs)for(const p of j.parts)p.model.show=false;}redraw();},
    setVisible(value){visible=!!value;if(!visible){restore();for(const j of jobs)for(const p of j.parts)p.model.show=false;}redraw();},
    destroy(){if(destroyed)return;destroyed=true;for(const remove of removers)remove();removeFrame();restore();for(const job of jobs)disposeModel(job);},
  };
}
