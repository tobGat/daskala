// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Stundenplan. Async DbPort; keine weiteren Abhängigkeiten.

async function getAll(db) {
  return db.select(`
      SELECT sp.*, sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name, k.name AS klasse_name,
             k.id AS klasse_id, k.teams_link AS klasse_teams_link
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sp.stunde_id = sz.id
      JOIN faecher f ON sp.fach_id = f.id
      JOIN klassen k ON f.klasse_id = k.id
      ORDER BY sp.wochentag, sz.stunde
    `)
}

async function create(db, data) {
  const iv = Math.max(1, parseInt(data.wochenIntervall) || 1)
  const anker = iv > 1 ? (data.ankerDatum ?? null) : null
  const info = await db.execute('INSERT INTO stundenplan (wochentag, stunde_id, fach_id, wochen_intervall, anker_datum) VALUES (?, ?, ?, ?, ?)',
    [data.wochentag, data.stundeId, data.fachId, iv, anker])
  return info.lastInsertRowid
}

async function remove(db, id) {
  await db.execute('DELETE FROM stundenplan WHERE id = ?', [id])
  return true
}

async function update(db, id, data) {
  if (data.wochenIntervall !== undefined) {
    const iv = Math.max(1, parseInt(data.wochenIntervall) || 1)
    const anker = iv > 1 ? (data.ankerDatum ?? null) : null
    await db.execute('UPDATE stundenplan SET fach_id = ?, wochen_intervall = ?, anker_datum = ? WHERE id = ?', [data.fachId, iv, anker, id])
  } else {
    await db.execute('UPDATE stundenplan SET fach_id = ? WHERE id = ?', [data.fachId, id])
  }
  return true
}

// Stunde per Drag & Drop in einen anderen Slot verschieben. Die id bleibt erhalten,
// damit die Wochen-Planung (stunden_planung, per stundenplan_id) mitwandert.
// Ist der Ziel-Slot belegt, werden die beiden Stunden getauscht (transaktional).
async function verschieben(db, id, wochentag, stundeId) {
  const eintrag = await db.selectOne('SELECT wochentag, stunde_id FROM stundenplan WHERE id = ?', [id])
  if (!eintrag) return false
  if (eintrag.wochentag === wochentag && eintrag.stunde_id === stundeId) return true
  const belegt = await db.selectOne('SELECT id FROM stundenplan WHERE wochentag = ? AND stunde_id = ? AND id != ?', [wochentag, stundeId, id])
  await db.transaction(async (tx) => {
    if (belegt) await tx.execute('UPDATE stundenplan SET wochentag = ?, stunde_id = ? WHERE id = ?', [eintrag.wochentag, eintrag.stunde_id, belegt.id]) // Tausch: Ziel-Eintrag auf Quell-Slot
    await tx.execute('UPDATE stundenplan SET wochentag = ?, stunde_id = ? WHERE id = ?', [wochentag, stundeId, id])
  })
  return true
}

async function getByKlasse(db, klasseId) {
  return db.select(`
      SELECT sp.id, sp.wochentag, sp.stunde_id, sp.fach_id,
             sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name,
             k.name AS klasse_name, k.id AS klasse_id, k.teams_link AS klasse_teams_link
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sz.id = sp.stunde_id
      JOIN faecher f ON f.id = sp.fach_id
      JOIN klassen k ON k.id = f.klasse_id
      WHERE k.id = ?
      ORDER BY sp.wochentag, sz.stunde
    `, [klasseId])
}

async function getParallelFach(db, aktuelleKlasseId, fachName) {
  // Parallelklassen-Fächer finden (gleicher Name, andere Klasse, selbes Schuljahr)
  const parallelFaecher = await db.select(`
      SELECT f.id AS fach_id, f.name AS fach_name,
             k.id AS klasse_id, k.name AS klasse_name, k.teams_link AS klasse_teams_link
      FROM faecher f
      JOIN klassen k ON f.klasse_id = k.id
      WHERE f.name = ?
        AND k.schuljahr_id = (SELECT schuljahr_id FROM klassen WHERE id = ?)
        AND k.id != ?
      ORDER BY k.name
    `, [fachName, aktuelleKlasseId, aktuelleKlasseId])

  // Für jedes parallele Fach die Stundenplan-Slots laden
  const out = []
  for (const pf of parallelFaecher) {
    const slots = await db.select(`
      SELECT sp.id, sp.wochentag, sp.stunde_id, sp.fach_id,
             sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name,
             k.name AS klasse_name, k.id AS klasse_id, k.teams_link AS klasse_teams_link
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sz.id = sp.stunde_id
      JOIN faecher f ON f.id = sp.fach_id
      JOIN klassen k ON k.id = f.klasse_id
      WHERE f.id = ?
      ORDER BY sp.wochentag, sz.stunde
    `, [pf.fach_id])
    out.push({ ...pf, slots })
  }
  return out
}

module.exports = { getAll, create, remove, update, verschieben, getByKlasse, getParallelFach }
