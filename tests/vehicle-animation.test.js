import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Matrix4 } from 'cesium';
import { wheelLocalMatrix, createVehicleAnimator } from '../src/vehicle-animation.js';
import { wheelRigs } from '../src/wheel-rigs.js';

const rig=wheelRigs['/models/mustang-2005.glb'];
test('measured wheel pivots stay fixed under spin and steering, including nested source transforms',()=>{
  for(const wheel of rig)for(const part of wheel.nodes){
    const original=Matrix4.fromArray(part.originalGlobal);
    const localPivot=Matrix4.multiplyByPoint(Matrix4.inverse(original,new Matrix4()),Cartesian3.fromArray(wheel.center),new Cartesian3());
    const parent=Matrix4.inverse(Matrix4.fromArray(part.parentInverse),new Matrix4());
    for(const [spin,steer] of [[0,0],[1.2,0.5],[-2.5,-0.4]]){
      const world=Matrix4.multiply(parent,wheelLocalMatrix(part,wheel.center,spin,steer),new Matrix4());
      const actual=Matrix4.multiplyByPoint(world,localPivot,new Cartesian3());
      assert.ok(Cartesian3.distance(actual,Cartesian3.fromArray(wheel.center))<1e-8);
      if(!spin&&!steer)assert.ok(Matrix4.equalsEpsilon(world,original,1e-8));
    }
  }
});
test('forward and reverse cancel wheel travel; stationary steering affects front wheels only',()=>{
  const nodes=new Map(rig.flatMap(w=>w.nodes.map(p=>[p.name,{matrix:null}])));
  let state={speed:3,steer:0};
  const animator=createVehicleAnimator({getNode:name=>nodes.get(name)},rig,()=>state);
  animator.tick(0.04);state={speed:-3,steer:0};animator.tick(0.04);
  for(const wheel of rig)for(const part of wheel.nodes)
    assert.ok(Matrix4.equalsEpsilon(nodes.get(part.name).matrix,wheelLocalMatrix(part,wheel.center,0,0),1e-8));
  state={speed:0,steer:1};animator.tick(0.04);
  for(const wheel of rig)for(const part of wheel.nodes){
    const rest=wheelLocalMatrix(part,wheel.center,0,0);
    assert.equal(Matrix4.equalsEpsilon(nodes.get(part.name).matrix,rest,1e-8),!wheel.front);
  }
});
