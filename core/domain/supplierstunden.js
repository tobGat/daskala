// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Supplierstunden. db injiziert; keine weiteren Abhängigkeiten.

function getWoche(db, wocheDatum) {
  return db.prepare('SELECT * FROM supplierstunden WHERE woche_datum = ?').all(wocheDatum)
}

function create(db, { wocheDatum, wochentag, stundeId, klasseText, fachText, notiz }) {
  const info = db.prepare(
    'INSERT INTO supplierstunden (woche_datum, wochentag, stunde_id, klasse_text, fach_text, notiz) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(wocheDatum, wochentag, stundeId, klasseText, fachText, notiz ?? null)
  return info.lastInsertRowid
}

function remove(db, id) {
  db.prepare('DELETE FROM supplierstunden WHERE id = ?').run(id)
  return true
}

function update(db, id, { fachText, klasseText, notiz, titel, inhalt, hueText, hueFristDatum, link }) {
  db.prepare(`
      UPDATE supplierstunden
      SET fach_text = ?, klasse_text = ?, notiz = ?, titel = ?, inhalt = ?, hue_text = ?, hue_frist_datum = ?, link = ?
      WHERE id = ?
    `).run(fachText ?? '', klasseText ?? '', notiz ?? null, titel ?? null, inhalt ?? null, hueText ?? null, hueFristDatum ?? null, link ?? null, id)
  return true
}

module.exports = { getWoche, create, remove, update }
