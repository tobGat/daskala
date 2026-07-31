// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne KV: Trigger (Warnhinweise). db injiziert; deps = { erzeugeTrigger }.

function getAlle(db, klasseId, opts = {}) {
  const { archiviert = 0, schweregrad } = opts
  // Spalten mit t. qualifizieren – kv_trigger UND schueler haben je eine Spalte klasse_id.
  const wheres = ['t.klasse_id = ?', 't.archiviert = ?']
  const params = [klasseId, archiviert ? 1 : 0]
  if (schweregrad) { wheres.push('t.schweregrad = ?'); params.push(schweregrad) }
  return db.prepare(`
      SELECT t.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_trigger t
      LEFT JOIN schueler s ON s.id = t.schueler_id
      WHERE ${wheres.join(' AND ')}
      ORDER BY
        CASE t.schweregrad WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
        t.erstellt_am DESC
    `).all(...params)
}

function getAlleFuerSchueler(db, schuelerId) {
  return db.prepare('SELECT * FROM kv_trigger WHERE schueler_id = ? ORDER BY erstellt_am DESC').all(schuelerId)
}

function reagieren(db, id, reaktion) {
  db.prepare(`
      UPDATE kv_trigger
      SET reagiert_am = datetime('now','localtime'), reaktion = ?, archiviert = 1
      WHERE id = ?
    `).run(reaktion ?? null, id)
  return true
}

function create(db, deps, { klasseId, schuelerId, typ, schweregrad, ausloeser, beschreibung }) {
  return deps.erzeugeTrigger(klasseId, schuelerId ?? null, typ, schweregrad ?? 'info', ausloeser ?? null, beschreibung ?? null)
}

function remove(db, id) {
  db.prepare('DELETE FROM kv_trigger WHERE id = ?').run(id)
  return true
}

module.exports = { getAlle, getAlleFuerSchueler, reagieren, create, remove }
