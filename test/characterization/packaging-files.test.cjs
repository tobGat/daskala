// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Paketierungs-Wächter (Regression zu v1.2.0).
//
// v1.2.0 startete nicht ("Cannot find module './core/domain/einstellungen'"),
// weil die electron-builder-`files`-Whitelist die in Phase 1/2 neu angelegten
// Verzeichnisse `core/` und `platform/` nicht mitpaketierte. Dev und die
// Charakterisierungstests laufen aus dem Quellbaum und bemerkten das nicht –
// erst die gepackte app.asar fehlte die Module.
//
// Dieser Test stellt sicher: JEDES Top-Level-Verzeichnis, aus dem main.js oder
// preload.js per require('./…') laden, ist von einem `files`-Eintrag abgedeckt.
//
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

const REPO = path.join(__dirname, '..', '..')
const pkg = require(path.join(REPO, 'package.json'))

// Erstes Pfadsegment eines require('./seg/…') bzw. require('./datei.js').
function requireWurzeln(datei) {
  const src = fs.readFileSync(path.join(REPO, datei), 'utf8')
  const roots = new Set()
  for (const m of src.matchAll(/require\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)) {
    roots.add(m[1].split(/[\\/]/)[0])
  }
  return roots
}

// Ist `root` (Verzeichnis oder Datei) von einem files-Glob abgedeckt?
function abgedeckt(root, files) {
  return files.some((g) => g.split(/[\\/]/)[0] === root)
}

test('electron-builder files deckt alle require-Wurzeln von main.js/preload.js ab', () => {
  const files = (pkg.build && pkg.build.files) || []
  const wurzeln = new Set([...requireWurzeln('main.js'), ...requireWurzeln('preload.js')])
  const fehlend = [...wurzeln].filter((r) => !abgedeckt(r, files))
  assert.deepStrictEqual(fehlend, [],
    `Nicht in build.files paketiert (App würde im Release nicht starten): ${fehlend.join(', ')}`)
})

test('build.files enthält core/ und platform/ (Phase-1/2-Kern)', () => {
  const files = (pkg.build && pkg.build.files) || []
  for (const dir of ['core', 'platform']) {
    assert.ok(abgedeckt(dir, files), `build.files paketiert '${dir}/' nicht`)
  }
})
