import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev: `npm run dev` serves the app on 5173 and proxies /api to the uvicorn app on 8123.
// Prod: `npm run build` emits web/dist, which service/api/main.py mounts at / so a single
// uvicorn process is the whole deployment.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8123', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
