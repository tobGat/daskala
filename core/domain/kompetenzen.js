// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Kompetenzen (Kompetenzbereiche + Schüler:innen-Kompetenzen).
// db injiziert; deps = { initKompetenzVorlagen }.

function bereicheGetAll(db, fachId) {
  return db.prepare('SELECT * FROM kompetenzbereiche WHERE fach_id = ? ORDER BY reihenfolge, id').all(fachId)
}

function bereichCreate(db, fachId, titel, beschreibung) {
  const maxR = db.prepare('SELECT MAX(reihenfolge) as m FROM kompetenzbereiche WHERE fach_id = ?').get(fachId)?.m ?? 0
  const info = db.prepare('INSERT INTO kompetenzbereiche (fach_id, titel, beschreibung, reihenfolge) VALUES (?, ?, ?, ?)').run(fachId, titel, beschreibung ?? null, maxR + 1)
  return info.lastInsertRowid
}

function bereichUpdate(db, id, { titel, beschreibung }) {
  db.prepare('UPDATE kompetenzbereiche SET titel = ?, beschreibung = ? WHERE id = ?').run(titel, beschreibung ?? null, id)
  return true
}

function bereichDelete(db, id) {
  db.prepare('DELETE FROM kompetenzbereiche WHERE id = ?').run(id)
  return true
}

function bereichReorder(db, ids) {
  const stmt = db.prepare('UPDATE kompetenzbereiche SET reihenfolge = ? WHERE id = ?')
  ids.forEach((id, idx) => stmt.run(idx, id))
  return true
}

function initVorlagen(db, deps, fachId, fachName) {
  deps.initKompetenzVorlagen(fachId, fachName)
  return true
}

function schuelerGetAll(db, fachId) {
  return db.prepare(`
      SELECT sk.* FROM schueler_kompetenzen sk
      JOIN kompetenzbereiche kb ON kb.id = sk.kompetenzbereich_id
      WHERE kb.fach_id = ?
    `).all(fachId)
}

function schuelerSet(db, kompetenzbereichId, schuelerId, niveau, notiz) {
  db.prepare(`
      INSERT INTO schueler_kompetenzen (kompetenzbereich_id, schueler_id, niveau, notiz, aktualisiert)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(kompetenzbereich_id, schueler_id) DO UPDATE SET
        niveau = excluded.niveau, notiz = excluded.notiz, aktualisiert = excluded.aktualisiert
    `).run(kompetenzbereichId, schuelerId, niveau, notiz ?? null)
  return true
}

module.exports = { bereicheGetAll, bereichCreate, bereichUpdate, bereichDelete, bereichReorder, initVorlagen, schuelerGetAll, schuelerSet }
