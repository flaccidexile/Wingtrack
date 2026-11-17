import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import net from 'net'
import { spawn, type ChildProcess } from 'child_process'

/**
 * Ensures the Express API server in ../server is running whenever Vite is
 * running. If the IDE or container restarts only Vite on :5173, or if a
 * proxied /api request hits ECONNREFUSED, this plugin automatically spawns
 * the Express API server in the background so /api never stays down with 502.
 */
function ensureApiServerPlugin(apiTarget: string, serverDir: string): Plugin {
  let apiProc: ChildProcess | null = null
  let checking = false

  const parsed = new URL(apiTarget)
  const port = Number(parsed.port) || 4100
  const host = parsed.hostname || 'localhost'

  function isPortListening(): Promise<boolean> {
    return new Promise(resolve => {
      const sock = new net.Socket()
      sock.setTimeout(600)
      sock.once('connect', () => { sock.destroy(); resolve(true) })
      sock.once('error', () => { sock.destroy(); resolve(false) })
      sock.once('timeout', () => { sock.destroy(); resolve(false) })
      sock.connect(port, host)
    })
  }

  async function ensureRunning() {
    if (checking) return
    checking = true
    try {
      const alive = await isPortListening()
      if (alive) return
      if (apiProc && apiProc.exitCode === null) return

      const tsNodeBin = path.resolve(serverDir, 'node_modules/ts-node/dist/bin.js')
      apiProc = spawn(
        process.execPath,
        [tsNodeBin, '--transpile-only', 'src/index.ts'],
        {
          cwd: serverDir,
          stdio: 'ignore',
          windowsHide: true,
        }
      )
      apiProc.on('exit', () => {
        apiProc = null
      })
    } finally {
      checking = false
    }
  }

  return {
    name: 'wingtrack-ensure-api-server',
    configureServer() {
      void ensureRunning()
      const timer = setInterval(() => { void ensureRunning() }, 5000)
      timer.unref?.()
    },
  }
}

export default defineConfig(({ mode }) => {
  const root = import.meta.dirname ?? path.resolve()
  const serverDir = path.resolve(root, '../server')

  // The API port is configurable rather than hardcoded: another project on this
  // machine also defaults to 4000, and whichever server binds first wins — the
  // other then gets 404s from the wrong service. Set VITE_API_PROXY_TARGET in
  // .env.local to point at wherever the WINGTRACK API is actually listening.
  const env = loadEnv(mode, root, 'VITE_')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4100'

  return {
    plugins: [react(), tailwindcss(), ensureApiServerPlugin(apiTarget, serverDir)],
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
