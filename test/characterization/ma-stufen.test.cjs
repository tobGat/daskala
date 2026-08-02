// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: Mitarbeits-Bewertungsstufen (2-stufig +/− und 4-stufig Smileys).
// Prüft die gewichtete Summe und die Deckelung-am-Schluss der Notenberechnung.
// Ausführen:  npm run test:core   (nur unter ELECTRON_RUN_AS_NODE=1 electron)

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const noten = require('../../core/services/notenberechnung.js')

// Frische In-Memory-DB mit Basis (Standardfach, 1 Schüler:in, SA=3) und einer
// MA-Spalte im gewünschten Modus samt Einträgen. Liefert die berechnete S1-Note.
function noteMitMA(maStufen, maWerte) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  const addSpalte = (kat, stufen) => db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen) VALUES (?, 1, ?, ?, ?)').run(fId, kat, kat, stufen).lastInsertRowid
  const addEintrag = (spId, wert) => db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, wert)
  // Basis: eine Schularbeit mit Note 3 → Basisnote 3,0.
  addEintrag(addSpalte('SA', 2), '3')
  // Jede MA-Bewertung ist eine eigene Spalte (ein Eintrag pro Spalte+Schüler:in).
  for (const w of maWerte) addEintrag(addSpalte('MA', maStufen), w)
  const { note } = noten.berechneZeugnisnote(db, fId, sId, 1)
  db.close()
  return note
}

test('2-stufig: + verbessert um 0,1, − verschlechtert um 0,1', () => {
  assert.strictEqual(noteMitMA(2, ['+']), 2.9)
  assert.strictEqual(noteMitMA(2, ['-']), 3.1)
  assert.strictEqual(noteMitMA(2, ['+', '-']), 3.0)
})

test('4-stufig: Smileys wirken gewichtet (±0,1 / ±0,05)', () => {
  assert.strictEqual(noteMitMA(4, ['😄']), 2.9)   // sehr fröhlich = +0,1
  assert.strictEqual(noteMitMA(4, ['😞']), 3.1)   // sehr traurig = −0,1
  assert.strictEqual(noteMitMA(4, ['🙂', '🙂']), 2.9) // 2× mäßig fröhlich = +0,1
  assert.strictEqual(noteMitMA(4, ['🙁', '🙁']), 3.1) // 2× mäßig traurig = −0,1
  assert.strictEqual(noteMitMA(4, ['😄', '😞']), 3.0) // hebt sich auf
})

test('Deckelung greift erst am Schluss (Rohsumme bleibt im Minus)', () => {
  // 6× sehr traurig = −0,6 → gedeckelt auf −0,5 → Note 3,5
  assert.strictEqual(noteMitMA(4, ['😞', '😞', '😞', '😞', '😞', '😞']), 3.5)
  // + ein sehr fröhlich → Rohsumme −0,5, weiterhin gedeckelt → immer noch 3,5
  assert.strictEqual(noteMitMA(4, ['😞', '😞', '😞', '😞', '😞', '😞', '😄']), 3.5)
  // erst genug Plus hebt die Rohsumme über die Grenze: +2 → Rohsumme −0,4 → 3,4
  assert.strictEqual(noteMitMA(4, ['😞', '😞', '😞', '😞', '😞', '😞', '😄', '😄']), 3.4)
})

test('unbekannte MA-Werte im jeweiligen Modus zählen nicht', () => {
  assert.strictEqual(noteMitMA(4, ['+']), 3.0)   // + ist im 4-stufigen Modus ungültig
  assert.strictEqual(noteMitMA(2, ['😄']), 3.0)  // Smiley im 2-stufigen Modus ungültig
})
