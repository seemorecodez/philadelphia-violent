import test from 'node:test';
import assert from 'node:assert/strict';
import { Event, Matrix4 } from 'cesium';
import { createInterior, LAYOUTS, interiorBlocked } from '../src/interiors.js';
import { createCharacterRenderer } from '../src/character-renderer.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const outside={longitude:-75.1647,latitude:39.9476,height:12};
function model(){
  return {ready:false,show:false,modelMatrix:new Matrix4(),dead:false,
    readyEvent:new Event(),errorEvent:new Event(),
    activeAnimations:{removeAll(){},add(){}},
    isDestroyed(){return this.dead;},destroy(){this.dead=true;this.show=false;}};
}
function fixture(heightFeet=18){
  const items=new Set();const rooms=[];const actors=[];const populations=[];const camera=[];
  const viewer={scene:{preRender:new Event(),requestRender(){},primitives:{
    add(item){items.add(item);return item;},remove(item){if(items.delete(item)){item.destroy();return true;}return false;},
  }},entities:{remove(){}},camera:{setView(value){camera.push(value);}}};
  function pending(list){return new Promise((resolve,reject)=>list.push({resolve,reject,model:model()}));}
  const interior=createInterior(viewer,{
    loadModel:()=>pending(rooms),
    rendererFactory:(target,options)=>createCharacterRenderer(target,{...options,loadModel:()=>pending(actors)}),
    npcFactory:()=>{
      const npc={ticks:[],talks:0,dead:false,blocks(){return false;},
        tick(dt,paused){this.ticks.push({dt,paused});return {nearbyName:'Sam',dialogue:null};},
        interact(){this.talks++;return {nearbyName:'Sam'};},destroy(){this.dead=true;}};
      populations.push(npc);return npc;
    },
  });
  const enter=()=>interior.enter({id:'test-building',heightFeet},outside);
  async function load(list,index=0,alreadyReady=false){
    await flush();const entry=list[index];entry.model.ready=alreadyReady;entry.resolve(entry.model);await flush();return entry.model;
  }
  function markReady(value){value.ready=true;value.readyEvent.raiseEvent();viewer.scene.preRender.raiseEvent();}
  async function ready(){
    const room=await load(rooms);const actor=await load(actors);markReady(room);markReady(actor);
  }
  enter();
  return {interior,viewer,items,rooms,actors,populations,camera,enter,load,markReady,ready};
}

test('room readiness alone cannot move or talk before the player becomes visible',async()=>{
  const h=fixture();const room=await h.load(h.rooms);h.markReady(room);
  const loading=h.interior.tick({throttle:1,sprint:true},.1);
  assert.equal(loading.ready,false);assert.equal(loading.y,LAYOUTS.shop.spawn[1]);assert.equal(loading.speed,0);
  assert.equal(loading.nearbyName,undefined);assert.equal(h.interior.talk(),undefined);
  assert.equal(h.populations[0].talks,0);assert.ok(h.populations[0].ticks.every(tick=>tick.paused));
  const actor=await h.load(h.actors);h.markReady(actor);
  const moving=h.interior.tick({throttle:1},.1);
  assert.equal(actor.show,true);assert.equal(moving.ready,true);assert.ok(moving.y>loading.y);
  assert.deepEqual(h.interior.talk(),{nearbyName:'Sam'});
  h.interior.destroy();assert.equal(h.items.size,0);assert.equal(h.viewer.scene.preRender.numberOfListeners,0);
});

test('already-ready room models start correctly after a character finished loading first',async()=>{
  const h=fixture();const actor=await h.load(h.actors);h.markReady(actor);
  assert.equal(actor.show,false);assert.equal(h.interior.tick({throttle:1},.1).ready,false);
  await h.load(h.rooms,0,true);h.viewer.scene.preRender.raiseEvent();
  assert.equal(h.interior.tick({throttle:1},.1).ready,true);assert.equal(h.populations.length,1);
  h.rooms[0].model.readyEvent.raiseEvent();assert.equal(h.populations.length,1);
  h.interior.destroy();
});

test('hidden and failed player models stop movement, with a usable exit after failure away from the door',async()=>{
  const h=fixture();await h.ready();let state;
  for(let index=0;index<8;index++)state=h.interior.tick({throttle:1,sprint:true},.1);
  assert.equal(state.nearExit,false);
  h.actors[0].model.show=false;
  const hidden=h.interior.tick({throttle:1},.1);
  assert.equal(hidden.ready,false);assert.equal(hidden.y,state.y);
  h.viewer.scene.preRender.raiseEvent();
  h.actors[0].model.errorEvent.raiseEvent(new Error('animation failed'));
  const failed=h.interior.tick({throttle:1,steer:1},.1);
  assert.equal(failed.ready,false);assert.equal(failed.speed,0);assert.equal(failed.y,state.y);
  assert.equal(failed.heading,state.heading);assert.equal(failed.nearExit,true);assert.match(failed.error,/Exit or E/);
  assert.equal(h.interior.talk(),undefined);h.interior.destroy();
});

test('a room rendering error stops traversal and allows exit without returning to its door',async()=>{
  const h=fixture();await h.ready();let state;
  for(let index=0;index<8;index++)state=h.interior.tick({throttle:1,sprint:true},.1);
  h.rooms[0].model.errorEvent.raiseEvent(new Error('room failed'));
  const failed=h.interior.tick({throttle:1},.1);
  assert.equal(failed.y,state.y);assert.equal(failed.ready,false);assert.equal(failed.nearExit,true);
  h.viewer.scene.preRender.raiseEvent();assert.equal(h.actors[0].model.show,false);
  h.interior.destroy();
});

test('old room events and late loads cannot alter a newly entered interior',async()=>{
  const h=fixture();await h.ready();const old=h.rooms[0].model;
  h.enter();assert.equal(old.dead,true);assert.equal(old.readyEvent.numberOfListeners,0);assert.equal(old.errorEvent.numberOfListeners,0);
  old.readyEvent.raiseEvent();old.errorEvent.raiseEvent(new Error('stale'));
  assert.equal(h.interior.tick({},0).error,'');assert.equal(h.populations.length,1);
  await flush();h.interior.exit();
  const lateRoom=await h.load(h.rooms,1);const lateActor=await h.load(h.actors,1);
  assert.equal(lateRoom.dead,true);assert.equal(lateActor.dead,true);assert.equal(h.items.size,0);
  assert.equal(h.interior.tick({},.1),null);assert.equal(h.viewer.scene.preRender.numberOfListeners,0);
});

test('indoor walking and sprinting cover the same distance at 10, 20 and 60 FPS',async()=>{
  for(const sprint of [false,true]){
    const distances=[];
    for(const fps of [10,20,60]){
      const h=fixture();await h.ready();let state;
      for(let frame=0;frame<fps;frame++)state=h.interior.tick({throttle:1,sprint},1/fps);
      distances.push(state.y-LAYOUTS.shop.spawn[1]);
      assert.ok(h.populations[0].ticks.every(tick=>tick.dt<=1/30));
      assert.ok(Math.abs(h.populations[0].ticks.reduce((sum,tick)=>sum+tick.dt,0)-1)<1e-12);
      h.interior.destroy();
    }
    for(const distance of distances)assert.ok(Math.abs(distance-(sprint?4:1.65))<1e-10);
  }
});

test('bounded substeps preserve wall collision, pause and braking without invalid camera coordinates',async()=>{
  const h=fixture(100);await h.ready();let state;
  for(let frame=0;frame<30;frame++)state=h.interior.tick({throttle:1,sprint:true},.1);
  assert.ok(state.y < -2);assert.equal(interiorBlocked(LAYOUTS.lobby,state.x,state.y),false);
  assert.equal(state.speed,0);
  const paused=h.interior.tick({throttle:-1,steer:1},.1,true);
  assert.equal(paused.x,state.x);assert.equal(paused.y,state.y);assert.equal(paused.heading,state.heading);
  const brake=h.interior.tick({throttle:-1,handbrake:true},.1);assert.equal(brake.y,state.y);assert.equal(brake.speed,0);
  const invalid=h.interior.tick({throttle:Infinity,steer:NaN},NaN);
  assert.equal(invalid.y,state.y);assert.equal(invalid.heading,state.heading);
  for(const view of h.camera){
    for(const vector of [view.destination,view.orientation.direction,view.orientation.up]){
      assert.ok([vector.x,vector.y,vector.z].every(Number.isFinite));
    }
  }
  h.interior.destroy();
});
