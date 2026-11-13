import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// Secrets live only in the backend (.env, server/config.ts). Vite exposes only
// VITE_-prefixed variables to the client and ODYSSEY defines none.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
})
