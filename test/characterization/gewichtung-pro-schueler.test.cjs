// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: individuelle Notengewichtung pro (Fach, Schüler:in). Ein per-Schüler:in gesetzter
// Gewichtungs-Override (schueler_gewichtung) sticht die Fach-Gewichtung aus; fehlt er, gilt weiter
// die Fach- bzw. globale Gewichtung. set(null) entfernt den Override. Ausführen: npm run test:core
const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')
const gewichtung = require('../../core/domain/gewichtungSchueler.js')

// Fach mit SA/T-Gewicht je 0,5, zwei Schüler:innen, beide SA=2 und T=4.
function setup() {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const kId = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sjId, '1A').lastInsertRowid
  const fId = db.prepare('INSERT INTO faecher (klasse_id, name, alle_schueler, gewichtung_sa, gewichtung_t) VALUES (?, ?, 1, 0.5, 0.5)').run(kId, 'M').lastInsertRowid
  const sA = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, aktiv) VALUES (?, ?, ?, 1)').run(kId, 'A', 'A').lastInsertRowid
  const sB = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, aktiv) VALUES (?, ?, ?, 1)').run(kId, 'B', 'B').lastInsertRowid
  const saSp = db.prepare("INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, reihenfolge) VALUES (?, 1, 'SA', 'SA', 0)").run(fId).lastInsertRowid
  const tSp = db.prepare("INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, reihenfolge) VALUES (?, 1, 'T', 'T', 1)").run(fId).lastInsertRowid
  for (const s of [sA, sB]) {
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(saSp, s, '2')
    db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(tSp, s, '4')
  }
  const port = createDbAdapter(() => db)
  const deps = { berechneAlleFuerFach: (id) => noten.berechneAlleFuerFach(port, id) }
  return { db, port, deps, fId, sA, sB }
}
const noteVon = async (port, fId, sId) => (await noten.berechneZeugnisnote(port, fId, sId)).note

test('per-Schüler:in-Gewichtung sticht Fach-Gewichtung aus; andere:r bleibt beim Fach', async () => {
  const { db, port, deps, fId, sA, sB } = setup()
  assert.strictEqual(await noteVon(port, fId, sA), 3)   // 0,5·2 + 0,5·4 = 3
  // A: SA stärker (0,8) als T (0,2) → 0,8·2 + 0,2·4 = 2,4
  await gewichtung.set(port, deps, fId, sA, { sa: 0.8, t: 0.2, custom: 0.1, ma: 0.2 })
  assert.strictEqual(await noteVon(port, fId, sA), 2.4)
  assert.strictEqual(await noteVon(port, fId, sB), 3)   // B ohne Override → Fach 0,5/0,5
  db.close()
})

test('gewichtungSchueler.set(null) entfernt den Override → zurück auf Fach-Gewichtung', async () => {
  const { db, port, deps, fId, sA } = setup()
  await gewichtung.set(port, deps, fId, sA, { sa: 0.8, t: 0.2, custom: 0.1, ma: 0.2 })
  assert.strictEqual(await noteVon(port, fId, sA), 2.4)
  await gewichtung.set(port, deps, fId, sA, null)
  assert.deepStrictEqual(await gewichtung.get(port, fId), {})
  assert.strictEqual(await noteVon(port, fId, sA), 3)
  db.close()
})

test('gewichtungSchueler.get liefert die gesetzten Anteile', async () => {
  const { db, port, deps, fId, sA } = setup()
  await gewichtung.set(port, deps, fId, sA, { sa: 0.6, t: 0.4, custom: 0, ma: 0 })
  assert.deepStrictEqual(await gewichtung.get(port, fId), { [sA]: { sa: 0.6, t: 0.4, custom: 0, ma: 0 } })
  db.close()
})
