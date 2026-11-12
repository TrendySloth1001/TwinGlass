// Copies what the site shows from the repo: release version, changelog, screenshot and icon.
// Run before deploying (`npm run sync`); the copies are committed so Vercel can build from site/ alone.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const here = new URL('../', import.meta.url)
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
const changelog = JSON.parse(readFileSync(new URL('changelog/changelog.json', root), 'utf8'))
const repo = 'https://github.com/TrendySloth1001/TwinGlass'

writeFileSync(
  new URL('src/data/release.json', here),
  JSON.stringify(
    {
      version,
      phone: changelog.releases.find((r) => r.version === version)?.phone ?? null,
      date: changelog.releases.find((r) => r.version === version)?.date ?? null,
      dmg: `${repo}/releases/download/v${version}/Twinglass-${version}-arm64.dmg`,
      repo,
    },
    null,
    2,
  ) + '\n',
)
writeFileSync(new URL('src/data/changelog.json', here), JSON.stringify(changelog, null, 2) + '\n')
copyFileSync(new URL('docs/assets/screenshot.png', root), new URL('public/screenshot.png', here))
copyFileSync(new URL('src/renderer/src/assets/twinglass-icon.png', root), new URL('public/icon.png', here))
copyFileSync(new URL('build/icon.png', root), new URL('public/icon-large.png', here))
console.log(`synced Twinglass ${version}`)
