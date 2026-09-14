import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base 用相对路径 './'，同一份产物可同时适配三种宿主：
//   1. GitHub Pages 的子路径 /design-history-quiz/
//   2. 独立域名根路径（WorkBuddy 发布）
//   3. 本地 file:// 直接打开（离线兜底）
// 这样不必为不同宿主分别构建，也避开了「忘了设 base 导致白屏」这个最常见的坑。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  // 发布沙箱通过反向代理访问，必须监听 0.0.0.0 并放行代理域名，
  // 否则 Vite 会返回 "Blocked request. This host is not allowed."
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4173,
    strictPort: false,
    allowedHosts: true,
  },
  test: {
    // 纯逻辑测试跑在 node 下；组件交互测试用文件头的 @vitest-environment jsdom 单独指定
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
