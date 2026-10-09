import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeStreetDetails} from '../src/street-objects.js';
import {geographicPoint} from '../src/district-geometry.js';
import {neighborhoodReferences} from '../src/neighborhood-references.js';

function rectangle(x0,y0,x1,y1,z){return [x0,y0,z,x1,y0,z,x1,y1,z,x0,y0,z,x1,y1,z,x0,y1,z];}
const style=neighborhoodReferences.find(x=>x.id==='west');
function fixture(){
  const cells=[0,1].map(i=>({id:`${i}_0`,groups:{
    road:rectangle(i*10000,0,(i+1)*10000,800,100+i*10),
    sidewalk:rectangle(i*10000,800,(i+1)*10000,1250,115+i*10),
    grass:rectangle(i*10000,1250,(i+1)*10000,5000,115+i*10),
  }}));
  const ring=[[4300,2500],[6000,2500],[6000,5000],[4300,5000],[4300,2500]];
  const features=[{id:1,polygons:[[ring.map(([x,y])=>geographicPoint([x/100,-y/100]))]]}];
  return {cells,features};
}

test('native dressing stays off roads and real structures and uses source elevation',()=>{
  const {cells,features}=fixture(),out=buildNativeStreetDetails(cells,features,style);
  const props=[...out.cells.values()].flat();
  assert(props.some(p=>p.kind==='tree'));
  assert(props.some(p=>p.kind==='lamp'));
  for(const p of props){
    const [x,y,z]=p.position;
    assert(y>800,'no road obstruction');
    assert(!(x>4140&&x<6160&&y>2340&&y<5160),'footprint and entrance buffer');
    if(p.kind==='cable')assert(z>880&&z<950,'conductors stay above pedestrian and vehicle clearance');
    else assert.equal(z,x<10000?115:125,'native terrain height, not ellipsoid height');
    assert(p.position.every(Number.isFinite));assert(p.scale.every(s=>s>0));
    assert.notEqual(p.kind,'parked-car','no invented parking without mapped parking surfaces');
  }
});

test('cell order does not change placement or duplicate cell-border instances',()=>{
  const {cells,features}=fixture();
  const a=buildNativeStreetDetails(cells,features,style),b=buildNativeStreetDetails([...cells].reverse(),features,style);
  assert.deepEqual(a,b);
  const props=[...a.cells.values()].flat(),keys=props.map(p=>`${p.kind}:${p.position}:${p.yaw}:${p.scale}`);
  assert.equal(new Set(keys).size,keys.length);
});

test('old cells and narrow sidewalks remain safe; style input is not mutated',()=>{
  const before=JSON.stringify(style);
  const out=buildNativeStreetDetails([{id:'0_0',groups:{road:rectangle(0,0,10000,800,100),sidewalk:rectangle(0,800,10000,900,115)}}],[],style);
  assert.deepEqual(out.cells.get('0_0'),[],'90cm sidewalk cannot hold props and a walking lane');
  assert.equal(JSON.stringify(style),before);
  assert.deepEqual(buildNativeStreetDetails([{id:'legacy',groups:{}}],[],style).cells.get('legacy'),[]);
});
