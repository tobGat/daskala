// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: benotete Mitarbeit (Kategorie MAN). Echte Note 1–5, eigene Gewichtung,
// niveau-fähig (AHS/ST), rezenz-fähig – ermöglicht eine ZN auch ohne SA/Tests.
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Baut eine frische DB mit einem Standard- oder differenzierten Fach und beliebigen
// Spalten. spalten = [{ kategorie, wert, datum? }]. Liefert die berechnete S1-Note.
async function note(spalten, opts = {}) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  for (const [k, v] of Object.entries(opts.einstellungen || {})) {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run(k, String(v))
  }
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name, benotungssystem, gewichtung_sa, gewichtung_man) VALUES (?, ?, ?, ?, ?)')
    .run(kId, 'M', opts.differenziert ? 'differenziert' : 'standard', opts.gewSA ?? null, opts.gewMAN ?? null).lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  if (opts.niveau) {
    db.prepare('INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)').run(fId, sId, opts.niveau)
  }
  spalten.forEach((sp, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES (?, 1, ?, ?, ?, ?)')
      .run(fId, sp.kategorie, sp.kategorie, sp.datum ?? null, i).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, String(sp.wert))
  })
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId, 1)
  db.close()
  return note
}

test('MAN-only: gewichteter Schnitt der Mitarbeitsnoten (keine grobe Fallback-Note)', async () => {
  // Zwei MAN-Noten 2 und 4 → 3,0 (nur MAN vorhanden → Gewicht normiert auf 1).
  assert.strictEqual(await note([{ kategorie: 'MAN', wert: 2 }, { kategorie: 'MAN', wert: 4 }]), 3.0)
})

test('MAN-only: einzelne Mitarbeitsnote wird direkt zur Note', async () => {
  assert.strictEqual(await note([{ kategorie: 'MAN', wert: 2 }]), 2.0)
})

test('MAN-only differenziert (ST): Niveau-Offset +2 wird intern angewandt', async () => {
  // ST-Schüler:in, MAN=3 → intern 3+2 = 5,0 (Anzeige mappt später zurück auf 3).
  assert.strictEqual(await note([{ kategorie: 'MAN', wert: 3 }], { differenziert: true, niveau: 'ST' }), 5.0)
})

test('MAN + SA gemischt: normierte Gewichtung', async () => {
  // gew_sa 0.4, gew_man 0.3, SA=2, MAN=4 → (2·0.4 + 4·0.3)/0.7 = 2,857… → 2,9
  assert.strictEqual(await note(
    [{ kategorie: 'SA', wert: 2 }, { kategorie: 'MAN', wert: 4 }],
    { gewSA: 0.4, gewMAN: 0.3 }
  ), 2.9)
})

test('Rezenz-Gewichtung wirkt auch auf Mitarbeitsnoten', async () => {
  const sp = [
    { kategorie: 'MAN', wert: 4, datum: '2025-10-01' },
    { kategorie: 'MAN', wert: 3, datum: '2025-11-01' },
    { kategorie: 'MAN', wert: 2, datum: '2025-12-01' },
  ]
  assert.strictEqual(await note(sp), 3.0)                                  // Faktor 1 = Mittel
  assert.strictEqual(await note(sp, { einstellungen: { rezenz_faktor: 2 } }), 2.8) // neueste doppelt
})

test('Mitarbeitsnote mit eigenen Symbolen: Position = Note 1…5', async () => {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  const symbole = JSON.stringify(['A', 'B', 'C', 'D', 'E']) // A=1 … E=5
  const add = (wert) => {
    const spId = db.prepare("INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_symbole) VALUES (?, 1, 'MAN', 'MA', ?)").run(fId, symbole).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, wert)
  }
  add('B')  // Position 2 → Note 2
  add('D')  // Position 4 → Note 4
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId)
  db.close()
  assert.strictEqual(note, 3.0) // (2 + 4) / 2
})
