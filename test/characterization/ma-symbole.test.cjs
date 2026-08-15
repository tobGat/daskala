// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: eigene Symbole der 4-stufigen Mitarbeit. Die Wertung ist
// positionsbasiert (Stufe 0/1 positiv, 2/3 negativ) – identisch zu den Smileys,
// nur die Symbole sind pro Spalte frei wählbar.
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Basis SA=3 (→ 3,0) + eine 4-stufige MA-Spalte mit eigenen Symbolen `symbole`
// und den Einträgen `werte`. Liefert die berechnete S1-Note.
async function noteMitSymbolen(symbole, werte) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  const addEintrag = (spId, wert) => db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, wert)
  // Basis-Schularbeit
  const saId = db.prepare("INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen) VALUES (?, 1, 'SA', 'SA', 2)").run(fId).lastInsertRowid
  addEintrag(saId, '3')
  // Jede MA-Bewertung eine eigene 4-stufige Spalte mit denselben eigenen Symbolen.
  const maSymbole = symbole ? JSON.stringify(symbole) : null
  for (const w of werte) {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen, ma_symbole) VALUES (?, 1, ?, ?, 4, ?)').run(fId, 'MA', 'MA', maSymbole).lastInsertRowid
    addEintrag(spId, w)
  }
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId, 1)
  db.close()
  return note
}

const CUSTOM = ['+', '+~', '-~', '-'] // sehr+, +, −, sehr−

test('eigene Symbole wirken positionsbasiert wie die Smileys', async () => {
  assert.strictEqual(await noteMitSymbolen(CUSTOM, ['+']), 2.9)        // Stufe 0 = vpos +0,1
  assert.strictEqual(await noteMitSymbolen(CUSTOM, ['-']), 3.1)        // Stufe 3 = vneg −0,1
  assert.strictEqual(await noteMitSymbolen(CUSTOM, ['+~', '+~']), 2.9) // 2× Stufe 1 (pos +0,05)
  assert.strictEqual(await noteMitSymbolen(CUSTOM, ['-~', '-~']), 3.1) // 2× Stufe 2 (neg −0,05)
  assert.strictEqual(await noteMitSymbolen(CUSTOM, ['+', '-']), 3.0)   // hebt sich auf
})

test('Symbole ausserhalb der Liste zählen nicht', async () => {
  // Ein Smiley in einer Spalte mit eigenen Symbolen ist ungültig → kein Einfluss.
  assert.strictEqual(await noteMitSymbolen(CUSTOM, ['😄']), 3.0)
})

test('ohne eigene Symbole gelten weiterhin die Default-Smileys', async () => {
  assert.strictEqual(await noteMitSymbolen(null, ['😄']), 2.9)
  assert.strictEqual(await noteMitSymbolen(null, ['😞']), 3.1)
  assert.strictEqual(await noteMitSymbolen(null, ['+']), 3.0) // + ist bei Default-Smileys ungültig
})
