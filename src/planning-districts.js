import collection from '../public/data/neighborhoods/planning-districts.json' with {type:'json'};
const records=collection.features.map(feature=>{
  const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  const p=polygons.flat(2);
  return {name:feature.properties.dist_name,code:feature.properties.abbrev,polygons,bounds:[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))]};
});
function inside(point,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;}
export function planningDistrictAt(lon,lat){
  if(!Number.isFinite(lon)||!Number.isFinite(lat))return null;
  for(const record of records){const b=record.bounds;if(lon<b[0]||lon>b[2]||lat<b[1]||lat>b[3])continue;
    if(record.polygons.some(p=>inside([lon,lat],p[0])&&!p.slice(1).some(r=>inside([lon,lat],r))))return record;
  }return null;
}
