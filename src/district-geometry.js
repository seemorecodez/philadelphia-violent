import {Cartesian2,PolygonPipeline} from 'cesium';
export const DISTRICT_ORIGIN=[-75.16,39.95];
export const SX=111320*Math.cos(DISTRICT_ORIGIN[1]*Math.PI/180),SY=111320,CELL_SIZE=100;
export const localPoint=([lon,lat])=>[(lon-DISTRICT_ORIGIN[0])*SX,(lat-DISTRICT_ORIGIN[1])*SY];
export const geographicPoint=([x,y])=>[DISTRICT_ORIGIN[0]+x/SX,DISTRICT_ORIGIN[1]+y/SY];
export const area=ring=>ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-q[0]*p[1];},0)/2;
export function clipPolygon(poly,axis,edge,greater){
  const out=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],ai=greater?a[axis]>=edge:a[axis]<=edge,bi=greater?b[axis]>=edge:b[axis]<=edge;
    if(ai)out.push(a);
    if(ai!==bi){const t=(edge-a[axis])/(b[axis]-a[axis]);out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }return out;
}
export function clipBox(poly,box){let p=poly;for(const [axis,edge,greater] of [[0,box[0],true],[1,box[1],true],[0,box[2],false],[1,box[3],false]])p=clipPolygon(p,axis,edge,greater);return p;}
export function triangulatePolygon(rings){
  const points=[],holes=[];
  for(const [i,raw] of rings.entries()){
    const ring=raw.slice();if(ring.length>1&&ring[0][0]===ring.at(-1)[0]&&ring[0][1]===ring.at(-1)[1])ring.pop();
    if(ring.length<3||ring.some(p=>p.length<2||!p.slice(0,2).every(Number.isFinite)))throw Error('Invalid source surface ring');
    if(i)holes.push(points.length);points.push(...ring);
  }
  const ix=PolygonPipeline.triangulate(points.map(p=>new Cartesian2(...p)),holes),triangles=[];
  for(let i=0;i<ix.length;i+=3)triangles.push(ix.slice(i,i+3).map(j=>points[j]));
  const expected=Math.abs(area(rings[0]))-rings.slice(1).reduce((s,r)=>s+Math.abs(area(r)),0);
  const got=triangles.reduce((s,t)=>s+Math.abs(area(t)),0);
  if(Math.abs(got-expected)>Math.max(.02,expected*.0001))throw Error('Surface triangulation lost source area');
  return triangles;
}
export function subdivideTriangle(t,maxEdge=12){
  const lengths=t.map((a,i)=>Math.hypot(a[0]-t[(i+1)%3][0],a[1]-t[(i+1)%3][1]));
  const i=lengths.indexOf(Math.max(...lengths));if(lengths[i]<=maxEdge)return [t];
  const a=t[i],b=t[(i+1)%3],c=t[(i+2)%3],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return [...subdivideTriangle([a,m,c],maxEdge),...subdivideTriangle([m,b,c],maxEdge)];
}
export function pointInTriangle(p,t){
  if(Math.abs(area(t))<1e-9)return false;
  const signs=t.map((a,i)=>{const b=t[(i+1)%3];return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);});
  return signs.every(s=>s>=-1e-6)||signs.every(s=>s<=1e-6);
}
