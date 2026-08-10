// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Zeugnisnoten (berechnet + manuell), Semester 1/2 + Endnote (3).
// Async DbPort; deps = { berechneZeugnisnote, berechneEndnote, pushUndo, rosterIdsFuerFach }.

const { neueUuid } = require('../db/uuid')

async function getAll(db, fachId) {
  return db.select('SELECT * FROM zeugnisnoten WHERE fach_id = ?', [fachId])
}

async function berechne(db, deps, fachId, schuelerId, semester) {
  const note = semester === 3
    ? await deps.berechneEndnote(fachId, schuelerId)
    : (await deps.berechneZeugnisnote(fachId, schuelerId, semester)).note
  if (note !== null) {
    await db.execute(`
        INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet, uuid)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(fach_id, schueler_id, semester)
        DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
      `, [fachId, schuelerId, semester, note, semester === 3 ? 1 : 0, neueUuid()])
  }
  return note
}

async function setManuell(db, deps, fachId, schuelerId, semester, note) {
  const existing = await db.selectOne('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, semester])
  const rowExisted = !!existing
  const oldManuell = existing ? existing.note_manuell : undefined
  const berechnet = semester === 3
    ? await deps.berechneEndnote(fachId, schuelerId)
    : (await deps.berechneZeugnisnote(fachId, schuelerId, semester)).note
  const upsert = (n) => db.execute(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, note_manuell, s1_eingerechnet, uuid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, note_manuell = excluded.note_manuell, s1_eingerechnet = excluded.s1_eingerechnet
    `, [fachId, schuelerId, semester, berechnet, n, semester === 3 ? 1 : 0, neueUuid()])
  await upsert(note)
  deps.pushUndo({
    description: 'Zeugnisnote',
    undo: async () => {
      if (!rowExisted) {
        await db.execute('DELETE FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, semester])
      } else {
        await db.execute('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [oldManuell ?? null, fachId, schuelerId, semester])
      }
    },
    redo: () => upsert(note),
  })
  return true
}

async function clearManuell(db, deps, fachId, schuelerId, semester) {
  const existing = await db.selectOne('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, semester])
  const oldManuell = existing?.note_manuell ?? null
  await db.execute('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, semester])
  deps.pushUndo({
    description: 'Zeugnisnote zurücksetzen',
    undo: () => db.execute('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [oldManuell, fachId, schuelerId, semester]),
    redo: () => db.execute('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, semester]),
  })
  return true
}

async function berechneFach(db, deps, fachId) {
  // Alle Schüler:innen: S1, S2 und Endnote neu berechnen
  const fach = await db.selectOne('SELECT * FROM faecher WHERE id = ?', [fachId])
  if (!fach) return false
  const schueler = (await deps.rosterIdsFuerFach(fachId)).map((id) => ({ id }))
  const UPSERT = `
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet, uuid)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
    `
  const UPDATE_ONLY = 'UPDATE zeugnisnoten SET note_berechnet = ?, s1_eingerechnet = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?'
  await db.transaction(async (tx) => {
    for (const s of schueler) {
      for (const sem of [1, 2]) {
        const { note } = await deps.berechneZeugnisnote(fachId, s.id, sem)
        if (note !== null) await tx.execute(UPSERT, [fachId, s.id, sem, note, 0, neueUuid()])
        else await tx.execute(UPDATE_ONLY, [null, 0, fachId, s.id, sem])
      }
    }
    for (const s of schueler) {
      const endnote = await deps.berechneEndnote(fachId, s.id)
      if (endnote !== null) await tx.execute(UPSERT, [fachId, s.id, 3, endnote, 1, neueUuid()])
      else await tx.execute(UPDATE_ONLY, [null, 1, fachId, s.id, 3])
    }
  })
  return true
}

module.exports = { getAll, berechne, setManuell, clearManuell, berechneFach }
