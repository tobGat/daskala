// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Termine. Plattformunabhängig, ohne electron; db wird injiziert.

function getAll(db, schuljahrId) {
  return db.prepare(`
      SELECT t.*, k.name as klasse_name
      FROM termine t
      LEFT JOIN klassen k ON k.id = t.klasse_id
      WHERE t.schuljahr_id = ?
      ORDER BY t.datum, t.uhrzeit
    `).all(schuljahrId)
}

function create(db, { titel, datum, uhrzeit, bisUhrzeit, notiz, klasseId, schuljahrId, stundeId }) {
  const info = db.prepare(
    'INSERT INTO termine (titel, datum, uhrzeit, bis_uhrzeit, notiz, klasse_id, schuljahr_id, stunde_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(titel, datum, uhrzeit ?? null, bisUhrzeit ?? null, notiz ?? null, klasseId ?? null, schuljahrId, stundeId ?? null)
  return info.lastInsertRowid
}

function update(db, id, { titel, datum, uhrzeit, bisUhrzeit, notiz, klasseId, stundeId }) {
  db.prepare('UPDATE termine SET titel = ?, datum = ?, uhrzeit = ?, bis_uhrzeit = ?, notiz = ?, klasse_id = ?, stunde_id = ? WHERE id = ?')
    .run(titel, datum, uhrzeit ?? null, bisUhrzeit ?? null, notiz ?? null, klasseId ?? null, stundeId ?? null, id)
  return true
}

function remove(db, id) {
  db.prepare('DELETE FROM termine WHERE id = ?').run(id)
  return true
}

module.exports = { getAll, create, update, remove }
