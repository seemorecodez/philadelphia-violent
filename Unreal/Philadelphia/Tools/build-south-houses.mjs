import {writeHouseMesh} from './house-mesh-binary.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {Cartesian3,Cartographic,Matrix4} from 'cesium';
import {buildHouseGeometry} from '../../../src/house-details.js';
import {localPoint,geographicPoint,pointInTriangle,area} from '../../../src/district-geometry.js';
import {buildNativeStreetDetails} from '../../../src/street-objects.js';
import {nearestNeighborhood} from '../../../src/neighborhood-references.js';
const pack=process.argv[2]??'South';
const detailsOnly=process.argv.includes('--street-details-only');
if(!['South','west','north','river','fairmount'].includes(pack))throw Error('Unknown retained neighborhood pack');
const source=`Unreal/Philadelphia/SourceAssets/${pack}`,out=`Unreal/Philadelphia/Content/SourceData/${pack.toLowerCase()}`;
const observed=JSON.parse(await readFile(source+'/manifest.json'));
const prepared=JSON.parse(await readFile(source+'/prepared-buildings.json'));
const meta=JSON.parse(await readFile(out+'/manifest.json'));
const sources=new Map();
for(const c of meta.cells)sources.set(c.id,JSON.parse(await readFile(source+'/cells/'+c.id+'.json')));
const desired=localPoint([observed.longitude??-75.1661,observed.latitude??39.9317]);
function roadAt(p){const c=sources.get(`${Math.floor(p[0]/100)}_${Math.floor(p[1]/100)}`),flat=c?.groups.road??[];for(let i=0;i<flat.length;i+=6)if(pointInTriangle(p,[flat.slice(i,i+2),flat.slice(i+2,i+4),flat.slice(i+4,i+6)]))return true;return false;}
const candidates=[];for(const c of sources.values()){const a=c.groups.road??[];for(let i=0;i<a.length;i+=6){const p=[(a[i]+a[i+2]+a[i+4])/3,(a[i+1]+a[i+3]+a[i+5])/3];if(Math.hypot(p[0]-desired[0],p[1]-desired[1])<225)candidates.push(p);}}
candidates.sort((a,b)=>Math.hypot(a[0]-desired[0],a[1]-desired[1])-Math.hypot(b[0]-desired[0],b[1]-desired[1]));
// Keep the established South/West/North view where valid. Curved park roads
// and the waterfront do not share Center City's street-grid bearing.
const headings=[9.5,...Array.from({length:72},(_,i)=>i*5)].map(d=>d*Math.PI/180);
let spawn,heading;
for(const h of headings){
 spawn=candidates.find(p=>Array.from({length:26},(_,d)=>[-1,0,1].every(side=>roadAt([p[0]+Math.sin(h)*d+Math.cos(h)*side,p[1]+Math.cos(h)*d-Math.sin(h)*side]))).every(Boolean));
 if(spawn){heading=h;break;}
}
if(!spawn)throw Error('No clear source-backed 25m street route found');
const cells=new Map(),detailCells=new Map(),skipped=[];let houses=0,triangles=0;
for(const f of detailsOnly?[]:prepared.features){

 // The browser renderer used two-sided surfaces. Native opaque walls need
 // consistently outward faces: counter-clockwise exterior, clockwise holes.
 const polygons=f.polygons.map(poly=>poly.map((ring,i)=>((area(ring.map(localPoint))>0)===(i===0))?ring:[...ring].reverse()));
 for(const near of [false,true]){
 const built=buildHouseGeometry({...f,polygons},{near});if(!built){if(!near)skipped.push({id:f.id,name:f.buildingName,height:f.height});continue;}
 const target=near?detailCells:cells;
 const data=target.get(f.cell)??{positions:[],normals:[],colors:[],uv:[],indices:[],sourceIds:[]};target.set(f.cell,data);
 const attrs=built.geometry.attributes,base=data.positions.length/3;
 for(let i=0;i<attrs.position.values.length;i+=3){
   const local=Cartesian3.fromArray(attrs.position.values,i),world=Matrix4.multiplyByPoint(built.modelMatrix,local,new Cartesian3()),geo=Cartographic.fromCartesian(world);
   const [x,north]=localPoint([geo.longitude*180/Math.PI,geo.latitude*180/Math.PI]);
   data.positions.push(Math.round(x*1000)/10,Math.round(-north*1000)/10,Math.round((geo.height-prepared.originHeight)*1000)/10);
   const n=attrs.normal.values;data.normals.push(n[i],-n[i+1],n[i+2]);
 }
 for(const value of attrs.color.values)data.colors.push(value);for(const value of attrs.st.values)data.uv.push(value);
 for(const i of built.geometry.indices)data.indices.push(base+i);
 data.sourceIds.push(f.id);if(!near){houses++;triangles+=built.geometry.indices.length/3;}
 }
}
const nativeCells=await Promise.all(meta.cells.map(async c=>JSON.parse(await readFile(out+'/'+c.id+'.json'))));
const street=buildNativeStreetDetails(nativeCells,prepared.features,nearestNeighborhood(observed.longitude,observed.latitude));
for(const [i,c] of meta.cells.entries()){const path=out+'/'+c.id+'.json',data=nativeCells[i];
 if(!detailsOnly){if(cells.has(c.id))data.buildings=cells.get(c.id);else delete data.buildings;
 const detailFile=c.id+'-houses.bin';
 if(detailCells.has(c.id)){data.houseDetailFile=detailFile;await writeHouseMesh(out+'/'+detailFile,detailCells.get(c.id),c);}else delete data.houseDetailFile;
 }
 data.streetProps=street.cells.get(c.id)??[];
 await writeFile(path,JSON.stringify(data));}
// Interpolate the exact exported native road face for the player spawn.
const spawnCell=JSON.parse(await readFile(out+`/${Math.floor(spawn[0]/100)}_${Math.floor(spawn[1]/100)}.json`));
const [x,y]=[spawn[0]*100,-spawn[1]*100];let z=null;
for(let i=0;i<spawnCell.groups.road.length;i+=9){const a=spawnCell.groups.road.slice(i,i+9),p=[[a[0],a[1]],[a[3],a[4]],[a[6],a[7]]];if(!pointInTriangle([x,y],p))continue;
 const det=(a[4]-a[7])*(a[0]-a[6])+(a[6]-a[3])*(a[1]-a[7]);if(Math.abs(det)<.001)continue;
 const u=((a[4]-a[7])*(x-a[6])+(a[6]-a[3])*(y-a[7]))/det,v=((a[7]-a[1])*(x-a[6])+(a[0]-a[6])*(y-a[7]))/det;z=u*a[2]+v*a[5]+(1-u-v)*a[8];break;}
if(z===null)throw Error('Spawn must touch an exported road face');
meta.spawn=[x,y,z+94];meta.yawDegrees=heading*180/Math.PI-90;meta.name=observed.name??'South Philadelphia';
if(!detailsOnly){meta.houseCount=houses;meta.houseTriangles=triangles;meta.skippedBuildings=skipped;}
meta.streetDetails=street.summary;
await writeFile(out+'/manifest.json',JSON.stringify(meta,null,2));
const registryPath='Unreal/Philadelphia/Content/SourceData/city-packs.json';
let registry;
try{registry=JSON.parse(await readFile(registryPath));}catch(error){if(error.code!=='ENOENT')throw error;registry={packs:[]};}
if(!Array.isArray(registry.packs))throw Error('Invalid native city pack registry');
if(!registry.packs.includes(pack.toLowerCase()))registry.packs.push(pack.toLowerCase());
await writeFile(registryPath,JSON.stringify(registry,null,2));
console.log(JSON.stringify({houses:meta.houseCount,triangles:meta.houseTriangles,streetDetails:street.summary,spawn:meta.spawn,geographicSpawn:geographicPoint(spawn)}));
