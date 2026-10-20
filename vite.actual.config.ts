import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Separate input and output: the original index.html and dist/ keep their existing build.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'local-cad-assets',
      buildStart() {
        if (!existsSync(resolve('actual-assets/plant-review.glb'))) {
          this.error(
            '缺少本地 CAD 资产：将 docs/cad-local/plant-review.glb 复制到 actual-assets/ 后再构建实际产线。',
          );
        }
        if (!existsSync(resolve('dist/index.html')))
          this.error('缺少原演示静态产物 dist/index.html，无法提供原演示入口。');
      },
      writeBundle() {
        // Copy the existing original build byte-for-byte, never rebuild or overwrite dist/.
        cpSync(resolve('dist'), resolve('dist-actual'), { recursive: true });
        mkdirSync(resolve('dist-actual/actual-assets'), { recursive: true });
        copyFileSync(
          resolve('actual-assets/plant-review.glb'),
          resolve('dist-actual/actual-assets/plant-review.glb'),
        );
      },
    },
  ],
  publicDir: false,
  build: {
    outDir: 'dist-actual',
    rollupOptions: { input: resolve('actual.html') },
    chunkSizeWarningLimit: 1400,
  },
});
