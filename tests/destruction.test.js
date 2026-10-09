import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebris, sidewalkFragments, sidewalkDebrisPose } from '../src/destruction.js';
import { buildSidewalkGeometry, distanceToSidewalkSection, parseSidewalkSurface, sectionSidewalkSurface } from '../src/sidewalk-surfaces.js';

const origin={longitude:-75.16469,latitude:39.94746,height:12};
const point=(x,y)=>[origin.longitude+x/(111320*Math.cos(40*Math.PI/180)),origin.latitude+y/111320];
const square=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d],[a,b]].map(p=>point(...p));
function sourceSections(){
  const surface=parseSidewalkSurface({attributes:{OBJECTID_1:88,FCODE:2210},geometry:{rings:[square(-5,-5,5,5),square(-1,-1,1,1)]}});
  return sectionSidewalkSurface(surface,origin).map(section=>({...section,baseHeight:12}));
}

test('sidewalk fragments remain inside actual clipped boundaries and exclude the source hole',()=>{
  for(const section of sourceSections()){
    const fragments=sidewalkFragments(section);
    assert.ok(fragments.length>0 && fragments.length<=12);
    for(const fragment of fragments){
      assert.equal(fragment.sourceId,'88');assert.equal(fragment.sectionId,section.id);
      assert.ok(distanceToSidewalkSection(section,fragment)<1e-5);
      const east=(fragment.longitude-origin.longitude)*111320*Math.cos(40*Math.PI/180);
      const north=(fragment.latitude-origin.latitude)*111320;
      assert.ok(Math.abs(east)>=1-1e-6 || Math.abs(north)>=1-1e-6);
      for(let i=0;i<3;i++){
        const a=fragment.triangle[i],b=fragment.triangle[(i+1)%3];
        assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<=1.350001);
      }
    }
  }
  assert.deepEqual(sidewalkFragments({kind:'sidewalk',pieces:[]}),[]);
});

test('detached fragments have closed undersides and finite lit normals',()=>{
  const section=sourceSections()[0],fragment=sidewalkFragments(section)[0];
  const part={...section,longitude:fragment.longitude,latitude:fragment.latitude,pieces:[fragment.triangle]};
  const open=buildSidewalkGeometry(part,()=>12);
  const closed=buildSidewalkGeometry(part,()=>12,{closeBottom:true});
  assert.equal(closed.geometry.indices.length,open.geometry.indices.length+3);
  const values=closed.geometry.attributes.normal.values;
  assert.ok([...values].every(Number.isFinite));
  const z=[...values].filter((_,index)=>index%3===2);
  assert.ok(Math.min(...z)<-.99);assert.ok(Math.max(...z)>.99);
});

test('sidewalk motion stays small, settles and fades in a bounded lifetime',()=>{
  let highest=0;
  for(let index=0;index<12;index++)for(let age=0;age<3;age+=.02){
    const pose=sidewalkDebrisPose(age,index);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(Math.hypot(pose.x,pose.y)<=.141);
    assert.ok(pose.z>=0 && pose.z<.37);assert.ok(pose.alpha>=0 && pose.alpha<=1);
    highest=Math.max(highest,pose.z);
  }
  assert.ok(highest>.25);assert.ok(sidewalkDebrisPose(1.6).z<.001);
  assert.equal(sidewalkDebrisPose(2.4).alpha,0);
});

function harness(t){
  const handles=[];
  const viewer={scene:{requestRender(){}},entities:{add(entity){return entity;},remove(){}}};
  const effect=createDebris(viewer,{renderSidewalkFragment(){
    const handle={ready:false,visible:true,poses:[],disposed:0,
      show(value){this.visible=value;},update(pose){this.poses.push(pose);},dispose(){this.disposed++;}};
    handles.push(handle);return handle;
  }});
  t.after(()=>effect.destroy());
  return{effect,handles};
}

test('fragment pool caps resources, waits for readiness, pauses hidden and cleans up',t=>{
  const {effect,handles}=harness(t),section=sourceSections()[0];
  for(let i=0;i<3;i++)assert.ok(effect.addSidewalk(section)<=12);
  assert.ok(handles.length>24);assert.equal(handles.filter(h=>!h.disposed).length,24);
  effect.tick(.1);assert.ok(handles.every(h=>h.poses.length===0));
  for(const handle of handles)handle.ready=true;
  effect.setVisible(false);for(let i=0;i<30;i++)effect.tick(.1);
  assert.ok(handles.every(h=>h.poses.length===0));
  effect.setVisible(true);effect.tick(.1);
  assert.equal(handles.filter(h=>h.poses.length===1).length,24);
  for(let i=0;i<25;i++)effect.tick(.1);
  assert.ok(handles.every(h=>h.disposed===1));
  effect.clear();assert.ok(handles.every(h=>h.disposed===1));
  effect.destroy();assert.equal(effect.addSidewalk(section),0);
});

test('unready fragments expire and clear removes all pending fragments exactly once',t=>{
  const {effect,handles}=harness(t),section=sourceSections()[0];
  effect.addSidewalk(section);
  for(let i=0;i<55;i++)effect.tick(.1);
  assert.ok(handles.every(h=>h.disposed===1));
  effect.addSidewalk(section);effect.clear();
  assert.ok(handles.every(h=>h.disposed===1));
  effect.tick(Infinity);effect.tick(-1);
  assert.ok(handles.every(h=>h.disposed===1));
});
