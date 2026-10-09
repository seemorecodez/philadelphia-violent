import {readFile,writeFile} from 'node:fs/promises';
import {pointInTriangle} from '../../src/district-geometry.js';
const root='Unreal/Philadelphia/SourceAssets/west/cells';
const meta=JSON.parse(await readFile('Unreal/Philadelphia/Content/SourceData/west/manifest.json'));
const cells=new Map();for(const c of meta.cells)cells.set(c.id,JSON.parse(await readFile(root+'/'+c.id+'.json')));
function road(p){const v=cells.get(`${Math.floor(p[0]/100)}_${Math.floor(p[1]/100)}`)?.groups.road??[];for(let i=0;i<v.length;i+=6)if(pointInTriangle(p,[v.slice(i,i+2),v.slice(i+2,i+4),v.slice(i+4,i+6)]))return true;return false;}
const start=[meta.spawn[0]/100,-meta.spawn[1]/100],theta=(meta.yawDegrees+90)*Math.PI/180,forward=[Math.sin(theta),Math.cos(theta)];
const routes=[];
for(let d=30;d<=120;d++)for(const side of [-1,1]){
 const corner=start.map((v,i)=>v+forward[i]*d),turn=[forward[1]*side,-forward[0]*side];
 let valid=true;
 for(let s=0;s<=150-d;s++)for(const width of [-.6,0,.6])if(!road([corner[0]+turn[0]*s-turn[1]*width,corner[1]+turn[1]*s+turn[0]*width])){valid=false;break;}
 if(valid)routes.push({firstLegMeters:d,turnYawDegrees:meta.yawDegrees+side*90,corner,end:corner.map((v,i)=>v+turn[i]*(150-d))});
}
const result={scope:'Source-road candidates only; require actual collision and input-path verification',start,routes};
await writeFile('artifacts/agpilot-world-expansion/west-turn-candidates.json',JSON.stringify(result,null,2));console.log(JSON.stringify({candidates:routes.length,examples:routes.slice(0,3)}));
