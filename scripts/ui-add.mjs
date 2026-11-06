// npm run ui:add -- <component|registry-url> [...]
// Wraps the shadcn CLI and repairs what it gets wrong in this electron-vite layout (ADR-7):
// it writes `import { cn } from "cn"` and npm-installs an unrelated package named `cn`
// (and `next-themes` for sonner). Both are undone here.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SHADCN = 'shadcn@4.23.0'
const UNWANTED = ['cn', 'next-themes']
const uiDir = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'components', 'ui')
const args = process.argv.slice(2)
if (!args.length) {
  console.error('usage: npm run ui:add -- <component> [...]')
  process.exit(1)
}

execFileSync('npx', ['-y', SHADCN, 'add', ...args, '-y', '-o'], { stdio: 'inherit' })

let fixed = 0
for (const f of readdirSync(uiDir).filter((n) => n.endsWith('.tsx'))) {
  const path = join(uiDir, f)
  const src = readFileSync(path, 'utf8')
  const out = src.replaceAll('from "cn"', 'from "@/lib/utils"')
  if (out !== src) {
    writeFileSync(path, out)
    fixed++
  }
}

const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))
const installed = UNWANTED.filter((n) => pkg.dependencies?.[n] || pkg.devDependencies?.[n])
if (installed.length) execFileSync('npm', ['uninstall', ...installed], { stdio: 'inherit' })

const bad = readdirSync(uiDir).filter((f) => /from "next-themes"/.test(readFileSync(join(uiDir, f), 'utf8')))
console.log(`ui:add: fixed cn import in ${fixed} file(s); removed: ${installed.join(', ') || 'nothing'}`)
if (bad.length) console.warn(`ui:add: still importing next-themes (replace with theme="system"): ${bad.join(', ')}`)
