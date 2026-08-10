// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: Mitarbeits-Bewertungsstufen (2-stufig +/− und 4-stufig Smileys).
// Prüft die gewichtete Summe und die Deckelung-am-Schluss der (async) Notenberechnung.
// Ausführen:  npm run test:core   (nur unter ELECTRON_RUN_AS_NODE=1 electron)

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Frische In-Memory-DB mit Basis (Standardfach, 1 Schüler:in, SA=3) und einer
// MA-Spalte im gewünschten Modus samt Einträgen. Liefert die berechnete S1-Note.
async function noteMitMA(maStufen, maWerte, opts = {}) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  // Optionale Einfluss-Gewichte je Stufe (Einstellungen).
  for (const [k, v] of Object.entries(opts.gewichte || {})) {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run(k, String(v))
  }
  const symbol = opts.symbol || 'pm'
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  const addSpalte = (kat, stufen) => db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen, ma_symbol) VALUES (?, 1, ?, ?, ?, ?)').run(fId, kat, kat, stufen, kat === 'MA' ? symbol : 'pm').lastInsertRowid
  const addEintrag = (spId, wert) => db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, wert)
  // Basis: eine Schularbeit mit Note 3 → Basisnote 3,0.
  addEintrag(addSpalte('SA', 2), '3')
  // Jede MA-Bewertung ist eine eigene Spalte (ein Eintrag pro Spalte+Schüler:in).
  for (const w of maWerte) addEintrag(addSpalte('MA', maStufen), w)
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId, 1)
  db.close()
  return note
}

test('2-stufig: + verbessert um 0,1, − verschlechtert um 0,1', async () => {
  assert.strictEqual(await noteMitMA(2, ['+']), 2.9)
  assert.strictEqual(await noteMitMA(2, ['-']), 3.1)
  assert.strictEqual(await noteMitMA(2, ['+', '-']), 3.0)
})

test('4-stufig: Smileys wirken gewichtet (±0,1 / ±0,05)', async () => {
  assert.strictEqual(await noteMitMA(4, ['😄']), 2.9)   // sehr fröhlich = +0,1
  assert.strictEqual(await noteMitMA(4, ['😞']), 3.1)   // sehr traurig = −0,1
  assert.strictEqual(await noteMitMA(4, ['🙂', '🙂']), 2.9) // 2× mäßig fröhlich = +0,1
  assert.strictEqual(await noteMitMA(4, ['🙁', '🙁']), 3.1) // 2× mäßig traurig = −0,1
  assert.strictEqual(await noteMitMA(4, ['😄', '😞']), 3.0) // hebt sich auf
})

test('Deckelung greift erst am Schluss (Rohsumme bleibt im Minus)', async () => {
  // 6× sehr traurig = −0,6 → gedeckelt auf −0,5 → Note 3,5
  assert.strictEqual(await noteMitMA(4, ['😞', '😞', '😞', '😞', '😞', '😞']), 3.5)
  // + ein sehr fröhlich → Rohsumme −0,5, weiterhin gedeckelt → immer noch 3,5
  assert.strictEqual(await noteMitMA(4, ['😞', '😞', '😞', '😞', '😞', '😞', '😄']), 3.5)
  // erst genug Plus hebt die Rohsumme über die Grenze: +2 → Rohsumme −0,4 → 3,4
  assert.strictEqual(await noteMitMA(4, ['😞', '😞', '😞', '😞', '😞', '😞', '😄', '😄']), 3.4)
})

test('unbekannte MA-Werte im jeweiligen Modus zählen nicht', async () => {
  assert.strictEqual(await noteMitMA(4, ['+']), 3.0)   // + ist im 4-stufigen Modus ungültig
  assert.strictEqual(await noteMitMA(2, ['😄']), 3.0)  // Smiley im 2-stufigen Modus ungültig
})

test('Pfeil-Spalten (↗/↘) speichern +/− und rechnen identisch', async () => {
  // ma_symbol = 'pfeil' ändert nur die Anzeige; Werte bleiben +/−, Berechnung wie 2-stufig.
  assert.strictEqual(await noteMitMA(2, ['+'], { symbol: 'pfeil' }), 2.9)
  assert.strictEqual(await noteMitMA(2, ['-'], { symbol: 'pfeil' }), 3.1)
})

test('Einfluss je Stufe frei konfigurierbar (Einstellungen)', async () => {
  // Aufwärts-Gewicht auf 0,2 → + verbessert um 0,2
  assert.strictEqual(await noteMitMA(2, ['+'], { gewichte: { ma_w_plus: 0.2 } }), 2.8)
  // Abwärts-Gewicht auf 0,3 → − verschlechtert um 0,3
  assert.strictEqual(await noteMitMA(2, ['-'], { gewichte: { ma_w_minus: 0.3 } }), 3.3)
  // 🙂 auf 0,1 hochsetzen → wie 😄
  assert.strictEqual(await noteMitMA(4, ['🙂'], { gewichte: { ma_w_smiley_pos: 0.1 } }), 2.9)
  // 😞 auf 0,2 → verschlechtert um 0,2 (unter Deckelung 0,5)
  assert.strictEqual(await noteMitMA(4, ['😞'], { gewichte: { ma_w_smiley_vneg: 0.2 } }), 3.2)
})
