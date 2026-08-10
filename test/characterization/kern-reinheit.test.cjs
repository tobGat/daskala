// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Reinheit (Portierung, Rückfall-Schutz für Phase 1 + Phase 2).
//
// Sichert die Plattformunabhängigkeit des Kerns dauerhaft ab:
//   1. `core/` importiert nirgends `electron` (Phase-1-Checkpoint).
//   2. `core/domain/*` und `core/services/*` sprechen die DB ausschließlich über
//      den async DbPort an – kein rohes `db.prepare(...)`, kein direkter
//      `better-sqlite3`-Import (Phase 2.2). Ausnahme: `core/db/schema.js` legt
//      per DDL/Seed direkt auf der Roh-Verbindung an (bewusst, siehe dort).
//
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

const CORE = path.join(__dirname, '..', '..', 'core')
const REPO = path.join(__dirname, '..', '..')

function alleJs(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...alleJs(p))
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

// Kommentare entfernen, damit erklärende Texte (die z. B. `require('electron')`
// wörtlich erwähnen) keine Fehlalarme auslösen. `://` in URLs bleibt erhalten.
function ohneKommentare(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/')

test('core/ importiert nirgends electron', () => {
  const treffer = []
  for (const datei of alleJs(CORE)) {
    if (/require\(\s*['"]electron['"]\s*\)/.test(ohneKommentare(fs.readFileSync(datei, 'utf8')))) {
      treffer.push(rel(datei))
    }
  }
  assert.deepStrictEqual(treffer, [], `require('electron') im Kern gefunden:\n${treffer.join('\n')}`)
})

test('core/domain + core/services nutzen nur den DbPort (kein rohes prepare/better-sqlite3)', () => {
  const dateien = [...alleJs(path.join(CORE, 'domain')), ...alleJs(path.join(CORE, 'services'))]
  const treffer = []
  for (const datei of dateien) {
    const src = ohneKommentare(fs.readFileSync(datei, 'utf8'))
    if (/\.prepare\s*\(/.test(src)) treffer.push(`${rel(datei)}: rohes .prepare(…) → DbPort (select/selectOne/execute/transaction) verwenden`)
    if (/require\(\s*['"]better-sqlite3['"]\s*\)/.test(src)) treffer.push(`${rel(datei)}: direkter better-sqlite3-Import → Kern muss plattformunabhängig bleiben`)
  }
  assert.deepStrictEqual(treffer, [], `Rohe DB-Nutzung im Kern:\n${treffer.join('\n')}`)
})
