// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Zeugnisnote (berechnet + manuell). Es gibt EINE durchgehende Note je
// (Fach, Schüler:in) – der laufende Jahresstand aus allen Aufzeichnungen beider Semester.
// Gespeichert im Slot semester=3 (Slots 1/2 werden nicht mehr verwendet).
// Async DbPort; deps = { berechneZeugnisnote, pushUndo, rosterIdsFuerFach }.

const { neueUuid } = require('../db/uuid')

// Slot der einen Note in der zeugnisnoten-Tabelle.
const NOTE_SEMESTER = 3

async function getAll(db, fachId) {
  return db.select('SELECT * FROM zeugnisnoten WHERE fach_id = ?', [fachId])
}

async function berechne(db, deps, fachId, schuelerId) {
  const note = (await deps.berechneZeugnisnote(fachId, schuelerId)).note
  if (note !== null) {
    await db.execute(`
        INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet, uuid)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(fach_id, schueler_id, semester)
        DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
      `, [fachId, schuelerId, NOTE_SEMESTER, note, 1, neueUuid()])
  }
  return note
}

async function setManuell(db, deps, fachId, schuelerId, note) {
  const existing = await db.selectOne('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, NOTE_SEMESTER])
  const rowExisted = !!existing
  const oldManuell = existing ? existing.note_manuell : undefined
  const berechnet = (await deps.berechneZeugnisnote(fachId, schuelerId)).note
  const upsert = (n) => db.execute(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, note_manuell, s1_eingerechnet, uuid)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, note_manuell = excluded.note_manuell, s1_eingerechnet = excluded.s1_eingerechnet
    `, [fachId, schuelerId, NOTE_SEMESTER, berechnet, n, 1, neueUuid()])
  await upsert(note)
  deps.pushUndo({
    description: 'Zeugnisnote',
    undo: async () => {
      if (!rowExisted) {
        await db.execute('DELETE FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, NOTE_SEMESTER])
      } else {
        await db.execute('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [oldManuell ?? null, fachId, schuelerId, NOTE_SEMESTER])
      }
    },
    redo: () => upsert(note),
  })
  return true
}

async function clearManuell(db, deps, fachId, schuelerId) {
  const existing = await db.selectOne('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, NOTE_SEMESTER])
  const oldManuell = existing?.note_manuell ?? null
  await db.execute('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, NOTE_SEMESTER])
  deps.pushUndo({
    description: 'Zeugnisnote zurücksetzen',
    undo: () => db.execute('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [oldManuell, fachId, schuelerId, NOTE_SEMESTER]),
    redo: () => db.execute('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?', [fachId, schuelerId, NOTE_SEMESTER]),
  })
  return true
}

async function berechneFach(db, deps, fachId) {
  // Eine durchgehende Jahresnote je Schüler:in neu berechnen.
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
      const { note } = await deps.berechneZeugnisnote(fachId, s.id)
      if (note !== null) await tx.execute(UPSERT, [fachId, s.id, NOTE_SEMESTER, note, 1, neueUuid()])
      else await tx.execute(UPDATE_ONLY, [null, 1, fachId, s.id, NOTE_SEMESTER])
    }
  })
  return true
}

module.exports = { getAll, berechne, setManuell, clearManuell, berechneFach }
