// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: Rezenz-Gewichtung innerhalb einer Kategorie (§ 20 LBVO).
// Neuere Leistungen zählen stärker als frühere; Faktor 1,0 = reiner Durchschnitt.
// Ausführen:  npm run test:core   (nur unter ELECTRON_RUN_AS_NODE=1 electron)

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Frische In-Memory-DB mit Standardfach + 1 Schüler:in und mehreren SA-Spalten
// (Note + Datum, chronologisch alt→neu). Liefert die berechnete S1-Note.
async function noteMitSA(saListe, rezenzFaktor) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  if (rezenzFaktor != null) {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run('rezenz_faktor', String(rezenzFaktor))
  }
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  saListe.forEach(({ note, datum }, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES (?, 1, ?, ?, ?, ?)')
      .run(fId, 'SA', `SA${i + 1}`, datum, i).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, String(note))
  })
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId, 1)
  db.close()
  return note
}

test('Faktor 1,0 = reiner Durchschnitt (rückwärtskompatibel)', async () => {
  const sa = [{ note: 4, datum: '2025-10-01' }, { note: 3, datum: '2025-11-01' }, { note: 2, datum: '2025-12-01' }]
  assert.strictEqual(await noteMitSA(sa, 1), 3.0)
  assert.strictEqual(await noteMitSA(sa, null), 3.0) // ohne gesetzten Faktor = Default 1
})

test('Faktor 2,0: neueste Note zählt doppelt so stark wie die älteste', async () => {
  // 4,3,2 (alt→neu), Gewichte 1 / 1,5 / 2 → (4+4,5+4)/4,5 = 2,777… → 2,8
  const sa = [{ note: 4, datum: '2025-10-01' }, { note: 3, datum: '2025-11-01' }, { note: 2, datum: '2025-12-01' }]
  assert.strictEqual(await noteMitSA(sa, 2), 2.8)
})

test('Sortierung nach Datum – Eingabereihenfolge egal', async () => {
  // Gleiche Noten/Daten, nur umgekehrt eingefügt → identisches Ergebnis.
  const sa = [{ note: 2, datum: '2025-12-01' }, { note: 3, datum: '2025-11-01' }, { note: 4, datum: '2025-10-01' }]
  assert.strictEqual(await noteMitSA(sa, 2), 2.8)
})

test('gewichteterSchnitt (rein): lineare Rang-Gewichte', () => {
  const werte = [
    { n: 4, datum: '2025-10-01', reihenfolge: 0 },
    { n: 3, datum: '2025-11-01', reihenfolge: 1 },
    { n: 2, datum: '2025-12-01', reihenfolge: 2 },
  ]
  assert.strictEqual(noten.gewichteterSchnitt(werte, 1), 3) // faktor 1 → Mittel
  assert.ok(Math.abs(noten.gewichteterSchnitt(werte, 2) - 2.7777777) < 1e-6)
  assert.strictEqual(noten.gewichteterSchnitt([{ n: 5 }], 2), 5) // Einzelwert → unverändert
})
