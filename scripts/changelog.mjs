// Writes CHANGELOG.md from changelog/changelog.json (the same file both apps show in-app).
import { readFileSync, writeFileSync } from 'node:fs'

const { repo, releases } = JSON.parse(readFileSync(new URL('../changelog/changelog.json', import.meta.url), 'utf8'))
const out = ['# Changelog', '', 'Twinglass for Mac and the Twinglass phone app ship together: each Mac release carries the phone app listed with it.', '']
for (const r of releases) {
  out.push(`## [${r.version}](${repo}/releases/tag/v${r.version}) · ${r.date} · ${r.title}`, '', r.summary, '')
  out.push(`### Twinglass for Mac ${r.version}`, '', ...r.mac.map((l) => `- ${l}`), '')
  out.push(`### Phone app ${r.phone}`, '', ...r.phoneApp.map((l) => `- ${l}`), '')
}
writeFileSync(new URL('../CHANGELOG.md', import.meta.url), out.join('\n'))
console.log(`CHANGELOG.md: ${releases.length} releases`)
