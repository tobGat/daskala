// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Charakterisierungstests – schreibende IPC-Kanäle (Phase 0).
//
// Jeder Kanal wird gegen eine FRISCHE Fixture-Kopie ausgeführt; danach wird der
// Rückgabewert UND der Zustand der betroffenen Tabellen als Snapshot verglichen.
// Zeitstempel-Spalten werden normalisiert (siehe harness.snapshotTables).
//
// Ausführen:        npm run test:core
// Snapshots neu:    npm run test:core:update   (nur bewusst – Verhalten geändert!)

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { createHarness, ladeSeed } = require('../helpers/harness.cjs')

// name: eindeutiger Schlüssel/Testtitel · channel/args: Aufruf · tables: Zustand danach
const CASES = [
  { name: 'einstellungen:set', channel: 'einstellungen:set', args: ['theme', 'dark'], tables: ['einstellungen'] },
  { name: 'klassen:create', channel: 'klassen:create', args: [{ schuljahrId: 1, name: '4D', farbe: '#22d3ee', teamsLink: null, istVorlage: 0 }], tables: ['klassen'] },
  // Sonderfall: manuelle Kaskade beim Löschen einer Klasse (Klasse 1 = voller Baum).
  { name: 'klassen:delete (Kaskade)', channel: 'klassen:delete', args: [1], tables: ['klassen', 'faecher', 'schueler', 'eintraege', 'zeugnisnoten', 'notizen'] },
  { name: 'faecher:create', channel: 'faecher:create', args: [{ klasseId: 1, name: 'Englisch', farbe: null, benotungssystem: 'standard', alleSchueler: 1 }], tables: ['faecher'] },
  { name: 'schueler:create', channel: 'schueler:create', args: [{ klasseId: 1, vorname: 'Greta', nachname: 'Novak', fachIds: [1] }], tables: ['schueler', 'fach_schueler'] },
  { name: 'spalten:create', channel: 'spalten:create', args: [{ fachId: 1, semester: 2, kategorie: 'SA', kuerzel: 'SA2', datum: '2026-03-10', notiz: null }], tables: ['spalten'] },
  { name: 'eintraege:set (neu)', channel: 'eintraege:set', args: [1, 3, '4'], tables: ['eintraege', 'eintraege_verlauf'] },
  { name: 'eintraege:set (update)', channel: 'eintraege:set', args: [1, 1, '1'], tables: ['eintraege', 'eintraege_verlauf'] },
  { name: 'notizen:set', channel: 'notizen:set', args: [3, 1, 'Fleißig im Unterricht.'], tables: ['notizen'] },
  // Sonderfall: setzt aktuelles Niveau UND schreibt einen Historie-Eintrag.
  { name: 'niveau:set', channel: 'niveau:set', args: [1, 3, 'ST', '2026-02-01'], tables: ['schueler_niveau', 'schueler_niveau_historie'] },
  { name: 'termine:create', channel: 'termine:create', args: [{ titel: 'Sprechtag', datum: '2025-12-01', uhrzeit: '10:00', bisUhrzeit: '11:00', notiz: null, klasseId: 1, schuljahrId: 1, stundeId: null }], tables: ['termine'] },
  { name: 'termine:update', channel: 'termine:update', args: [1, { titel: 'Elternabend (verschoben)', datum: '2025-10-21', uhrzeit: '18:30', bisUhrzeit: '20:00', notiz: 'Aula', klasseId: 1, stundeId: null }], tables: ['termine'] },
  { name: 'todos:create', channel: 'todos:create', args: [{ titel: 'Kopien vorbereiten', klasseId: 1, fachId: 1, faelligkeit: '2025-11-01', erinnerung: null }], tables: ['todos'] },
  { name: 'todos:toggleErledigt', channel: 'todos:toggleErledigt', args: [1], tables: ['todos'] },
  { name: 'stundenplan:create', channel: 'stundenplan:create', args: [{ wochentag: 4, stundeId: 2, fachId: 1, wochenIntervall: 1 }], tables: ['stundenplan'] },
  // Sonderfall: Ziel-Slot belegt → Tausch der beiden Stunden (transaktional).
  { name: 'stundenplan:verschieben (Tausch)', channel: 'stundenplan:verschieben', args: [1, 1, 2], tables: ['stundenplan'] },
]

const SNAP_PATH = path.join(__dirname, 'snapshots', 'write-channels.json')
const UPDATE = process.env.SNAPSHOT_UPDATE === '1'
const collected = {}

// Beim Aktualisieren erst nach allen Tests schreiben.
process.on('exit', () => {
  if (UPDATE && Object.keys(collected).length) {
    fs.mkdirSync(path.dirname(SNAP_PATH), { recursive: true })
    fs.writeFileSync(SNAP_PATH, JSON.stringify(collected, null, 2) + '\n', 'utf8')
  }
})

for (const c of CASES) {
  test(c.name, async () => {
    const h = await createHarness({ seedSql: ladeSeed() })
    try {
      const ret = await h.callHandler(c.channel, ...c.args)
      const actual = { ret: ret === undefined ? null : ret, state: h.snapshotTables(c.tables) }
      if (UPDATE) { collected[c.name] = actual; return }
      const expected = JSON.parse(fs.readFileSync(SNAP_PATH, 'utf8'))
      assert.deepStrictEqual(actual, expected[c.name])
    } finally {
      h.cleanup()
    }
  })
}
