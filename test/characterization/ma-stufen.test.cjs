// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: Mitarbeit als NOTE (§ 4 Abs. 2 LBVO). Jede Aufzeichnung ist eine Teilnote 1–5;
// die Mitarbeitsnote ist ihr Durchschnitt. 2-stufig (+/−), 3-stufig (+/~/−) und 4-stufig (Smileys).
// Ausführen:  npm run test:core   (nur unter ELECTRON_RUN_AS_NODE=1 electron)

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Frische In-Memory-DB mit EINEM reinen Mitarbeits-Fach (nur MA-Spalten). Da MA die einzige
// note-bildende Kategorie ist, entspricht die Zeugnisnote direkt der Mitarbeitsnote (Durchschnitt
// der Teilnoten). Liefert die berechnete Note.
async function maNote(maStufen, maWerte, opts = {}) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const symbol = opts.symbol || 'pm'
  const symbole = opts.symbole ? JSON.stringify(opts.symbole) : null
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  const addSpalte = () => db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen, ma_symbol, ma_symbole) VALUES (?, 1, ?, ?, ?, ?, ?)').run(fId, 'MA', 'MA', maStufen, symbol, symbole).lastInsertRowid
  const addEintrag = (spId, wert) => db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, wert)
  // Jede MA-Bewertung ist eine eigene Spalte (ein Eintrag pro Spalte+Schüler:in).
  for (const w of maWerte) addEintrag(addSpalte(), w)
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId)
  db.close()
  return note
}
const rnd = (x) => Math.round(x * 100) / 100

test('2-stufig: + → 1, − → 5, ausgeglichen → 3', async () => {
  assert.strictEqual(await maNote(2, ['+']), 1)
  assert.strictEqual(await maNote(2, ['-']), 5)
  assert.strictEqual(await maNote(2, ['+', '-']), 3)
  assert.strictEqual(await maNote(2, ['+', '+', '-']), rnd((1 + 1 + 5) / 3)) // 2,33
})

test('3-stufig: + → 1, ~ → 3 (neutral), − → 5', async () => {
  assert.strictEqual(await maNote(3, ['+']), 1)
  assert.strictEqual(await maNote(3, ['~']), 3)
  assert.strictEqual(await maNote(3, ['-']), 5)
  assert.strictEqual(await maNote(3, ['+', '~', '-']), 3)
  assert.strictEqual(await maNote(3, ['+', '+', '-']), rnd((1 + 1 + 5) / 3)) // 2,33
})

test('4-stufig: 😄→1, 🙂→2, 🙁→4, 😞→5 (intensitätsgewichtet)', async () => {
  assert.strictEqual(await maNote(4, ['😄']), 1)
  assert.strictEqual(await maNote(4, ['🙂']), 2)
  assert.strictEqual(await maNote(4, ['🙁']), 4)
  assert.strictEqual(await maNote(4, ['😞']), 5)
  assert.strictEqual(await maNote(4, ['😄', '😞']), 3)     // (1+5)/2 – sehr+ hebt sehr− auf
  assert.strictEqual(await maNote(4, ['🙂', '😞']), 3.5)   // (2+5)/2 – 😞 wiegt schwerer
})

test('unbekannte MA-Werte im Modus zählen nicht (keine Note)', async () => {
  assert.strictEqual(await maNote(4, ['+']), null)   // + ist im 4-stufigen Modus ungültig
  assert.strictEqual(await maNote(2, ['😄']), null)  // Smiley im 2-stufigen Modus ungültig
  assert.strictEqual(await maNote(3, ['x']), null)   // Fremdsymbol im 3-stufigen Modus ungültig
})

test('Pfeil-Spalten (↗/↘) speichern +/− und rechnen wie 2-stufig', async () => {
  assert.strictEqual(await maNote(2, ['+'], { symbol: 'pfeil' }), 1)
  assert.strictEqual(await maNote(2, ['-'], { symbol: 'pfeil' }), 5)
})
