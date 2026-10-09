import {writeFile} from 'node:fs/promises';
// PHLYHSE1: little-endian counts followed by 12 float32 values per vertex
// (cell-relative position, normal, linear RGBA, UV), then uint32 indices.
export function encodeHouseMesh(data,cell){
 const count=data.positions.length/3;
 if(!Number.isInteger(count)||!count||data.normals.length!==count*3||data.colors.length!==count*4||data.uv.length!==count*2||data.indices.length%3)throw Error('Invalid house mesh attributes');
 const bytes=Buffer.alloc(16+count*48+data.indices.length*4);bytes.write('PHLYHSE1');bytes.writeUInt32LE(count,8);bytes.writeUInt32LE(data.indices.length,12);
 let offset=16;
 for(let i=0;i<count;i++){
  const values=[data.positions[i*3]-cell.x,data.positions[i*3+1]-cell.y,data.positions[i*3+2],...data.normals.slice(i*3,i*3+3),...data.colors.slice(i*4,i*4+4),...data.uv.slice(i*2,i*2+2)];
  for(const value of values){if(!Number.isFinite(value)||!Number.isFinite(Math.fround(value)))throw Error('Nonfinite house attribute');bytes.writeFloatLE(value,offset);offset+=4;}
 }
 for(const index of data.indices){if(!Number.isInteger(index)||index<0||index>=count)throw Error('Invalid house index');bytes.writeUInt32LE(index,offset);offset+=4;}
 return bytes;
}
export async function writeHouseMesh(path,data,cell){await writeFile(path,encodeHouseMesh(data,cell));}
