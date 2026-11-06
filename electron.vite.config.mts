import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  renderer: {
    plugins: [react(), tailwindcss()],
    // electron-vite 6 does not minify the renderer by default (1.54 MB -> ~0.47 MB with this).
    build: { minify: true },
    resolve: { alias: { ...shared, '@': resolve('src/renderer/src') } },
  },
})
