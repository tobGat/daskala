// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Spalten (Bewertungsspalten je Fach). db injiziert;
// deps = { pushUndo } (nur für update). delete protokolliert inline in den Verlauf.

function getAll(db, fachId) {
  return db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge, datum').all(fachId)
}

function create(db, data) {
  const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM spalten WHERE fach_id = ? AND semester = ?').get(data.fachId, data.semester)?.m ?? 0
  const info = db.prepare(`
      INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge, notiz)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.fachId, data.semester, data.kategorie, data.kuerzel, data.datum, maxReihenfolge + 1, data.notiz ?? null)
  return info.lastInsertRowid
}

function remove(db, id) {
  const betroffene = db.prepare('SELECT spalte_id, schueler_id, wert, kommentar FROM eintraege WHERE spalte_id = ?').all(id)
  if (betroffene.length > 0) {
    const spalte = db.prepare('SELECT fach_id FROM spalten WHERE id = ?').get(id)
    const verlaufStmt = db.prepare(`
        INSERT INTO eintraege_verlauf (fach_id, spalte_id, schueler_id, wert_alt, wert_neu, kommentar_alt, kommentar_neu, aktion)
        VALUES (?, ?, ?, ?, NULL, ?, NULL, 'spalte_geloescht')
      `)
    db.transaction(() => {
      for (const e of betroffene) {
        verlaufStmt.run(spalte?.fach_id ?? null, e.spalte_id, e.schueler_id, e.wert, e.kommentar)
      }
    })()
  }
  db.prepare('DELETE FROM eintraege WHERE spalte_id = ?').run(id)
  db.prepare('DELETE FROM spalten WHERE id = ?').run(id)
  return true
}

function update(db, deps, id, data) {
  const old = db.prepare('SELECT kuerzel, datum, notiz FROM spalten WHERE id = ?').get(id)
  db.prepare('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?').run(data.kuerzel, data.datum, data.notiz ?? null, id)
  if (old) deps.pushUndo({
    description: 'Spalte umbenennen',
    undo: () => db.prepare('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?').run(old.kuerzel, old.datum, old.notiz, id),
    redo: () => db.prepare('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?').run(data.kuerzel, data.datum, data.notiz ?? null, id),
  })
  return true
}

function toggleEingeklappt(db, id) {
  db.prepare('UPDATE spalten SET eingeklappt = CASE WHEN eingeklappt = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id)
  return true
}

function setEingeklappt(db, ids, wert) {
  const stmt = db.prepare('UPDATE spalten SET eingeklappt = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const id of ids) stmt.run(wert ? 1 : 0, id)
  })
  tx()
  return true
}

function sortByKategorie(db, fachId, semester) {
  const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? AND semester = ? ORDER BY kategorie, datum').all(fachId, semester)
  const stmt = db.prepare('UPDATE spalten SET reihenfolge = ? WHERE id = ?')
  const tx = db.transaction(() => {
    spalten.forEach((s, i) => stmt.run(i + 1, s.id))
  })
  tx()
  return true
}

// Spalten wieder chronologisch (nach Datum) sortieren; Spalten ohne Datum ans Ende.
function sortChronologisch(db, fachId, semester) {
  const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? AND semester = ? ORDER BY datum IS NULL, datum, id').all(fachId, semester)
  const stmt = db.prepare('UPDATE spalten SET reihenfolge = ? WHERE id = ?')
  const tx = db.transaction(() => {
    spalten.forEach((s, i) => stmt.run(i + 1, s.id))
  })
  tx()
  return true
}

module.exports = { getAll, create, remove, update, toggleEingeklappt, setEingeklappt, sortByKategorie, sortChronologisch }
