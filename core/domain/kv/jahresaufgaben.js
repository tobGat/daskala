// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: Jahresaufgaben (Templates + Status je Klasse/Schuljahr). db injiziert.

function getAlle(db, klasseId, schuljahrId) {
  return db.prepare(`
      SELECT
        a.id, a.monat, a.titel, a.beschreibung, a.rechtsbezug, a.kategorie, a.sortierung, a.parent_id,
        s.id AS status_id, s.erledigt_am, s.notiz
      FROM kv_jahresaufgaben a
      LEFT JOIN kv_jahresaufgaben_status s
        ON s.aufgabe_id = a.id AND s.klasse_id = ? AND s.schuljahr_id = ?
      ORDER BY a.monat, a.sortierung, a.id
    `).all(klasseId, schuljahrId)
}

function createTemplate(db, data) {
  let monat = data.monat
  if (data.parentId) {
    const parent = db.prepare('SELECT monat FROM kv_jahresaufgaben WHERE id = ?').get(data.parentId)
    if (parent) monat = parent.monat
  }
  const maxSort = data.parentId
    ? db.prepare('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_jahresaufgaben WHERE parent_id = ?').get(data.parentId).m
    : db.prepare('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_jahresaufgaben WHERE monat = ? AND parent_id IS NULL').get(monat).m
  const info = db.prepare(`
      INSERT INTO kv_jahresaufgaben (monat, titel, beschreibung, rechtsbezug, kategorie, sortierung, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(monat, data.titel, data.beschreibung ?? null, data.rechtsbezug ?? null, data.kategorie ?? null, maxSort + 1, data.parentId ?? null)
  return info.lastInsertRowid
}

function updateTemplate(db, id, data) {
  db.prepare(`
      UPDATE kv_jahresaufgaben
      SET monat = ?, titel = ?, beschreibung = ?, rechtsbezug = ?, kategorie = ?
      WHERE id = ?
    `).run(data.monat, data.titel, data.beschreibung ?? null, data.rechtsbezug ?? null, data.kategorie ?? null, id)
  return true
}

function deleteTemplate(db, id) {
  // Status-Einträge kaskadieren via ON DELETE CASCADE weg
  db.prepare('DELETE FROM kv_jahresaufgaben WHERE id = ?').run(id)
  return true
}

function setStatus(db, aufgabeId, klasseId, schuljahrId, erledigtAm, notiz) {
  if (aufgabeId == null || klasseId == null || schuljahrId == null) {
    throw new Error(`kv:jahresaufgaben:setStatus – fehlende ID (aufgabeId=${aufgabeId}, klasseId=${klasseId}, schuljahrId=${schuljahrId})`)
  }
  db.prepare(`
      INSERT INTO kv_jahresaufgaben_status (aufgabe_id, schuljahr_id, klasse_id, erledigt_am, notiz)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(aufgabe_id, schuljahr_id, klasse_id) DO UPDATE SET
        erledigt_am = excluded.erledigt_am,
        notiz       = excluded.notiz
    `).run(aufgabeId, schuljahrId, klasseId, erledigtAm ?? null, notiz ?? null)
  return true
}

module.exports = { getAlle, createTemplate, updateTemplate, deleteTemplate, setStatus }
