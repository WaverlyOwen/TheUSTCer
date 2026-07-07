import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径产物，兼容 GitHub Pages 子路径部署
  base: './',
  server: {
    // 预览工具会通过 PORT 指定端口；本地手动 npm run dev 时仍默认 5173
    port: Number(process.env.PORT) || 5173,
  },
});
