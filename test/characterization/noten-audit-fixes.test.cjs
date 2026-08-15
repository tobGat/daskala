// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Regressionstests fuer die Audit-Fixes (v1.3.1):
// - Fallback-Note nur aus Mitarbeit (HUE allein → keine Note)
// - MAN: eigene 5 Symbole werden von spalten.create gespeichert (bzw. Duplikate verworfen)
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

test('Fallback: nur Mitarbeit ergibt eine grobe Note', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db)
  fuelle(db, fId, sId, [{ kategorie: 'MA', wert: '+' }])
  assert.strictEqual(await note(db, fId, sId), 1.0) // + → verhaeltnis 1 → 3-2 = 1
  db.close()
})

test('Fallback: nur Hausübung ergibt KEINE Note (§ 3 – HÜ nicht alleinige Grundlage)', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db)
  fuelle(db, fId, sId, [{ kategorie: 'HÜ', wert: '✓' }, { kategorie: 'HÜ', wert: '✓' }])
  assert.strictEqual(await note(db, fId, sId), null)
  db.close()
})

test('Fallback: MA + HÜ ohne Basis wertet nur die Mitarbeit', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db)
  fuelle(db, fId, sId, [{ kategorie: 'MA', wert: '-' }, { kategorie: 'HÜ', wert: '✓' }])
  assert.strictEqual(await note(db, fId, sId), 5.0) // − → 3+2 = 5, HÜ ignoriert
  db.close()
})

test('spalten.create speichert eigene MAN-Symbole (5 Stück)', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId } = baueFach(db)
  const port = createDbAdapter(() => db)
  const id = await spalten.create(port, {
    fachId: fId, semester: 1, kategorie: 'MAN', kuerzel: 'MA',
    maStufen: 2, maSymbol: 'pm', maSymbole: ['A', 'B', 'C', 'D', 'E'],
  })
  const row = db.prepare('SELECT ma_symbole FROM spalten WHERE id = ?').get(id)
  assert.strictEqual(row.ma_symbole, JSON.stringify(['A', 'B', 'C', 'D', 'E']))
  db.close()
})

test('spalten.create verwirft doppelte/leere Symbole (Uniqueness-Schutz)', async () => {
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId } = baueFach(db)
  const port = createDbAdapter(() => db)
  const dup = await spalten.create(port, { fachId: fId, semester: 1, kategorie: 'MAN', kuerzel: 'MA', maStufen: 2, maSymbole: ['A', 'A', 'C', 'D', 'E'] })
  assert.strictEqual(db.prepare('SELECT ma_symbole FROM spalten WHERE id = ?').get(dup).ma_symbole, null)
  const leer = await spalten.create(port, { fachId: fId, semester: 1, kategorie: 'MA', kuerzel: 'MA', maStufen: 4, maSymbole: ['+', '', '-', '~'] })
  assert.strictEqual(db.prepare('SELECT ma_symbole FROM spalten WHERE id = ?').get(leer).ma_symbole, null)
  db.close()
})

test('niveau-abhängiger Clamp: differenzierte Note bleibt im Fenster [1+Offset, 5+Offset]', async () => {
  // ST-Schüler:in (Offset +2): alle SA=5 → intern 7; starker Minus-Einfluss würde 7,5 ergeben → auf 7 gedeckelt.
  const db = new Database(':memory:'); applySchema(db, { logError: () => {} })
  const { fId, sId } = baueFach(db, { differenziert: true, niveau: 'ST' })
  fuelle(db, fId, sId, [
    { kategorie: 'SA', wert: '5' },
    ...Array.from({ length: 6 }, () => ({ kategorie: 'MA', wert: '-' })),
  ])
  const n = await note(db, fId, sId)
  assert.ok(n <= 7 && n >= 3, `ST-Note muss in [3,7] liegen, war ${n}`)
  assert.strictEqual(n, 7) // 7 - (-0,5 gedeckelt) = 7,5 → clamp 7
  db.close()
})