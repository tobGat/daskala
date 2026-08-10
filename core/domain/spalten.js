// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Spalten (Bewertungsspalten je Fach). Async DbPort;
// deps = { pushUndo } (nur für update). delete protokolliert inline in den Verlauf.

async function getAll(db, fachId) {
  return db.select('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge, datum', [fachId])
}

async function create(db, data) {
  const maxReihenfolge = (await db.selectOne('SELECT MAX(reihenfolge) as m FROM spalten WHERE fach_id = ? AND semester = ?', [data.fachId, data.semester]))?.m ?? 0
  const info = await db.execute(`
      INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge, notiz, ma_stufen, ma_symbol)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.fachId, data.semester, data.kategorie, data.kuerzel, data.datum, maxReihenfolge + 1, data.notiz ?? null, data.maStufen === 4 ? 4 : 2, data.maSymbol === 'pfeil' ? 'pfeil' : 'pm'])
  return info.lastInsertRowid
}

async function remove(db, id) {
  const betroffene = await db.select('SELECT spalte_id, schueler_id, wert, kommentar FROM eintraege WHERE spalte_id = ?', [id])
  if (betroffene.length > 0) {
    const spalte = await db.selectOne('SELECT fach_id FROM spalten WHERE id = ?', [id])
    await db.transaction(async (tx) => {
      for (const e of betroffene) {
        await tx.execute(`
        INSERT INTO eintraege_verlauf (fach_id, spalte_id, schueler_id, wert_alt, wert_neu, kommentar_alt, kommentar_neu, aktion)
        VALUES (?, ?, ?, ?, NULL, ?, NULL, 'spalte_geloescht')
      `, [spalte?.fach_id ?? null, e.spalte_id, e.schueler_id, e.wert, e.kommentar])
      }
    })
  }
  await db.execute('DELETE FROM eintraege WHERE spalte_id = ?', [id])
  await db.execute('DELETE FROM spalten WHERE id = ?', [id])
  return true
}

async function update(db, deps, id, data) {
  const old = await db.selectOne('SELECT kuerzel, datum, notiz FROM spalten WHERE id = ?', [id])
  await db.execute('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?', [data.kuerzel, data.datum, data.notiz ?? null, id])
  if (old) deps.pushUndo({
    description: 'Spalte umbenennen',
    undo: () => db.execute('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?', [old.kuerzel, old.datum, old.notiz, id]),
    redo: () => db.execute('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?', [data.kuerzel, data.datum, data.notiz ?? null, id]),
  })
  return true
}

async function toggleEingeklappt(db, id) {
  await db.execute('UPDATE spalten SET eingeklappt = CASE WHEN eingeklappt = 0 THEN 1 ELSE 0 END WHERE id = ?', [id])
  return true
}

async function setEingeklappt(db, ids, wert) {
  await db.transaction(async (tx) => {
    for (const id of ids) await tx.execute('UPDATE spalten SET eingeklappt = ? WHERE id = ?', [wert ? 1 : 0, id])
  })
  return true
}

async function sortByKategorie(db, fachId, semester) {
  const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ? AND semester = ? ORDER BY kategorie, datum', [fachId, semester])
  await db.transaction(async (tx) => {
    let i = 0
    for (const s of spalten) await tx.execute('UPDATE spalten SET reihenfolge = ? WHERE id = ?', [++i, s.id])
  })
  return true
}

// Spalten wieder chronologisch (nach Datum) sortieren; Spalten ohne Datum ans Ende.
async function sortChronologisch(db, fachId, semester) {
  const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ? AND semester = ? ORDER BY datum IS NULL, datum, id', [fachId, semester])
  await db.transaction(async (tx) => {
    let i = 0
    for (const s of spalten) await tx.execute('UPDATE spalten SET reihenfolge = ? WHERE id = ?', [++i, s.id])
  })
  return true
}

module.exports = { getAll, create, remove, update, toggleEingeklappt, setEingeklappt, sortByKategorie, sortChronologisch }
