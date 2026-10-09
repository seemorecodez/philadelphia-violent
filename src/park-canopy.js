import {inPark} from './park-boundary.js';
export const CANOPY_SOURCE='https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/TreeCanopyChange_2008_2018/FeatureServer/0/query';
const PAVEMENT_SOURCE='https://mapservices.pasda.psu.edu/server/rest/services/pasda/CityPhilly/MapServer/11/query';
const SX=111320*Math.cos(40*Math.PI/180),SY=111320,SPACING=9;
function bounds(geometry){
  const points=geometry?.type==='Polygon'?geometry.coordinates.flat():geometry?.type==='MultiPolygon'?geometry.coordinates.flat(2):[];
  if(!points.length)return null;
  let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
  for(const p of points){if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))return null;w=Math.min(w,p[0]);e=Math.max(e,p[0]);s=Math.min(s,p[1]);n=Math.max(n,p[1]);}
  return [w,s,e,n];
}
const overlap=(a,b)=>a&&b&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const contains=(p,item)=>p[0]>=item.bounds[0]&&p[0]<=item.bounds[2]&&p[1]>=item.bounds[1]&&p[1]<=item.bounds[3]&&inPark(p,item.geometry);
function index(features){return features.map(f=>({geometry:f.geometry,bounds:bounds(f.geometry),name:f.properties?.PUBLIC_NAM})).filter(f=>f.bounds);}

export function placeCanopyTrees(center,parks,canopy,pavement,{limit=160}={}){
  const candidates=[];const cx=center.longitude*SX,cy=center.latitude*SY;
  for(let y=Math.floor((cy-190)/SPACING);y<=Math.ceil((cy+190)/SPACING);y++)for(let x=Math.floor((cx-190)/SPACING);x<=Math.ceil((cx+190)/SPACING);x++){
    let seed=(Math.imul(x,73856093)^Math.imul(y,19349663))>>>0;
    const px=(x+.2+(seed%60)/100)*SPACING,py=(y+.2+((seed>>>8)%60)/100)*SPACING;
    const distance=Math.hypot(px-cx,py-cy);if(distance>185)continue;
    candidates.push({x,y,seed,p:[px/SX,py/SY],distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance);const result=[];
  const parkIndex=index(parks),canopyIndex=index(canopy),pavementIndex=index(pavement);
  for(const {x,y,seed,p} of candidates){
    const park=parkIndex.find(item=>contains(p,item));
    if(!park||!canopyIndex.some(item=>contains(p,item))||pavementIndex.some(item=>contains(p,item)))continue;
    // Reject near-path trunks as well as stems directly inside paving. Sample
    // a 1.5m clearance ring; canopy itself may naturally overhang a path.
    if([[1.5/SX,0],[-1.5/SX,0],[0,1.5/SY],[0,-1.5/SY]].some(([dx,dy])=>pavementIndex.some(item=>contains([p[0]+dx,p[1]+dy],item))))continue;
    result.push({id:`woodland-${x}-${y}`,longitude:p[0],latitude:p[1],scale:2.1+(seed%100)/160,
      park:park.name,referenceId:'fairmount',positionBasis:'Interpreted tree within 2018 mapped canopy and 2025 park boundary; excludes mapped paving',heightBasis:'Representative canopy scale, not surveyed tree height'});
    if(result.length>=limit)break;
  }
  return result;
}

export function createParkCanopy({onStatus=()=>{}}={}){
  let parks=null;
  async function collection(url,signal){
    const response=await fetch(url,{signal,credentials:'omit'});if(!response.ok)throw new Error(`Canopy data HTTP ${response.status}`);
    const text=await response.text();if(text.length>8000000)throw new Error('Canopy geometry exceeds local window budget');
    const data=JSON.parse(text);if(!Array.isArray(data.features)||data.error)throw new Error('Invalid canopy feature collection');return data;
  }
  return {async load(center,signal){
    if(!parks)parks=(await collection('/data/parks.geojson',signal)).features;
    const box=[center.longitude-220/SX,center.latitude-220/SY,center.longitude+220/SX,center.latitude+220/SY];
    const nearby=parks.filter(f=>overlap(bounds(f.geometry),box));if(!nearby.length)return [];
    const common={f:'geojson',geometry:box.join(','),geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',inSR:'4326',outSR:'4326',returnGeometry:'true',geometryPrecision:'7',maxAllowableOffset:'0.000002',resultRecordCount:'1000'};
    const signalBound=AbortSignal.any([signal,AbortSignal.timeout(18000)]);
    const canopy=await collection(`${CANOPY_SOURCE}?${new URLSearchParams({...common,where:"CLASS_NAME IN ('Gain','No Change')",outFields:'OBJECTID,CLASS_NAME'})}`,signalBound);
    if(!canopy.features.length)return [];
    const pavement=await collection(`${PAVEMENT_SOURCE}?${new URLSearchParams({...common,where:'FCODE <> 9999',outFields:'FCODE'})}`,signalBound);
    // Incomplete exclusions must never authorize planting across unseen roads.
    if(pavement.exceededTransferLimit||pavement.properties?.exceededTransferLimit)throw new Error('Pavement exclusions incomplete');
    if(canopy.exceededTransferLimit||canopy.properties?.exceededTransferLimit)onStatus('Only part of the mapped canopy loaded in this park.','warning');
    return placeCanopyTrees(center,nearby,canopy.features,pavement.features);
  }};
}
