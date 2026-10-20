import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const output = resolve('dist-actual');
const built = existsSync(join(output, 'actual.html'));

describe.skipIf(!built)('实际产线发布产物', () => {
  it('独立页面引用的相对资源均存在', () => {
    const html = readFileSync(join(output, 'actual.html'), 'utf8');
    expect(html).toMatch(/<script[^>]+src="\.\/assets\//u);
    for (const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/gu)) {
      expect(existsSync(join(output, match[1])), match[1]).toBe(true);
    }
  });

  it('原演示入口保持一致，公开模型完整且不含原始 STEP', () => {
    expect(readFileSync(join(output, 'index.html')).equals(readFileSync(resolve('dist/index.html')))).toBe(true);
    const model = readFileSync(join(output, 'actual-assets/plant-review.glb'));
    expect(model.subarray(0, 4).toString()).toBe('glTF');
    expect(model.readUInt32LE(8)).toBe(model.length);
    expect(model.equals(readFileSync(resolve('actual-assets/plant-review.glb')))).toBe(true);
    expect(readdirSync(output, { recursive: true }).some((file) => /\.step$/iu.test(String(file)))).toBe(false);
  });
});
