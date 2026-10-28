import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = process.env.API_URL ?? 'http://localhost:7100'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: api, changeOrigin: true } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
})
