// Bounded evidence capture/inspection for the original philly_0000 model.
// No runtime changes. Only the known two I3S leaf resources are inspected.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Cartesian3, Matrix3, Matrix4, Transforms } from 'cesium';

const BASE = 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/philadelphia_Bldgs_text_untex/SceneServer/layers/0';
const OUT = path.resolve('artifacts/city-source-audit/match-philly-0000');
const LEAVES = [242, 250];
const MAX_FILE = 4 * 1024 * 1024;
let fetchedBytes = 0;
fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function capture(relative, name) {
  const file = path.join(OUT, name);
  if (!file.startsWith(OUT + path.sep)) throw new Error('Invalid evidence output path');
  if (fs.existsSync(file)) return fs.readFileSync(file);
  if (!process.argv.includes('--capture')) throw new Error(`Missing evidence ${name}; use --capture for bounded known-source reads.`);
  const bytes = execFileSync('curl.exe', ['--compressed', '--fail', '--silent', '--show-error',
    '--max-time', '30', '--max-filesize', String(MAX_FILE), '--max-redirs', '0', `${BASE}/${relative}`],
  { maxBuffer: MAX_FILE, windowsHide: true });
  fetchedBytes += bytes.length;
  if (bytes.length > MAX_FILE || fetchedBytes > 12 * 1024 * 1024) throw new Error('Source capture exceeds bounded byte limit');
  fs.writeFileSync(file, bytes);
  manifest.push({ relative, file: name, decodedBytes: bytes.length, sha256: hash(bytes), capturedAt: new Date().toISOString() });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return bytes;
}

function attribute(buffer, type) {
  const count = buffer.readUInt32LE(0);
  if (count > 1000) throw new Error('Unexpected field feature count');
  if (type === 'string') {
    let offset = 8 + count * 4;
    return Array.from({ length: count }, (_, i) => {
      const length = buffer.readUInt32LE(8 + i * 4);
      const value = buffer.subarray(offset, offset + length).toString('utf8').replace(/\0$/, '');
      offset += length; return value;
    });
  }
  if (type === 'float64') return Array.from({ length: count }, (_, i) => buffer.readDoubleLE(8 + i * 8));
  return Array.from({ length: count }, (_, i) => buffer.readUInt32LE(4 + i * 4));
}

function decodeGeometry(buffer, node) {
  const vertexCount = buffer.readUInt32LE(0); const featureCount = buffer.readUInt32LE(4);
  if (vertexCount > 100000 || featureCount > 1000 || vertexCount % 3) throw new Error('Unexpected raw I3S geometry header');
  let offset = 8;
  const floats = count => { const values = Array.from({ length: count }, (_, i) => buffer.readFloatLE(offset + i * 4)); offset += count * 4; return values; };
  const positions = floats(vertexCount * 3); const normals = floats(vertexCount * 3);
  offset += vertexCount * 2 * 4; // Original UVs; retained in the captured buffer.
  offset += vertexCount * 4; // RGBA vertex colors.
  const ids = Array.from({ length: featureCount }, (_, i) => buffer.readBigUInt64LE(offset + i * 8).toString()); offset += featureCount * 8;
  const ranges = Array.from({ length: featureCount }, (_, i) => [buffer.readUInt32LE(offset + i * 8), buffer.readUInt32LE(offset + i * 8 + 4)]);
  offset += featureCount * 8;
  if (offset !== buffer.length) throw new Error(`Geometry layout mismatch: decoded ${offset}, actual ${buffer.length}`);
  const center = node.obb?.center ?? node.mbs?.slice(0, 3);
  const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(-75.155179, 39.955632, 0));
  const inverse = Matrix4.inverseTransformation(frame, new Matrix4());
  const rotation = Matrix4.getMatrix3(inverse, new Matrix3());
  const points = []; const localNormals = [];
  for (let i = 0; i < vertexCount; i++) {
    // Uncompressed I3S EPSG:4326 positions are geographic offsets from mbs.
    // Heights remain the published EGM96 values for shape comparison; no
    // silent geoid-to-ellipsoid correction or terrain placement is asserted.
    const p = Matrix4.multiplyByPoint(inverse, Cartesian3.fromDegrees(center[0] + positions[i*3], center[1] + positions[i*3+1], center[2] + positions[i*3+2]), new Cartesian3());
    points.push([p.x, p.y, p.z]);
    const n = Matrix3.multiplyByVector(rotation, Cartesian3.fromArray(normals, i*3), new Cartesian3());
    localNormals.push([n.x,n.y,n.z]);
  }
  return { vertexCount, featureCount, ids, ranges, points, normals: localNormals };
}

const summary = [];
for (const resource of LEAVES) {
  const node = JSON.parse(capture(`nodes/${resource}`, `node-${resource}.json`));
  const ids = attribute(capture(`nodes/${resource}/attributes/f_0/0`, `node-${resource}-OBJECTID.bin`), 'uint32');
  const names = attribute(capture(`nodes/${resource}/attributes/f_1/0`, `node-${resource}-ObjName.bin`), 'string');
  const row = { resource, center: node.obb?.center ?? node.mbs?.slice(0, 3), features: ids.map((id, i) => ({ index: i, id, name: names[i] })) };
  if (process.argv.includes('--geometry')) {
    const geometry = decodeGeometry(capture(`nodes/${resource}/geometries/0`, `node-${resource}-geometry-0.bin`), node);
    if (geometry.featureCount !== ids.length) throw new Error('Attribute/geometry feature counts disagree');
    row.vertexCount = geometry.vertexCount;
    for (const feature of row.features) {
      const [first, last] = geometry.ranges[feature.index];
      const points = geometry.points.slice(first*3, (last+1)*3);
      Object.assign(feature, { geometryId: geometry.ids[feature.index], faces: last-first+1,
        bounds: [0,1,2].map(axis=>[Math.min(...points.map(p=>p[axis])), Math.max(...points.map(p=>p[axis]))]) });
    }
    fs.writeFileSync(path.join(OUT, `decoded-${resource}.json`), JSON.stringify(geometry));
  }
  summary.push(row);
}
fs.writeFileSync(path.join(OUT, 'features.json'), JSON.stringify(summary, null, 2) + '\n');
if (process.argv.includes('--match')) {
  const target = summary[0].features.find(feature => feature.name === 'philly_0000');
  if (!target || target.id !== 2351) throw new Error('Expected named source feature not present');
  const attributes = {};
  for (const [key, name] of [[2,'CenterLat'],[3,'CenterLon'],[4,'Origin84'],[5,'OriginMSL']]) {
    attributes[name] = attribute(capture(`nodes/242/attributes/f_${key}/0`, `node-242-${name}.bin`), 'float64')[target.index];
  }
  const page = JSON.parse(capture('nodepages/3', 'nodepage-3.json'));
  const byIndex = new Map(page.nodes.map(node => [node.index, node]));
  const lods = [];
  for (let node = byIndex.get(243); node; node = byIndex.get(node.parentIndex)) {
    const resource = node.mesh.attribute.resource;
    const ids = attribute(capture(`nodes/${resource}/attributes/f_0/0`, `node-${resource}-OBJECTID.bin`), 'uint32');
    const index = ids.indexOf(target.id);
    if (index < 0 || ids.lastIndexOf(target.id) !== index) throw new Error(`Target feature not unique in ancestor ${node.index}`);
    lods.push({ nodeIndex: node.index, resource, sourceVersion: node.version, featureIndex: index,
      featureCount: ids.length, materialDefinition: node.mesh.material.definition, featureId: target.id });
    if (node.parentIndex === 0) break;
  }
  if (lods.at(-1)?.nodeIndex !== 234) throw new Error('Ancestor trace did not reach the known root child');
  fs.writeFileSync(path.join(OUT, 'identity-and-lods.json'), JSON.stringify({ target, attributes, lods }, null, 2) + '\n');
  console.log(JSON.stringify({ fetchedBytes, target, attributes, lods }, null, 2));
} else console.log(JSON.stringify({ fetchedBytes, summary }, null, 2));
