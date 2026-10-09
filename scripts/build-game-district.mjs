import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {localPoint,geographicPoint,triangulatePolygon,clipBox,area,subdivideTriangle,CELL_SIZE,DISTRICT_ORIGIN} from '../src/district-geometry.js';
import {advanceAlongPath,createStreetGraph} from '../src/district-navigation.js';
const folder='public/data/district';
const manifest=JSON.parse(await readFile(`${folder}/source-manifest.json`));
const [w,s,e,n]=manifest.bounds,lo=localPoint([w,s]),hi=localPoint([e,n]);
const cells=new Map();
const groups={1000:'road',1010:'concrete',1020:'road',2200:'parking',2210:'sidewalk',2220:'concrete',2230:'concrete',2240:'road',2250:'concrete',2300:'earth',2310:'gravel',9999:'grass'};
let rejected=0,sourceArea=0,triCount=0;
const surfaces=JSON.parse(await readFile(`${folder}/surfaces.geojson`));
function getCell(x,y){const id=`${x}_${y}`;if(!cells.has(id))cells.set(id,{id,x,y,groups:{},curbs:[]});return cells.get(id);}
for(const f of surfaces.features){
  const kind=groups[f.properties.FCODE];if(!kind)continue;
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
  for(const polygon of polygons){
    const rings=polygon.map(r=>r.map(localPoint));let triangles;
    try{triangles=triangulatePolygon(rings);}catch{rejected++;continue;}
    for(const tri of triangles){
      const bounded=clipBox(tri,[...lo,...hi]);if(bounded.length<3)continue;
      sourceArea+=Math.abs(area(bounded));
      const x0=Math.floor(Math.min(...bounded.map(p=>p[0]))/CELL_SIZE),x1=Math.floor(Math.max(...bounded.map(p=>p[0]))/CELL_SIZE);
      const y0=Math.floor(Math.min(...bounded.map(p=>p[1]))/CELL_SIZE),y1=Math.floor(Math.max(...bounded.map(p=>p[1]))/CELL_SIZE);
      for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
        const piece=clipBox(bounded,[x*CELL_SIZE,y*CELL_SIZE,(x+1)*CELL_SIZE,(y+1)*CELL_SIZE]);if(piece.length<3||Math.abs(area(piece))<.000001)continue;
        const c=getCell(x,y),target=c.groups[kind]??=[];
        for(let i=1;i<piece.length-1;i++)for(const t of subdivideTriangle([piece[0],piece[i],piece[i+1]],12)){
          if(Math.abs(area(t))<.000001)continue;if(area(t)<0)t.reverse();target.push(...t.flat().map(v=>Math.round(v*1000)/1000));triCount++;
        }
      }
    }
    if(kind==='sidewalk')for(const ring of rings)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const count=Math.max(1,Math.ceil(length/3));
      for(let j=0;j<count;j++){
        const p=[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count],q=[a[0]+(b[0]-a[0])*(j+1)/count,a[1]+(b[1]-a[1])*(j+1)/count];
        if(p[0]<lo[0]||p[0]>hi[0]||p[1]<lo[1]||p[1]>hi[1])continue;
        getCell(Math.floor(p[0]/CELL_SIZE),Math.floor(p[1]/CELL_SIZE)).curbs.push(...[...p,...q].map(v=>Math.round(v*1000)/1000));
      }
    }
  }
}
// Surveyed pedestrian crossing centerlines guide authored 3m-wide paint geometry.
// Unmarked/unknown crossings stay unpainted. Paint never substitutes for road mesh.
function paintQuad(center,heading,width,length,kind='paint'){
  const dx=Math.sin(heading),dy=Math.cos(heading),rx=dy,ry=-dx;
  const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[center[0]+rx*a*width/2+dx*b*length/2,center[1]+ry*a*width/2+dy*b*length/2]);
  const x0=Math.floor(Math.min(...points.map(p=>p[0]))/100),x1=Math.floor(Math.max(...points.map(p=>p[0]))/100),y0=Math.floor(Math.min(...points.map(p=>p[1]))/100),y1=Math.floor(Math.max(...points.map(p=>p[1]))/100);
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
    const clipped=clipBox(clipBox(points,[...lo,...hi]),[x*100,y*100,(x+1)*100,(y+1)*100]);if(clipped.length<3)continue;
    const target=getCell(x,y).groups[kind]??=[];
    for(let i=1;i<clipped.length-1;i++){const t=[clipped[0],clipped[i],clipped[i+1]];if(area(t)<0)t.reverse();target.push(...t.flat().map(v=>Math.round(v*1000)/1000));}
  }
}
const paths=JSON.parse(await readFile(`${folder}/pedestrian-paths.geojson`));
for(const f of paths.features){
  if(f.properties.line_type!==2||!['CONTINENTAL','LADDER','PARALLEL','DECORATIVE'].includes(f.properties.feat_type)||f.geometry.type!=='LineString')continue;
  const points=f.geometry.coordinates.map(localPoint);let total;try{total=advanceAlongPath(points,0).length;}catch{continue;}
  if(total>45)continue;
  for(let d=.4;d<total-.3;d+=.95){const p=advanceAlongPath(points,d);paintQuad([p.x,p.y],p.heading,3,.45);}
}
const streetGraph=createStreetGraph(JSON.parse(await readFile(`${folder}/streets.geojson`)).features);
for(const edge of streetGraph.edges.filter(e=>e.laneOffset&&e.id.endsWith(':f'))){
  for(let d=9;d<edge.length-9;d+=2){const p=advanceAlongPath(edge.points,d);for(const offset of [-.11,.11])paintQuad([p.x+Math.cos(p.heading)*offset,p.y-Math.sin(p.heading)*offset],p.heading,.10,2.02,'yellow');}
}
await mkdir(`${folder}/cells`,{recursive:true});
const entries=[];
for(const c of cells.values()){
  const text=JSON.stringify(c);await writeFile(`${folder}/cells/${c.id}.json`,text);
  entries.push({id:c.id,x:c.x,y:c.y,bytes:Buffer.byteLength(text),triangles:Object.values(c.groups).reduce((s,v)=>s+v.length/6,0)+c.curbs.length/2,center:geographicPoint([(c.x+.5)*CELL_SIZE,(c.y+.5)*CELL_SIZE])});
}
const report={...manifest,origin:DISTRICT_ORIGIN,cellSize:CELL_SIZE,cells:entries,sourceArea,triangles:triCount,rejectedPolygons:rejected,excludedCodes:'Building footprints (1810) and elevated bridges (1200/1210/1220) do not become ground pavement. Bridge decks remain unfinished.',finish:'Authored asphalt, concrete, vegetation and curb dimensions; geographic boundaries remain source based.'};
await writeFile(`${folder}/manifest.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({cells:entries.length,triangles:triCount,rejectedPolygons:rejected,bytes:entries.reduce((s,c)=>s+c.bytes,0)}));
