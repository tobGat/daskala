// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Fächer. Async DbPort.
// deps = { raeumeFachDatenAuf, materialRoot, verschiebeDir, sanitizeSegment,
// berechneAlleFuerFach, rosterIdsFuerFach, initKompetenzVorlagen }.

const path = require('path')
const { neueUuid } = require('../db/uuid')

async function getAll(db, klasseId) {
  return db.select('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name', [klasseId])
}

// Alle Fächer echter Klassen eines Schuljahrs (für den Ziel-Picker beim Anwenden von Vorlagen).
async function getAllImSchuljahr(db, schuljahrId) {
  return db.select(`
      SELECT f.id, f.name, f.farbe, f.klasse_id,
             k.name AS klasse_name, k.farbe AS klasse_farbe, k.reihenfolge AS klasse_reihenfolge
      FROM faecher f JOIN klassen k ON k.id = f.klasse_id
      WHERE k.schuljahr_id = ? AND k.ist_vorlage = 0
      ORDER BY k.reihenfolge, k.name, f.reihenfolge, f.name
    `, [schuljahrId])
}

async function create(db, deps, { klasseId, name, farbe, benotungssystem, alleSchueler = 1, schuelerIds = [] }) {
  const maxReihenfolge = (await db.selectOne('SELECT MAX(reihenfolge) as m FROM faecher WHERE klasse_id = ?', [klasseId]))?.m ?? 0
  const info = await db.execute('INSERT INTO faecher (klasse_id, name, farbe, reihenfolge, benotungssystem, alle_schueler, uuid) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [klasseId, name, farbe ?? null, maxReihenfolge + 1, benotungssystem ?? 'standard', alleSchueler ? 1 : 0, neueUuid()])
  const fachId = info.lastInsertRowid
  // Manuelle Teilmenge: gewählte Schüler:innen als Fach-Mitglieder eintragen
  if (!alleSchueler && schuelerIds.length) {
    for (const sid of schuelerIds) await db.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fachId, sid])
  }
  // Bei differenziert: Default-Niveau für die Roster-Schüler:innen (NACH fach_schueler-Insert)
  if (benotungssystem === 'differenziert') {
    for (const sid of await deps.rosterIdsFuerFach(fachId)) await db.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fachId, sid, 'AHS'])
  }
  // Kompetenz-Vorlagen automatisch anlegen
  await deps.initKompetenzVorlagen(fachId, name)
  return fachId
}

async function remove(db, deps, id) {
  // Zuerst alle Nicht-CASCADE-Kinddaten abräumen (foreign_keys=ON), atomar.
  await db.transaction(async (tx) => {
    await deps.raeumeFachDatenAuf([id])
    await tx.execute('DELETE FROM faecher WHERE id = ?', [id])
  })
  return true
}

async function rename(db, deps, id, name) {
  const root = await deps.materialRoot()
  const alt = root ? await db.selectOne('SELECT f.name AS fn, k.name AS kn, s.bezeichnung AS sb FROM faecher f JOIN klassen k ON f.klasse_id=k.id JOIN schuljahre s ON k.schuljahr_id=s.id WHERE f.id=?', [id]) : null
  await db.execute('UPDATE faecher SET name = ? WHERE id = ?', [name, id])
  let ordnerWarnung = null
  if (alt) ordnerWarnung = await deps.verschiebeDir(
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(alt.kn), deps.sanitizeSegment(alt.fn)),
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(alt.kn), deps.sanitizeSegment(name)))
  return { ok: true, ordnerWarnung }
}

async function setFarbe(db, id, farbe) {
  await db.execute('UPDATE faecher SET farbe = ? WHERE id = ?', [farbe ?? null, id])
  return true
}

async function updateGewichtung(db, deps, id, data) {
  // Nur SA/Test/Individuell gewichten die Note; MA & HÜ wirken als Einfluss (eigene Deckelung).
  await db.execute(`
      UPDATE faecher SET
        gewichtung_sa = ?,
        gewichtung_t = ?,
        gewichtung_ma = NULL,
        gewichtung_hue = NULL,
        gewichtung_custom = ?,
        ma_hue_max_einfluss = NULL,
        ma_max_einfluss = ?,
        hue_max_einfluss = ?
      WHERE id = ?
    `, [data.sa ?? null, data.t ?? null, data.custom ?? null, data.maEinfluss ?? null, data.hueEinfluss ?? null, id])
  await deps.berechneAlleFuerFach(id)
  return true
}

async function resetGewichtung(db, deps, id) {
  await db.execute('UPDATE faecher SET gewichtung_sa = NULL, gewichtung_t = NULL, gewichtung_ma = NULL, gewichtung_hue = NULL, gewichtung_custom = NULL, ma_hue_max_einfluss = NULL, ma_max_einfluss = NULL, hue_max_einfluss = NULL WHERE id = ?', [id])
  await deps.berechneAlleFuerFach(id)
  return true
}

async function setBenotungssystem(db, deps, id, system) {
  await db.execute('UPDATE faecher SET benotungssystem = ? WHERE id = ?', [system, id])
  if (system === 'differenziert') {
    // Default-Niveau 'AHS' für alle Schüler:innen + Initial-Historien-Eintrag
    const fach = await db.selectOne('SELECT klasse_id FROM faecher WHERE id = ?', [id])
    if (fach) {
      const schuelerIds = (await deps.rosterIdsFuerFach(id)).map((x) => ({ id: x }))
      for (const s of schuelerIds) {
        await db.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [id, s.id, 'AHS'])
        await db.execute(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?
          )
        `, [id, s.id, 'AHS', '1900-01-01', id, s.id])
      }
    }
  }
  await deps.berechneAlleFuerFach(id)
  return true
}

// Aktuelle Fach-Zuordnung (ids). Bei alle_schueler=1 automatisch alle aktiven Klassen-Schüler:innen.
async function getSchuelerIds(db, deps, fachId) {
  return deps.rosterIdsFuerFach(fachId)
}

// Fach-Zuordnung setzen: alle = true → alle Klassen-Schüler:innen; sonst manuelle Teilmenge.
async function setSchueler(db, deps, fachId, { alle, schuelerIds = [] }) {
  const fach = await db.selectOne('SELECT benotungssystem FROM faecher WHERE id = ?', [fachId])
  if (!fach) return false
  await db.transaction(async (tx) => {
    await tx.execute('UPDATE faecher SET alle_schueler = ? WHERE id = ?', [alle ? 1 : 0, fachId])
    await tx.execute('DELETE FROM fach_schueler WHERE fach_id = ?', [fachId])   // immer neu aufbauen
    if (!alle) {
      for (const sid of schuelerIds) await tx.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fachId, sid])
    }
    // Differenziert: neu ins Roster gekommene Schüler:innen brauchen Niveau-Default + Historie
    if (fach.benotungssystem === 'differenziert') {
      for (const sid of await deps.rosterIdsFuerFach(fachId)) {
        await tx.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fachId, sid, 'AHS'])
        await tx.execute(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, ?, '1900-01-01'
          WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
        `, [fachId, sid, 'AHS', fachId, sid])
      }
    }
  })
  await deps.berechneAlleFuerFach(fachId)   // Roster geändert → Zeugnisnoten neu berechnen
  return true
}

module.exports = {
  getAll, getAllImSchuljahr, create, remove, rename, setFarbe,
  updateGewichtung, resetGewichtung, setBenotungssystem, getSchuelerIds, setSchueler,
}
