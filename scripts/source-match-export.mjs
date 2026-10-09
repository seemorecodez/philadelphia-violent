// Export only the captured I3S remainder; no geometry/texture generation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const audit=path.resolve('artifacts/city-source-audit/match-philly-0000');
const output=path.resolve('public/models/city/philly-0000-remainder.glb');
const input=JSON.parse(fs.readFileSync(path.join(audit,'remainder-source-geometry.json')));
const identity=JSON.parse(fs.readFileSync(path.join(audit,'identity-and-lods.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(audit,'manifest.json')));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const axis=array=>{const result=[];for(let i=0;i<array.length;i+=3)result.push(array[i],array[i+2],-array[i+1]);return result;};
const toLinear=value=>{const x=value/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;};
const positions=axis(input.positions),normals=axis(input.normals);
const colors=input.colors.map((value,i)=>i%4===3?value/255:toLinear(value));
const vertexCount=positions.length/3;
assert.equal(vertexCount%3,0);assert.equal(normals.length,positions.length);assert.equal(colors.length,vertexCount*4);
assert.equal(vertexCount/3,input.sourceTriangleIndices.length);
const arrays=[positions,normals,colors];const buffers=arrays.map(a=>Buffer.from(new Float32Array(a).buffer));
let offset=0;const bufferViews=buffers.map(buffer=>{const view={buffer:0,byteOffset:offset,byteLength:buffer.length,target:34962};offset+=buffer.length;return view;});
const bounds=Array.from({length:3},(_,axis)=>{const values=positions.filter((_,i)=>i%3===axis);return[Math.min(...values),Math.max(...values)];});
const gltf={asset:{version:'2.0',generator:'source-match-export.mjs; original I3S positions/normals/colors'},
 scene:0,scenes:[{nodes:[0]}],nodes:[{name:'philly_0000 original I3S remainder',mesh:0}],
 meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},mode:4,material:0}]}],
 materials:[{name:'Original I3S vertex colors',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1},doubleSided:false}],
 buffers:[{byteLength:offset}],bufferViews,
 accessors:[{bufferView:0,componentType:5126,count:vertexCount,type:'VEC3',min:bounds.map(b=>b[0]),max:bounds.map(b=>b[1])},
 {bufferView:1,componentType:5126,count:vertexCount,type:'VEC3'},
 {bufferView:2,componentType:5126,count:vertexCount,type:'VEC4'}],
 extras:{sourceFeatureId:2351,sourceResource:242,sourceTriangleIndices:input.sourceTriangleIndices,
  coordinateConvention:'Original local (east,north,up) -> glTF (east,up,-north); Cesium upAxis Y, forwardAxis X.',
  coverageToleranceMeters:input.coverageToleranceMeters}};
const json=Buffer.from(JSON.stringify(gltf));const jsonPadding=Buffer.alloc((4-json.length%4)%4,32);const jsonChunk=Buffer.concat([json,jsonPadding]);
const binary=Buffer.concat(buffers),length=12+8+jsonChunk.length+8+binary.length;
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(length,8);
const jh=Buffer.alloc(8);jh.writeUInt32LE(jsonChunk.length);jh.write('JSON',4);
const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4);
const payload=Buffer.concat([header,jh,jsonChunk,bh,binary]);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,payload);
// Read the actual exported bytes back, checking every component and triangle.
const checked=fs.readFileSync(output);assert.equal(checked.toString('utf8',0,4),'glTF');assert.equal(checked.readUInt32LE(8),checked.length);
const checkedJsonLength=checked.readUInt32LE(12);const parsed=JSON.parse(checked.toString('utf8',20,20+checkedJsonLength));
const binaryOffset=20+checkedJsonLength+8;
const maximumErrors=[];
for(let a=0;a<arrays.length;a++){
 let maximum=0;const view=parsed.bufferViews[a];for(let i=0;i<arrays[a].length;i++)maximum=Math.max(maximum,Math.abs(checked.readFloatLE(binaryOffset+view.byteOffset+i*4)-arrays[a][i]));
 assert.ok(maximum<.00001);maximumErrors.push(maximum);
}
const localBounds=Array.from({length:3},(_,axis)=>{const values=input.positions.filter((_,i)=>i%3===axis);return[Math.min(...values),Math.max(...values)];});
const report={asset:'philly-0000-remainder.glb',sha256:hash(checked),bytes:checked.length,triangles:vertexCount/3,
 placement:{longitude:identity.attributes.CenterLon,latitude:identity.attributes.CenterLat,height:identity.attributes.Origin84,cesiumUpAxis:'Y',cesiumForwardAxis:'X'},
 localEastNorthUpBoundsMeters:localBounds,gltfBoundsMeters:bounds,sourceFeatureId:2351,sourceName:'philly_0000',sourceResource:242,
 sourceGeometry:manifest.find(item=>item.file==='node-242-geometry-0.bin'),sourceTriangleIndices:input.sourceTriangleIndices,
 verification:{readBack:true,maximumPositionErrorMeters:maximumErrors[0],maximumNormalComponentError:maximumErrors[1],maximumLinearColorComponentError:maximumErrors[2]},
 method:'Retains the distinct I3S triangles exceeding 0.1 m source-surface distance at any of 16 barycentric samples. Bit-identical repeated triangles are coalesced. No invented geometry. Source RGB bytes converted from sRGB to linear glTF COLOR_0, as in Cesium I3S; alpha is retained.',
 limitations:'Bounded coverage evidence, not an exact surface-union proof. Original source normals and winding retained. Runtime appearance and complete combined replacement must be visually checked before hiding the original feature.'};
fs.writeFileSync(output.replace(/\.glb$/,'.provenance.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(audit,'remainder-export.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
