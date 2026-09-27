import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const quirkBuildPath = resolve(currentDirectory, '../quirk/out/quirk.html')

function exposeQuirkBuild() {
  return {
    name: 'expose-quirk-build',
    configureServer(server) {
      server.middlewares.use('/quirk/quirk.html', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(readFileSync(quirkBuildPath))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'quirk/quirk.html',
        source: readFileSync(quirkBuildPath),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), exposeQuirkBuild()],
  resolve: {
    alias: {
      '@': resolve(currentDirectory, './src'),
    },
  },
})
