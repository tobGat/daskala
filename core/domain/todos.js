// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Todos. Plattformunabhängig, ohne electron; db wird injiziert.

function getAll(db, schuljahrId) {
  return db.prepare(`
      SELECT t.*, k.name as klasse_name, f.name as fach_name
      FROM todos t
      LEFT JOIN klassen k ON k.id = t.klasse_id
      LEFT JOIN faecher f ON f.id = t.fach_id
      WHERE t.klasse_id IS NULL OR k.schuljahr_id = ?
      ORDER BY t.erledigt, t.reihenfolge, t.id
    `).all(schuljahrId)
}

function create(db, { titel, klasseId, fachId, faelligkeit, erinnerung }) {
  console.log('[main] todos:create:', { titel, faelligkeit, erinnerung })
  const maxReihenfolge = klasseId
    ? db.prepare('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id = ?').get(klasseId)?.m ?? 0
    : db.prepare('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id IS NULL').get()?.m ?? 0
  const info = db.prepare(
    'INSERT INTO todos (titel, klasse_id, fach_id, faelligkeit, erinnerung, reihenfolge) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(titel, klasseId ?? null, fachId ?? null, faelligkeit ?? null, erinnerung ?? null, maxReihenfolge + 1)
  return info.lastInsertRowid
}

function update(db, id, { titel, klasseId, fachId, faelligkeit, erinnerung }) {
  db.prepare('UPDATE todos SET titel = ?, klasse_id = ?, fach_id = ?, faelligkeit = ?, erinnerung = ? WHERE id = ?')
    .run(titel, klasseId ?? null, fachId ?? null, faelligkeit ?? null, erinnerung ?? null, id)
  return true
}

function remove(db, id) {
  db.prepare('DELETE FROM todos WHERE id = ?').run(id)
  return true
}

function toggleErledigt(db, id) {
  db.prepare('UPDATE todos SET erledigt = CASE WHEN erledigt = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id)
  return true
}

module.exports = { getAll, create, update, remove, toggleErledigt }
