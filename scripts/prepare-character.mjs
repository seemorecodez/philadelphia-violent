import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = readFileSync('artifacts/source-models/CesiumMan.glb');
const jsonSize = source.readUInt32LE(12);
const model = JSON.parse(source.subarray(20, 20 + jsonSize).toString());
const binary = source.subarray(20 + jsonSize);
// The original skin texture contains a logo. Use a plain neutral material;
// preserve the authored human mesh, skeleton and walking animation.
for (const material of model.materials) {
  material.name = 'Plain character';
  material.pbrMetallicRoughness = { baseColorFactor: [0.32, 0.40, 0.48, 1], metallicFactor: 0, roughnessFactor: 0.85 };
  delete material.normalTexture;
  delete material.emissiveTexture;
}
const originalRoot = model.scenes[0].nodes;
model.nodes.push({ name: 'Character metre scale', children: originalRoot, scale: [1.195, 1.195, 1.195] });
model.scenes[0].nodes = [model.nodes.length - 1];
model.asset.copyright = 'Cesium, CC BY 4.0. Adapted by SeemoreCodez: plain material and approximately 1.8 m height.';
model.asset.generator = 'Philadelphia Drive prepare-character.mjs';
let json = Buffer.from(JSON.stringify(model));
json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + json.length + binary.length, 8);
header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const output = Buffer.concat([header, json, binary]);
writeFileSync('public/models/character/walker.glb', output);
writeFileSync('public/models/character/README.md', `# Walking character\n\nOriginal [Cesium Man](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMan), by Cesium, CC BY 4.0. Retrieved September 11, 2026.\n\nAuthored mesh, skinning and animation preserved. The original logo-bearing texture is not displayed; a plain neutral material replaces it. Root scale 1.195 makes the rest-pose height about 1.8 metres. This is a neutral starting character; customization is not implemented.\n\nSource SHA-256: ${createHash('sha256').update(source).digest('hex')}\n\nDerived SHA-256: ${createHash('sha256').update(output).digest('hex')}\n\nRebuild using node scripts/prepare-character.mjs with the original GLB in artifacts/source-models.\n`);
console.log(`Prepared ${output.length} byte animated character`);
