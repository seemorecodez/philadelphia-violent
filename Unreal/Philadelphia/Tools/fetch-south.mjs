// Offline Unreal source preparation. Reuses geographic conversion code only.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fetchCitySurfaceCell} from '../../../src/city-surface-cell.js';
import {geographicPoint} from '../../../src/district-geometry.js';
const root='Unreal/Philadelphia/SourceAssets/South';
await mkdir(root+'/cells',{recursive:true});
const cells=[];for(let x=-8;x<=-4;x++)for(let y=-23;y<=-19;y++)cells.push({id:`${x}_${y}`,x,y});
let cursor=0;
await Promise.all([0,1].map(async()=>{while(cursor<cells.length){const c=cells[cursor++],path=`${root}/cells/${c.id}.json`;
  try{const old=JSON.parse(await readFile(path));if(old.id===c.id&&old.sourceFeatures!==undefined)continue;}catch{}
  const cell=await fetchCitySurfaceCell(c.x,c.y,{signal:AbortSignal.timeout(60000)});
  await writeFile(path,JSON.stringify(cell));console.log(`Source surface ${c.id}: ${cell.sourceFeatures} features`);
}}));
const bbox=[...geographicPoint([-800,-2300]),...geographicPoint([-300,-1800])];
const url='https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Building_Footprints/FeatureServer/0/query';
const features=[],ids=new Set();let complete=false;
for(let page=0;page<5;page++){
  const q=new URLSearchParams({f:'geojson',where:'1=1',geometry:bbox.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'objectid,building_name,approx_hgt,max_hgt',returnGeometry:'true',orderByFields:'objectid',resultRecordCount:'2000',resultOffset:String(page*2000)});
  const response=await fetch(url+'?'+q,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Buildings HTTP ${response.status}`);
  const data=await response.json();if(!Array.isArray(data.features))throw Error('Invalid building source');
  for(const f of data.features){const id=f.properties.objectid??f.id;if(id==null||ids.has(id))throw Error('Missing/repeated building identity');ids.add(id);features.push(f);}
  if(!data.exceededTransferLimit&&!data.properties?.exceededTransferLimit&&data.features.length<2000){complete=true;break;}
}
if(!complete)throw Error('Incomplete building source');
const buildings=JSON.stringify({type:'FeatureCollection',features});await writeFile(root+'/buildings.geojson',buildings);
await writeFile(root+'/manifest.json',JSON.stringify({cells,bounds:bbox,source:'PASDA CityPhilly surface layer 11; Philadelphia Building_Footprints',buildingSource:url,buildingCount:features.length,buildingSha256:createHash('sha256').update(buildings).digest('hex'),retrieved:new Date().toISOString()},null,2));
console.log(`South source complete: ${cells.length} cells; ${features.length} building footprints`);
