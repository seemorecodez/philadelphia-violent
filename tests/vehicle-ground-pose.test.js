import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Ellipsoid, HeadingPitchRoll, Matrix4, Transforms } from 'cesium';
import { fitVehicleGroundPose } from '../src/vehicle-ground-pose.js';
import { vehicles } from '../src/vehicles.js';

const position={longitude:-75.16469,latitude:39.94746,heading:0,height:12};
const tolerance=2e-6;
function plane(eastSlope,northSlope,height=12) {
  const origin=Cartesian3.fromDegrees(position.longitude,position.latitude,height);
  const frame=Transforms.eastNorthUpToFixedFrame(origin);
  const inverse=Matrix4.inverseTransformation(frame,new Matrix4());
  const normal=Matrix4.multiplyByPointAsVector(frame,new Cartesian3(-eastSlope,-northSlope,1),new Cartesian3());
  let calls=0;
  return {frame,inverse,get calls(){return calls;},height(longitude,latitude){
    calls++;
    // Intersect the geodetic height ray with a physical plane in ECEF. This
    // fixture independently checks sampling, headings, units and HPR signs.
    const surface=Cartesian3.fromDegrees(longitude,latitude,0);
    const up=Ellipsoid.WGS84.geodeticSurfaceNormal(surface,new Cartesian3());
    return Cartesian3.dot(normal,Cartesian3.subtract(origin,surface,new Cartesian3()))/Cartesian3.dot(normal,up);
  }};
}
function assertOnPlane(state,vehicle,pose,terrain,eastSlope,northSlope) {
  const matrix=Transforms.headingPitchRollToFixedFrame(
    Cartesian3.fromDegrees(state.longitude,state.latitude,pose.height),
    new HeadingPitchRoll(state.heading-Math.PI/2,pose.pitch,pose.roll),
  );
  for (const forward of [-vehicle.length/2,0,vehicle.length/2])for (const left of [-vehicle.width/2,0,vehicle.width/2]) {
    const world=Matrix4.multiplyByPoint(matrix,new Cartesian3(forward,left,0),new Cartesian3());
    const local=Matrix4.multiplyByPoint(terrain.inverse,world,new Cartesian3());
    assert.ok(Math.abs(local.z-eastSlope*local.x-northSlope*local.y)<tolerance,
      `footprint left plane at heading ${state.heading}: ${local.z-eastSlope*local.x-northSlope*local.y}`);
  }
}

test('flat loaded terrain preserves level pitch/roll and uses observed rather than stale state height',()=>{
  const terrain=plane(0,0,27);const pose=fitVehicleGroundPose({...position,height:-500},vehicles[0],terrain.height);
  assert.ok(pose);assert.equal(terrain.calls,9);assert.equal(pose.sampleCount,9);
  assert.ok(Math.abs(pose.pitch)<tolerance);assert.ok(Math.abs(pose.roll)<tolerance);
  assert.ok(Math.abs(pose.height-27)<tolerance);assert.ok(Math.abs(pose.verticalOffset)<tolerance);
});

test('combined slopes match the actual Cesium model plane at rotated headings for both measured cars',()=>{
  for(const vehicle of vehicles)for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,.71]) {
    const terrain=plane(.19,-.13);const state={...position,heading};
    const pose=fitVehicleGroundPose(state,vehicle,terrain.height);
    assert.ok(pose);assert.equal(terrain.calls,9);
    assertOnPlane(state,vehicle,pose,terrain,.19,-.13);
    assert.ok(Math.abs(pose.height-(pose.centerHeight+pose.verticalOffset))<tolerance);
  }
});

test('uphill front and uphill left have the verified positive pitch/roll signs',()=>{
  const front=plane(0,.1);const left=plane(-.1,0);
  const pitched=fitVehicleGroundPose(position,vehicles[0],front.height);
  const rolled=fitVehicleGroundPose(position,vehicles[0],left.height);
  assert.ok(Math.abs(pitched.pitch-Math.atan(.1))<tolerance);assert.ok(Math.abs(pitched.roll)<tolerance);
  assert.ok(Math.abs(rolled.roll-Math.atan(.1))<tolerance);assert.ok(Math.abs(rolled.pitch)<tolerance);
});

test('missing terrain, steep terrain and discontinuities return no replacement pose',()=>{
  assert.equal(fitVehicleGroundPose(position,vehicles[0],()=>undefined),null);
  const flat=plane(0,0);let count=0;
  assert.equal(fitVehicleGroundPose(position,vehicles[0],(lon,lat)=>++count===5?NaN:flat.height(lon,lat)),null);
  assert.equal(count,5);
  assert.equal(fitVehicleGroundPose(position,vehicles[0],()=>{throw new Error('tile unavailable');}),null);
  const cliff=plane(1,0);assert.equal(fitVehicleGroundPose(position,vehicles[0],cliff.height),null);
  const bump=plane(0,0);
  assert.equal(fitVehicleGroundPose(position,vehicles[0],(lon,lat)=>bump.height(lon,lat)+(lon>position.longitude?2:0)),null);
});

test('small observed crown supplies only its necessary support offset; no input is mutated',()=>{
  const state=Object.freeze({...position});const vehicle=Object.freeze({...vehicles[0]});
  const terrain=plane(0,0);
  const pose=fitVehicleGroundPose(state,vehicle,(lon,lat)=>terrain.height(lon,lat)
    +(lon===position.longitude && lat===position.latitude?0.06:0));
  assert.ok(pose);assert.ok(pose.maxResidual>0.04 && pose.maxResidual<0.07);
  assert.ok(Math.abs(pose.height-12.06)<tolerance);
  assert.equal(state.height,12);
  assert.equal(fitVehicleGroundPose({...state,heading:NaN},vehicle,terrain.height),null);
  assert.equal(fitVehicleGroundPose(state,{...vehicle,width:0},terrain.height),null);
});
