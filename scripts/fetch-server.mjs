// Downloads the pinned scrcpy-server and verifies its SHA-256 (see docs/FACTS.md).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '5.0.1'
const SHA256 = '764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536'
const URL = `https://github.com/Genymobile/scrcpy/releases/download/v${VERSION}/scrcpy-server-v${VERSION}`

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'resources', `scrcpy-server-v${VERSION}`)
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

if (existsSync(out) && sha(readFileSync(out)) === SHA256) {
  console.log(`scrcpy-server ${VERSION} present and verified`)
  process.exit(0)
}

const res = await fetch(URL)
if (!res.ok) throw new Error(`download failed: ${res.status} ${URL}`)
const buf = Buffer.from(await res.arrayBuffer())
const got = sha(buf)
if (got !== SHA256) throw new Error(`SHA-256 mismatch: expected ${SHA256}, got ${got}`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, buf)
console.log(`scrcpy-server ${VERSION} downloaded and verified -> ${out}`)
