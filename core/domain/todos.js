// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Todos. Plattformunabhängig; spricht den async DbPort an.

async function getAll(db, schuljahrId) {
  return db.select(`
      SELECT t.*, k.name as klasse_name, f.name as fach_name
      FROM todos t
      LEFT JOIN klassen k ON k.id = t.klasse_id
      LEFT JOIN faecher f ON f.id = t.fach_id
      WHERE t.klasse_id IS NULL OR k.schuljahr_id = ?
      ORDER BY t.erledigt, t.reihenfolge, t.id
    `, [schuljahrId])
}

async function create(db, { titel, klasseId, fachId, faelligkeit, erinnerung }) {
  const maxReihenfolge = klasseId
    ? (await db.selectOne('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id = ?', [klasseId]))?.m ?? 0
    : (await db.selectOne('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id IS NULL'))?.m ?? 0
  const info = await db.execute(
    'INSERT INTO todos (titel, klasse_id, fach_id, faelligkeit, erinnerung, reihenfolge) VALUES (?, ?, ?, ?, ?, ?)',
    [titel, klasseId ?? null, fachId ?? null, faelligkeit ?? null, erinnerung ?? null, maxReihenfolge + 1]
  )
  return info.lastInsertRowid
}

async function update(db, id, { titel, klasseId, fachId, faelligkeit, erinnerung }) {
  await db.execute('UPDATE todos SET titel = ?, klasse_id = ?, fach_id = ?, faelligkeit = ?, erinnerung = ? WHERE id = ?',
    [titel, klasseId ?? null, fachId ?? null, faelligkeit ?? null, erinnerung ?? null, id])
  return true
}

async function remove(db, id) {
  await db.execute('DELETE FROM todos WHERE id = ?', [id])
  return true
}

async function toggleErledigt(db, id) {
  await db.execute('UPDATE todos SET erledigt = CASE WHEN erledigt = 0 THEN 1 ELSE 0 END WHERE id = ?', [id])
  return true
}

module.exports = { getAll, create, update, remove, toggleErledigt }
