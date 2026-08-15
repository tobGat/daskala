// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: Mitarbeit als Note (§ 4 Abs. 2 LBVO). Aus Bonus/Malus (+/−, +/~/−, Smileys) UND
// Hausübung (✓/✗/—) wird EINE Mitarbeitsnote als Durchschnitt der Teilnoten gebildet; sie geht mit
// gewichtung_ma in die Zeugnisnote ein – niveau-fähig. Ausführen:  npm run test:core
const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Baut eine frische DB mit einem Standard- oder differenzierten Fach und beliebigen Spalten.
// spalten = [{ kategorie, wert, datum?, maStufen?, maSymbole? }]. Liefert die berechnete Note.
async function note(spalten, opts = {}) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  for (const [k, v] of Object.entries(opts.einstellungen || {})) {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run(k, String(v))
  }
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name, benotungssystem, gewichtung_sa, gewichtung_ma) VALUES (?, ?, ?, ?, ?)')
    .run(kId, 'M', opts.differenziert ? 'differenziert' : 'standard', opts.gewSA ?? null, opts.gewMA ?? null).lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  if (opts.niveau) {
    db.prepare('INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)').run(fId, sId, opts.niveau)
  }
  spalten.forEach((sp, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge, ma_stufen, ma_symbole) VALUES (?, 1, ?, ?, ?, ?, ?, ?)')
      .run(fId, sp.kategorie, sp.kategorie, sp.datum ?? null, i, sp.maStufen ?? 2, sp.maSymbole ? JSON.stringify(sp.maSymbole) : null).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, String(sp.wert))
  })
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId)
  db.close()
  return note
}

test('MA-only: Verhältnis-Note aus + / − (ausgeglichen = 3)', async () => {
  assert.strictEqual(await note([{ kategorie: 'MA', wert: '+' }]), 1)
  assert.strictEqual(await note([{ kategorie: 'MA', wert: '-' }]), 5)
  assert.strictEqual(await note([{ kategorie: 'MA', wert: '+' }, { kategorie: 'MA', wert: '-' }]), 3)
})

test('Hausübung fließt in die Mitarbeitsnote (✓ wie 1, ✗ wie 5, — zählt nicht)', async () => {
  assert.strictEqual(await note([{ kategorie: 'HÜ', wert: '✓' }]), 1)
  assert.strictEqual(await note([{ kategorie: 'HÜ', wert: '✗' }]), 5)
  assert.strictEqual(await note([{ kategorie: 'HÜ', wert: '✓' }, { kategorie: 'HÜ', wert: '✗' }]), 3)
  assert.strictEqual(await note([{ kategorie: 'HÜ', wert: '✓' }, { kategorie: 'HÜ', wert: '—' }]), 1)
})

test('MA + HÜ zusammen bilden EINE Mitarbeitsnote', async () => {
  // + (Teilnote 1) und ✗ (Teilnote 5) → Durchschnitt 3
  assert.strictEqual(await note([{ kategorie: 'MA', wert: '+' }, { kategorie: 'HÜ', wert: '✗' }]), 3)
})

test('3-stufig ~ ist neutral (Teilnote 3)', async () => {
  assert.strictEqual(await note([{ kategorie: 'MA', wert: '~', maStufen: 3 }]), 3)
})

test('MA + SA gemischt: normierte Gewichtung', async () => {
  // gewSA 0.5, gewMA 0.5; SA=2, MA=['-'] (Note 5) → (2·0.5 + 5·0.5)/1.0 = 3,5
  assert.strictEqual(await note(
    [{ kategorie: 'SA', wert: 2 }, { kategorie: 'MA', wert: '-' }],
    { gewSA: 0.5, gewMA: 0.5 }
  ), 3.5)
})

test('MA-only differenziert (ST): Niveau-Offset +2 wird intern angewandt', async () => {
  // ST-Schüler:in, MA=['+','-'] (Note 3) → intern 3+2 = 5,0 (Anzeige mappt später zurück).
  assert.strictEqual(
    await note([{ kategorie: 'MA', wert: '+' }, { kategorie: 'MA', wert: '-' }], { differenziert: true, niveau: 'ST' }),
    5.0
  )
})

test('ohne jede note-bildende Aufzeichnung: keine Note', async () => {
  assert.strictEqual(await note([]), null)
})
