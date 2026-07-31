// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Zeugnisnoten (berechnet + manuell), Semester 1/2 + Endnote (3).
// db injiziert; deps = { berechneZeugnisnote, berechneEndnote, pushUndo, rosterIdsFuerFach }.

function getAll(db, fachId) {
  return db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fachId)
}

function berechne(db, deps, fachId, schuelerId, semester) {
  const note = semester === 3
    ? deps.berechneEndnote(fachId, schuelerId)
    : deps.berechneZeugnisnote(fachId, schuelerId, semester).note
  if (note !== null) {
    db.prepare(`
        INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(fach_id, schueler_id, semester)
        DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
      `).run(fachId, schuelerId, semester, note, semester === 3 ? 1 : 0)
  }
  return note
}

function setManuell(db, deps, fachId, schuelerId, semester, note) {
  const existing = db.prepare('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?').get(fachId, schuelerId, semester)
  const rowExisted = !!existing
  const oldManuell = existing ? existing.note_manuell : undefined
  const berechnet = semester === 3
    ? deps.berechneEndnote(fachId, schuelerId)
    : deps.berechneZeugnisnote(fachId, schuelerId, semester).note
  const upsert = (n) => db.prepare(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, note_manuell, s1_eingerechnet)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, note_manuell = excluded.note_manuell, s1_eingerechnet = excluded.s1_eingerechnet
    `).run(fachId, schuelerId, semester, berechnet, n, semester === 3 ? 1 : 0)
  upsert(note)
  deps.pushUndo({
    description: 'Zeugnisnote',
    undo: () => {
      if (!rowExisted) {
        db.prepare('DELETE FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester)
      } else {
        db.prepare('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(oldManuell ?? null, fachId, schuelerId, semester)
      }
    },
    redo: () => upsert(note),
  })
  return true
}

function clearManuell(db, deps, fachId, schuelerId, semester) {
  const existing = db.prepare('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?').get(fachId, schuelerId, semester)
  const oldManuell = existing?.note_manuell ?? null
  db.prepare('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester)
  deps.pushUndo({
    description: 'Zeugnisnote zurücksetzen',
    undo: () => db.prepare('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(oldManuell, fachId, schuelerId, semester),
    redo: () => db.prepare('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester),
  })
  return true
}

function berechneFach(db, deps, fachId) {
  // Alle Schüler:innen: S1, S2 und Endnote neu berechnen
  const fach = db.prepare('SELECT * FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return false
  const schueler = deps.rosterIdsFuerFach(fachId).map((id) => ({ id }))
  const upsert = db.prepare(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
    `)
  const updateOnly = db.prepare(`
      UPDATE zeugnisnoten SET note_berechnet = ?, s1_eingerechnet = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?
    `)
  db.transaction(() => {
    for (const s of schueler) {
      for (const sem of [1, 2]) {
        const { note } = deps.berechneZeugnisnote(fachId, s.id, sem)
        if (note !== null) {
          upsert.run(fachId, s.id, sem, note, 0)
        } else {
          updateOnly.run(null, 0, fachId, s.id, sem)
        }
      }
    }
    for (const s of schueler) {
      const endnote = deps.berechneEndnote(fachId, s.id)
      if (endnote !== null) {
        upsert.run(fachId, s.id, 3, endnote, 1)
      } else {
        updateOnly.run(null, 1, fachId, s.id, 3)
      }
    }
  })()
  return true
}

module.exports = { getAll, berechne, setManuell, clearManuell, berechneFach }
