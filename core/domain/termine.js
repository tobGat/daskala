// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Termine. Plattformunabhängig; spricht den async DbPort an.

async function getAll(db, schuljahrId) {
  return db.select(`
      SELECT t.*, k.name as klasse_name
      FROM termine t
      LEFT JOIN klassen k ON k.id = t.klasse_id
      WHERE t.schuljahr_id = ?
      ORDER BY t.datum, t.uhrzeit
    `, [schuljahrId])
}

async function create(db, { titel, datum, uhrzeit, bisUhrzeit, notiz, klasseId, schuljahrId, stundeId, ganztags, bisDatum }) {
  const info = await db.execute(
    'INSERT INTO termine (titel, datum, uhrzeit, bis_uhrzeit, notiz, klasse_id, schuljahr_id, stunde_id, ganztags, bis_datum) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [titel, datum, uhrzeit ?? null, bisUhrzeit ?? null, notiz ?? null, klasseId ?? null, schuljahrId, stundeId ?? null, ganztags ? 1 : 0, bisDatum ?? null]
  )
  return info.lastInsertRowid
}

async function update(db, id, { titel, datum, uhrzeit, bisUhrzeit, notiz, klasseId, stundeId, ganztags, bisDatum }) {
  await db.execute('UPDATE termine SET titel = ?, datum = ?, uhrzeit = ?, bis_uhrzeit = ?, notiz = ?, klasse_id = ?, stunde_id = ?, ganztags = ?, bis_datum = ? WHERE id = ?',
    [titel, datum, uhrzeit ?? null, bisUhrzeit ?? null, notiz ?? null, klasseId ?? null, stundeId ?? null, ganztags ? 1 : 0, bisDatum ?? null, id])
  return true
}

async function remove(db, id) {
  await db.execute('DELETE FROM termine WHERE id = ?', [id])
  return true
}

module.exports = { getAll, create, update, remove }
