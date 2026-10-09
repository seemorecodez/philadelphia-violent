// Preserve the exact textured I3S leaf used by the browser. No mesh invention.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Cartesian3, Matrix3, Matrix4, Transforms} from 'cesium';

const folder='artifacts/city-source-audit/city-hall';
const report=JSON.parse(fs.readFileSync(process.argv[3]??`${folder}/city-hall-mesh.json`));
const selectedId=Number(process.argv[2]??2849);
assert.ok(report.objectIds.includes(selectedId));
const isCityHall=[2849,2422].includes(selectedId);
const leaves=report.lods.filter(n=>n.leaf&&n.objectId===selectedId);
assert.equal(leaves.length,1);
const leaf=leaves[0];
assert.equal(leaf.mesh.geometry.definition,1);
const resource=leaf.mesh.geometry.resource;
const source=fs.readFileSync(`${folder}/nodes-${resource}-geometries-0.bin`);
const jpeg=fs.readFileSync(`${folder}/nodes-${resource}-textures-0.bin`);
assert.equal(jpeg.readUInt16BE(),0xffd8);
function jpegDimensions(bytes){
 let i=2;
 while(i<bytes.length){
  assert.equal(bytes[i++],255);while(bytes[i]===255)i++;
  const marker=bytes[i++],size=bytes.readUInt16BE(i);
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {width:bytes.readUInt16BE(i+5),height:bytes.readUInt16BE(i+3)};
  assert.ok(size>=2&&i+size<=bytes.length);i+=size;
 }
 throw new Error('JPEG dimensions not found');
}
let count=source.readUInt32LE(0);
const features=source.readUInt32LE(4);
assert.equal(features,leaf.mesh.geometry.featureCount);assert.equal(count,leaf.mesh.geometry.vertexCount);assert.equal(count%3,0);
let offset=8;
const floats=n=>{const a=Array.from({length:n},(_,i)=>source.readFloatLE(offset+4*i));offset+=n*4;return a;};
let originalPositions=floats(count*3),originalNormals=floats(count*3),uv=floats(count*2);
let colorBytes=source.subarray(offset,offset+count*4);offset+=count*4;
let regions=Array.from({length:count*4},(_,i)=>source.readUInt16LE(offset+2*i));offset+=count*8;
const ids=Array.from({length:features},(_,i)=>Number(source.readBigUInt64LE(offset+i*8)));offset+=features*8;
const featureIndex=ids.indexOf(selectedId);
assert.equal(featureIndex,leaf.featureIndex);assert.equal(ids.lastIndexOf(selectedId),featureIndex);assert.ok(featureIndex>=0);
const firstTriangle=source.readUInt32LE(offset+featureIndex*8),lastTriangle=source.readUInt32LE(offset+featureIndex*8+4);
assert.ok(firstTriangle<=lastTriangle&&lastTriangle<count/3);offset+=features*8;
assert.equal(offset,source.length);
// I3S faceRange is inclusive and counts triangles, not vertices or byte offsets.
// Slice every attribute together so neighbors in a shared atlas are not exported.
const firstVertex=firstTriangle*3,endVertex=(lastTriangle+1)*3;
originalPositions=originalPositions.slice(firstVertex*3,endVertex*3);
originalNormals=originalNormals.slice(firstVertex*3,endVertex*3);
uv=uv.slice(firstVertex*2,endVertex*2);
colorBytes=colorBytes.subarray(firstVertex*4,endVertex*4);
regions=regions.slice(firstVertex*4,endVertex*4);
count=endVertex-firstVertex;

const center=leaf.nodeDocument.mbs.slice(0,3);
const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...center));
const inverse=Matrix4.inverseTransformation(frame,new Matrix4());
const rotation=Matrix4.getMatrix3(inverse,new Matrix3());
const positions=[],normals=[],colors=[];
const toLinear=b=>{const v=b/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const axis=v=>[v.x,v.z,-v.y];
for(let i=0;i<count;i++){
 const p=Cartesian3.fromDegrees(center[0]+originalPositions[i*3],center[1]+originalPositions[i*3+1],center[2]+originalPositions[i*3+2]);
 positions.push(...axis(Matrix4.multiplyByPoint(inverse,p,new Cartesian3())));
 normals.push(...axis(Matrix3.multiplyByVector(rotation,Cartesian3.fromArray(originalNormals,i*3),new Cartesian3())));
 // Same UV-region crop as the installed Cesium decodeI3S.js. Do not flip V.
 for(let a=0;a<2;a++)uv[i*2+a]=(regions[i*4+a]+uv[i*2+a]*(regions[i*4+a+2]-regions[i*4+a]))/65535;
 colors.push(toLinear(colorBytes[i*4]),toLinear(colorBytes[i*4+1]),toLinear(colorBytes[i*4+2]),colorBytes[i*4+3]/255);
}
assert.ok([...positions,...normals,...uv,...colors].every(Number.isFinite));
assert.ok(colors.every((v,i)=>i%4!==3||v===1),'Transparent source needs separate primitive handling');
const binary=[],views=[],accessors=[];
let byteLength=0;
function view(bytes,target){
 const padding=Buffer.alloc((4-byteLength%4)%4);binary.push(padding);byteLength+=padding.length;
 const result={buffer:0,byteOffset:byteLength,byteLength:bytes.length};if(target)result.target=target;
 binary.push(bytes);byteLength+=bytes.length;views.push(result);return views.length-1;
}
function attribute(values,width,type){
 const array=new Float32Array(values),bytes=Buffer.from(array.buffer);
 const a={bufferView:view(bytes,34962),componentType:5126,count:values.length/width,type};
 if(type==='VEC3'){
  a.min=Array.from({length:width},(_,j)=>Math.min(...array.filter((_,i)=>i%width===j)));
  a.max=Array.from({length:width},(_,j)=>Math.max(...array.filter((_,i)=>i%width===j)));
 }
 accessors.push(a);return accessors.length-1;
}
const attributes={POSITION:attribute(positions,3,'VEC3'),NORMAL:attribute(normals,3,'VEC3'),TEXCOORD_0:attribute(uv,2,'VEC2'),COLOR_0:attribute(colors,4,'VEC4')};
const imageView=view(jpeg);
const doc={asset:{version:'2.0',generator:'Philadelphia original I3S City Hall preservation'},scene:0,scenes:[{nodes:[0]}],
 nodes:[{name:`Philadelphia original source ${selectedId}`,mesh:0}],
 meshes:[{primitives:[{attributes,mode:4,material:0}]}],
 materials:[{name:`Original Philadelphia atlas ${selectedId}`,pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1}}],
 textures:[{source:0,sampler:0}],images:[{bufferView:imageView,mimeType:'image/jpeg'}],
 samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}],
 bufferViews:views,accessors,buffers:[{byteLength}],
 extras:{sourceUrl:report.source,sourceObjectId:selectedId,sourceNode:leaf.nodeIndex,sourceResource:resource,
 sourceVersion:leaf.sourceVersion,sourceFaceRange:[firstTriangle,lastTriangle],origin:center,axes:'glTF east/up/-north; Cesium upAxis Y forwardAxis X',
 status:'Original historical photographic mesh; not cleaned, current survey, or finished game art'}};
const json=Buffer.from(JSON.stringify(doc));const jc=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const bin=Buffer.concat([...binary,Buffer.alloc((4-byteLength%4)%4)]);
const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+jc.length+bin.length,8);
const chunk=(size,type)=>{const b=Buffer.alloc(8);b.writeUInt32LE(size);b.writeUInt32LE(type,4);return b;};
const payload=Buffer.concat([header,chunk(jc.length,0x4e4f534a),jc,chunk(bin.length,0x004e4942),bin]);
const output=`public/models/city/${isCityHall?'city-hall':'source'}-${selectedId}.glb`;fs.writeFileSync(output,payload);
// Verify the actual file, every float component, and the exact original JPEG bytes.
const checked=fs.readFileSync(output),parsed=JSON.parse(checked.subarray(20,20+checked.readUInt32LE(12)));
assert.equal(checked.readUInt32LE(8),checked.length);
const dataStart=28+checked.readUInt32LE(12);
const errors=[positions,normals,uv,colors].map((values,a)=>{
 const start=dataStart+parsed.bufferViews[parsed.accessors[a].bufferView].byteOffset;
 let error=0;for(let i=0;i<values.length;i++)error=Math.max(error,Math.abs(values[i]-checked.readFloatLE(start+i*4)));
 assert.ok(error<.00001);return error;
});
const iv=parsed.bufferViews[parsed.images[0].bufferView];
assert.ok(checked.subarray(dataStart+iv.byteOffset,dataStart+iv.byteOffset+iv.byteLength).equals(jpeg));
const sha=b=>createHash('sha256').update(b).digest('hex');
const evidence={source:report.source,objectId:selectedId,nodeIndex:leaf.nodeIndex,resource,sourceVersion:leaf.sourceVersion,
 originalGeometrySha256:sha(source),originalAtlasSha256:sha(jpeg),textureDimensions:jpegDimensions(jpeg),outputSha256:sha(checked),output,bytes:checked.length,
 triangles:count/3,sourceFeatureIndex:featureIndex,sourceFaceRange:[firstTriangle,lastTriangle],sourceFileFeatureCount:features,origin:center,localBounds: {min:accessors[0].min,max:accessors[0].max},
 maxFloatStorageErrors:errors,originalJpegBytesPreserved:true,sourceTriangleOrderPreserved:true,
 UV:'Original UVs cropped by per-vertex UInt16 atlas region exactly as Cesium; no V flip',
 verification:'Read-back passed; rendered verification pending',
 limitations:['Historical photographed lighting, vegetation and occlusion remain','No interiors or gameplay collision authoring','Height datum follows existing browser convention; not survey corrected']};
fs.writeFileSync(output.replace('.glb','.provenance.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
