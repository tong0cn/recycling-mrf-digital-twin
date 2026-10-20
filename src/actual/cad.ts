import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Batch static CAD faces by equipment/material without changing world-space vertices. */
export function batchPlant(source: THREE.Group): THREE.Group {
  source.updateMatrixWorld(true);
  const result = new THREE.Group(),
    sourceGeometries = new Set<THREE.BufferGeometry>();
  source.traverse((root) => {
    if (!/^E\d{2}$/.test(root.name)) return;
    const equipment = new THREE.Group();
    equipment.name = root.name;
    const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) throw new Error('CAD primitive contains unexpected material groups');
      const material = child.material,
        sourceGeometry = child.geometry as THREE.BufferGeometry;
      sourceGeometries.add(sourceGeometry);
      const geometry = new THREE.BufferGeometry();
      for (const name of ['position', 'normal']) {
        const attribute = sourceGeometry.getAttribute(name);
        if (!attribute) continue;
        const values = new Float32Array(attribute.count * 3);
        for (let i = 0; i < attribute.count; i += 1) {
          values[i * 3] = attribute.getX(i);
          values[i * 3 + 1] = attribute.getY(i);
          values[i * 3 + 2] = attribute.getZ(i);
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
      }
      if (sourceGeometry.index) geometry.setIndex(sourceGeometry.index.clone());
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      geometry.applyMatrix4(child.matrixWorld);
      if (!groups.has(material.uuid))
        groups.set(material.uuid, { material: material.clone(), geometries: [] });
      groups.get(material.uuid)!.geometries.push(geometry);
    });
    for (const group of groups.values()) {
      const merged = mergeGeometries(group.geometries);
      if (!merged) throw new Error(`CAD batching failed for ${root.name}`);
      equipment.add(new THREE.Mesh(merged, group.material));
      group.geometries.forEach((geometry) => geometry.dispose());
    }
    result.add(equipment);
  });
  sourceGeometries.forEach((geometry) => geometry.dispose());
  return result;
}
