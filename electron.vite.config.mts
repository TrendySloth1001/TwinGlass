import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const shared = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  preload: { plugins: [externalizeDepsPlugin()], resolve: { alias: shared } },
  renderer: { resolve: { alias: shared } },
})
