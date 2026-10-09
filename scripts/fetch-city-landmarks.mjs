import {writeFile} from 'node:fs/promises';
const base='https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Building_Footprints/FeatureServer/0/query';
const features=[];let complete=false;
for(let page=0;page<12;page++){
  const query=new URLSearchParams({f:'geojson',where:"building_name IS NOT NULL AND building_name <> '' AND building_name <> ' '",outFields:'objectid,bin,building_name,approx_hgt,max_hgt',outSR:'4326',returnGeometry:'true',resultRecordCount:'2000',resultOffset:String(page*2000),orderByFields:'objectid'});
  const response=await fetch(`${base}?${query}`,{signal:AbortSignal.timeout(90000)});
  const data=await response.json();if(!Array.isArray(data.features))throw new Error(JSON.stringify(data.error));
  features.push(...data.features);
  if(!data.exceededTransferLimit&&!data.properties?.exceededTransferLimit){complete=true;break;}
}
if(!complete)throw new Error('Named building inventory truncated');
const entries=features.map(f=>{
  const p=f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates.flat(2);
  return {id:`building-${f.properties.objectid}`,name:f.properties.building_name.trim(),
    longitude:(Math.min(...p.map(p=>p[0]))+Math.max(...p.map(p=>p[0])))/2,
    latitude:(Math.min(...p.map(p=>p[1]))+Math.max(...p.map(p=>p[1])))/2,
    objectid:f.properties.objectid,bin:f.properties.bin,heightFeet:f.properties.approx_hgt,modelStatus:'Existing source geometry; individual fidelity not yet verified'};
}).filter(f=>f.name);
await writeFile('public/data/landmark-buildings.json',JSON.stringify(entries,null,2));
await writeFile('artifacts/landmark-building-footprints.geojson',JSON.stringify({type:'FeatureCollection',features}));
console.log(JSON.stringify({namedBuildings:entries.length,artMuseum:entries.filter(x=>/museum.*art|art.*museum/i.test(x.name))}));
