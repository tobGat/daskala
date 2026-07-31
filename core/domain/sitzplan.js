// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Sitzplan (Tische + Sitzplätze je Fach). db injiziert.

function getTische(db, fachId) {
  const rows = db.prepare(`
      SELECT t.id as tisch_id, t.typ, t.x, t.y, t.rotation,
             s.id as sitz_id, s.position,
             s.schueler_id,
             sch.vorname, sch.nachname, sch.avatar
      FROM sitzplan_tische t
      LEFT JOIN sitzplan_sitzplaetze s ON s.tisch_id = t.id
      LEFT JOIN schueler sch ON sch.id = s.schueler_id
      WHERE t.fach_id = ?
      ORDER BY t.id, s.position
    `).all(fachId)
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

function createTisch(db, fachId, typ, x, y) {
  const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
  const tisch = db.prepare(
    'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y) VALUES (?, ?, ?, ?, ?)'
  ).run(fach.klasse_id, fachId, typ, x, y)
  const tischId = tisch.lastInsertRowid
  db.prepare('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, 0)').run(tischId)
  if (typ === 'doppel') {
    db.prepare('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, 1)').run(tischId)
  }
  return tischId
}

function deleteTisch(db, tischId) {
  db.prepare('DELETE FROM sitzplan_tische WHERE id = ?').run(tischId)
  return true
}

function moveTisch(db, tischId, x, y) {
  db.prepare('UPDATE sitzplan_tische SET x = ?, y = ? WHERE id = ?').run(x, y, tischId)
  return true
}

function setRotation(db, tischId, rotation) {
  const r = ((Number(rotation) % 360) + 360) % 360 // auf 0/90/180/270 normalisieren
  db.prepare('UPDATE sitzplan_tische SET rotation = ? WHERE id = ?').run(r, tischId)
  return true
}

function assignSchueler(db, sitzplatzId, schuelerId) {
  db.prepare('UPDATE sitzplan_sitzplaetze SET schueler_id = ? WHERE id = ?')
    .run(schuelerId ?? null, sitzplatzId)
  return true
}

function duplicateTisch(db, fachId, sourceTischId, x, y) {
  const source = db.prepare('SELECT * FROM sitzplan_tische WHERE id = ?').get(sourceTischId)
  const sourceSitze = db.prepare('SELECT * FROM sitzplan_sitzplaetze WHERE tisch_id = ? ORDER BY position').all(sourceTischId)
  const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
  const tisch = db.prepare(
    'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y, rotation) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(fach.klasse_id, fachId, source.typ, x, y, source.rotation ?? 0)
  const newTischId = tisch.lastInsertRowid
  for (const sitz of sourceSitze) {
    db.prepare('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, ?)')
      .run(newTischId, sitz.position)
  }
  return newTischId
}

module.exports = { getTische, createTisch, deleteTisch, moveTisch, setRotation, assignSchueler, duplicateTisch }
