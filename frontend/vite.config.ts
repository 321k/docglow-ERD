/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function docglowDataPlugin() {
  const candidatePaths = [
    process.env.DOCGLOW_DATA_PATH,
    '../target/docglow/docglow-data.json',
    '../marcura-site/docglow-data.json',
  ].filter((candidate): candidate is string => Boolean(candidate))

  return {
    name: 'docglow-data',
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/docglow-data.json') {
          next()
          return
        }

        const resolvedPath = candidatePaths
          .map(candidate => path.resolve(__dirname, candidate))
          .find(candidate => fs.existsSync(candidate))

        if (!resolvedPath) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            error: 'No generated docglow-data.json found for Vite dev server. Run docglow generate or set DOCGLOW_DATA_PATH.',
          }))
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'no-store')
        res.end(fs.readFileSync(resolvedPath, 'utf8'))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), docglowDataPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100000,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
