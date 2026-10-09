// Assemble the two original source pieces without changing their geometry/UVs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Cartesian3,Matrix4,Transforms} from 'cesium';
const district=process.argv[2]==='reading-terminal';
assert.ok(!process.argv[2]||district);
const ids=district?[2742,2743,2739,2850,2851]:[2849,2422];
const slug=district?'reading-terminal-block':'city-hall';
const parts=ids.map(id=>{
 const path=`public/models/city/${district?'source':'city-hall'}-${id}.glb`,bytes=fs.readFileSync(path);
 const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size));
 const bin=bytes.subarray(28+size,28+size+doc.buffers[0].byteLength);
 return {id,path,bytes,doc,bin,provenance:JSON.parse(fs.readFileSync(path.replace('.glb','.provenance.json')))};
});
const origin=parts[0].doc.extras.origin;
const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...origin));
const inverse=Matrix4.inverseTransformation(frame,new Matrix4());
const axis=new Matrix4(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
const axisInverse=Matrix4.inverseTransformation(axis,new Matrix4());
const doc={asset:{version:'2.0',generator:'Philadelphia retained City Hall assembly'},scene:0,
 scenes:[{nodes:parts.map((_,i)=>i)}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[],
 accessors:[],bufferViews:[],buffers:[],extras:{origin,source:parts[0].provenance.source,objectIds:ids,
 status:'Original Philadelphia assembly; photographed lighting and occlusions retained'}};
const buffers=[];let offset=0;
for(const part of parts){
 const p=part.doc;
 const vi=doc.bufferViews.length,ai=doc.accessors.length,mi=doc.materials.length,ti=doc.textures.length,ii=doc.images.length,si=doc.samplers.length;
 const relative=Matrix4.multiply(inverse,Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...p.extras.origin)),new Matrix4());
 const matrix=Matrix4.multiply(Matrix4.multiply(axis,relative,new Matrix4()),axisInverse,new Matrix4());
 doc.nodes.push({name:`Original City Hall source ${part.id}`,mesh:doc.meshes.length,matrix:Matrix4.toArray(matrix)});
 for(const mesh of p.meshes)doc.meshes.push({primitives:mesh.primitives.map(v=>({...v,material:v.material+mi,
   attributes:Object.fromEntries(Object.entries(v.attributes).map(([k,index])=>[k,index+ai]))}))});
 // Unreal uses imported material slot names when combining meshes. Identical
 // names collapse distinct source atlases onto one slot despite separate indices.
 doc.materials.push(...p.materials.map(v=>({...v,name:`${v.name} source ${part.id}`,pbrMetallicRoughness:{...v.pbrMetallicRoughness,
   baseColorTexture:{...v.pbrMetallicRoughness.baseColorTexture,index:v.pbrMetallicRoughness.baseColorTexture.index+ti}}})));
 doc.textures.push(...p.textures.map(v=>({...v,source:v.source+ii,sampler:v.sampler+si})));
 doc.images.push(...p.images.map(v=>({...v,bufferView:v.bufferView+vi})));
 doc.samplers.push(...p.samplers);
 doc.accessors.push(...p.accessors.map(v=>({...v,bufferView:v.bufferView+vi})));
 doc.bufferViews.push(...p.bufferViews.map(v=>({...v,buffer:0,byteOffset:v.byteOffset+offset})));
 const padding=Buffer.alloc((4-part.bin.length%4)%4);
 buffers.push(part.bin,padding);offset+=part.bin.length+padding.length;
}
doc.buffers=[{byteLength:offset}];const bin=Buffer.concat(buffers),json=Buffer.from(JSON.stringify(doc));
const jc=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const head=Buffer.alloc(12);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(28+jc.length+bin.length,8);
const chunk=(n,type)=>{const b=Buffer.alloc(8);b.writeUInt32LE(n);b.writeUInt32LE(type,4);return b;};
const output=`public/models/city/${slug}-original.glb`;
fs.writeFileSync(output,Buffer.concat([head,chunk(jc.length,0x4e4f534a),jc,chunk(bin.length,0x004e4942),bin]));
const check=fs.readFileSync(output),size=check.readUInt32LE(12),parsed=JSON.parse(check.subarray(20,20+size));
assert.equal(check.readUInt32LE(8),check.length);
let start=0;
for(const part of parts){assert.ok(check.subarray(28+size+start,28+size+start+part.bin.length).equals(part.bin));start+=part.bin.length+(4-part.bin.length%4)%4;}
assert.equal(parsed.nodes.length,parts.length);assert.equal(parsed.materials.length,parts.length);
assert.equal(new Set(parsed.materials.map(m=>m.name)).size,parts.length);
assert.equal(new Set(parsed.materials.map(m=>m.pbrMetallicRoughness.baseColorTexture.index)).size,parts.length);
const report={output,source:doc.extras.source,objectIds:ids,origin,
 triangles:parts.reduce((n,p)=>n+p.provenance.triangles,0),
 textureAtlases:parts.map(p=>p.provenance.textureDimensions??{width:4096,height:4096}),
 bytes:check.length,sha256:createHash('sha256').update(check).digest('hex'),
 parts:parts.map(p=>p.provenance),verification:'Both original geometry/texture buffer payloads preserved byte for byte in assembly; rendered verification pending',
 limitations:['Source City Hall asset; not a new reconstruction','Historical photographic shadows and occlusion remain','No authored interior or final game collision']};
fs.writeFileSync(output.replace('.glb','.provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,triangles:report.triangles,bytes:report.bytes,objectIds:report.objectIds}));
