// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: eigene Symbole der mehrstufigen Mitarbeit. Die Wertung ist positionsbasiert
// (Stufe → Teilnote): 4-stufig [1,2,4,5], 3-stufig [1,3,5]. Symbole pro Spalte frei wählbar.
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Reines Mitarbeits-Fach (nur MA) → die Zeugnisnote ist die Mitarbeitsnote (Durchschnitt der
// Teilnoten). `maStufen` (3 oder 4), eigene `symbole` (oder null = Default) und `werte`.
async function maNote(maStufen, symbole, werte) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  const addEintrag = (spId, wert) => db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, wert)
  const maSymbole = symbole ? JSON.stringify(symbole) : null
  for (const w of werte) {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen, ma_symbole) VALUES (?, 1, ?, ?, ?, ?)').run(fId, 'MA', 'MA', maStufen, maSymbole).lastInsertRowid
    addEintrag(spId, w)
  }
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId)
  db.close()
  return note
}

const CUSTOM4 = ['+', '+~', '-~', '-'] // Position 0…3 → Teilnote 1/2/4/5
const CUSTOM3 = ['P', 'N', 'M']        // Position 0…2 → Teilnote 1/3/5

test('4-stufig: eigene Symbole positionsbasiert (Teilnote 1/2/4/5)', async () => {
  assert.strictEqual(await maNote(4, CUSTOM4, ['+']), 1)
  assert.strictEqual(await maNote(4, CUSTOM4, ['-']), 5)
  assert.strictEqual(await maNote(4, CUSTOM4, ['+~', '+~']), 2)
  assert.strictEqual(await maNote(4, CUSTOM4, ['-~', '-~']), 4)
  assert.strictEqual(await maNote(4, CUSTOM4, ['+', '-']), 3)   // (1+5)/2
})

test('3-stufig: eigene Symbole positionsbasiert (Teilnote 1/3/5)', async () => {
  assert.strictEqual(await maNote(3, CUSTOM3, ['P']), 1)
  assert.strictEqual(await maNote(3, CUSTOM3, ['N']), 3)
  assert.strictEqual(await maNote(3, CUSTOM3, ['M']), 5)
  assert.strictEqual(await maNote(3, CUSTOM3, ['P', 'M']), 3)   // (1+5)/2
})

test('Symbole ausserhalb der Liste zählen nicht (keine Note)', async () => {
  assert.strictEqual(await maNote(4, CUSTOM4, ['😄']), null)  // Smiley nicht in eigener Liste
  assert.strictEqual(await maNote(3, CUSTOM3, ['x']), null)
})

test('ohne eigene Symbole gelten die Default-Symbole', async () => {
  assert.strictEqual(await maNote(4, null, ['😄']), 1)  // Default-Smileys
  assert.strictEqual(await maNote(4, null, ['😞']), 5)
  assert.strictEqual(await maNote(3, null, ['+']), 1)   // Default +/~/−
  assert.strictEqual(await maNote(3, null, ['~']), 3)
  assert.strictEqual(await maNote(3, null, ['-']), 5)
})
