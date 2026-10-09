import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSourceSurfaceCell,fetchCitySurfaceCell} from '../src/city-surface-cell.js';
import {geographicPoint,area,pointInTriangle} from '../src/district-geometry.js';
import {planningDistrictAt} from '../src/planning-districts.js';

const feature=(rings,FCODE=2210,id=1)=>({type:'Feature',properties:{OBJECTID_1:id,FCODE},geometry:{type:'Polygon',coordinates:rings.map(r=>r.map(geographicPoint))}});
const rectangle=(x,y,u,v)=>[[x,y],[u,y],[u,v],[x,v],[x,y]];
const triangles=flat=>Array.from({length:flat.length/6},(_,i)=>[flat.slice(i*6,i*6+2),flat.slice(i*6+2,i*6+4),flat.slice(i*6+4,i*6+6)]);
test('source courtyard survives subdivision across adjacent cells without overlapping area',()=>{
  const f=feature([rectangle(70,10,130,90),rectangle(90,30,110,70).reverse()]);
  let total=0;
  for(const x of [0,1]){
    const c=buildSourceSurfaceCell([f],x,0),ts=triangles(c.groups.sidewalk);
    total+=ts.reduce((s,t)=>s+Math.abs(area(t)),0);
    assert.ok(ts.every(t=>!pointInTriangle([x?105:95,50],t)));
    for(const values of [...Object.values(c.groups),c.curbs])for(let i=0;i<values.length;i+=2){
      assert.ok(values[i]>=x*100&&values[i]<=(x+1)*100);
      assert.ok(values[i+1]>=0&&values[i+1]<=100);
    }
    for(let i=0;i<c.curbs.length;i+=4)assert.ok(Math.hypot(c.curbs[i+2]-c.curbs[i],c.curbs[i+3]-c.curbs[i+1])<=3.002);
    // Cell cuts must not manufacture a curb through the middle of the sidewalk.
    for(let i=0;i<c.curbs.length;i+=4)assert.ok(!(c.curbs[i]===100&&c.curbs[i+2]===100));
  }
  assert.ok(Math.abs(total-4000)<.1);
});
test('elevated bridges and buildings never become ground road surfaces',()=>{
  const c=buildSourceSurfaceCell([1200,1210,1220,1810].map((code,i)=>feature([rectangle(0,0,50,50)],code,i)),0,0);
  assert.deepEqual(c.groups,{});assert.equal(c.sourceFeatures,0);
});
test('source pagination rejects duplicate identities and propagates service failures',async()=>{
  const f=feature([rectangle(0,0,10,10)]);
  let calls=0;
  await assert.rejects(fetchCitySurfaceCell(0,0,{fetcher:async()=>{calls++;return {ok:true,json:async()=>({features:[f],exceededTransferLimit:true})};}}),/repeated identity/);
  assert.equal(calls,2);
  await assert.rejects(fetchCitySurfaceCell(0,0,{fetcher:async()=>({ok:false,status:503})}),/HTTP 503/);
  await assert.rejects(fetchCitySurfaceCell(0,0,{fetcher:async()=>({ok:true,json:async()=>({error:{message:'bad query'}})})}),/invalid data/);
});
test('source envelope uses real geography and forwards cancellation',async()=>{
  const controller=new AbortController();
  const c=await fetchCitySurfaceCell(0,0,{signal:controller.signal,fetcher:async(url,options)=>{
    const q=new URL(url).searchParams;assert.equal(options.signal,controller.signal);
    assert.equal(q.get('inSR'),'4326');assert.deepEqual(q.get('geometry').split(',').map(Number),[...geographicPoint([0,0]),...geographicPoint([100,100])]);
    return {ok:true,json:async()=>({features:[feature([rectangle(0,0,10,10)],1000)]})};
  }});
  assert.ok(c.groups.road.length);assert.equal(c.sourceFeatures,1);
});
test('official city boundaries distinguish regional coverage and outside Philadelphia',()=>{
  assert.equal(planningDistrictAt(-75.1661,39.9317)?.name,'South');
  assert.equal(planningDistrictAt(-75.2182,39.9508)?.name,'University Southwest');
  assert.equal(planningDistrictAt(-75.05,40.05)?.name,'Central Northeast');
  assert.equal(planningDistrictAt(-74.9,39.9),null);
  assert.equal(planningDistrictAt(NaN,39.9),null);
});
