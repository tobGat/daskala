// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: Jahresaufgaben (Templates + Status je Klasse/Schuljahr). Async DbPort.

async function getAlle(db, klasseId, schuljahrId) {
  return db.select(`
      SELECT
        a.id, a.monat, a.titel, a.beschreibung, a.rechtsbezug, a.kategorie, a.sortierung, a.parent_id,
        s.id AS status_id, s.erledigt_am, s.notiz
      FROM kv_jahresaufgaben a
      LEFT JOIN kv_jahresaufgaben_status s
        ON s.aufgabe_id = a.id AND s.klasse_id = ? AND s.schuljahr_id = ?
      ORDER BY a.monat, a.sortierung, a.id
    `, [klasseId, schuljahrId])
}

async function createTemplate(db, data) {
  let monat = data.monat
  if (data.parentId) {
    const parent = await db.selectOne('SELECT monat FROM kv_jahresaufgaben WHERE id = ?', [data.parentId])
    if (parent) monat = parent.monat
  }
  const maxSort = data.parentId
    ? (await db.selectOne('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_jahresaufgaben WHERE parent_id = ?', [data.parentId])).m
    : (await db.selectOne('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_jahresaufgaben WHERE monat = ? AND parent_id IS NULL', [monat])).m
  const info = await db.execute(`
      INSERT INTO kv_jahresaufgaben (monat, titel, beschreibung, rechtsbezug, kategorie, sortierung, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [monat, data.titel, data.beschreibung ?? null, data.rechtsbezug ?? null, data.kategorie ?? null, maxSort + 1, data.parentId ?? null])
  return info.lastInsertRowid
}

async function updateTemplate(db, id, data) {
  await db.execute(`
      UPDATE kv_jahresaufgaben
      SET monat = ?, titel = ?, beschreibung = ?, rechtsbezug = ?, kategorie = ?
      WHERE id = ?
    `, [data.monat, data.titel, data.beschreibung ?? null, data.rechtsbezug ?? null, data.kategorie ?? null, id])
  return true
}

async function deleteTemplate(db, id) {
  // Status-Einträge kaskadieren via ON DELETE CASCADE weg
  await db.execute('DELETE FROM kv_jahresaufgaben WHERE id = ?', [id])
  return true
}

async function setStatus(db, aufgabeId, klasseId, schuljahrId, erledigtAm, notiz) {
  if (aufgabeId == null || klasseId == null || schuljahrId == null) {
    throw new Error(`kv:jahresaufgaben:setStatus – fehlende ID (aufgabeId=${aufgabeId}, klasseId=${klasseId}, schuljahrId=${schuljahrId})`)
  }
  await db.execute(`
      INSERT INTO kv_jahresaufgaben_status (aufgabe_id, schuljahr_id, klasse_id, erledigt_am, notiz)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(aufgabe_id, schuljahr_id, klasse_id) DO UPDATE SET
        erledigt_am = excluded.erledigt_am,
        notiz       = excluded.notiz
    `, [aufgabeId, schuljahrId, klasseId, erledigtAm ?? null, notiz ?? null])
  return true
}

module.exports = { getAlle, createTemplate, updateTemplate, deleteTemplate, setStatus }
