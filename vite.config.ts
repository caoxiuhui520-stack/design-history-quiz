import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages 部署在 /<仓库名>/ 子路径下，生产构建必须带 base，否则静态资源全部 404。
// 本地 dev / preview 用根路径，方便调试。
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? process.env.VITE_BASE ?? '/design-history-quiz/' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, host: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
