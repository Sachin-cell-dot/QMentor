import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExplainHandler } from './api/explain.js'

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

function exposeExplanationApi(apiKey) {
  const installMiddleware = (server) => {
    const handler = createExplainHandler({ apiKey })
    server.middlewares.use('/api/explain', (request, response) => {
      handler(request, response).catch(() => {
        if (!response.headersSent) {
          response.statusCode = 500
          response.setHeader('Content-Type', 'application/json; charset=utf-8')
          response.end(JSON.stringify({ error: 'AI explanation proxy failed.' }))
        }
      })
    })
  }

  return {
    name: 'expose-explanation-api',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, currentDirectory, '')
  return {
    plugins: [react(), exposeQuirkBuild(), exposeExplanationApi(env.OPENAI_API_KEY)],
    resolve: {
      alias: {
        '@': resolve(currentDirectory, './src'),
      },
    },
  }
})
