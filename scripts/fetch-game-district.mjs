import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const bounds=[-75.1625,39.951,-75.148,39.9605];
const sources={surfaces:'https://mapservices.pasda.psu.edu/server/rest/services/pasda/CityPhilly/MapServer/11',streets:'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Street_Centerline/FeatureServer/0'};
await mkdir('public/data/district',{recursive:true});
const manifest={district:'Chinatown / Reading Terminal',bounds,downloadedAt:new Date().toISOString(),sources:{}};
for(const [kind,source] of Object.entries(sources)){
  const meta=await(await fetch(`${source}?f=json`)).json();
  await writeFile(`public/data/district/${kind}-metadata.json`,JSON.stringify(meta));
  const id=meta.fields.find(f=>f.type==='esriFieldTypeOID').name;
  let features=[];const urls=[];
  for(let offset=0;offset<20000;offset+=1000){
    const p=new URLSearchParams({f:'geojson',where:'1=1',geometry:bounds.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',returnGeometry:'true',resultOffset:String(offset),resultRecordCount:'1000',orderByFields:id,geometryPrecision:'8'});
    const url=`${source}/query?${p}`;urls.push(url);
    const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${kind}: HTTP ${r.status}`);
    const data=await r.json();if(data.error||!Array.isArray(data.features))throw Error(JSON.stringify(data.error));
    features.push(...data.features);
    if(data.features.length<1000&&!data.exceededTransferLimit&&!data.properties?.exceededTransferLimit)break;
    if(offset===19000)throw Error('District exceeds page budget; refusing incomplete source.');
  }
  const bytes=JSON.stringify({type:'FeatureCollection',features});
  await writeFile(`public/data/district/${kind}.geojson`,bytes);
  manifest.sources[kind]={url:source,queries:urls,count:features.length,bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex'),copyright:meta.copyrightText};
  console.log(kind,features.length,Buffer.byteLength(bytes));
}
await writeFile('public/data/district/source-manifest.json',JSON.stringify(manifest,null,2));
