import { readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../node_modules/three/examples/jsm/libs/meshopt_decoder.module.js';
import { Box3, Vector3 } from '../node_modules/three/build/three.module.js';

/** Inspect decoded positions, avoiding inflated boxes caused by transforming local AABBs. */
async function equipmentBounds(file) {
  const data = readFileSync(file);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '',
  );
  gltf.scene.updateMatrixWorld(true);
  const result = new Map();
  gltf.scene.traverse((object) => {
    if (!/^E\d{2}$/.test(object.name)) return;
    if (result.has(object.name)) throw new Error(`Duplicate equipment ID: ${object.name}`);
    const box = new Box3();
    const point = new Vector3();
    object.traverse((child) => {
      if (!child.isMesh) return;
      const position = child.geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) {
        point.fromBufferAttribute(position, index).applyMatrix4(child.matrixWorld);
        box.expandByPoint(point);
      }
    });
    if (box.isEmpty()) throw new Error(`Equipment has no geometry: ${object.name}`);
    result.set(object.name, [...box.min.toArray(), ...box.max.toArray()]);
  });
  return result;
}

const [source, target, reportFile] = process.argv.slice(2);
if (!source || !target || !reportFile) {
  throw new Error('Usage: node scripts/verify-cad-review.mjs full.glb review.glb report.json');
}
const full = await equipmentBounds(source);
const review = await equipmentBounds(target);
if (full.size !== 42 || review.size !== full.size) throw new Error('Expected 42 equipment instances in both exports');
const rows = [...full].map(([id, original]) => {
  const current = review.get(id);
  if (!current) throw new Error(`Missing equipment: ${id}`);
  return { id, bboxMaxDeltaM: Math.max(...original.map((value, index) => Math.abs(value - current[index]))) };
});
const maxDeltaM = Math.max(...rows.map((row) => row.bboxMaxDeltaM));
const report = {
  method: 'Exact transformed mesh vertex bounds; not CAD surface-distance or engineering-tolerance verification',
  equipmentCount: rows.length,
  maxDeltaM,
  reviewSanityLimitM: 0.025,
  passed: maxDeltaM < 0.025,
  rows,
};
writeFileSync(reportFile, JSON.stringify(report, null, 2));
console.log(`Equipment: ${rows.length}; maximum mesh-boundary delta: ${(maxDeltaM * 1000).toFixed(3)} mm`);
if (!report.passed) throw new Error('Review mesh exceeds the 25 mm boundary sanity limit; tighten simplification');
console.log('All 42 instances retain geometry and mesh boundaries within the review limit: PASS');
