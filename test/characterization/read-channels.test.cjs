// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Charakterisierungstests – lesende IPC-Kanäle (Phase 0, Muster).
//
// Ruft die unveränderten main.js-Handler über den Harness gegen die Fixture auf
// und vergleicht das Ergebnis mit eingefrorenen Snapshots. Die Snapshots wurden
// vom bestehenden Code erzeugt und definieren „korrekt" für den Umbau.
//
// Ausführen:  ELECTRON_RUN_AS_NODE=1 electron --test test/characterization/*.cjs
//   (bequem über  npm run test:core)
//
// Snapshots (neu) erzeugen/aktualisieren:  SNAPSHOT_UPDATE=1 npm run test:core
//   Nur bewusst tun – ein geänderter Snapshot bedeutet geändertes Verhalten.

const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { createHarness, ladeSeed } = require('../helpers/harness.cjs')

// Kanal + Argumente. Die IDs entsprechen der Fixture (test/fixtures/seed.sql).
const CASES = [
  // Kern-Entitäten
  { channel: 'einstellungen:getAll',    args: [] },
  { channel: 'schuljahre:getAll',       args: [] },
  { channel: 'klassen:getAll',          args: [1] },     // Schuljahr 1, ohne Vorlagenklasse
  { channel: 'klassen:getVorlagen',     args: [] },      // nur Vorlagenklassen
  { channel: 'schueler:getAll',         args: [1] },     // Klasse 1, sortiert nach Nachname, ohne inaktive
  { channel: 'zeugnisnoten:getAll',     args: [1] },     // Fach 1 (Deutsch)
  { channel: 'notizen:get',             args: [1, 1] },  // Schüler 1 × Fach 1
  { channel: 'gewichtungGlobal:getAll', args: [] },
  // Niveau / Kompetenzen
  { channel: 'niveau:get',              args: [1] },      // Fach 1 (differenziert)
  { channel: 'niveau:getHistorie',      args: [1] },
  { channel: 'kompetenzbereiche:getAll', args: [1] },
  { channel: 'schuelerKompetenzen:getAll', args: [1] },
  // Stundenplan / Termine / Todos / Ferien / Jahresplanung
  { channel: 'stundenzeiten:getAll',    args: [] },
  { channel: 'stundenplan:getAll',      args: [] },
  { channel: 'todos:getAll',            args: [1] },      // Schuljahr 1
  { channel: 'termine:getAll',          args: [1] },      // Schuljahr 1
  { channel: 'customFerien:getAll',     args: [1] },      // Schuljahr 1
  { channel: 'jahresplanung:getAll',    args: [1] },      // Fach 1
]

const SNAP_PATH = path.join(__dirname, 'snapshots', 'read-channels.json')
const UPDATE = process.env.SNAPSHOT_UPDATE === '1'

let h
const erzeugt = {}

before(async () => { h = await createHarness({ seedSql: ladeSeed() }) })

after(() => {
  if (UPDATE) {
    fs.mkdirSync(path.dirname(SNAP_PATH), { recursive: true })
    fs.writeFileSync(SNAP_PATH, JSON.stringify(erzeugt, null, 2) + '\n', 'utf8')
    console.log(`Snapshots geschrieben: ${SNAP_PATH}`)
  }
  h?.cleanup()
})

for (const c of CASES) {
  test(c.channel, async () => {
    const actual = await h.callHandler(c.channel, ...c.args)
    if (UPDATE) { erzeugt[c.channel] = actual; return }
    const expected = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'))
    assert.deepStrictEqual(actual, expected[c.channel])
  })
}
