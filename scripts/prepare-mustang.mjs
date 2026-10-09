// Prepare the original Ricy CC BY 4.0 model. Body geometry is preserved;
// individually identified badge/decal meshes and marked textures are removed.
// Run: node scripts/prepare-mustang.mjs [--inspect]
import fs from 'node:fs';
import crypto from 'node:crypto';
import draco3d from 'draco3d';
import { Matrix4, Cartesian3, Quaternion } from 'cesium';

const sourcePath = 'artifacts/sourcevehicles/mustang-2005.original.glb';
const inspectionDirectory = 'artifacts/sourcevehicles/mustang-inspection';
const bytes = fs.readFileSync(sourcePath);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) throw new Error('Expected GLB 2.0');
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const binaryChunk = bytes.subarray(20 + jsonLength);
const binary = bytes.subarray(28 + jsonLength);
const draco = await draco3d.createDecoderModule({});
const cachedPositions = new Map();
const sourceHash = crypto.createHash('sha256').update(bytes).digest('hex');
if (sourceHash !== '50028ce61dd4f6b210d710d354d2312f0a2cac0d24056d09d20f039abaaa243b') {
  throw new Error('Source hash changed; inspect the model before applying indexed cleanup.');
}

function positionsForMesh(id) {
  if (cachedPositions.has(id)) return cachedPositions.get(id);
  const positions = [];
  for (const primitive of gltf.meshes[id].primitives) {
    const extension = primitive.extensions.KHR_draco_mesh_compression;
    const view = gltf.bufferViews[extension.bufferView];
    const encoded = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
    const decoder = new draco.Decoder();
    const buffer = new draco.DecoderBuffer();
    const mesh = new draco.Mesh();
    const values = new draco.DracoFloat32Array();
    try {
      buffer.Init(new Int8Array(encoded), encoded.length);
      const result = decoder.DecodeBufferToMesh(buffer, mesh);
      if (!result.ok()) throw new Error(result.error_msg());
      const attribute = decoder.GetAttributeByUniqueId(mesh, extension.attributes.POSITION);
      decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
      for (let i = 0; i < values.size(); i += 3) positions.push(new Cartesian3(values.GetValue(i), values.GetValue(i + 1), values.GetValue(i + 2)));
    } finally {
      draco.destroy(values); draco.destroy(mesh); draco.destroy(buffer); draco.destroy(decoder);
    }
  }
  cachedPositions.set(id, positions);
  return positions;
}

function measure(document) {
  const meshes = [];
  function visit(id, parent) {
    const node = document.nodes[id];
    const local = node.matrix ? Matrix4.fromArray(node.matrix)
      : Matrix4.fromTranslationQuaternionRotationScale(
        Cartesian3.fromArray(node.translation ?? [0, 0, 0]),
        new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        Cartesian3.fromArray(node.scale ?? [1, 1, 1]),
      );
    const world = Matrix4.multiply(parent, local, new Matrix4());
    if (node.mesh !== undefined) {
      const low = [Infinity, Infinity, Infinity]; const high = [-Infinity, -Infinity, -Infinity];
      for (const position of positionsForMesh(node.mesh)) {
        const p = Matrix4.multiplyByPoint(world, position, new Cartesian3());
        [p.x, p.y, p.z].forEach((value, axis) => {
          low[axis] = Math.min(low[axis], value); high[axis] = Math.max(high[axis], value);
        });
      }
      meshes.push({ id, name: node.name, mesh: node.mesh, low, high, vertices: positionsForMesh(node.mesh).length });
    }
    for (const child of node.children ?? []) visit(child, world);
  }
  for (const root of document.scenes[document.scene ?? 0].nodes) visit(root, Matrix4.IDENTITY);
  const low = [0, 1, 2].map(axis => Math.min(...meshes.map(mesh => mesh.low[axis])));
  const high = [0, 1, 2].map(axis => Math.max(...meshes.map(mesh => mesh.high[axis])));
  return { low, high, dimensions: high.map((v, i) => v - low[i]), meshes };
}

fs.mkdirSync(inspectionDirectory, { recursive: true });
const original = measure(gltf);
fs.writeFileSync(`${inspectionDirectory}/geometry-bounds.json`, JSON.stringify({ sourceHash, ...original }, null, 2));
console.log(JSON.stringify({ sourceHash, low: original.low, high: original.high, dimensions: original.dimensions }, null, 2));
if (process.argv.includes('--inspect')) process.exit(0);

const cleaned = structuredClone(gltf);
const removed = [
  [7, 'body_Material #1332_0', 'MUSTANG door-sill lettering overlay'],
  [37, 'rearbadge', 'Rear logo medallion, including its three child meshes'],
  [60, 'msngsteeringwheel_Material #437_0', 'Steering-wheel pony emblem'],
  [93, 'msngv6front bumper_Material #287_0', 'Front pony emblem; separate honeycomb grille mesh is retained'],
  [28, 'FrdPerofrmcRim_Aluminium Clean3_0', 'First wheel-cap lettering'],
  [191, 'FrdPerofrmcRim001_Aluminium Clean3_0', 'Second wheel-cap lettering'],
  [199, 'FrdPerofrmcRim002_Aluminium Clean3_0', 'Third wheel-cap lettering'],
  [204, 'FrdPerofrmcRim003_Aluminium Clean3_0', 'Fourth wheel-cap lettering'],
];
for (const [id, name] of removed) {
  if (cleaned.nodes[id].name !== name) throw new Error(`Unexpected node ${id}`);
}
const removedIds = new Set(removed.map(([id]) => id));
for (const node of cleaned.nodes) {
  if (node.children) node.children = node.children.filter(id => !removedIds.has(id));
}

// All 40 source images were visually inspected in texture-contact-sheet.jpg.
// Keep only the eight images with physical surface detail and no markings:
// headlamp, taillamp, tire tread, brushed panel, speaker grille, amber marker,
// rear side lamp, and overhead-light assembly. No pixel editing or body repaint.
const retainedImages = new Set([1, 2, 3, 8, 13, 15, 17, 38]);
const cleanedMaterials = [];
for (let id = 0; id < cleaned.materials.length; id++) {
  const material = cleaned.materials[id];
  const pbr = material.pbrMetallicRoughness;
  if (!pbr?.baseColorTexture) continue;
  const image = cleaned.textures[pbr.baseColorTexture.index].source;
  if (retainedImages.has(image)) continue;
  delete pbr.baseColorTexture;
  // Match each marked surface to the existing plain plastic/rubber/visor
  // material while retaining its source roughness and metallic response.
  const value = image === 4 ? 0.012 : image === 9 ? 0.006
    : image === 39 ? gltf.materials[11].pbrMetallicRoughness.baseColorFactor[0]
      : gltf.materials[2].pbrMetallicRoughness.baseColorFactor[0];
  pbr.baseColorFactor = [value, value, value, 1];
  cleanedMaterials.push({ id, name: material.name, removedSourceImage: image, plainBaseColor: pbr.baseColorFactor });
}

const unscaled = measure(cleaned);
const scale = 4.77 / unscaled.dimensions[2];
const translation = [
  -(unscaled.low[0] + unscaled.high[0]) / 2 * scale,
  -unscaled.low[1] * scale,
  -(unscaled.low[2] + unscaled.high[2]) / 2 * scale,
];
const roots = cleaned.scenes[cleaned.scene ?? 0].nodes;
const normalizedRoot = cleaned.nodes.length;
cleaned.nodes.push({ name: 'Ground-centred Mustang, 4.77 metres long', children: roots, translation, scale: [scale, scale, scale] });
cleaned.scenes[cleaned.scene ?? 0].nodes = [normalizedRoot];
cleaned.asset.generator += ' / prepare-mustang.mjs';
cleaned.asset.extras.modifications = 'Detached front/rear/steering/wheel/sill badge geometry; replaced marked texture bindings with matching plain surface colours; normalized to 4.77 metres length and ground-centred origin. Source body, wheel, grille and interior geometry preserved.';
const finalBounds = measure(cleaned);
if (Math.abs(finalBounds.dimensions[2] - 4.77) > 1e-6 || Math.abs(finalBounds.low[1]) > 1e-6) throw new Error('Normalization failed');
const json = Buffer.from(JSON.stringify(cleaned));
const padding = Buffer.alloc((4 - json.length % 4) % 4, 0x20);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(20 + json.length + padding.length + binaryChunk.length, 8);
header.writeUInt32LE(json.length + padding.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const output = Buffer.concat([header, json, padding, binaryChunk]);
fs.writeFileSync('public/models/mustang-2005.glb', output);

const wheelRoots = [[24, 29], [187, 192], [195, 205], [200, 208]];
function descendants(root) { return [root, ...(cleaned.nodes[root].children ?? []).flatMap(descendants)]; }
const wheels = wheelRoots.map(([rim, tire]) => {
  const ids = new Set([...descendants(rim), ...descendants(tire)]);
  const parts = finalBounds.meshes.filter(part => ids.has(part.id));
  const low = [0, 1, 2].map(axis => Math.min(...parts.map(part => part.low[axis])));
  const high = [0, 1, 2].map(axis => Math.max(...parts.map(part => part.high[axis])));
  const center = high.map((value, axis) => (value + low[axis]) / 2);
  return {
    location: `${center[2] > 0 ? 'front' : 'rear'}-${center[0] > 0 ? 'left' : 'right'}`,
    rimRootNode: rim, rimRootName: cleaned.nodes[rim].name,
    tireRootNode: tire, tireRootName: cleaned.nodes[tire].name,
    centerMetres: center, radiusMetres: (high[1] - low[1]) / 2,
    globalSpinAxis: '+X in normalized glTF scene; node-local pivots require conversion',
  };
});
const triangleCount = document => measure(document).meshes.reduce((total, part) => total
  + document.meshes[part.mesh].primitives.reduce((count, primitive) => count + document.accessors[primitive.indices].count / 3, 0), 0);
const metadata = {
  source: 'https://sketchfab.com/3d-models/2005-ford-mustang-gt-26b6b60cf2804370ac3c64424242dc1f',
  redistribution: 'https://raw.githubusercontent.com/nesdesignco/FormDrive/main/public/models/mustang-2005.glb',
  author: 'Ricy (https://sketchfab.com/ngon_3d)', license: 'CC-BY-4.0',
  retrieved: '2026-09-11', sourceHash,
  derivedHash: crypto.createHash('sha256').update(output).digest('hex'),
  outputBytes: output.length,
  axes: { up: '+Y', forward: '+Z', evidence: 'Front-bumper vertices occupy positive Z; rear bumper and rear badge occupy negative Z. Source wheels rest on minimum Y.' },
  dimensionsMetres: { width: finalBounds.dimensions[0], height: finalBounds.dimensions[1], length: finalBounds.dimensions[2] },
  boundsMetres: { minimum: finalBounds.low, maximum: finalBounds.high },
  runtimeScale: 1, runtimeGroundOffset: 0, normalization: { scale, translation },
  originalTriangles: triangleCount(gltf), activeTriangles: triangleCount(cleaned),
  removedNodes: removed.map(([id, name, reason]) => ({ id, name, reason })),
  cleanedMaterials, retainedSourceImages: [...retainedImages], wheels,
  binaryChunkUnchanged: true,
  visualStatus: 'Source texture contact sheet inspected. Prepared asset requires front/rear/side/wheel/interior inspection in the running renderer before acceptance. Original body geometry and all unmarked material bindings are preserved.',
};
fs.writeFileSync('public/models/mustang-2005.metadata.json', JSON.stringify(metadata, null, 2) + '\n');
fs.writeFileSync(`${inspectionDirectory}/prepared-bounds.json`, JSON.stringify(finalBounds, null, 2));
console.log(JSON.stringify({ output: 'public/models/mustang-2005.glb', bytes: output.length,
  dimensions: metadata.dimensionsMetres, activeTriangles: metadata.activeTriangles, wheels }, null, 2));
