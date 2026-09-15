// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Zentrale Notizen mit Ordnern („Notizbuch"), pro Schuljahr. Electron-frei; nutzt den async DbPort.
// Datenmodell: eigene Ordner in `notiz_ordner`; Notizen in `notiz_eintraege`. Eine Notiz liegt in genau
// einem Ort: klasse_id gesetzt (virtueller Klassen-Ordner) ODER ordner_id gesetzt (eigener Ordner) ODER
// beide NULL („Allgemein"). Nicht zu verwechseln mit `core/domain/notizen.js` (Textblob je Schüler:in×Fach).

// ─── Ordner ──────────────────────────────────────────────────────────────────
async function ordnerGetAll(db, schuljahrId) {
  return db.select('SELECT * FROM notiz_ordner WHERE schuljahr_id = ? ORDER BY reihenfolge, id', [schuljahrId])
}

async function ordnerCreate(db, { schuljahrId, name, farbe }) {
  const max = (await db.selectOne('SELECT MAX(reihenfolge) AS m FROM notiz_ordner WHERE schuljahr_id = ?', [schuljahrId]))?.m ?? 0
  const info = await db.execute(
    'INSERT INTO notiz_ordner (schuljahr_id, name, farbe, reihenfolge) VALUES (?, ?, ?, ?)',
    [schuljahrId, name, farbe ?? null, max + 1])
  return info.lastInsertRowid
}

async function ordnerUpdate(db, id, { name, farbe }) {
  await db.execute('UPDATE notiz_ordner SET name = ?, farbe = ? WHERE id = ?', [name, farbe ?? null, id])
  return true
}

async function ordnerRemove(db, id) {
  // ON DELETE CASCADE räumt die Notizen dieses Ordners mit ab.
  await db.execute('DELETE FROM notiz_ordner WHERE id = ?', [id])
  return true
}

// ─── Notizen ─────────────────────────────────────────────────────────────────
async function notizGetAll(db, schuljahrId) {
  return db.select(
    'SELECT * FROM notiz_eintraege WHERE schuljahr_id = ? ORDER BY aktualisiert_am DESC, id DESC',
    [schuljahrId])
}

async function notizCreate(db, { schuljahrId, klasseId, ordnerId, titel, text }) {
  const info = await db.execute(
    'INSERT INTO notiz_eintraege (schuljahr_id, klasse_id, ordner_id, titel, text) VALUES (?, ?, ?, ?, ?)',
    [schuljahrId, klasseId ?? null, ordnerId ?? null, titel ?? null, text ?? ''])
  return info.lastInsertRowid
}

// Deckt auch das Verschieben zwischen Ordnern ab (klasse_id/ordner_id werden mitgesetzt).
async function notizUpdate(db, id, { titel, text, klasseId, ordnerId }) {
  await db.execute(
    `UPDATE notiz_eintraege
       SET titel = ?, text = ?, klasse_id = ?, ordner_id = ?, aktualisiert_am = datetime('now')
     WHERE id = ?`,
    [titel ?? null, text ?? '', klasseId ?? null, ordnerId ?? null, id])
  return true
}

async function notizRemove(db, id) {
  await db.execute('DELETE FROM notiz_eintraege WHERE id = ?', [id])
  return true
}

module.exports = {
  ordnerGetAll, ordnerCreate, ordnerUpdate, ordnerRemove,
  notizGetAll, notizCreate, notizUpdate, notizRemove,
}
