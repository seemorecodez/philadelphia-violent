import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {encodeHouseMesh} from '../../Unreal/Philadelphia/Tools/house-mesh-binary.mjs';
const root='Unreal/Philadelphia/Content/SourceData/west';
const manifest=JSON.parse(await readFile(root+'/manifest.json'));
let original=0,compact=0,vertices=0,maxPositionErrorCm=0;
for(const cell of manifest.cells){
 const source=await readFile(root+'/'+cell.id+'-houses.json');
 const data=JSON.parse(source).buildings;
 const bytes=encodeHouseMesh(data,cell);
 assert.equal(bytes.toString('ascii',0,8),'PHLYHSE1');
 const count=bytes.readUInt32LE(8);
 for(let i=0;i<count;i++)for(let axis=0;axis<3;axis++){
  const restored=bytes.readFloatLE(16+i*48+axis*4)+(axis===0?cell.x:axis===1?cell.y:0);
  const error=Math.abs(restored-data.positions[i*3+axis]);maxPositionErrorCm=Math.max(maxPositionErrorCm,error);assert.ok(error<.01);
 }
 for(let i=0;i<data.indices.length;i++)assert.equal(bytes.readUInt32LE(16+count*48+i*4),data.indices[i]);
 for(let i=0;i<count;i++){
  for(let a=0;a<3;a++)assert.equal(bytes.readFloatLE(16+i*48+12+a*4),Math.fround(data.normals[i*3+a]));
  for(let a=0;a<4;a++)assert.equal(bytes.readFloatLE(16+i*48+24+a*4),Math.fround(data.colors[i*4+a]));
  for(let a=0;a<2;a++)assert.equal(bytes.readFloatLE(16+i*48+40+a*4),Math.fround(data.uv[i*2+a]));
 }
 const name=cell.id+'-houses.bin';await writeFile(root+'/'+name,bytes);
 const path=root+'/'+cell.id+'.json',base=JSON.parse(await readFile(path));base.houseDetailFile=name;await writeFile(path,JSON.stringify(base));
 original+=source.length;compact+=bytes.length;vertices+=count;
}
const result={cells:manifest.cells.length,originalBytes:original,binaryBytes:compact,vertices,maxPositionErrorCm,scope:'All West detail vertices, attributes and indices; no gameplay acceptance'};
await writeFile('artifacts/agpilot-world-expansion/binary-facade-validation.json',JSON.stringify(result,null,2));console.log(result);
