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
const klassen = require('../../core/domain/klassen.js')

function baueDb() {
  const db = new Database(':memory:')
  applySchema(db, { logError: () => {} })
  db.pragma('foreign_keys = ON') // wie im Desktop-Pfad (main.js) – CASCADE/Constraints aktiv
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
  assert.equal(db.pragma('user_version', { simple: true }), 6)  // applySchema hebt auf aktuelle SCHEMA_VERSION
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

test('remove deaktiviert Person + alle Mitgliedschaften → fällt aus Roster und getAll', async () => {
  const { db, port, deps, k1, k2, f1 } = baueDb()
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })
  const sB = await schueler.create(port, { klasseId: k2, vorname: 'B', nachname: 'B' })
  await schueler.setKlassen(port, deps, sB, [k2, k1]) // sB klassenübergreifend auch in k1
  await schueler.remove(port, sB)
  // sB verschwindet aus dem Fach-Roster (alle_schueler=1) und aus getAll; sA bleibt.
  assert.deepStrictEqual(ids(await noten.rosterFuerFach(port, f1)), ids([{ id: sA }]))
  assert.deepStrictEqual(ids(await schueler.getAll(port, k1)), ids([{ id: sA }]))
  // Keine aktive Mitgliedschaft mehr (konsistent mit s.aktiv=0).
  assert.equal(db.prepare('SELECT COUNT(*) c FROM klassen_schueler WHERE schueler_id = ? AND aktiv = 1').get(sB).c, 0)
  db.close()
})

test('Migration v4→v5 überspringt verwaiste schueler (klasse_id ohne Klasse) statt komplett abzubrechen', () => {
  const db = new Database(':memory:')
  db.pragma('user_version = 4')
  db.exec("CREATE TABLE schuljahre (id INTEGER PRIMARY KEY AUTOINCREMENT, bezeichnung TEXT NOT NULL)")
  db.exec("CREATE TABLE klassen (id INTEGER PRIMARY KEY AUTOINCREMENT, schuljahr_id INTEGER NOT NULL, name TEXT NOT NULL)")
  db.exec("CREATE TABLE schueler (id INTEGER PRIMARY KEY AUTOINCREMENT, klasse_id INTEGER NOT NULL, vorname TEXT, nachname TEXT, reihenfolge INTEGER DEFAULT 0, aktiv INTEGER DEFAULT 1)")
  const sj = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const k = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sj, '1A').lastInsertRowid
  db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?,?,?)').run(k, 'Gut', 'G')
  db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname) VALUES (?,?,?)').run(9999, 'Waise', 'W') // verwaiste klasse_id
  db.pragma('foreign_keys = ON') // wie im Desktop-Pfad (main.js:343 vor applySchema)
  applySchema(db, { logError: () => {} })
  const rows = db.prepare('SELECT * FROM klassen_schueler').all()
  assert.equal(rows.length, 1)                                  // nur der gültige Schüler wandert in die Junction
  assert.equal(rows[0].klasse_id, k)
  assert.equal(db.pragma('user_version', { simple: true }), 6)  // Migration lief durch (kein FK-Abbruch)
  db.close()
})

test('klassen.remove: nur klassen-eigene Schüler:innen werden gelöscht, geteilte bleiben (Datenverlust-Schutz)', async () => {
  const { db, port, deps, k1, k2 } = baueDb()
  const kdeps = { raeumeFachDatenAuf: async () => {}, logError: () => {} }
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })         // nur k1
  const sC = await schueler.create(port, { klasseId: k1, vorname: 'C', nachname: 'C' })         // Stammklasse k1 …
  await schueler.setKlassen(port, deps, sC, [k1, k2])                                            // … zusätzlich in k2
  const sB = await schueler.create(port, { klasseId: k2, vorname: 'B', nachname: 'B' })         // nur k2
  await klassen.remove(port, kdeps, k1)
  // sA (nur k1) hart gelöscht:
  assert.equal(db.prepare('SELECT COUNT(*) c FROM schueler WHERE id = ?').get(sA).c, 0)
  // sC (geteilt) bleibt aktiv, Stammklasse auf k2 umgehängt, keine k1-Mitgliedschaft mehr:
  const c = db.prepare('SELECT aktiv, klasse_id FROM schueler WHERE id = ?').get(sC)
  assert.ok(c)
  assert.equal(c.aktiv, 1)
  assert.equal(c.klasse_id, k2)
  const cMemb = db.prepare('SELECT klasse_id, ist_stammklasse FROM klassen_schueler WHERE schueler_id = ?').all(sC)
  assert.deepStrictEqual(cMemb.map((r) => r.klasse_id), [k2])
  assert.equal(cMemb[0].ist_stammklasse, 1)
  // sB (nur k2) unberührt; k1 weg:
  assert.equal(db.prepare('SELECT COUNT(*) c FROM schueler WHERE id = ?').get(sB).c, 1)
  assert.equal(db.prepare('SELECT COUNT(*) c FROM klassen WHERE id = ?').get(k1).c, 0)
  db.close()
})

test('rosterFuerFach folgt der Klassen-Sortierung (nachname/vorname/manuell)', async () => {
  const { db, port, k1, f1 } = baueDb()
  // Anlage-Reihenfolge (= ks.reihenfolge) bewusst quer zur Alphabetik.
  await schueler.create(port, { klasseId: k1, vorname: 'Cara', nachname: 'Berg' })
  await schueler.create(port, { klasseId: k1, vorname: 'Bea', nachname: 'Calb' })
  await schueler.create(port, { klasseId: k1, vorname: 'Alex', nachname: 'Auer' })
  const vornamen = async () => (await noten.rosterFuerFach(port, f1)).map((s) => s.vorname)
  db.prepare("UPDATE klassen SET sortierung = 'nachname' WHERE id = ?").run(k1)
  assert.deepStrictEqual(await vornamen(), ['Alex', 'Cara', 'Bea'])   // Auer < Berg < Calb
  db.prepare("UPDATE klassen SET sortierung = 'vorname' WHERE id = ?").run(k1)
  assert.deepStrictEqual(await vornamen(), ['Alex', 'Bea', 'Cara'])
  db.prepare("UPDATE klassen SET sortierung = 'manuell' WHERE id = ?").run(k1)
  assert.deepStrictEqual(await vornamen(), ['Cara', 'Bea', 'Alex'])   // Anlage-Reihenfolge
  db.close()
})

test('setFaecher: Person einzeln einem Gruppen-Fach zuordnen/entfernen (Voll-Fach ignoriert)', async () => {
  const { db, port, deps, k1 } = baueDb()
  const g = db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'Chor', 0)").run(k1).lastInsertRowid
  const voll = db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'Turnen', 1)").run(k1).lastInsertRowid
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })
  await schueler.setFaecher(port, deps, sA, { add: [g, voll] })
  assert.deepStrictEqual(ids(await noten.rosterFuerFach(port, g)), ids([{ id: sA }]))
  // Voll-Fach (alle_schueler=1) erzeugt KEINEN fach_schueler-Eintrag.
  assert.equal(db.prepare('SELECT COUNT(*) c FROM fach_schueler WHERE fach_id = ? AND schueler_id = ?').get(voll, sA).c, 0)
  await schueler.setFaecher(port, deps, sA, { remove: [g] })
  assert.deepStrictEqual(ids(await noten.rosterFuerFach(port, g)), [])
  db.close()
})

test('setSpfFaecher: SPF fachbezogen – Roster-spf_fach nur im gewählten Fach; Summen-Flag folgt', async () => {
  const { db, port, k1, f1 } = baueDb()
  const f2 = db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'M', 1)").run(k1).lastInsertRowid
  const sA = await schueler.create(port, { klasseId: k1, vorname: 'A', nachname: 'A' })
  await schueler.setSpfFaecher(port, sA, [f1])
  assert.equal((await noten.rosterFuerFach(port, f1)).find(s => s.id === sA).spf_fach, 1)
  assert.equal((await noten.rosterFuerFach(port, f2)).find(s => s.id === sA).spf_fach, 0)
  assert.equal(db.prepare('SELECT spf FROM schueler WHERE id = ?').get(sA).spf, 1) // Summen-Flag gesetzt
  await schueler.setSpfFaecher(port, sA, [])
  assert.equal((await noten.rosterFuerFach(port, f1)).find(s => s.id === sA).spf_fach, 0)
  assert.equal(db.prepare('SELECT spf FROM schueler WHERE id = ?').get(sA).spf, 0) // Summen-Flag entfernt
  db.close()
})

test('Migration v<6 backfillt fachbezogenes SPF aus globalem schueler.spf (Stammklassen-Fächer)', () => {
  const db = new Database(':memory:')
  db.pragma('user_version = 5')
  db.exec("CREATE TABLE schuljahre (id INTEGER PRIMARY KEY AUTOINCREMENT, bezeichnung TEXT NOT NULL)")
  db.exec("CREATE TABLE klassen (id INTEGER PRIMARY KEY AUTOINCREMENT, schuljahr_id INTEGER NOT NULL, name TEXT NOT NULL)")
  db.exec("CREATE TABLE faecher (id INTEGER PRIMARY KEY AUTOINCREMENT, klasse_id INTEGER NOT NULL, name TEXT, alle_schueler INTEGER DEFAULT 1)")
  db.exec("CREATE TABLE schueler (id INTEGER PRIMARY KEY AUTOINCREMENT, klasse_id INTEGER NOT NULL, vorname TEXT, nachname TEXT, aktiv INTEGER DEFAULT 1, spf INTEGER DEFAULT 0)")
  const sj = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const k = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sj, '1A').lastInsertRowid
  const fA = db.prepare("INSERT INTO faecher (klasse_id, name) VALUES (?, 'D')").run(k).lastInsertRowid
  const fB = db.prepare("INSERT INTO faecher (klasse_id, name) VALUES (?, 'M')").run(k).lastInsertRowid
  const sSpf = db.prepare("INSERT INTO schueler (klasse_id, vorname, nachname, spf) VALUES (?,?,?,1)").run(k, 'S', 'P').lastInsertRowid
  const sKein = db.prepare("INSERT INTO schueler (klasse_id, vorname, nachname, spf) VALUES (?,?,?,0)").run(k, 'K', 'E').lastInsertRowid
  applySchema(db, { logError: () => {} })
  const rows = db.prepare('SELECT schueler_id, fach_id FROM schueler_fach_spf ORDER BY fach_id').all()
  assert.deepStrictEqual(rows, [{ schueler_id: sSpf, fach_id: fA }, { schueler_id: sSpf, fach_id: fB }]) // alle Stammklassen-Fächer
  assert.equal(db.prepare('SELECT COUNT(*) c FROM schueler_fach_spf WHERE schueler_id = ?').get(sKein).c, 0)
  assert.equal(db.pragma('user_version', { simple: true }), 6)
  db.close()
})

test('Migration v<6: SPF-Backfill nur für belegte Fächer (nicht eingeschriebenes Gruppenfach ausgenommen)', () => {
  const db = new Database(':memory:')
  db.pragma('user_version = 5')
  db.exec("CREATE TABLE schuljahre (id INTEGER PRIMARY KEY AUTOINCREMENT, bezeichnung TEXT NOT NULL)")
  db.exec("CREATE TABLE klassen (id INTEGER PRIMARY KEY AUTOINCREMENT, schuljahr_id INTEGER NOT NULL, name TEXT NOT NULL)")
  db.exec("CREATE TABLE faecher (id INTEGER PRIMARY KEY AUTOINCREMENT, klasse_id INTEGER NOT NULL, name TEXT, alle_schueler INTEGER DEFAULT 1)")
  db.exec("CREATE TABLE schueler (id INTEGER PRIMARY KEY AUTOINCREMENT, klasse_id INTEGER NOT NULL, vorname TEXT, nachname TEXT, aktiv INTEGER DEFAULT 1, spf INTEGER DEFAULT 0)")
  db.exec("CREATE TABLE fach_schueler (fach_id INTEGER NOT NULL, schueler_id INTEGER NOT NULL, PRIMARY KEY (fach_id, schueler_id))")
  const sj = db.prepare("INSERT INTO schuljahre (bezeichnung) VALUES ('T')").run().lastInsertRowid
  const k = db.prepare('INSERT INTO klassen (schuljahr_id, name) VALUES (?, ?)').run(sj, '1A').lastInsertRowid
  const voll = db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'D', 1)").run(k).lastInsertRowid
  const grpMit = db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'Chor', 0)").run(k).lastInsertRowid
  db.prepare("INSERT INTO faecher (klasse_id, name, alle_schueler) VALUES (?, 'Band', 0)").run(k) // Gruppenfach ohne Einschreibung
  const s = db.prepare("INSERT INTO schueler (klasse_id, vorname, nachname, spf) VALUES (?,?,?,1)").run(k, 'S', 'P').lastInsertRowid
  db.prepare('INSERT INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)').run(grpMit, s) // nur in Chor eingeschrieben
  applySchema(db, { logError: () => {} })
  const faecherMitSpf = db.prepare('SELECT fach_id FROM schueler_fach_spf WHERE schueler_id = ? ORDER BY fach_id').all(s).map(r => r.fach_id)
  assert.deepStrictEqual(faecherMitSpf, [voll, grpMit]) // Voll-Fach + belegtes Gruppenfach; NICHT das unbelegte „Band"
  db.close()
})
