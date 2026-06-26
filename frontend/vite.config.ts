import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 开发期通过 proxy 把 /api 转发到本地 sidecar(8766), 避免 CORS。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5183,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8766",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
