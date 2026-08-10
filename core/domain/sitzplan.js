// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Sitzplan (Tische + Sitzplätze je Fach). Async DbPort.

async function getTische(db, fachId) {
  const rows = await db.select(`
      SELECT t.id as tisch_id, t.typ, t.x, t.y, t.rotation,
             s.id as sitz_id, s.position,
             s.schueler_id,
             sch.vorname, sch.nachname, sch.avatar
      FROM sitzplan_tische t
      LEFT JOIN sitzplan_sitzplaetze s ON s.tisch_id = t.id
      LEFT JOIN schueler sch ON sch.id = s.schueler_id
      WHERE t.fach_id = ?
      ORDER BY t.id, s.position
    `, [fachId])
  // Gruppiere Rows zu Tisch-Objekten
  const map = {}
  for (const row of rows) {
    if (!map[row.tisch_id]) {
      map[row.tisch_id] = { id: row.tisch_id, typ: row.typ, x: row.x, y: row.y, rotation: row.rotation ?? 0, sitze: [] }
    }
    if (row.sitz_id != null) {
      map[row.tisch_id].sitze.push({
        id: row.sitz_id, position: row.position,
        schueler_id: row.schueler_id, vorname: row.vorname, nachname: row.nachname, avatar: row.avatar,
      })
    }
  }
  return Object.values(map)
}

async function createTisch(db, fachId, typ, x, y) {
  const fach = await db.selectOne('SELECT klasse_id FROM faecher WHERE id = ?', [fachId])
  const tisch = await db.execute(
    'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y) VALUES (?, ?, ?, ?, ?)',
    [fach.klasse_id, fachId, typ, x, y]
  )
  const tischId = tisch.lastInsertRowid
  await db.execute('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, 0)', [tischId])
  if (typ === 'doppel') {
    await db.execute('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, 1)', [tischId])
  }
  return tischId
}

async function deleteTisch(db, tischId) {
  await db.execute('DELETE FROM sitzplan_tische WHERE id = ?', [tischId])
  return true
}

async function moveTisch(db, tischId, x, y) {
  await db.execute('UPDATE sitzplan_tische SET x = ?, y = ? WHERE id = ?', [x, y, tischId])
  return true
}

async function setRotation(db, tischId, rotation) {
  const r = ((Number(rotation) % 360) + 360) % 360 // auf 0/90/180/270 normalisieren
  await db.execute('UPDATE sitzplan_tische SET rotation = ? WHERE id = ?', [r, tischId])
  return true
}

async function assignSchueler(db, sitzplatzId, schuelerId) {
  await db.execute('UPDATE sitzplan_sitzplaetze SET schueler_id = ? WHERE id = ?', [schuelerId ?? null, sitzplatzId])
  return true
}

async function duplicateTisch(db, fachId, sourceTischId, x, y) {
  const source = await db.selectOne('SELECT * FROM sitzplan_tische WHERE id = ?', [sourceTischId])
  const sourceSitze = await db.select('SELECT * FROM sitzplan_sitzplaetze WHERE tisch_id = ? ORDER BY position', [sourceTischId])
  const fach = await db.selectOne('SELECT klasse_id FROM faecher WHERE id = ?', [fachId])
  const tisch = await db.execute(
    'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y, rotation) VALUES (?, ?, ?, ?, ?, ?)',
    [fach.klasse_id, fachId, source.typ, x, y, source.rotation ?? 0]
  )
  const newTischId = tisch.lastInsertRowid
  for (const sitz of sourceSitze) {
    await db.execute('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, ?)', [newTischId, sitz.position])
  }
  return newTischId
}

module.exports = { getTische, createTisch, deleteTisch, moveTisch, setRotation, assignSchueler, duplicateTisch }
