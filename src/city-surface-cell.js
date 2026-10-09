import {localPoint,geographicPoint,triangulatePolygon,clipBox,area,subdivideTriangle,CELL_SIZE} from './district-geometry.js';
import {SOURCES} from './sources.js';

// These are the same public surface classes used by the retained district.
// Elevated bridge polygons require their own deck geometry, never terrain draping.
export const SURFACE_KINDS={1000:'road',1010:'concrete',1020:'road',2200:'parking',2210:'sidewalk',2220:'concrete',2230:'concrete',2240:'road',2250:'concrete',2300:'earth',2310:'gravel',9999:'grass'};
export function cellBounds(x,y){return [x*CELL_SIZE,y*CELL_SIZE,(x+1)*CELL_SIZE,(y+1)*CELL_SIZE];}

function clippedSegment(a,b,box){
  let start=0,end=1;
  for(let axis=0;axis<2;axis++){
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-12){if(a[axis]<box[axis]||a[axis]>box[axis+2])return null;continue;}
    const t=(box[axis]-a[axis])/delta,u=(box[axis+2]-a[axis])/delta;
    start=Math.max(start,Math.min(t,u));end=Math.min(end,Math.max(t,u));
    if(start>=end)return null;
  }
  return [a.map((v,i)=>v+(b[i]-v)*start),a.map((v,i)=>v+(b[i]-v)*end)];
}

export function buildSourceSurfaceCell(features,x,y){
  if(!Number.isInteger(x)||!Number.isInteger(y))throw Error('Invalid world cell');
  const bounds=cellBounds(x,y),data={id:`${x}_${y}`,x,y,groups:{},curbs:[],sourceFeatures:0,source:'Philadelphia public surface polygons',elevatedBridgesExcluded:true};
  for(const feature of features){
    const kind=SURFACE_KINDS[feature.properties?.FCODE];if(!kind)continue;
    const polygons=feature.geometry?.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry?.type==='MultiPolygon'?feature.geometry.coordinates:null;
    if(!polygons)throw Error('Unsupported source surface geometry');
    data.sourceFeatures++;
    for(const polygon of polygons){
      const rings=polygon.map(r=>r.map(localPoint));
      for(const triangle of triangulatePolygon(rings)){
        const piece=clipBox(triangle,bounds);
        if(piece.length<3||Math.abs(area(piece))<1e-6)continue;
        const target=data.groups[kind]??=[];
        for(let i=1;i<piece.length-1;i++)for(const t of subdivideTriangle([piece[0],piece[i],piece[i+1]],12)){
          if(Math.abs(area(t))<1e-6)continue;if(area(t)<0)t.reverse();
          target.push(...t.flat().map(v=>Math.round(v*1000)/1000));
        }
      }
      if(kind==='sidewalk')for(const ring of rings)for(let i=1;i<ring.length;i++){
        const segment=clippedSegment(ring[i-1],ring[i],bounds);if(!segment)continue;
        const [a,b]=segment,n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/3));
        for(let k=0;k<n;k++)data.curbs.push(...[...a.map((v,j)=>v+(b[j]-v)*k/n),...a.map((v,j)=>v+(b[j]-v)*(k+1)/n)].map(v=>Math.round(v*1000)/1000));
      }
    }
  }
  return data;
}

export async function fetchCitySurfaceCell(x,y,{signal,fetcher=fetch}={}){
  const b=cellBounds(x,y),extent=[...geographicPoint(b.slice(0,2)),...geographicPoint(b.slice(2))];
  const features=[],ids=new Set();
  for(let page=0;page<8;page++){
    const query=new URLSearchParams({f:'geojson',where:`FCODE IN (${Object.keys(SURFACE_KINDS).join(',')})`,geometry:extent.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'OBJECTID_1,FCODE',returnGeometry:'true',orderByFields:'OBJECTID_1',resultOffset:String(page*1000),resultRecordCount:'1000',geometryPrecision:'8'});
    const response=await fetcher(`${SOURCES.ground}/11/query?${query}`,{signal});
    if(!response.ok)throw Error(`City surface HTTP ${response.status}`);
    const data=await response.json();
    if(data.error||!Array.isArray(data.features))throw Error('City surface service returned invalid data');
    for(const f of data.features){
      const id=f.properties?.OBJECTID_1??f.id;
      if(id===undefined||ids.has(id))throw Error('City surface pagination missing or repeated identity');
      ids.add(id);features.push(f);
    }
    if(!data.exceededTransferLimit&&!data.properties?.exceededTransferLimit&&data.features.length<1000)return buildSourceSurfaceCell(features,x,y);
  }
  throw Error('City surface request exceeded page budget; no partial cell accepted');
}
