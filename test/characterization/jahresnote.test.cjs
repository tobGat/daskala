// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: eine durchgehende Jahresnote (Zeugnisnote) aus ALLEN Aufzeichnungen
// beider Semester. Keine getrennten Semesternoten, keine Semestergewichtung; die
// Rezenz (§ 20) läuft chronologisch über das ganze Jahr.
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')

// Fach mit SA-Spalten in beliebigen Semestern; spalten = [{ semester, wert, datum }].
async function note(spalten, rezenzFaktor) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  if (rezenzFaktor != null) {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run('rezenz_faktor', String(rezenzFaktor))
  }
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name) VALUES (?, ?)').run(kId, 'M').lastInsertRowid
  const sId = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?, ?, ?)').run(kId, 'A', 'B').lastInsertRowid
  spalten.forEach((sp, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES (?, ?, ?, ?, ?, ?)')
      .run(fId, sp.semester, 'SA', 'SA', sp.datum ?? null, i).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sId, String(sp.wert))
  })
  const port = createDbAdapter(() => db)
  const { note } = await noten.berechneZeugnisnote(port, fId, sId)
  db.close()
  return note
}

test('eine Note aus allen Aufzeichnungen beider Semester', async () => {
  // S1: SA 4, S2: SA 2 → Mittel 3,0 (keine Semestergewichtung, keine Rezenz).
  assert.strictEqual(await note([
    { semester: 1, wert: 4, datum: '2025-10-01' },
    { semester: 2, wert: 2, datum: '2026-03-01' },
  ]), 3.0)
})

test('nur Semester 1 befüllt → Zwischenstand aus S1', async () => {
  assert.strictEqual(await note([
    { semester: 1, wert: 2, datum: '2025-10-01' },
    { semester: 1, wert: 4, datum: '2025-11-01' },
  ]), 3.0)
})

test('Rezenz läuft durchgehend übers Jahr (semesterübergreifend)', async () => {
  // Vier SA über beide Semester (alt→neu 4,3,2,1), Faktor 2 → neueste zieht stärker.
  const sp = [
    { semester: 1, wert: 4, datum: '2025-10-01' },
    { semester: 1, wert: 3, datum: '2025-12-01' },
    { semester: 2, wert: 2, datum: '2026-03-01' },
    { semester: 2, wert: 1, datum: '2026-05-01' },
  ]
  assert.strictEqual(await note(sp, 1), 2.5) // Mittel (4+3+2+1)/4
  // Faktor 2: Rang-Gewichte 1, 1.33, 1.67, 2 (Summe 6) → (4+4+3.33+2)/6 = 2.22 → 2,2.
  // Die späteren S2-Noten ziehen stärker als die frühen S1-Noten (durchgehende Rezenz).
  assert.strictEqual(await note(sp, 2), 2.2)
})

test('berechneZeugnisnote nimmt keinen semester-Parameter mehr', () => {
  assert.strictEqual(noten.berechneZeugnisnote.length, 3) // (db, fachId, schuelerId)
})
