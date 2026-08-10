// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Kompetenzen (Kompetenzbereiche + Schüler:innen-Kompetenzen).
// Async DbPort; deps = { initKompetenzVorlagen }.

async function bereicheGetAll(db, fachId) {
  return db.select('SELECT * FROM kompetenzbereiche WHERE fach_id = ? ORDER BY reihenfolge, id', [fachId])
}

async function bereichCreate(db, fachId, titel, beschreibung) {
  const maxR = (await db.selectOne('SELECT MAX(reihenfolge) as m FROM kompetenzbereiche WHERE fach_id = ?', [fachId]))?.m ?? 0
  const info = await db.execute('INSERT INTO kompetenzbereiche (fach_id, titel, beschreibung, reihenfolge) VALUES (?, ?, ?, ?)', [fachId, titel, beschreibung ?? null, maxR + 1])
  return info.lastInsertRowid
}

async function bereichUpdate(db, id, { titel, beschreibung }) {
  await db.execute('UPDATE kompetenzbereiche SET titel = ?, beschreibung = ? WHERE id = ?', [titel, beschreibung ?? null, id])
  return true
}

async function bereichDelete(db, id) {
  await db.execute('DELETE FROM kompetenzbereiche WHERE id = ?', [id])
  return true
}

async function bereichReorder(db, ids) {
  await db.transaction(async (tx) => {
    let idx = 0
    for (const id of ids) await tx.execute('UPDATE kompetenzbereiche SET reihenfolge = ? WHERE id = ?', [idx++, id])
  })
  return true
}

async function initVorlagen(db, deps, fachId, fachName) {
  await deps.initKompetenzVorlagen(fachId, fachName)
  return true
}

async function schuelerGetAll(db, fachId) {
  return db.select(`
      SELECT sk.* FROM schueler_kompetenzen sk
      JOIN kompetenzbereiche kb ON kb.id = sk.kompetenzbereich_id
      WHERE kb.fach_id = ?
    `, [fachId])
}

async function schuelerSet(db, kompetenzbereichId, schuelerId, niveau, notiz) {
  await db.execute(`
      INSERT INTO schueler_kompetenzen (kompetenzbereich_id, schueler_id, niveau, notiz, aktualisiert)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(kompetenzbereich_id, schueler_id) DO UPDATE SET
        niveau = excluded.niveau, notiz = excluded.notiz, aktualisiert = excluded.aktualisiert
    `, [kompetenzbereichId, schuelerId, niveau, notiz ?? null])
  return true
}

module.exports = { bereicheGetAll, bereichCreate, bereichUpdate, bereichDelete, bereichReorder, initVorlagen, schuelerGetAll, schuelerSet }
