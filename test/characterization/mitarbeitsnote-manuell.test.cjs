// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: manuelle Mitarbeitsnote (§ 4 Abs. 2 LBVO – Gesamtbeurteilung). Eine gesetzte manuelle
// Mitarbeitsnote (schueler_ma_note) überschreibt den berechneten Teilnoten-Schnitt und fließt mit
// gewichtung_ma in die Zeugnisnote ein; sie gilt als Mitarbeit (auch ohne +/− oder ✓/✗).
// maNote.set(null) stellt die Berechnung wieder her. Ausführen: npm run test:core
const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')
const maNote = require('../../core/domain/maNote.js')

// Fach mit SA-Gewicht 0,4 + MA-Gewicht 0,2, ein:e Schüler:in. spalten = [{ kategorie, wert }].
function setup(spalten) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name, alle_schueler, gewichtung_sa, gewichtung_ma) VALUES (?, ?, 1, 0.4, 0.2)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, aktiv) VALUES (?, ?, ?, 1)').run(kId, 'A', 'B').lastInsertRowid
  spalten.forEach((sp, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, reihenfolge, ma_stufen) VALUES (?, 1, ?, ?, ?, 2)')
      .run(fId, sp.kategorie, sp.kategorie, i).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, String(sp.wert))
  })
  const port = createDbAdapter(() => db)
  const deps = { berechneAlleFuerFach: (id) => noten.berechneAlleFuerFach(port, id) }
  return { db, port, deps, fId, sId }
}
const noteVon = async (port, fId, sId) => (await noten.berechneZeugnisnote(port, fId, sId)).note

test('manuelle Mitarbeitsnote überschreibt den berechneten Teilnoten-Schnitt', async () => {
  // SA=2 (0,4) + MA aus + / − → Schnitt 3 (0,2): (2·0,4 + 3·0,2)/0,6 = 2,33
  const { db, port, deps, fId, sId } = setup([
    { kategorie: 'SA', wert: 2 }, { kategorie: 'MA', wert: '+' }, { kategorie: 'MA', wert: '-' },
  ])
  assert.strictEqual(await noteVon(port, fId, sId), 2.33)
  // Manuelle Mitarbeitsnote 1 statt 3: (2·0,4 + 1·0,2)/0,6 = 1,67
  await maNote.set(port, deps, fId, sId, 1)
  assert.strictEqual(await noteVon(port, fId, sId), 1.67)
  // Zurücksetzen → wieder der berechnete Schnitt
  await maNote.set(port, deps, fId, sId, null)
  assert.strictEqual(await noteVon(port, fId, sId), 2.33)
  db.close()
})

test('manuelle Mitarbeitsnote zählt als Mitarbeit (auch ohne + / − oder ✓ / ✗)', async () => {
  const { db, port, deps, fId, sId } = setup([{ kategorie: 'SA', wert: 2 }])
  assert.strictEqual(await noteVon(port, fId, sId), 2) // nur SA vorhanden
  // Manuelle Mitarbeitsnote 4 → MA wird note-bildend: (2·0,4 + 4·0,2)/0,6 = 2,67
  await maNote.set(port, deps, fId, sId, 4)
  assert.strictEqual(await noteVon(port, fId, sId), 2.67)
  db.close()
})

test('maNote.get liefert gesetzte Noten; set(null) entfernt sie', async () => {
  const { db, port, deps, fId, sId } = setup([{ kategorie: 'SA', wert: 2 }])
  await maNote.set(port, deps, fId, sId, 3)
  assert.deepStrictEqual(await maNote.get(port, fId), { [sId]: 3 })
  await maNote.set(port, deps, fId, sId, null)
  assert.deepStrictEqual(await maNote.get(port, fId), {})
  db.close()
})
