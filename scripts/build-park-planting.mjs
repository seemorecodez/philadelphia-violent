import {readFile,writeFile} from 'node:fs/promises';
import {inPark} from '../src/park-boundary.js';
const references=JSON.parse(await readFile('public/data/neighborhoods/references.json','utf8'));
const parks=JSON.parse(await readFile('public/data/parks.geojson','utf8'));
// Manually traced from the retained 256px city photographs. These are observed
// canopy REGIONS, not surveyed stems. Deliberately exclude road, trail and water.
const masks=[
  {reference:'fairmount',parkId:94,regions:[[[5,101],[125,96],[250,85],[250,127],[180,130],[50,150],[5,148],[5,101]],[[105,3],[250,3],[250,47],[112,57],[105,3]],[[8,179],[105,174],[157,185],[200,201],[125,219],[12,215],[8,179]]]},
  {reference:'river',parkId:202,regions:[[[65,15],[149,20],[175,73],[133,94],[81,75],[65,15]],[[140,94],[198,91],[207,142],[178,165],[149,142],[140,94]]]},
];
const trees=[];
for(const mask of masks){const reference=references.find(r=>r.id===mask.reference),park=parks.features.find(f=>f.id===mask.parkId);if(!reference||!park)throw new Error('Missing exact park/reference');
  const [w,s,e,n]=reference.bounds;
  const coordinate=([x,y])=>[w+x/256*(e-w),n-y/256*(n-s)];
  const regions=mask.regions.map(r=>({type:'Polygon',coordinates:[r.map(coordinate)]}));
  for(let y=8;y<252;y+=18)for(let x=8;x<252;x+=18){
    const seed=(x*73856093^y*19349663^mask.parkId)>>>0;
    const pixel=[x+(seed%9)-4,y+((seed>>>8)%9)-4],p=coordinate(pixel);
    if(!regions.some(region=>inPark(p,region))||!inPark(p,park.geometry))continue;
    const scale=2.1+(seed%100)/160;
    trees.push({id:`canopy-${mask.reference}-${x}-${y}`,longitude:p[0],latitude:p[1],scale,
      referenceId:reference.id,parkId:park.id,park:park.properties.PUBLIC_NAM,
      positionBasis:'Interpreted stem within photographed canopy and actual park boundary',heightBasis:'Representative tree scaled to interpreted canopy size; not measured'});
  }
}
await writeFile('public/data/park-planting.json',JSON.stringify(trees,null,2));
await writeFile('artifacts/park-planting-evidence.json',JSON.stringify({masks,trees:trees.length,source:'City of Philadelphia 2023 aerial photographs and 2025 PPR Properties',status:'Two image-covered park patches only; not citywide forest completion'},null,2));
console.log(JSON.stringify({interpretedTrees:trees.length,parks:[...new Set(trees.map(t=>t.park))]}));
