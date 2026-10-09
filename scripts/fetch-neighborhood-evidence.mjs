import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SOURCES} from '../src/sources.js';
const out='public/data/neighborhoods'; await mkdir(out,{recursive:true});
const references=[
  {id:'south',name:'South Philadelphia',longitude:-75.1661,latitude:39.9317},
  {id:'west',name:'West Philadelphia',longitude:-75.2182,latitude:39.9508},
  {id:'north',name:'North Philadelphia',longitude:-75.1588,latitude:39.9914},
  {id:'river',name:'Delaware waterfront / Penn Treaty Park',longitude:-75.1280,latitude:39.9662},
  {id:'fairmount',name:'East Fairmount Park',longitude:-75.1955,latitude:39.9884},
];
const manifest=[];
for(const reference of references){
  const z=18,n=2**z,lat=reference.latitude*Math.PI/180;
  const x=Math.floor((reference.longitude+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*n);
  // One 2023 city image per area retained locally; no new provider or API key.
  const url=`${SOURCES.imagery}/tile/${z}/${y}/${x}`;
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Image HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes[0]!==255 || bytes[1]!==216)throw new Error('Expected JPEG source tile');
  await writeFile(`${out}/${reference.id}.jpg`,bytes);
  const lon=t=>t/n*360-180, latitude=t=>Math.atan(Math.sinh(Math.PI*(1-2*t/n)))*180/Math.PI;
  manifest.push({...reference,url,image:`/data/neighborhoods/${reference.id}.jpg`,bounds:[lon(x),latitude(y+1),lon(x+1),latitude(y)],sha256:createHash('sha256').update(bytes).digest('hex'),basis:'2023 overhead photograph; does not establish unseen facades'});
}
await writeFile(`${out}/references.json`,JSON.stringify(manifest,null,2));
const query=new URLSearchParams({f:'geojson',where:'1=1',outFields:'OBJECTID_1,NAME,SUBTYPE,BIN',outSR:'4326',returnGeometry:'true',resultRecordCount:'1000',orderByFields:'OBJECTID_1'});
const landmarkUrl=`${SOURCES.ground}/32/query?${query}`;
const result={type:'FeatureCollection',features:[]};let complete=false;
for(let page=0;page<12;page++){
  const part=await fetch(`${landmarkUrl}&resultOffset=${page*1000}`,{signal:AbortSignal.timeout(30000)}).then(r=>r.json());
  if(!Array.isArray(part.features))throw new Error('Invalid landmark page');
  result.features.push(...part.features);
  if(!part.exceededTransferLimit&&!part.properties?.exceededTransferLimit){complete=true;break;}
}
if(!complete || new Set(result.features.map(f=>f.id)).size!==result.features.length)throw new Error('Landmark source incomplete or repeated pages');
await writeFile('public/data/landmarks.geojson',JSON.stringify(result));
await writeFile('public/data/landmarks-source.json',JSON.stringify({url:landmarkUrl,count:result.features.length,retrieved:new Date().toISOString(),status:'Source point inventory; not proof of individual 3D model completion'},null,2));
console.log(JSON.stringify({images:manifest.length,landmarks:result.features.length}));
