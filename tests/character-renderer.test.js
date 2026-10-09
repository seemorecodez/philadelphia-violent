import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Event, Matrix4 } from 'cesium';
import { createCharacterRenderer } from '../src/character-renderer.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const items=new Set();const calls=[];const clips=[];let moving=false;let show=true;let resolveLoad;let x=0;let z=0;let speed=1;
  const model={ready:false,show:true,modelMatrix:new Matrix4(),readyEvent:new Event(),errorEvent:new Event(),dead:false,
    activeAnimations:{removeAll(){calls.push('clear');},add(options){calls.push(options.name);clips.push(options);}},
    destroy(){this.dead=true;},isDestroyed(){return this.dead;}};
  const scene={preUpdate:new Event(),preRender:new Event(),requestRender(){},primitives:{add(v){items.add(v);},remove(v){if(items.delete(v))v.destroy();}}};
  const renderer=createCharacterRenderer({scene},{modelUrl:'/human.glb',getMatrix:()=>Matrix4.fromTranslation(new Cartesian3(x,0,z)),getShow:()=>show,getMoving:()=>moving,getSpeed:()=>speed,strideLength:1,runStrideLength:2,
    loadModel:()=>new Promise(resolve=>{resolveLoad=resolve;})});
  return {renderer,model,scene,items,calls,clips,setPosition(value,height=z){x=value;z=height;},move(value,direction=1,height=z){x=value;z=height;speed=direction;scene.preRender.raiseEvent();},load:async()=>{await flush();resolveLoad(model);await flush();},ready(){model.ready=true;model.readyEvent.raiseEvent();},walk(){moving=true;scene.preRender.raiseEvent();},idle(){moving=false;scene.preRender.raiseEvent();},hide(){show=false;scene.preRender.raiseEvent();}};
}
test('character shows only after readiness and plays one named clip at a time',async()=>{
  const h=fixture();await h.load();assert.equal(h.model.show,false);assert.deepEqual(h.calls,[]);
  h.ready();assert.equal(h.model.show,true);assert.deepEqual(h.calls,['clear','Idle']);
  h.walk();assert.deepEqual(h.calls.slice(-2),['clear','Walk']);
  const count=h.calls.length;h.walk();assert.equal(h.calls.length,count);
  h.idle();assert.deepEqual(h.calls.slice(-2),['clear','Idle']);
  h.hide();assert.equal(h.model.show,false);
  h.renderer.destroy();assert.equal(h.model.dead,true);assert.equal(h.scene.preRender.numberOfListeners,0);
});
test('late character loading after exit destroys the asset and never shows it',async()=>{
  const h=fixture();h.renderer.destroy();await h.load();assert.equal(h.model.dead,true);assert.equal(h.items.size,0);assert.equal(await h.renderer.ready,null);
});
test('walk phase follows actual travel, freezes on collision and reverses with backward steps',async()=>{
  const h=fixture();await h.load();h.ready();h.walk();
  const phase=h.clips.at(-1).animationTime;
  assert.equal(phase(),0);h.move(.25);assert.equal(phase(),.25);
  h.walk();h.walk();assert.equal(phase(),.25);
  h.move(0,-1);assert.equal(phase(),0);
  h.move(100);assert.equal(phase(),0); // Repositioning is not a stride.
  h.hide();h.move(100.5);assert.equal(phase(),0);
  h.renderer.destroy();
});
test('sprinting selects the Run clip with its own stride, then stops in Idle',async()=>{
  const h=fixture();await h.load();h.ready();h.walk();h.move(.5,4);
  assert.equal(h.clips.at(-1).name,'Run');assert.equal(h.clips.at(-1).animationTime(),.25);
  const count=h.clips.length;h.move(1,4);assert.equal(h.clips.length,count);assert.equal(h.clips.at(-1).animationTime(),.5);
  h.idle();assert.equal(h.clips.at(-1).name,'Idle');h.renderer.destroy();
});

test('terrain height corrections do not count as walking strides',async()=>{
  const h=fixture();await h.load();h.ready();h.walk();
  const phase=h.clips.at(-1).animationTime;
  h.move(0,1,1.2);assert.equal(phase(),0);
  h.move(.25,1,1.8);assert.ok(Math.abs(phase()-.25)<1e-12);
  h.move(.25,1,5);assert.ok(Math.abs(phase()-.25)<1e-12);
  h.renderer.destroy();
});

test('rendered pose consumes movement from the same frame after host simulation',async()=>{
  const h=fixture();await h.load();h.ready();h.walk();
  h.scene.preUpdate.addEventListener(()=>h.setPosition(.4));
  h.scene.preUpdate.raiseEvent();
  h.scene.preRender.raiseEvent();
  assert.equal(h.model.modelMatrix[12],.4);
  assert.equal(h.clips.at(-1).animationTime(),.4);
  h.renderer.destroy();
  h.scene.preRender.raiseEvent();assert.equal(h.items.size,0);
});
