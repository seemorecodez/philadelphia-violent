import test from 'node:test';import assert from 'node:assert/strict';import {inPark} from '../src/park-boundary.js';
import {placeCanopyTrees} from '../src/park-canopy.js';
const ring=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]];
test('park gate excludes holes and malformed collections while admitting separate islands',()=>{
  const polygon={type:'Polygon',coordinates:[ring(0,0,10,10),ring(3,3,7,7)]};
  assert.equal(inPark([2,2],polygon),true);assert.equal(inPark([0,3],polygon),true);
  assert.equal(inPark([3,4],polygon),false);assert.equal(inPark([5,5],polygon),false);
  const island={type:'MultiPolygon',coordinates:[polygon.coordinates,[ring(4,4,6,6)]]};assert.equal(inPark([5,5],island),true);
  for(const geometry of [null,{type:'MultiPolygon'}, {type:'Polygon',coordinates:[]},{type:'MultiPolygon',coordinates:[polygon.coordinates,[]]}])assert.equal(inPark([2,2],geometry),false);
  assert.equal(inPark(['2',2],polygon),false);
});
test('woodland placement is stable and constrained to canopy, park boundary and path clearance',()=>{
  const center={longitude:-75.1955,latitude:39.9884};const [x,y]=[center.longitude,center.latitude];
  const f=(coords)=>({geometry:{type:'Polygon',coordinates:[coords]},properties:{PUBLIC_NAM:'Test park'}});
  const parks=[f(ring(x-.002,y-.002,x+.002,y+.002))];
  const canopy=[f(ring(x-.0015,y-.0015,x+.0015,y+.0015))];
  const path=[f(ring(x-.00015,y-.002,x+.00015,y+.002))];
  const trees=placeCanopyTrees(center,parks,canopy,path,{limit:80});assert.equal(trees.length,80);
  assert.deepEqual(trees,placeCanopyTrees(center,parks,canopy,path,{limit:80}));
  for(const t of trees){const p=[t.longitude,t.latitude];assert.ok(inPark(p,parks[0].geometry));assert.ok(inPark(p,canopy[0].geometry));assert.equal(inPark(p,path[0].geometry),false);}
  assert.equal(placeCanopyTrees(center,parks,[],path).length,0);
});
