import {localPoint} from './district-geometry.js';
/** Reviewed local-agent route concept; array contract, north heading and length corrected. */
export function advanceAlongPath(points,distance){
  if(!Array.isArray(points)||points.length<2||points.some(p=>!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite))||!Number.isFinite(distance)||distance<0)throw new TypeError('Expected finite meter points and a nonnegative distance');
  const segments=[];let length=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy);if(n>1e-8){segments.push({a,b,dx,dy,n});length+=n;}}
  if(!segments.length)throw new TypeError('Path has no length');
  let d=Math.min(distance,length);
  for(const [i,s] of segments.entries())if(d<s.n||i===segments.length-1){const t=Math.min(1,d/s.n);return {x:s.a[0]+s.dx*t,y:s.a[1]+s.dy*t,heading:Math.atan2(s.dx,s.dy),length,finished:distance>=length};}else d-=s.n;
}
export function createStreetGraph(features){
  const edges=[],outgoing=new Map();
  for(const f of features){const p=f.properties;
    if(![2,3,4,5].includes(p?.class)||!['FT','TF','B'].includes(p.oneway)||f.geometry?.type!=='LineString'||!Number.isFinite(p.fnode_)||!Number.isFinite(p.tnode_))continue;
    const points=f.geometry.coordinates.map(localPoint);
    for(const reverse of p.oneway==='B'?[false,true]:[p.oneway==='TF']){
      const path=reverse?[...points].reverse():points;let sampled;try{sampled=advanceAlongPath(path,0);}catch{continue;}
      const edge={id:`${p.seg_id}:${reverse?'r':'f'}`,sourceId:p.seg_id,name:p.stname,from:reverse?p.tnode_:p.fnode_,to:reverse?p.fnode_:p.tnode_,points:path,length:sampled.length,laneOffset:p.oneway==='B'?1.6:0};
      edges.push(edge);if(!outgoing.has(edge.from))outgoing.set(edge.from,[]);outgoing.get(edge.from).push(edge);
    }
  }
  return {edges,outgoing};
}
export function sampleLane(edge,distance){const p=advanceAlongPath(edge.points,distance);return {...p,x:p.x+Math.cos(p.heading)*edge.laneOffset,y:p.y-Math.sin(p.heading)*edge.laneOffset};}
export function chooseContinuation(graph,edge,sequence){
  const choices=(graph.outgoing.get(edge.to)??[]).filter(e=>e.sourceId!==edge.sourceId);
  if(!choices.length)return null;
  return choices[Math.abs(sequence)%choices.length];
}
