import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs with the project root as the working directory, so the built artifact is ./dist.
const distDir = path.resolve(process.cwd(), 'dist');
const built = existsSync(distDir);

const CDN_HOSTS = /jsdelivr|unpkg|cdnjs|googleapis|gstatic|esm\.sh|skypack|cdn\./iu;

/**
 * The published preview must run with no network access. XML namespace URLs and library
 * documentation links are inert strings, so the check targets fetched resources instead.
 */
describe.skipIf(!built)('发布产物自包含', () => {
  const indexHtml = built ? readFileSync(path.join(distDir, 'index.html'), 'utf8') : '';
  const assetsDir = path.join(distDir, 'assets');
  const assets = built && existsSync(assetsDir) ? readdirSync(assetsDir) : [];
  const css = assets.filter((name) => name.endsWith('.css')).map((name) => readFileSync(path.join(assetsDir, name), 'utf8')).join('\n');
  const bundle = assets.filter((name) => name.endsWith('.js')).map((name) => readFileSync(path.join(assetsDir, name), 'utf8')).join('\n');

  it('首页只引用相对资源，且引用的文件都真实存在', () => {
    expect(indexHtml).toMatch(/<script[^>]+src="\.\/assets\//u);
    expect(indexHtml).toMatch(/<link[^>]+href="\.\/assets\//u);
    expect(indexHtml).not.toMatch(/src="https?:\/\//u);
    expect(indexHtml).not.toMatch(/href="https?:\/\//u);
    for (const match of indexHtml.matchAll(/(?:src|href)="\.\/([^"]+)"/gu)) {
      expect(statSync(path.join(distDir, match[1])).isFile(), match[1]).toBe(true);
    }
  });

  it('构建产物不包含任何 CDN 依赖', () => {
    expect(bundle).not.toMatch(CDN_HOSTS);
    expect(css).not.toMatch(CDN_HOSTS);
    expect(css).not.toMatch(/@import/u);
    expect(css).not.toMatch(/url\(\s*['"]?https?:/u);
  });

  it('不含 sourcemap 引用，标题与语言正确', () => {
    expect(bundle).not.toMatch(/sourceMappingURL=/u);
    expect(indexHtml).toContain('<title>RELOOP MRF · 可回收物分拣中心数字孪生</title>');
    expect(indexHtml).toContain('lang="zh-CN"');
  });

  it('字体只使用系统字体回退，不请求在线字体', () => {
    expect(css).toContain('Microsoft YaHei');
    expect(css).not.toMatch(/fonts\.(googleapis|gstatic)/u);
  });
});

it('构建产物缺失时给出可执行的提示', () => {
  if (built) return;
  expect('dist/ 尚未构建，请先运行 npm run build 再验收发布产物').toBe('');
});
