// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Baut das Microsoft-Store-Paket (MSIX/AppX). Die Paketversion wird – wie in der
// Release-CI – aus dem neuesten Git-Tag abgeleitet (z. B. v1.0.68 → 1.0.68.0),
// damit sie den echten Releases entspricht, ohne package.json zu verändern.
// Fällt kein Tag an, gilt die Version aus package.json.
//
// Aufruf:  npm run build:store
// Voraussetzung: Windows (makeappx.exe) und einmalig Internet für die Build-Tools.

const { execSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const run = (cmd, env) => execSync(cmd, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } })

function ermittleVersion() {
  try {
    const tag = execSync('git describe --tags --abbrev=0', { cwd: ROOT }).toString().trim()
    const v = tag.replace(/^v/, '')
    if (/^\d+\.\d+\.\d+/.test(v)) return v
  } catch { /* kein Tag – Fallback unten */ }
  return require(path.join(ROOT, 'package.json')).version
}

const version = ermittleVersion()
console.log(`\n▶ Store-Paket für Daskala ${version} (MSIX/AppX)\n`)

// 1. Kachel-/Logo-Grafiken erzeugen
run('node scripts/gen-appx-assets.js')

// 2. Renderer bauen
run('npx vite build')

// 3. AppX schnüren – unsigniert (der Store signiert selbst), Version aus dem Tag.
run(
  `npx electron-builder --win appx --publish never -c.extraMetadata.version=${version}`,
  { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
)

console.log(`\n✓ Fertig. Paket unter: dist-electron/Daskala ${version}.appx`)
console.log('  → im Partner Center hochladen (siehe docs/MICROSOFT-STORE.md)\n')
