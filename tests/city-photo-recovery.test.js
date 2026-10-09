import test from 'node:test';
import assert from 'node:assert/strict';
import { Axis, Event } from 'cesium';
import { createCityPhotoRecovery } from '../src/city-photo-recovery.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const descriptor={name:'philly_0000',objectId:2351,nodeIndices:[42],
  url:'/models/city/philly-0000.glb',origin:[-75.155179,39.955632,12]};
function model(){
  return {ready:false,show:false,destroyed:0,readyEvent:new Event(),errorEvent:new Event(),
    isDestroyed(){return this.destroyed>0;},destroy(){this.destroyed++;this.show=false;},
    becomeReady(){this.ready=true;this.readyEvent.raiseEvent();}};
}
function fixture(t,asset=descriptor){
  const primitives=new Set();const requests=[];const fieldRequests=new Map();const statuses=[];
  const feature=(index,show=true)=>({show,getProperty:name=>name==='index'?index:undefined});
  // Draw order deliberately differs from field-array order. Neither a nearby
  // feature nor the same name with the wrong OBJECTID can be replaced.
  const neighbor=feature(1),matched=feature(0),wrongId=feature(2),alreadyHidden=feature(3,false);
  const features=[neighbor,matched,wrongId,alreadyHidden];
  const tile={content:{featuresLength:features.length,getFeature:index=>features[index]}};
  const node={data:{index:42},tile,children:[],fields:{},loadField(name){
    return new Promise((resolve,reject)=>fieldRequests.set(name,{resolve,reject}));
  }};
  const tileVisible=new Event();const tileUnload=new Event();const preRender=new Event();
  const viewer={scene:{preRender,requestRender(){},primitives:{
    add(item){primitives.add(item);return item;},
    remove(item){if(primitives.delete(item)){item.destroy();return true;}return false;},
  }}};
  const provider={layers:[{rootNode:{children:[node]},tileset:{tileVisible,tileUnload}}]};
  const recovery=createCityPhotoRecovery(viewer,provider,[asset],{
    createModel:options=>new Promise((resolve,reject)=>requests.push({options,resolve,reject})),
    onStatus:(...args)=>statuses.push(args),
  });
  t.after(()=>recovery.destroy());
  const frame=()=>{preRender.raiseEvent();tileVisible.raiseEvent(tile);};
  async function resolveFields(){
    node.fields.ObjName={values:['philly_0000','neighbor','philly_0000','philly_0000']};
    node.fields.OBJECTID={values:[2351,9999,2352,2351]};
    fieldRequests.get('ObjName').resolve();fieldRequests.get('OBJECTID').resolve();await flush();
  }
  async function loadModel(){const value=model();requests[0].resolve(value);await flush();return value;}
  return {recovery,primitives,requests,fieldRequests,statuses,node,tile,tileVisible,tileUnload,preRender,
    neighbor,matched,wrongId,alreadyHidden,frame,resolveFields,loadModel};
}

test('original stays visible until model and source identity are ready, then only the exact feature is replaced',async t=>{
  for(const first of ['model','fields']){
    const h=fixture(t);const replacement=await h.loadModel();h.frame();
    assert.equal(h.matched.show,true);assert.equal(replacement.show,false);
    assert.deepEqual([...h.fieldRequests.keys()],['ObjName','OBJECTID']);
    if(first==='model')replacement.becomeReady();else await h.resolveFields();
    h.frame();assert.equal(h.matched.show,true);assert.equal(replacement.show,false);
    if(first==='model')await h.resolveFields();else replacement.becomeReady();
    h.frame();assert.equal(h.matched.show,false);assert.equal(replacement.show,true);
    assert.equal(h.neighbor.show,true);assert.equal(h.wrongId.show,true);assert.equal(h.alreadyHidden.show,false);
    assert.equal(h.requests[0].options.upAxis,Axis.Y);assert.equal(h.requests[0].options.forwardAxis,Axis.X);
    assert.equal(h.requests[0].options.url,descriptor.url);
    h.recovery.destroy();
  }
});

test('photograph and retained source remainder swap together only for the verified source version',async t=>{
  t.mock.method(console,'warn',()=>{});
  const h=fixture(t,{...descriptor,urls:['/photo.glb','/remainder.glb'],sourceVersion:'verified-source'});
  h.node.data.version='verified-source';h.frame();await h.resolveFields();
  const photograph=await h.loadModel();photograph.becomeReady();h.frame();
  assert.equal(h.matched.show,true);assert.equal(photograph.show,false);
  assert.equal(h.requests[1].options.url,'/remainder.glb');
  const remainder=model();h.requests[1].resolve(remainder);await flush();h.frame();
  assert.equal(h.matched.show,true);
  remainder.becomeReady();h.node.data.version='changed-source';h.frame();
  assert.equal(h.matched.show,true);assert.equal(photograph.show,false);
  h.node.data.version='verified-source';h.frame();
  assert.equal(h.matched.show,false);assert.equal(photograph.show,true);assert.equal(remainder.show,true);
  remainder.errorEvent.raiseEvent(new Error('remainder render failed'));h.frame();
  assert.equal(h.matched.show,true);assert.equal(photograph.destroyed,1);assert.equal(remainder.destroyed,1);
});

test('toggle, visibility changes and destruction restore source visibility without exposing filtered neighbors',async t=>{
  const h=fixture(t);const replacement=await h.loadModel();replacement.becomeReady();h.frame();await h.resolveFields();h.frame();
  for(const method of ['setEnabled','setVisible']){
    h.recovery[method](false);h.frame();
    assert.equal(h.matched.show,true);assert.equal(replacement.show,false);assert.equal(h.alreadyHidden.show,false);
    h.recovery[method](true);h.frame();assert.equal(h.matched.show,false);assert.equal(replacement.show,true);
  }
  h.recovery.destroy();h.recovery.destroy();
  assert.equal(h.matched.show,true);assert.equal(h.neighbor.show,true);assert.equal(h.alreadyHidden.show,false);
  assert.equal(replacement.destroyed,1);assert.equal(h.primitives.size,0);
  assert.equal(h.tileVisible.numberOfListeners,0);assert.equal(h.preRender.numberOfListeners,0);
  assert.equal(h.tileUnload.numberOfListeners,0);
  assert.equal(replacement.readyEvent.numberOfListeners,0);assert.equal(replacement.errorEvent.numberOfListeners,0);
});

test('unloaded feature objects are released and fresh tile content is matched again',async t=>{
  const h=fixture(t);const replacement=await h.loadModel();replacement.becomeReady();h.frame();await h.resolveFields();h.frame();
  assert.equal(h.matched.show,false);
  h.tileUnload.raiseEvent(h.tile);
  // An unloaded feature must no longer be touched by restore(), even during
  // the interval where the tile still exposes its old content reference.
  let staleWrites=0;Object.defineProperty(h.matched,'show',{get:()=>false,set:()=>staleWrites++});
  h.recovery.setEnabled(false);assert.equal(staleWrites,0);
  const fresh={show:true,getProperty:()=>0};
  h.tile.content={featuresLength:1,getFeature:()=>fresh};
  h.recovery.setEnabled(true);h.frame();assert.equal(fresh.show,false);
  h.recovery.setEnabled(false);assert.equal(fresh.show,true);assert.equal(staleWrites,0);
});

test('a model that finishes after destruction is disposed and cannot change the city',async t=>{
  const h=fixture(t);h.frame();h.recovery.destroy();
  const late=await h.loadModel();await h.resolveFields();h.frame();
  assert.equal(late.destroyed,1);assert.equal(h.primitives.size,0);
  assert.equal(h.matched.show,true);assert.equal(h.neighbor.show,true);
  assert.equal(h.tileVisible.numberOfListeners,0);assert.equal(h.preRender.numberOfListeners,0);
});

test('failed loading or a later model rendering error preserves or restores the original feature',async t=>{
  t.mock.method(console,'warn',()=>{});
  const rejected=fixture(t);rejected.frame();await rejected.resolveFields();
  rejected.requests[0].reject(new Error('source asset missing'));await flush();rejected.frame();
  assert.equal(rejected.matched.show,true);assert.equal(rejected.primitives.size,0);assert.equal(rejected.statuses.length,1);
  const h=fixture(t);const replacement=await h.loadModel();replacement.becomeReady();h.frame();await h.resolveFields();h.frame();
  assert.equal(h.matched.show,false);
  replacement.errorEvent.raiseEvent(new Error('texture failed'));h.frame();
  assert.equal(h.matched.show,true);assert.equal(h.neighbor.show,true);assert.equal(replacement.show,false);
  assert.equal(replacement.destroyed,1);assert.equal(h.statuses.length,1);
  assert.equal(replacement.readyEvent.numberOfListeners,0);assert.equal(replacement.errorEvent.numberOfListeners,0);
});

test('failed or missing identity fields never hide the source or display an unmatched model',async t=>{
  for(const failure of ['rejected','missing']){
    const h=fixture(t);const replacement=await h.loadModel();replacement.becomeReady();h.frame();
    if(failure==='rejected'){
      h.fieldRequests.get('ObjName').reject(new Error('identity unavailable'));
      h.fieldRequests.get('OBJECTID').resolve();
    }else{
      h.fieldRequests.get('ObjName').resolve();h.fieldRequests.get('OBJECTID').resolve();
    }
    await flush();h.frame();h.frame();
    assert.equal(h.matched.show,true);assert.equal(h.neighbor.show,true);assert.equal(h.wrongId.show,true);
    assert.equal(replacement.show,false);assert.equal(h.fieldRequests.size,2);
  }
});
