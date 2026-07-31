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
  // Weitere Kern-Reads
  { channel: 'einstellungen:get',       args: ['theme'] },
  { channel: 'klassen:getDeleteStats',  args: [1] },
  { channel: 'faecher:getAll',          args: [1] },
  { channel: 'faecher:getAllImSchuljahr', args: [1] },
  { channel: 'faecher:getSchuelerIds',  args: [1] },
  { channel: 'schueler:getLeistungsProfil', args: [1] },
  { channel: 'spalten:getAll',          args: [1] },
  { channel: 'eintraege:getAll',        args: [1] },
  { channel: 'verlauf:get',             args: [1, 1] },
  { channel: 'jahresplanung:getFaecherMitPlan', args: [] },
  { channel: 'materialien:getRoot',     args: [] },
  { channel: 'planung:getVorhandeneWochen', args: [] },
  { channel: 'update:pruefen',          args: [] },       // app.isPackaged=false → {ok:false,grund:'dev'}
  // Stundenplan-/Wochen-Planung
  { channel: 'stundenplan:getByKlasse', args: [1] },
  { channel: 'stundenplan:getParallelFach', args: [1, 'Deutsch'] },
  { channel: 'stundenPlanung:get',      args: [1, '2025-10-13'] },
  { channel: 'stundenPlanung:getWoche', args: ['2025-10-13'] },
  { channel: 'stundenPlanung:getHueWoche', args: ['2025-10-13'] },
  { channel: 'stundenPlanung:checkMusizieren', args: ['2025-10-13', 1, 0] },
  { channel: 'supplierstunden:getWoche', args: ['2025-10-13'] },
  { channel: 'sitzplan:getTische',      args: [1] },
  // Klassenvorstand (KV)
  { channel: 'kv:jahresaufgaben:getAlle', args: [1, 1] },
  { channel: 'kv:wochenaufgaben:getAlle', args: [] },
  { channel: 'kv:wochenaufgaben:getStatusFuerWochen', args: [1, 1, [{ kw: 38, jahr: 2025 }]] },
  { channel: 'kv:trigger:getAlle',      args: [1] },
  { channel: 'kv:trigger:getAlleFuerSchueler', args: [1] },
  { channel: 'kv:aktenvermerke:getAlleFuerKlasse', args: [1] },
  { channel: 'kv:aktenvermerke:getAlleFuerSchueler', args: [1] },
  { channel: 'kv:elternkontakte:getAlleFuerSchueler', args: [1] },
  { channel: 'kv:elternkontakte:getOffeneFuerKlasse', args: [1] },
  { channel: 'kv:fehlstunden:getAlleFuerSchueler', args: [1, 1] },
  { channel: 'kv:pruefeOffeneRueckrufe', args: [] },
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
