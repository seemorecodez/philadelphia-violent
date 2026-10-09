import {readFile,writeFile} from 'node:fs/promises';
import {Cartesian3,Cartographic,Matrix4} from 'cesium';
import {buildHouseGeometry} from '../../../src/house-details.js';
import {localPoint,geographicPoint,pointInTriangle,area} from '../../../src/district-geometry.js';
const source='Unreal/Philadelphia/SourceAssets/South',out='Unreal/Philadelphia/Content/SourceData/south';
const prepared=JSON.parse(await readFile(source+'/prepared-buildings.json'));
const meta=JSON.parse(await readFile(out+'/manifest.json'));
const sources=new Map();
for(const c of meta.cells)sources.set(c.id,JSON.parse(await readFile(source+'/cells/'+c.id+'.json')));
const desired=localPoint([-75.1661,39.9317]),heading=9.5*Math.PI/180;
function roadAt(p){const c=sources.get(`${Math.floor(p[0]/100)}_${Math.floor(p[1]/100)}`),flat=c?.groups.road??[];for(let i=0;i<flat.length;i+=6)if(pointInTriangle(p,[flat.slice(i,i+2),flat.slice(i+2,i+4),flat.slice(i+4,i+6)]))return true;return false;}
const candidates=[];for(const c of sources.values()){const a=c.groups.road??[];for(let i=0;i<a.length;i+=6){const p=[(a[i]+a[i+2]+a[i+4])/3,(a[i+1]+a[i+3]+a[i+5])/3];if(Math.hypot(p[0]-desired[0],p[1]-desired[1])<80)candidates.push(p);}}
candidates.sort((a,b)=>Math.hypot(a[0]-desired[0],a[1]-desired[1])-Math.hypot(b[0]-desired[0],b[1]-desired[1]));
const spawn=candidates.find(p=>Array.from({length:26},(_,d)=>[-1,0,1].every(side=>roadAt([p[0]+Math.sin(heading)*d+Math.cos(heading)*side,p[1]+Math.cos(heading)*d-Math.sin(heading)*side]))).every(Boolean));
if(!spawn)throw Error('No clear source-backed 25m street route found');
const cells=new Map(),skipped=[];let houses=0,triangles=0;
for(const f of prepared.features){
 const distance=Math.hypot(...localPoint([f.longitude,f.latitude]).map((v,i)=>v-spawn[i]));
 // The browser renderer used two-sided surfaces. Native opaque walls need
 // consistently outward faces: counter-clockwise exterior, clockwise holes.
 const polygons=f.polygons.map(poly=>poly.map((ring,i)=>((area(ring.map(localPoint))>0)===(i===0))?ring:[...ring].reverse()));
 const built=buildHouseGeometry({...f,polygons},{near:distance<125});if(!built){skipped.push({id:f.id,name:f.buildingName,height:f.height});continue;}
 const data=cells.get(f.cell)??{positions:[],normals:[],colors:[],uv:[],indices:[],sourceIds:[]};cells.set(f.cell,data);
 const attrs=built.geometry.attributes,base=data.positions.length/3;
 for(let i=0;i<attrs.position.values.length;i+=3){
   const local=Cartesian3.fromArray(attrs.position.values,i),world=Matrix4.multiplyByPoint(built.modelMatrix,local,new Cartesian3()),geo=Cartographic.fromCartesian(world);
   const [x,north]=localPoint([geo.longitude*180/Math.PI,geo.latitude*180/Math.PI]);
   data.positions.push(Math.round(x*1000)/10,Math.round(-north*1000)/10,Math.round((geo.height-prepared.originHeight)*1000)/10);
   const n=attrs.normal.values;data.normals.push(n[i],-n[i+1],n[i+2]);
 }
 data.colors.push(...attrs.color.values);data.uv.push(...attrs.st.values);
 for(const i of built.geometry.indices)data.indices.push(base+i);
 data.sourceIds.push(f.id);houses++;triangles+=built.geometry.indices.length/3;
}
for(const c of meta.cells){const path=out+'/'+c.id+'.json',data=JSON.parse(await readFile(path));if(cells.has(c.id))data.buildings=cells.get(c.id);await writeFile(path,JSON.stringify(data));}
// Interpolate the exact exported native road face for the player spawn.
const spawnCell=JSON.parse(await readFile(out+`/${Math.floor(spawn[0]/100)}_${Math.floor(spawn[1]/100)}.json`));
const [x,y]=[spawn[0]*100,-spawn[1]*100];let z=null;
for(let i=0;i<spawnCell.groups.road.length;i+=9){const a=spawnCell.groups.road.slice(i,i+9),p=[[a[0],a[1]],[a[3],a[4]],[a[6],a[7]]];if(!pointInTriangle([x,y],p))continue;
 const det=(a[4]-a[7])*(a[0]-a[6])+(a[6]-a[3])*(a[1]-a[7]);if(Math.abs(det)<.001)continue;
 const u=((a[4]-a[7])*(x-a[6])+(a[6]-a[3])*(y-a[7]))/det,v=((a[7]-a[1])*(x-a[6])+(a[0]-a[6])*(y-a[7]))/det;z=u*a[2]+v*a[5]+(1-u-v)*a[8];break;}
if(z===null)throw Error('Spawn must touch an exported road face');
meta.spawn=[x,y,z+94];meta.yawDegrees=-80.5;meta.name='South Philadelphia';meta.houseCount=houses;meta.houseTriangles=triangles;meta.skippedBuildings=skipped;
await writeFile(out+'/manifest.json',JSON.stringify(meta,null,2));
const registryPath='Unreal/Philadelphia/Content/SourceData/city-packs.json';
let registry;
try{registry=JSON.parse(await readFile(registryPath));}catch(error){if(error.code!=='ENOENT')throw error;registry={packs:[]};}
if(!Array.isArray(registry.packs))throw Error('Invalid native city pack registry');
if(!registry.packs.includes('south'))registry.packs.push('south');
await writeFile(registryPath,JSON.stringify(registry,null,2));
console.log(JSON.stringify({houses,triangles,skipped:skipped.length,spawn:meta.spawn,geographicSpawn:geographicPoint(spawn)}));
