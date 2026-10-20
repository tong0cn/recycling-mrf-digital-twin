import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { batchPlant } from '../src/actual/cad';

describe('实际 CAD 批处理', () => {
  it('合并重复实例时保留设备编号、独立材质以及父子旋转后的世界坐标', () => {
    const source = new Group(),
      material = new MeshStandardMaterial({ color: '#33aa77' });
    const geometry = new BoxGeometry(1, 2, 3);
    for (const [index, id] of ['E02', 'E03'].entries()) {
      const root = new Group();
      root.name = id;
      root.position.set(index * 8, 2, -5);
      root.rotation.y = 0.7;
      for (let i = 0; i < 4; i += 1) {
        const mesh = new Mesh(geometry, material);
        mesh.position.set(i * 2, i, 0);
        mesh.rotation.x = 0.3;
        root.add(mesh);
      }
      source.add(root);
    }
    source.updateMatrixWorld(true);
    const expected = source.children.map((root) => new Box3().setFromObject(root, true));
    const batched = batchPlant(source);
    batched.updateMatrixWorld(true);
    expect(batched.children.map((root) => root.name)).toEqual(['E02', 'E03']);
    batched.children.forEach((root, i) => {
      expect(root.children).toHaveLength(1);
      const actual = new Box3().setFromObject(root, true);
      expect(actual.min.distanceTo(expected[i].min)).toBeLessThan(1e-5);
      expect(actual.max.distanceTo(expected[i].max)).toBeLessThan(1e-5);
      const mesh = root.children[0];
      expect(mesh).toBeInstanceOf(Mesh);
      if (mesh instanceof Mesh) expect(mesh.material).not.toBe(material);
    });
    expect(material.opacity).toBe(1);
  });
});
