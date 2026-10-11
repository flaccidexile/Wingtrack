import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const root = import.meta.dirname ?? path.resolve()

  // The API port is configurable rather than hardcoded: another project on this
  // machine also defaults to 4000, and whichever server binds first wins — the
  // other then gets 404s from the wrong service. Set VITE_API_PROXY_TARGET in
  // .env.local to point at wherever the WINGTRACK API is actually listening.
  const env = loadEnv(mode, root, 'VITE_')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(root, './src') },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
