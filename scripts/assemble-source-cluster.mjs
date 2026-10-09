// Preserve source geometry while sharing byte-identical atlas images/materials.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Cartesian3,Matrix4,Transforms} from 'cesium';

assert.equal(process.argv[2],'arch-street');
const slug='arch-street';
const manifest=JSON.parse(fs.readFileSync(`artifacts/city-source-audit/${slug}/source-meshes.json`));
const hash=b=>createHash('sha256').update(b).digest('hex');
const parts=manifest.objectIds.map(id=>{
 const path=`public/models/city/source-${id}.glb`,bytes=fs.readFileSync(path);
 const size=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+size));
 const provenance=JSON.parse(fs.readFileSync(path.replace('.glb','.provenance.json')));
 assert.equal(hash(bytes),provenance.outputSha256);
 assert.equal(doc.meshes.length,1);assert.equal(doc.meshes[0].primitives.length,1);
 assert.equal(doc.materials.length,1);assert.equal(doc.images.length,1);
 return {id,doc,bin:bytes.subarray(28+size),provenance};
});
const origin=parts[0].doc.extras.origin;
const inverse=Matrix4.inverseTransformation(Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...origin)),new Matrix4());
const axis=new Matrix4(1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1);
const axisInverse=Matrix4.inverseTransformation(axis,new Matrix4());
const doc={asset:{version:'2.0',generator:'Philadelphia original source cluster with shared photo atlases'},scene:0,
 scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[],accessors:[],bufferViews:[],buffers:[],
 extras:{origin,source:manifest.source,objectIds:manifest.objectIds,status:'Historical source geometry and photography; unfinished game art'}};
const binary=[],verification=[],atlasMap=new Map(),atlases=[];let byteLength=0;
function addView(bytes,target){
 const pad=Buffer.alloc((4-byteLength%4)%4);binary.push(pad);byteLength+=pad.length;
 const view={buffer:0,byteOffset:byteLength,byteLength:bytes.length};if(target)view.target=target;
 const index=doc.bufferViews.length;doc.bufferViews.push(view);binary.push(bytes);byteLength+=bytes.length;
 verification.push({index,bytes});return index;
}
for(const part of parts){
 const p=part.doc,primitive=p.meshes[0].primitives[0];
 assert.equal(primitive.mode,4);assert.equal(primitive.indices,undefined);
 const imageView=p.bufferViews[p.images[0].bufferView];
 const jpg=part.bin.subarray(imageView.byteOffset,imageView.byteOffset+imageView.byteLength);
 const key=hash(jpg);assert.equal(key,part.provenance.originalAtlasSha256);
 let material=atlasMap.get(key);
 if(material===undefined){
  material=doc.materials.length;atlasMap.set(key,material);
  doc.images.push({bufferView:addView(jpg),mimeType:'image/jpeg'});
  doc.samplers.push({...p.samplers[0]});
  doc.textures.push({source:material,sampler:material});
  doc.materials.push({...p.materials[0],name:`Original Philadelphia atlas ${key.slice(0,12)}`,
   pbrMetallicRoughness:{...p.materials[0].pbrMetallicRoughness,baseColorTexture:{index:material}}});
  atlases.push({...part.provenance.textureDimensions,sha256:key,sourceObjectIds:[]});
 }else{
  assert.deepEqual(p.samplers[0],doc.samplers[material]);
  assert.deepEqual(part.provenance.textureDimensions,{width:atlases[material].width,height:atlases[material].height});
 }
 atlases[material].sourceObjectIds.push(part.id);
 const attributes={};
 for(const [name,index] of Object.entries(primitive.attributes)){
  const accessor=p.accessors[index],view=p.bufferViews[accessor.bufferView];
  assert.equal(accessor.sparse,undefined);assert.equal(view.byteStride,undefined);
  attributes[name]=doc.accessors.length;
  doc.accessors.push({...accessor,bufferView:addView(part.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength),view.target)});
 }
 const relative=Matrix4.multiply(inverse,Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...p.extras.origin)),new Matrix4());
 const matrix=Matrix4.multiply(Matrix4.multiply(axis,relative,new Matrix4()),axisInverse,new Matrix4());
 doc.scenes[0].nodes.push(doc.nodes.length);
 doc.nodes.push({name:`Original Philadelphia source ${part.id}`,mesh:doc.meshes.length,matrix:Matrix4.toArray(matrix),extras:{sourceObjectId:part.id}});
 doc.meshes.push({primitives:[{attributes,mode:4,material}]});
}
doc.buffers=[{byteLength}];const json=Buffer.from(JSON.stringify(doc));
const jc=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const bin=Buffer.concat([...binary,Buffer.alloc((4-byteLength%4)%4)]);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+jc.length+bin.length,8);
const chunk=(size,type)=>{const b=Buffer.alloc(8);b.writeUInt32LE(size);b.writeUInt32LE(type,4);return b;};
const output=`public/models/city/${slug}-original.glb`;
fs.writeFileSync(output,Buffer.concat([header,chunk(jc.length,0x4e4f534a),jc,chunk(bin.length,0x004e4942),bin]));
const checked=fs.readFileSync(output),size=checked.readUInt32LE(12),parsed=JSON.parse(checked.subarray(20,20+size));
assert.equal(checked.length,checked.readUInt32LE(8));
for(const entry of verification){
 const view=parsed.bufferViews[entry.index];
 assert.ok(checked.subarray(28+size+view.byteOffset,28+size+view.byteOffset+view.byteLength).equals(entry.bytes));
}
assert.equal(doc.nodes.length,9);assert.equal(doc.images.length,4);
const report={output,source:manifest.source,objectIds:manifest.objectIds,origin,
 triangles:parts.reduce((n,p)=>n+p.provenance.triangles,0),textureAtlases:atlases,
 bytes:checked.length,sha256:hash(checked),parts:parts.map(p=>p.provenance),
 verification:'All retained geometry attribute payloads and unique original JPEGs match byte-for-byte; rendered check pending',
 limitations:['Nine source records are not necessarily nine separate buildings','Historical photographic shading and occlusion remain','No interiors or final authored game surfaces']};
fs.writeFileSync(output.replace('.glb','.provenance.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,triangles:report.triangles,bytes:report.bytes,uniqueAtlases:atlases.length,objectIds:manifest.objectIds}));
