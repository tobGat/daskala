// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: individueller Rezenzfaktor pro (Fach, Schüler:in) (§ 20 LBVO).
// Ein per-Schüler:in gesetzter Faktor (schueler_rezenz) sticht den globalen Wert aus;
// fehlt er, gilt weiter der globale Faktor. rezenz.setKlasse setzt alle Roster-Schüler:innen,
// rezenz.set(null) entfernt die Überschreibung (zurück auf global).
// Ausführen:  npm run test:core

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')
const rezenz = require('../../core/domain/rezenz.js')

// Frische In-Memory-DB: Fach (alle_schueler=1) + zwei Schüler:innen, beide mit identischen
// SA-Noten 4,3,2 (alt→neu). Optionaler globaler Rezenzfaktor.
function setup(globalFaktor) {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  if (globalFaktor != null) {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run('rezenz_faktor', String(globalFaktor))
  }
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, ?, 1)').run(kId, 'M').lastInsertRowid
  const sA = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, aktiv) VALUES (?, ?, ?, 1)').run(kId, 'A', 'A').lastInsertRowid
  const sB = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, aktiv) VALUES (?, ?, ?, 1)').run(kId, 'B', 'B').lastInsertRowid
  const sa = [{ note: 4, datum: '2025-10-01' }, { note: 3, datum: '2025-11-01' }, { note: 2, datum: '2025-12-01' }]
  sa.forEach(({ note, datum }, i) => {
    const spId = db.prepare('INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES (?, 1, ?, ?, ?, ?)')
      .run(fId, 'SA', `SA${i + 1}`, datum, i).lastInsertRowid
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sA, String(note))
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spId, sB, String(note))
  })
  const port = createDbAdapter(() => db)
  const deps = {
    berechneAlleFuerFach: (id) => noten.berechneAlleFuerFach(port, id),
    rosterIdsFuerFach: (id) => noten.rosterIdsFuerFach(port, id),
  }
  return { db, port, deps, fId, sA, sB }
}

const noteVon = async (port, fId, sId) => (await noten.berechneZeugnisnote(port, fId, sId)).note

test('per-Schüler:in-Override sticht global aus; andere Schüler:in bleibt global', async () => {
  const { db, port, deps, fId, sA, sB } = setup(1) // global = 1 → reiner Durchschnitt 3,0
  await rezenz.set(port, deps, fId, sA, 2)
  assert.strictEqual(await noteVon(port, fId, sA), 2.78) // 4,3,2 mit Faktor 2
  assert.strictEqual(await noteVon(port, fId, sB), 3.0)  // ohne Override → global 1
  db.close()
})

test('rezenz.setKlasse setzt den Faktor für alle Roster-Schüler:innen', async () => {
  const { db, port, deps, fId, sA, sB } = setup(1)
  await rezenz.setKlasse(port, deps, fId, 2)
  assert.deepStrictEqual(await rezenz.get(port, fId), { [sA]: 2, [sB]: 2 })
  assert.strictEqual(await noteVon(port, fId, sA), 2.78)
  assert.strictEqual(await noteVon(port, fId, sB), 2.78)
  db.close()
})

test('rezenz.set(null) entfernt die Überschreibung → zurück auf globalen Faktor', async () => {
  const { db, port, deps, fId, sA } = setup(3) // global = 3
  await rezenz.set(port, deps, fId, sA, 2)
  assert.strictEqual(await noteVon(port, fId, sA), 2.78) // Override 2 wirkt
  await rezenz.set(port, deps, fId, sA, null)
  assert.deepStrictEqual(await rezenz.get(port, fId), {}) // Override entfernt
  assert.strictEqual(await noteVon(port, fId, sA), 2.67) // 4,3,2 mit globalem Faktor 3
  db.close()
})
