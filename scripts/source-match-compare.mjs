// Offline position/surface/normal comparison of captured source geometry.
import fs from 'node:fs';
import path from 'node:path';
import { Cartesian3, Matrix3, Matrix4, Transforms } from 'cesium';

const OUT = path.resolve('artifacts/city-source-audit/match-philly-0000');
const identity = JSON.parse(fs.readFileSync(path.join(OUT,'identity-and-lods.json')));
const decoded = JSON.parse(fs.readFileSync(path.join(OUT,'decoded-242.json')));
const dae = fs.readFileSync('artifacts/city-source-audit/sample-philly-0000/philly_0000.dae','utf8');
const array = name => {
  const match = dae.match(new RegExp(`<float_array id="philly_0000-obj-${name}-array" count="(\\d+)">([^<]+)</float_array>`));
  if (!match) throw new Error(`Missing source ${name} array`);
  const values=match[2].trim().split(/\s+/).map(Number);
  if(values.length!==Number(match[1]))throw new Error('Invalid original source array count');
  return values;
};
const xyz = array('position'); const normalValues=array('normal');
const sourcePoints=Array.from({length:xyz.length/3},(_,i)=>xyz.slice(i*3,i*3+3));
const sourceNormals=Array.from({length:normalValues.length/3},(_,i)=>normalValues.slice(i*3,i*3+3));
const triangles=[];
for(const match of dae.matchAll(/<triangles\b([^>]*)>([\s\S]*?)<\/triangles>/g)) {
  const count=Number(match[1].match(/count="(\d+)"/)[1]);
  const offsets=[...match[2].matchAll(/<input\b[^>]*offset="(\d+)"/g)].map(m=>Number(m[1]));
  const stride=Math.max(...offsets)+1;const indices=match[2].match(/<p>([^<]+)<\/p>/)[1].trim().split(/\s+/).map(Number);
  if(indices.length!==count*3*stride)throw new Error('Invalid original triangle count');
  for(let i=0;i<count;i++) triangles.push({points:[0,1,2].map(v=>sourcePoints[indices[(i*3+v)*stride]]),normal:sourceNormals[indices[i*3*stride+1]]});
}

const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const normalize=a=>{const length=Math.hypot(...a);return a.map(x=>x/(length||1));};
const addScaled=(a,b,t)=>[a[0]+b[0]*t,a[1]+b[1]*t,a[2]+b[2]*t];
const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-75.155179,39.955632,0));
const inverse=Matrix4.inverseTransformation(frame,new Matrix4());
const {CenterLon,CenterLat,Origin84}=identity.attributes;
const sourceFrame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(CenterLon,CenterLat,Origin84));
const sourceToComparison=Matrix4.multiply(inverse,sourceFrame,new Matrix4());
const sourceRotation=Matrix4.getMatrix3(sourceToComparison,new Matrix3());
const transformPoint=p=>{const v=Matrix4.multiplyByPoint(sourceToComparison,new Cartesian3(...p),new Cartesian3());return[v.x,v.y,v.z];};
const transformNormal=p=>{const v=Matrix3.multiplyByVector(sourceRotation,new Cartesian3(...p),new Cartesian3());return[v.x,v.y,v.z];};
const original=triangles.map(t=>({points:t.points.map(transformPoint),normal:transformNormal(t.normal)}));
const [first,last]=decoded.ranges[identity.target.index];
const existing=Array.from({length:last-first+1},(_,i)=>({points:decoded.points.slice((first+i)*3,(first+i)*3+3),normal:decoded.normals[(first+i)*3]}));

// Closest point on a triangle, including edge and vertex Voronoi regions.
// Degenerate triangles fall back to their vertices; they are counted below.
function closest(p,t) {
 const [a,b,c]=t;const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a);const d1=dot(ab,ap),d2=dot(ac,ap);
 if(d1<=0&&d2<=0)return a;
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return b;
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return addScaled(a,ab,d1/(d1-d3));
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return c;
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return addScaled(a,ac,d2/(d2-d6));
 const va=d3*d6-d5*d4;if(va<=0&&(d4-d3)>=0&&(d5-d6)>=0)return addScaled(b,sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)));
 const sum=va+vb+vc;if(Math.abs(sum)<1e-18)return [a,b,c].sort((x,y)=>dot(sub(p,x),sub(p,x))-dot(sub(p,y),sub(p,y)))[0];
 return addScaled(addScaled(a,ab,vb/sum),ac,vc/sum);
}
const bounds=mesh=>[0,1,2].map(axis=>mesh.reduce(([min,max],t)=>[Math.min(min,...t.points.map(p=>p[axis])),Math.max(max,...t.points.map(p=>p[axis]))],[Infinity,-Infinity]));
function prepare(mesh){return mesh.map(t=>({...t,bounds:[0,1,2].map(a=>[Math.min(...t.points.map(p=>p[a])),Math.max(...t.points.map(p=>p[a]))])}));}
function query(point,mesh) {
 let best=Infinity,normal=null,nearest=null;
 for(const triangle of mesh){
  let lower=0;for(let axis=0;axis<3;axis++){const [min,max]=triangle.bounds[axis];const d=Math.max(min-point[axis],0,point[axis]-max);lower+=d*d;}
  if(lower>best)continue;
  const candidate=closest(point,triangle.points),delta=sub(point,candidate),distance=dot(delta,delta);
  if(distance<best){best=distance;normal=triangle.normal;nearest=candidate;}
 }
 return{distance:Math.sqrt(best),normal,nearest};
}
function stats(values){const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,mean:values.reduce((s,x)=>s+x,0)/values.length,p50:sorted[Math.floor(values.length*.5)],p95:sorted[Math.floor(values.length*.95)],max:sorted.at(-1)};}
function compare(from,to) {
 const target=prepare(to),vertexDistances=[],centroidDistances=[],normalAngles=[],roofDistances=[],roofNormalAngles=[],outliers=[];
 let totalArea=0,outlierArea=0;
 for(const [index,triangle] of from.entries()) {
  for(const point of triangle.points)vertexDistances.push(query(point,target).distance);
  const centroid=[0,1,2].map(axis=>triangle.points.reduce((s,p)=>s+p[axis],0)/3);
  const match=query(centroid,target),angle=Math.acos(Math.max(-1,Math.min(1,dot(normalize(triangle.normal),normalize(match.normal)))))*180/Math.PI;
  centroidDistances.push(match.distance);normalAngles.push(angle);
  const area=Math.hypot(...cross(sub(triangle.points[1],triangle.points[0]),sub(triangle.points[2],triangle.points[0])))/2;totalArea+=area;
  if(match.distance>.1){outlierArea+=area;outliers.push({triangle:index,distance:match.distance,area,centroid,nearest:match.nearest,points:triangle.points,normal:triangle.normal});}
  if(triangle.normal[2]>.8){roofDistances.push(match.distance);roofNormalAngles.push(angle);}
 }
 return{vertexDistanceMeters:stats(vertexDistances),centroidDistanceMeters:stats(centroidDistances),normalAngleDegrees:stats(normalAngles),roofCentroidDistanceMeters:stats(roofDistances),roofNormalAngleDegrees:stats(roofNormalAngles),totalAreaSquareMeters:totalArea,outlierAreaSquareMeters:outlierArea,outliers};
}
const report={
 target:{name:'philly_0000',objectId:2351,resource:242,leafNode:243},
 placement:{longitude:CenterLon,latitude:CenterLat,height:Origin84,basis:'Published per-feature CenterLon, CenterLat and Origin84. No fitted transform.',
  heightLimitation:'Matches existing I3S coordinate frame without active geoid correction. Metadata also labels the layer EGM96 and publishes OriginMSL=37.02377112; do not add geoid correction to just this replacement.'},
 originalTriangles:original.length,i3sTriangles:existing.length,originalBounds:bounds(original),i3sBounds:bounds(existing),
 originalToI3s:compare(original,existing),i3sToOriginal:compare(existing,original),
 note:'Distances compare actual triangle surfaces in the common ENU frame, using all triangle vertices and centroids; normal comparisons use published per-vertex normals at each triangle start. Not a Hausdorff proof or present-day survey validation.',
};
// Keep source-derived surfaces not covered by the original, including thin
// source artifacts. Only bit-identical repeated triangles are coalesced.
const raw=fs.readFileSync(path.join(OUT,'node-242-geometry-0.bin'));
const colorOffset=8+decoded.vertexCount*32;
const originalPrepared=prepare(original),seen=new Set(),remainder=[];
const coverageToleranceMeters=.1;
for(const [index,triangle] of existing.entries()) {
 const key=triangle.points.map(p=>p.join(',')).sort().join('|');if(seen.has(key))continue;seen.add(key);
 const samples=[];
 for(let a=0;a<=4;a++)for(let b=0;b<=4-a;b++) {
  const c=4-a-b;samples.push([0,1,2].map(axis=>(triangle.points[0][axis]*a+triangle.points[1][axis]*b+triangle.points[2][axis]*c)/4));
 }
 samples.push([0,1,2].map(axis=>triangle.points.reduce((s,p)=>s+p[axis],0)/3));
 const maxDistance=Math.max(...samples.map(p=>query(p,originalPrepared).distance));
 if(maxDistance>coverageToleranceMeters)remainder.push({index,triangle,maxSampleDistanceMeters:maxDistance});
}
const toOriginal=Matrix4.inverseTransformation(sourceToComparison,new Matrix4());
const toOriginalNormal=Matrix4.getMatrix3(toOriginal,new Matrix3());
const remainderData={source:'Existing I3S resource 242 geometry 0, feature ID 2351',
 coordinateFrame:'Original COLLADA metre/Z-up local frame; use the identical published placement as the textured model.',
 coverageToleranceMeters,samplesPerTriangle:16,sourceTriangleIndices:[],positions:[],normals:[],colors:[],maxSampleDistanceMeters:[]};
for(const selected of remainder) {
 remainderData.sourceTriangleIndices.push(first+selected.index);remainderData.maxSampleDistanceMeters.push(selected.maxSampleDistanceMeters);
 for(let v=0;v<3;v++) {
  const sourceIndex=(first+selected.index)*3+v;
  const point=Matrix4.multiplyByPoint(toOriginal,new Cartesian3(...decoded.points[sourceIndex]),new Cartesian3());
  const normal=Matrix3.multiplyByVector(toOriginalNormal,new Cartesian3(...decoded.normals[sourceIndex]),new Cartesian3());
  remainderData.positions.push(point.x,point.y,point.z);remainderData.normals.push(normal.x,normal.y,normal.z);
  remainderData.colors.push(...raw.subarray(colorOffset+sourceIndex*4,colorOffset+sourceIndex*4+4));
 }
}
report.remainder={triangles:remainder.length,distinctI3sTriangles:seen.size,coverageToleranceMeters,
 retainedSourceAreaSquareMeters:remainder.reduce((s,t)=>s+Math.hypot(...cross(sub(t.triangle.points[1],t.triangle.points[0]),sub(t.triangle.points[2],t.triangle.points[0])))/2,0),
 file:'remainder-source-geometry.json',note:'Original source positions, normals, RGBA bytes and winding retained. The 16-point coverage test is bounded evidence, not an exact union proof. Enable only after inspecting the combined asset.'};
fs.writeFileSync(path.join(OUT,'remainder-source-geometry.json'),JSON.stringify(remainderData,null,2)+'\n');
fs.writeFileSync(path.join(OUT,'surface-comparison.json'),JSON.stringify(report,null,2)+'\n');
const paths=mesh=>mesh.map(t=>`M ${t.points.map(p=>`${(350+p[0]*5).toFixed(2)} ${(310-p[1]*5).toFixed(2)}`).join(' L ')} Z`).join(' ');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="740" height="630" viewBox="0 0 740 630"><rect width="740" height="630" fill="white"/><text x="20" y="28" font-family="sans-serif" font-size="17">philly_0000 / OBJECTID 2351 — observed source geometry</text><text x="20" y="52" font-family="sans-serif" font-size="13">Blue: original textured DAE. Orange: current untextured I3S. Scale: 5 px/m.</text><path d="${paths(existing)}" stroke="#df7200" opacity=".28" stroke-width=".4" fill="none"/><path d="${paths(original)}" stroke="#146cdb" opacity=".8" stroke-width=".55" fill="none"/><text x="20" y="610" font-family="sans-serif" font-size="12">Source placement only; no best-fit transform. Surface/normal error statistics are in surface-comparison.json.</text></svg>`;
fs.writeFileSync(path.join(OUT,'geometry-overlay.svg'),svg);
console.log(JSON.stringify({target:report.target,placement:report.placement,originalTriangles:original.length,i3sTriangles:existing.length,
 originalToI3s:report.originalToI3s.vertexDistanceMeters,i3sToOriginal:report.i3sToOriginal.vertexDistanceMeters,
 outliers:report.i3sToOriginal.outliers.length,remainder:report.remainder},null,2));
