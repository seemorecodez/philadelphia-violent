import test from 'node:test';import assert from 'node:assert/strict';
import {houseProfile} from '../src/house-profile.js';
import {buildHouseGeometry,createHouseDetails} from '../src/house-details.js';
const reference={id:'photo-west',wall:[.4,.3,.2],trim:[.7,.7,.6],roof:[.6,.6,.5]};
test('local-agent profile retains reference identity, stable house IDs, and valid bounded dimensions',()=>{
  const first=houseProfile('building-20',7,reference);
  assert.deepEqual(first,houseProfile('building-20',7,reference));assert.equal(first.referenceId,reference.id);
  assert.ok(houseProfile(0,7,reference));
  for(const id of [null,{},Infinity,NaN,' '])assert.equal(houseProfile(id,7,reference),null);
  for(const height of [0,-1,Infinity,'7'])assert.equal(houseProfile('1',height,reference),null);
  assert.equal(houseProfile('1',7,{...reference,wall:[NaN,0,0]}),null);
  const colors=new Set();
  for(let id=0;id<100;id++){const p=houseProfile(id,7,reference);assert.ok(p.seed>=0);assert.ok(p.windowHeight<7/p.floors);p.wall.forEach((v,i)=>assert.ok(Math.abs(v-reference.wall[i])<=.035001));colors.add(p.wall.join(','));}
  assert.ok(colors.size>90);
});
const origin=[-75.1661,39.9317],sx=111320*Math.cos(origin[1]*Math.PI/180);
const ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]].map(([a,b])=>[origin[0]+a/sx,origin[1]+b/111320]);
const feature={id:'test-house',height:7,baseHeight:12,longitude:origin[0],latitude:origin[1],polygons:[[ring(0,0,6,12)]]};
test('real-footprint detail retains height, courtyard opening and finite render buffers; skips named landmarks',()=>{
  const f={...feature,polygons:[[ring(0,0,10,14),ring(3,4,3,4)]]};
  const built=buildHouseGeometry(f);assert.ok(built);
  for(const a of Object.values(built.geometry.attributes))assert.ok([...a.values].every(Number.isFinite));
  const p=built.geometry.attributes.position.values;assert.ok(Math.max(...Array.from(p).filter((_,i)=>i%3===2))<f.height+.02);
  const indices=built.geometry.indices,normal=built.geometry.attributes.normal.values;
  for(let i=0;i<indices.length;i+=3){const ids=Array.from(indices.slice(i,i+3));if(!ids.every(id=>normal[id*3+2]===1&&p[id*3+2]>f.height))continue;
    const x=ids.reduce((s,id)=>s+p[id*3],0)/3,y=ids.reduce((s,id)=>s+p[id*3+1],0)/3;
    assert.ok(!(x>3&&x<6&&y>4&&y<8),'roof must not close courtyard');}
  assert.equal(buildHouseGeometry({...feature,buildingName:'Museum'}),null);
  assert.equal(buildHouseGeometry({...feature,height:null}),null);
});
test('detail batch disappears with destroyed building and session clear releases it',()=>{
  const active=new Set();const viewer={scene:{primitives:{add(p){active.add(p);return p;},remove(p){active.delete(p);p.destroy();}},requestRender(){}}};
  const layer=createHouseDetails(viewer);layer.update([feature],...origin);assert.equal(layer.getStats().houses,1);
  layer.hide(feature.id);assert.equal(active.size,0);layer.update([feature],...origin);assert.equal(active.size,0);
  layer.clear();layer.update([feature],...origin);assert.equal(active.size,1);layer.destroy();assert.equal(active.size,0);
});
