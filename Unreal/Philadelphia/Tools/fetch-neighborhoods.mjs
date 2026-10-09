// Fetch bounded native world packs from the same free/keyless public sources.
// Original source observations are retained; this is not final game art.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import https from 'node:https';
import {fetchCitySurfaceCell} from '../../../src/city-surface-cell.js';
import {localPoint,geographicPoint} from '../../../src/district-geometry.js';

const references=JSON.parse(await readFile('public/data/neighborhoods/references.json'));
const requested=process.argv.slice(2);
if(!requested.length || requested.some(id=>!['west','north','river','fairmount'].includes(id)))
  throw Error('Choose retained reference packs: west north river fairmount');
const buildingURL='https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Building_Footprints/FeatureServer/0/query';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
// Avoid the installed Node/undici parser crash observed on an interrupted source
// response. Standard HTTPS retains explicit timeout and response-size bounds.
function sourceFetch(url,{signal}={}){
  return new Promise((resolve,reject)=>{
    const request=https.get(url,{signal,headers:{Accept:'application/json'}},response=>{
      const parts=[];let size=0;
      response.on('data',part=>{size+=part.length;if(size>32_000_000){response.destroy(Error('Source response exceeds 32 MB'));return;}parts.push(part);});
      response.on('error',reject);
      response.on('end',()=>resolve({ok:response.statusCode>=200&&response.statusCode<300,status:response.statusCode,
        json:async()=>JSON.parse(Buffer.concat(parts).toString('utf8'))}));
    });
    request.setTimeout(60000,()=>request.destroy(Error('Public source request timed out')));
    request.on('error',reject);
  });
}
for(const pack of [...new Set(requested)]){
  const reference=references.find(r=>r.id===pack);
  if(!reference)throw Error(`Missing retained neighborhood reference: ${pack}`);
  const image=await readFile('public'+reference.image);
  if(hash(image)!==reference.sha256)throw Error(`Reference photograph changed: ${pack}`);
  const folder=`Unreal/Philadelphia/SourceAssets/${pack}`;
  await mkdir(folder+'/cells',{recursive:true});
  const [east,north]=localPoint([reference.longitude,reference.latitude]);
  const cx=Math.floor(east/100),cy=Math.floor(north/100),cells=[];
  for(let x=cx-2;x<=cx+2;x++)for(let y=cy-2;y<=cy+2;y++)cells.push({id:`${x}_${y}`,x,y});
  let cursor=0;
  await Promise.all([0,1].map(async()=>{
    while(cursor<cells.length){
      const c=cells[cursor++],path=`${folder}/cells/${c.id}.json`;
      try{
        const raw=await readFile(path),old=JSON.parse(raw);
        if(old.id===c.id&&old.x===c.x&&old.y===c.y&&Number.isInteger(old.sourceFeatures)&&old.groups){
          c.sha256=hash(raw);continue;
        }
      }catch(error){if(error.code!=='ENOENT')throw error;}
      const data=await fetchCitySurfaceCell(c.x,c.y,{signal:AbortSignal.timeout(90000),fetcher:sourceFetch});
      const raw=JSON.stringify(data);await writeFile(path,raw);c.sha256=hash(raw);
      console.log(`${pack} source ${c.id}: ${data.sourceFeatures} observed features`);
    }
  }));
  const bounds=[...geographicPoint([(cx-2)*100,(cy-2)*100]),...geographicPoint([(cx+3)*100,(cy+3)*100])];
  const features=[],ids=new Set();let complete=false;
  for(let page=0;page<10;page++){
    const query=new URLSearchParams({f:'geojson',where:'1=1',geometry:bounds.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'objectid,building_name,approx_hgt,max_hgt',returnGeometry:'true',orderByFields:'objectid',resultRecordCount:'2000',resultOffset:String(page*2000)});
    const response=await sourceFetch(buildingURL+'?'+query,{signal:AbortSignal.timeout(90000)});
    if(!response.ok)throw Error(`Footprints HTTP ${response.status}`);
    const data=await response.json();if(data.error||!Array.isArray(data.features))throw Error('Invalid source building response');
    for(const f of data.features){const id=f.properties?.objectid??f.id;if(id==null||ids.has(id))throw Error('Missing or duplicate source ID');ids.add(id);features.push(f);}
    if(!data.exceededTransferLimit&&!data.properties?.exceededTransferLimit&&data.features.length<2000){complete=true;break;}
  }
  if(!complete)throw Error('Incomplete footprint pagination; pack not accepted');
  const buildings=JSON.stringify({type:'FeatureCollection',features});
  await writeFile(folder+'/buildings.geojson',buildings);
  await writeFile(folder+'/manifest.json',JSON.stringify({pack,name:reference.name,cells,bounds,
    longitude:reference.longitude,latitude:reference.latitude,reference,
    buildingSource:buildingURL,buildingCount:features.length,buildingSha256:hash(buildings),
    retrieved:new Date().toISOString(),classification:'Retained public source observations; native conversion and visual acceptance pending'},null,2));
  console.log(`${pack}: retained ${cells.length} source cells and ${features.length} building footprints`);
}
