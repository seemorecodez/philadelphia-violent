import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCameraRig } from '../src/camera-rig.js';

test('street framing brings the actor closer without changing the hood mount',()=>{
  const rig=createCameraRig();
  const walking=rig.sample({mode:'walking'});
  assert.ok(walking.back<4 && walking.height<2.3 && walking.targetHeight>1);
  const fast=rig.sample({speed:32});
  assert.ok(fast.back<12 && fast.height<4 && fast.fov<=68);
  rig.begin();rig.drag(200,100);rig.scroll(300);
  const hood=rig.sample({camera:'hood'});
  assert.equal(hood.back,-.45);assert.equal(hood.yaw,0);assert.equal(hood.height,1.45);
});
test('a whole Mustang and the character feet fit the normal widescreen view',()=>{
  const rig=createCameraRig();
  for(const mode of ['driving','walking']){
    const f=rig.sample({mode});
    const verticalHalf=Math.atan(Math.tan(f.fov*Math.PI/360)/(16/9));
    const lookDown=Math.atan2(f.height-f.targetHeight,f.back+f.ahead);
    const footDown=Math.atan2(f.height,f.back-(mode==='driving'?4.77/2:0));
    assert.ok(footDown-lookDown<verticalHalf-.015,`${mode} feet/tyres need a visible lower-frame margin`);
  }
});
test('manual free look remains at rest, returns smoothly in motion and stays bounded',()=>{
  const rig=createCameraRig();rig.begin();rig.drag(300,200);rig.end();
  const initial=rig.sample().yaw;
  assert.equal(rig.sample().ahead,0,'side views orbit the actual actor rather than a point ahead of it');
  for(let i=0;i<100;i++)rig.sample({dt:.1});
  assert.equal(rig.sample().yaw,initial);
  for(let i=0;i<50;i++)rig.sample({dt:.1,speed:10});
  assert.ok(Math.abs(rig.sample().yaw)<.001);
  for(let i=0;i<50;i++)rig.scroll(-10000);
  assert.ok(rig.sample().back>4);
  rig.reset();assert.equal(rig.sample().yaw,0);
});
test('paused and reduced-motion views do not automatically orbit or widen with speed',()=>{
  const rig=createCameraRig({reducedMotion:true});rig.begin();rig.drag(200,0);rig.end();
  const yaw=rig.sample().yaw;
  for(let i=0;i<50;i++)rig.sample({dt:.1,speed:20});
  assert.equal(rig.sample({speed:20}).yaw,yaw);assert.equal(rig.sample({speed:20}).fov,60);
  const paused=createCameraRig();paused.begin();paused.drag(200,0);paused.end();
  const angle=paused.sample().yaw;
  for(let i=0;i<50;i++)paused.sample({paused:true,speed:20,dt:.1});
  assert.equal(paused.sample().yaw,angle);
});
