// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: Wochenaufgaben (Templates + Status je KW/Klasse). db injiziert.

function getAlle(db) {
  return db.prepare('SELECT * FROM kv_wochenaufgaben WHERE aktiv = 1 ORDER BY sortierung, id').all()
}

function createTemplate(db, data) {
  const maxSort = db.prepare('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_wochenaufgaben').get().m
  const info = db.prepare(`
      INSERT INTO kv_wochenaufgaben (titel, rechtsbezug, sortierung, aktiv)
      VALUES (?, ?, ?, 1)
    `).run(data.titel, data.rechtsbezug ?? null, maxSort + 1)
  return info.lastInsertRowid
}

function updateTemplate(db, id, data) {
  db.prepare(`
      UPDATE kv_wochenaufgaben SET titel = ?, rechtsbezug = ? WHERE id = ?
    `).run(data.titel, data.rechtsbezug ?? null, id)
  return true
}

function deleteTemplate(db, id) {
  db.prepare('DELETE FROM kv_wochenaufgaben WHERE id = ?').run(id)
  return true
}

// Status für mehrere Wochen (für die Tabellen-Ansicht). wochen: Array von { kw, jahr }
function getStatusFuerWochen(db, klasseId, schuljahrId, wochen) {
  if (!Array.isArray(wochen) || wochen.length === 0) return []
  const conditions = wochen.map(() => '(kalenderwoche = ? AND jahr = ?)').join(' OR ')
  const params = [klasseId, schuljahrId, ...wochen.flatMap((w) => [w.kw, w.jahr])]
  return db.prepare(`
      SELECT * FROM kv_wochenaufgaben_status
      WHERE klasse_id = ? AND schuljahr_id = ? AND (${conditions})
    `).all(...params)
}

function setStatus(db, aufgabeId, klasseId, schuljahrId, kw, jahr, erledigtAm, notiz) {
  db.prepare(`
      INSERT INTO kv_wochenaufgaben_status (aufgabe_id, schuljahr_id, klasse_id, kalenderwoche, jahr, erledigt_am, notiz)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(aufgabe_id, klasse_id, kalenderwoche, jahr) DO UPDATE SET
        erledigt_am = excluded.erledigt_am,
        notiz       = excluded.notiz
    `).run(aufgabeId, schuljahrId, klasseId, kw, jahr, erledigtAm ?? null, notiz ?? null)
  return true
}

module.exports = { getAlle, createTemplate, updateTemplate, deleteTemplate, getStatusFuerWochen, setStatus }
