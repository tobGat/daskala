// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Regressionstests fuer Mitarbeit-als-Note (§ 4 Abs. 2 LBVO) + Audit-Fixes:
// - Mitarbeit (MA + Hausuebung) bildet EINE Note (Verhaeltnis + / −; ✓/✗ faellt ein)
// - eigene Symbole (3-/4-stufig) werden von spalten.create gespeichert (Duplikate verworfen)
// - niveau-abhaengiger End-Clamp haelt die Note im Fenster [1+Offset, 5+Offset]
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')
const spalten = require('../../core/domain/spalten.js')

function baueFach(db, { differenziert = false, niveau = null } = {}) {
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name, benotungssystem) VALUES (?, ?, ?)')
    .run(kId, 'M', differenziert ? 'differenziert' : 'standard').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  if (niveau) db.prepare('INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)').run(fId, sId, niveau)
  return { fId, sId }
}
// spalten = [{ kategorie, wert, ma_stufen? }]
function fuelle(db, fId, sId, liste) {
  liste.forEach((sp, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, ma_stufen, reihenfolge) VALUES (?, 1, ?, ?, ?, ?)')
      .run(fId, sp.kategorie, sp.kategorie, sp.ma_stufen ?? 2, i).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, String(sp.wert))
  })
}
async function note(db, fId, sId) {
  const { note } = await noten.berechneZeugnisnote(createDbAdapter(() => db), fId, sId)
  return note
}

test('Nur Mitarbeit (+) ergibt die Mitarbeitsnote 1', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db)
  fuelle(db, fId, sId, [{ kategorie: 'MA', wert: '+' }])
  assert.strictEqual(await note(db, fId, sId), 1.0) // + → Teilnote 1 → Mitarbeitsnote 1
  db.close()
})

test('Nur Hausübung ergibt eine Note (✓ = Teilnote 1)', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db)
  fuelle(db, fId, sId, [{ kategorie: 'HÜ', wert: '✓' }, { kategorie: 'HÜ', wert: '✓' }])
  assert.strictEqual(await note(db, fId, sId), 1.0) // Hausübung fließt in die Mitarbeitsnote ein
  db.close()
})

test('MA + HÜ bilden zusammen die Mitarbeitsnote', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db)
  fuelle(db, fId, sId, [{ kategorie: 'MA', wert: '-' }, { kategorie: 'HÜ', wert: '✓' }])
  assert.strictEqual(await note(db, fId, sId), 3.0) // (5 + 1) / 2
  db.close()
})

test('spalten.create speichert eigene 3-stufige Symbole (3 Stück)', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId } = baueFach(db)
  const port = createDbAdapter(() => db)
  const id = await spalten.create(port, {
    fachId: fId, semester: 1, kategorie: 'MA', kuerzel: 'MA',
    maStufen: 3, maSymbol: 'pm', maSymbole: ['P', 'N', 'M'],
  })
  const row = db.prepare('SELECT ma_stufen, ma_symbole FROM spalten WHERE id = ?').get(id)
  assert.strictEqual(row.ma_stufen, 3)
  assert.strictEqual(row.ma_symbole, JSON.stringify(['P', 'N', 'M']))
  db.close()
})

test('spalten.create verwirft doppelte/leere Symbole (Uniqueness-Schutz)', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId } = baueFach(db)
  const port = createDbAdapter(() => db)
  const dup = await spalten.create(port, { fachId: fId, semester: 1, kategorie: 'MA', kuerzel: 'MA', maStufen: 3, maSymbole: ['A', 'A', 'C'] })
  assert.strictEqual(db.prepare('SELECT ma_symbole FROM spalten WHERE id = ?').get(dup).ma_symbole, null)
  const leer = await spalten.create(port, { fachId: fId, semester: 1, kategorie: 'MA', kuerzel: 'MA', maStufen: 4, maSymbole: ['+', '', '-', '~'] })
  assert.strictEqual(db.prepare('SELECT ma_symbole FROM spalten WHERE id = ?').get(leer).ma_symbole, null)
  db.close()
})

test('niveau-abhängiger Clamp: differenzierte Note bleibt im Fenster [1+Offset, 5+Offset]', async () => {
  // ST-Schüler:in (Offset +2): SA=5 → intern 7; Mitarbeit alle '-' → Teilnote 5 → intern 7.
  // Gewichteter Schnitt = 7 und bleibt im Fenster [3, 7] (Anzeige mappt später auf 1–5).
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db, { differenziert: true, niveau: 'ST' })
  fuelle(db, fId, sId, [
    { kategorie: 'SA', wert: '5' },
    ...Array.from({ length: 6 }, () => ({ kategorie: 'MA', wert: '-' })),
  ])
  const n = await note(db, fId, sId)
  assert.ok(n <= 7 && n >= 3, `ST-Note muss in [3,7] liegen, war ${n}`)
  assert.strictEqual(n, 7)
  db.close()
})