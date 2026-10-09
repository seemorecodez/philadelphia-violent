// Retain real mapped Museum of Art approach surfaces for native conversion.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fetchCitySurfaceCell} from '../../../src/city-surface-cell.js';
const root='Unreal/Philadelphia/SourceAssets/Museum';
await mkdir(root+'/cells',{recursive:true});
const cells=[];for(let x=-20;x<=-16;x++)for(let y=14;y<=18;y++)cells.push({id:`${x}_${y}`,x,y});
let cursor=0;
await Promise.all([0,1].map(async()=>{while(cursor<cells.length){const c=cells[cursor++],path=`${root}/cells/${c.id}.json`;
 try{const old=JSON.parse(await readFile(path));if(old.id===c.id&&old.sourceFeatures!==undefined)continue;}catch{}
 const cell=await fetchCitySurfaceCell(c.x,c.y,{signal:AbortSignal.timeout(60000)});
 await writeFile(path,JSON.stringify(cell));console.log(`Museum surface ${c.id}: ${cell.sourceFeatures} features`);
}}));
await writeFile(root+'/manifest.json',JSON.stringify({cells,source:'Existing PASDA CityPhilly surface layer 11',retrieved:new Date().toISOString()},null,2));
