import fs from 'node:fs';
import { Matrix4, Cartesian3, Quaternion } from 'cesium';
const bytes=fs.readFileSync('public/models/mustang-2005.glb');
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const metadata=JSON.parse(fs.readFileSync('public/models/mustang-2005.metadata.json'));
const parents=new Map();
gltf.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=gltf.nodes[i];return n.matrix?Matrix4.fromArray(n.matrix):Matrix4.fromTranslationQuaternionRotationScale(Cartesian3.fromArray(n.translation??[0,0,0]),new Quaternion(...(n.rotation??[0,0,0,1])),Cartesian3.fromArray(n.scale??[1,1,1]));};
const global=i=>parents.has(i)?Matrix4.multiply(global(parents.get(i)),local(i),new Matrix4()):local(i);
const packed=m=>Array.from({length:16},(_,i)=>m[i]);
const wheels=metadata.wheels.map(w=>({front:w.location.startsWith('front'),center:w.centerMetres,radius:w.radiusMetres,
  nodes:[w.rimRootNode,w.tireRootNode].map(i=>({name:gltf.nodes[i].name,parentInverse:packed(Matrix4.inverse(parents.has(i)?global(parents.get(i)):Matrix4.IDENTITY,new Matrix4())),originalGlobal:packed(global(i))})),
}));
fs.writeFileSync('src/wheel-rigs.js','// Derived from the licensed Mustang mesh transforms; no geometry changes.\nexport const wheelRigs = '+JSON.stringify({'/models/mustang-2005.glb':wheels})+';\n');
console.log('Prepared four measured wheel pivots and eight original rim/tire nodes.');
