// After `npm run dist:mac`: writes the DMG's version and SHA-256 into the Homebrew cask, and a
// .sha256 file next to the DMG (install.sh verifies it when it's attached to the release).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const dmg = `dist/Twinglass-${version}-arm64.dmg`
if (!existsSync(dmg)) throw new Error(`${dmg} not found: run npm run dist:mac first`)
const sha = createHash('sha256').update(readFileSync(dmg)).digest('hex')
writeFileSync(`${dmg}.sha256`, `${sha}  Twinglass-${version}-arm64.dmg\n`)
const cask = 'packaging/homebrew/Casks/twinglass.rb'
const src = readFileSync(cask, 'utf8').replace(/version "[^"]*"/, `version "${version}"`).replace(/sha256 "[^"]*"/, `sha256 "${sha}"`)
writeFileSync(cask, src)
console.log(`cask → ${version} ${sha}\n${dmg}.sha256 written`)
