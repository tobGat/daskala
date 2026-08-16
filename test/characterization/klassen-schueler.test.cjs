// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Feature-Test: n:m-Klassenmitgliedschaft (klassen_schueler). Schüler:innen können mehreren Klassen
// angehören (klassenübergreifende Gruppen). Roster/getAll lesen die Mitgliedschaft; Migration v4→v5
// backfillt aus schueler.klasse_id. Ausführen: npm run test:core
const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { applySchema } = require('../../core/db/schema.js')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')
const noten = require('../../core/services/notenberechnung.js')
const schueler = require('../../core/domain/schueler.js')

function baueDb() {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  const port = createDbAdapter(() => db)
  const deps = { berechneAlleFuerFach: (id) => noten.berechneAlleFuerFach(port, id) }
  const sjId = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const k1 = db.prepare("INSERT INTO klassen (schuljahr_id, name) VALUES (?, '1A')").run(sjId).lastInsertRowid
  const k2 = db.prepare("INSERT INTO klassen (schuljahr_id, name) VALUES (?, '2B')").run(sjId).lastInsertRowid
  const f1 = db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'D', 1)").run(k1).lastInsertRowid
  return { db, port, deps, sjId, k1, k2, f1 }
}
const ids = (arr) => arr.map((s) => s.id).sort((a, b) => a - b)

test('create schreibt Person + Stammklasse-Mitgliedschaft', async () => {
  const { db, port, k1 } = baueDb()
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })
  const ks = db.prepare('SELECT * FROM klassen_schueler WHERE schueler_id = ?').all(sA)
  assert.equal(ks.length, 1)
  assert.equal(ks[0].klasse_id, k1)
  assert.equal(ks[0].ist_stammklasse, 1)
  assert.equal(ks[0].aktiv, 1)
  db.close()
})

test('Roster (alle_schueler=1) + getAll erfassen klassenübergreifende Mitglieder', async () => {
  const { db, port, deps, k1, k2, f1 } = baueDb()
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })
  const sB = await schueler.create(port, { klasseId: k2, vorname: 'B', nachname: 'B' })
  // sB (Stammklasse 2B) zusätzlich in 1A aufnehmen.
  await schueler.setKlassen(port, deps, sB, [k2, k1])
  assert.deepStrictEqual(ids(await noten.rosterFuerFach(port, f1)), ids([{ id: sA }, { id: sB }]))
  assert.deepStrictEqual(ids(await schueler.getAll(port, k1)), ids([{ id: sA }, { id: sB }]))
  // In der Zweitklasse ist nur sB (sA nicht Mitglied).
  assert.deepStrictEqual(ids(await schueler.getAll(port, k2)), ids([{ id: sB }]))
  db.close()
})

test('setKlassen entfernt Mitgliedschaft; genau eine Stammklasse bleibt', async () => {
  const { db, port, deps, k1, k2 } = baueDb()
  const sB = await schueler.create(port, { klasseId: k2, vorname: 'B', nachname: 'B' })
  await schueler.setKlassen(port, deps, sB, [k2, k1])
  assert.equal(db.prepare('SELECT COUNT(*) c FROM klassen_schueler WHERE schueler_id = ?').get(sB).c, 2)
  // Stammklasse (k2) entfernen → verbleibt k1, Stammklasse hängt auf k1 um.
  await schueler.setKlassen(port, deps, sB, [k1])
  const rest = db.prepare('SELECT klasse_id, ist_stammklasse FROM klassen_schueler WHERE schueler_id = ?').all(sB)
  assert.equal(rest.length, 1)
  assert.equal(rest[0].klasse_id, k1)
  assert.equal(rest[0].ist_stammklasse, 1)
  assert.equal(db.prepare('SELECT klasse_id FROM schueler WHERE id = ?').get(sB).klasse_id, k1)
  db.close()
})

test('entferneAusKlasse: einzige Klasse → Person deaktiviert; sonst nur Mitgliedschaft', async () => {
  const { db, port, deps, k1, k2 } = baueDb()
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })
  const sB = await schueler.create(port, { klasseId: k2, vorname: 'B', nachname: 'B' })
  await schueler.setKlassen(port, deps, sB, [k2, k1])
  // sA nur in k1 → entfernen deaktiviert die Person.
  await schueler.entferneAusKlasse(port, sA, k1)
  assert.equal(db.prepare('SELECT aktiv FROM schueler WHERE id = ?').get(sA).aktiv, 0)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM klassen_schueler WHERE schueler_id = ?').get(sA).c, 0)
  // sB in k1 und k2 → aus k1 entfernen lässt sB in k2 aktiv.
  await schueler.entferneAusKlasse(port, sB, k1)
  assert.equal(db.prepare('SELECT aktiv FROM schueler WHERE id = ?').get(sB).aktiv, 1)
  assert.deepStrictEqual(db.prepare('SELECT klasse_id FROM klassen_schueler WHERE schueler_id = ?').all(sB).map(r => r.klasse_id), [k2])
  db.close()
})

test('Migration v4→v5 backfillt klassen_schueler aus schueler.klasse_id', () => {
  const db = new Database(':memory:')
  db.pragma('user_version = 4')
  db.exec("CREATE TABLE schuljahre (id INTEGER PRIMARY KEY AUTOINCREMENT, bezeichnung TEXT NOT NULL)")
  db.exec("CREATE TABLE klassen (id INTEGER PRIMARY KEY AUTOINCREMENT, schuljahr_id INTEGER NOT NULL, name TEXT NOT NULL)")
  db.exec("CREATE TABLE schueler (id INTEGER PRIMARY KEY AUTOINCREMENT, klasse_id INTEGER NOT NULL, vorname TEXT, nachname TEXT, reihenfolge INTEGER DEFAULT 0, aktiv INTEGER DEFAULT 1)")
  const sj = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const k = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sj, '1A').lastInsertRowid
  db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, aktiv) VALUES (?,?,?,?,?)').run(k, 'A', 'A', 3, 1)
  db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, aktiv) VALUES (?,?,?,?,?)').run(k, 'B', 'B', 4, 0)
  applySchema(db, { logError: () => {} })
  const rows = db.prepare('SELECT * FROM klassen_schueler ORDER BY schueler_id').all()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].klasse_id, k)
  assert.equal(rows[0].reihenfolge, 3)
  assert.equal(rows[0].ist_stammklasse, 1)
  assert.equal(rows[1].aktiv, 0)                       // aktiv 1:1 aus schueler übernommen
  assert.equal(db.pragma('user_version', { simple: true }), 5)
  db.close()
})

test('getAllImSchuljahr liefert Personen mit Klassen- und Fächer-Zuordnung', async () => {
  const { db, port, deps, sjId, k1, k2 } = baueDb()
  const sB = await schueler.create(port, { klasseId: k2, vorname: 'B', nachname: 'B' })
  await schueler.setKlassen(port, deps, sB, [k2, k1])
  const alle = await schueler.getAllImSchuljahr(port, sjId)
  const b = alle.find(s => s.id === sB)
  assert.ok(b)
  assert.deepStrictEqual(b.klassen.map(k => k.id).sort((a, c) => a - c), [k1, k2].sort((a, c) => a - c))
  db.close()
})
