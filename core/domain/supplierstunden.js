// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Supplierstunden. Async DbPort; keine weiteren Abhängigkeiten.

async function getWoche(db, wocheDatum) {
  return db.select('SELECT * FROM supplierstunden WHERE woche_datum = ?', [wocheDatum])
}

async function create(db, { wocheDatum, wochentag, stundeId, klasseText, fachText, notiz }) {
  const info = await db.execute(
    'INSERT INTO supplierstunden (woche_datum, wochentag, stunde_id, klasse_text, fach_text, notiz) VALUES (?, ?, ?, ?, ?, ?)',
    [wocheDatum, wochentag, stundeId, klasseText, fachText, notiz ?? null]
  )
  return info.lastInsertRowid
}

async function remove(db, id) {
  await db.execute('DELETE FROM supplierstunden WHERE id = ?', [id])
  return true
}

async function update(db, id, { fachText, klasseText, notiz, titel, inhalt, hueText, hueFristDatum, link }) {
  await db.execute(`
      UPDATE supplierstunden
      SET fach_text = ?, klasse_text = ?, notiz = ?, titel = ?, inhalt = ?, hue_text = ?, hue_frist_datum = ?, link = ?
      WHERE id = ?
    `, [fachText ?? '', klasseText ?? '', notiz ?? null, titel ?? null, inhalt ?? null, hueText ?? null, hueFristDatum ?? null, link ?? null, id])
  return true
}

module.exports = { getWoche, create, remove, update }
