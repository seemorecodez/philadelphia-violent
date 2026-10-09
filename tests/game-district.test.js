import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {triangulatePolygon,area,clipBox,geographicPoint,localPoint,pointInTriangle} from '../src/district-geometry.js';
import {buildDistrictCell,sampleDistrictHeights} from '../src/game-district.js';
import {advanceAlongPath,createStreetGraph,sampleLane} from '../src/district-navigation.js';
test('district surface tessellation preserves courtyards and cell boundaries',()=>{
  const ring=[[0,0],[30,0],[30,30],[0,30],[0,0]],hole=[[10,10],[10,20],[20,20],[20,10],[10,10]];
  const triangles=triangulatePolygon([ring,hole]);assert.equal(triangles.reduce((s,t)=>s+Math.abs(area(t)),0),800);
  const pieces=triangles.map(t=>clipBox(t,[0,0,15,30]));assert.equal(pieces.reduce((s,t)=>s+Math.abs(area(t)),0),400);
  const p=[100,200],round=localPoint(geographicPoint(p));assert.ok(Math.hypot(round[0]-p[0],round[1]-p[1])<.000001);
  assert.equal(pointInTriangle([0,0],[[1,1],[2,2],[3,3]]),false);
});
test('road surfaces follow terrain and curbs have actual relief, unknown heights never fall back to zero',()=>{
  const cell={x:0,y:0,groups:{road:[0,0,10,0,0,10],sidewalk:[10,0,10,10,0,10]},curbs:[10,0,0,10]};
  assert.equal(buildDistrictCell(cell,()=>undefined),null);
  const mesh=buildDistrictCell(cell,()=>12);assert.equal(mesh.triangles,4);
  for(const attr of Object.values(mesh.geometry.attributes))assert.ok([...attr.values].every(Number.isFinite));
  const pos=mesh.geometry.attributes.position.values,z=Array.from(pos).filter((_,i)=>i%3===2);
  assert.ok(Math.max(...z)-Math.min(...z)>.13);
});
test('terrain preparation samples unique source vertices once and returns an in-memory sampler',async()=>{
  const cell={id:'0_0',x:0,y:0,groups:{road:[0,0,10,0,0,10]},curbs:[0,0,10,0]};let count=0,calls=0;
  const height=await sampleDistrictHeights(cell,async points=>{calls++;count=points.length;for(const p of points)p.height=12;});
  assert.equal(calls,1);assert.equal(count,441);const built=buildDistrictCell(cell,height);assert.ok(built);assert.equal(calls,1);
  await assert.rejects(sampleDistrictHeights(cell,async points=>{points[0].height=NaN;}));
});
test('route sampler uses geographic north, handles duplicates, correct total length at every distance',()=>{
  const path=[[0,0],[0,0],[10,0],[10,20]],p=advanceAlongPath(path,15);
  assert.equal(p.heading,0);assert.equal(p.length,30);assert.deepEqual([p.x,p.y],[10,5]);
  assert.equal(advanceAlongPath(path,100).finished,true);assert.equal(advanceAlongPath([[0,0],[10,0]],2).heading,Math.PI/2);
  assert.throws(()=>advanceAlongPath([[0,0],[0,0]],2));assert.throws(()=>advanceAlongPath(path,-1));
});
test('actual Philadelphia route graph retains one-way endpoints and omits expressways/ramps',async()=>{
  const data=JSON.parse(await readFile('public/data/district/streets.geojson'));
  const graph=createStreetGraph(data.features),source=data.features.find(f=>f.properties.seg_id===440944).properties;
  const edges=graph.edges.filter(e=>e.sourceId===440944);assert.equal(edges.length,1);assert.equal(edges[0].from,source.tnode_);assert.equal(edges[0].to,source.fnode_);
  const p=sampleLane(edges[0],10);assert.ok(p.heading<-2||p.heading>2);
  for(const edge of graph.edges){const source=data.features.find(f=>f.properties.seg_id===edge.sourceId);assert.ok([2,3,4,5].includes(source.properties.class));}
});
