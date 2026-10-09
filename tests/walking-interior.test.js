import test from 'node:test';
import assert from 'node:assert/strict';
import { moveOnFoot, groundDistance, intersectsParkedCar } from '../src/walking.js';
import { LAYOUTS, interiorBlocked } from '../src/interiors.js';
const start={longitude:-75.1647,latitude:39.9476,height:0,heading:0,speed:0,distance:0};
test('walking can turn at rest, moves forward, and bounds elapsed time',()=>{
  const turned=moveOnFoot(start,{steer:1},1);
  assert.equal(turned.latitude,start.latitude);
  assert.ok(turned.heading>0 && turned.heading<0.2);
  const moved=moveOnFoot(start,{throttle:1},1);
  assert.ok(moved.latitude>start.latitude);
  assert.ok(groundDistance(start,moved)<0.1);
});
test('walker cannot pass through parked car including its rotated body',()=>{
  const shape={length:4.77,width:2.14};
  const offset=(east,north)=>({...start,longitude:start.longitude+east/(111320*Math.cos(start.latitude*Math.PI/180)),latitude:start.latitude+north/111320});
  assert.equal(intersectsParkedCar(offset(0,2),start,shape),true);
  assert.equal(intersectsParkedCar(offset(2,0),start,shape),false);
  assert.equal(intersectsParkedCar(offset(2,0),{...start,heading:Math.PI/2},shape),true);
  assert.equal(intersectsParkedCar(offset(3,0),{...start,heading:Math.PI/2},shape),false);
});
test('sprint moves forward faster but backing away retains a walking gait speed',()=>{
  assert.equal(moveOnFoot(start,{throttle:1,sprint:true},.03).speed,4.5);
  assert.equal(moveOnFoot(start,{throttle:-1,sprint:true},.03).speed,-1.65);
});
test('interior door gaps remain open while walls and furniture stop passage',()=>{
  const shop=LAYOUTS.shop;
  assert.equal(interiorBlocked(shop,0,3),false);
  assert.equal(interiorBlocked(shop,2,3),true);
  assert.equal(interiorBlocked(shop,-4,-1),true);
  assert.equal(interiorBlocked(shop,0,9),true);
  for(const layout of Object.values(LAYOUTS)) assert.equal(interiorBlocked(layout,...layout.spawn),false);
});
