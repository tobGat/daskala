// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Fächer. Plattformunabhängig, ohne electron.
// db injiziert; deps = { raeumeFachDatenAuf, materialRoot, verschiebeDir,
// sanitizeSegment, berechneAlleFuerFach, rosterIdsFuerFach, initKompetenzVorlagen }.

const path = require('path')

function getAll(db, klasseId) {
  return db.prepare('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name').all(klasseId)
}

// Alle Fächer echter Klassen eines Schuljahrs (für den Ziel-Picker beim Anwenden von Vorlagen).
function getAllImSchuljahr(db, schuljahrId) {
  return db.prepare(`
      SELECT f.id, f.name, f.farbe, f.klasse_id,
             k.name AS klasse_name, k.farbe AS klasse_farbe, k.reihenfolge AS klasse_reihenfolge
      FROM faecher f JOIN klassen k ON k.id = f.klasse_id
      WHERE k.schuljahr_id = ? AND k.ist_vorlage = 0
      ORDER BY k.reihenfolge, k.name, f.reihenfolge, f.name
    `).all(schuljahrId)
}

function create(db, deps, { klasseId, name, farbe, benotungssystem, alleSchueler = 1, schuelerIds = [] }) {
  const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM faecher WHERE klasse_id = ?').get(klasseId)?.m ?? 0
  const info = db.prepare('INSERT INTO faecher (klasse_id, name, farbe, reihenfolge, benotungssystem, alle_schueler) VALUES (?, ?, ?, ?, ?, ?)')
    .run(klasseId, name, farbe ?? null, maxReihenfolge + 1, benotungssystem ?? 'standard', alleSchueler ? 1 : 0)
  const fachId = info.lastInsertRowid
  // Manuelle Teilmenge: gewählte Schüler:innen als Fach-Mitglieder eintragen
  if (!alleSchueler && schuelerIds.length) {
    const insFS = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
    for (const sid of schuelerIds) insFS.run(fachId, sid)
  }
  // Bei differenziert: Default-Niveau für die Roster-Schüler:innen (NACH fach_schueler-Insert)
  if (benotungssystem === 'differenziert') {
    const insert = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
    for (const sid of deps.rosterIdsFuerFach(fachId)) insert.run(fachId, sid, 'AHS')
  }
  // Kompetenz-Vorlagen automatisch anlegen
  deps.initKompetenzVorlagen(fachId, name)
  return fachId
}

function remove(db, deps, id) {
  // Zuerst alle Nicht-CASCADE-Kinddaten abräumen (foreign_keys=ON), atomar.
  db.transaction(() => {
    deps.raeumeFachDatenAuf([id])
    db.prepare('DELETE FROM faecher WHERE id = ?').run(id)
  })()
  return true
}

function rename(db, deps, id, name) {
  const root = deps.materialRoot()
  const alt = root ? db.prepare('SELECT f.name AS fn, k.name AS kn, s.bezeichnung AS sb FROM faecher f JOIN klassen k ON f.klasse_id=k.id JOIN schuljahre s ON k.schuljahr_id=s.id WHERE f.id=?').get(id) : null
  db.prepare('UPDATE faecher SET name = ? WHERE id = ?').run(name, id)
  let ordnerWarnung = null
  if (alt) ordnerWarnung = deps.verschiebeDir(
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(alt.kn), deps.sanitizeSegment(alt.fn)),
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(alt.kn), deps.sanitizeSegment(name)))
  return { ok: true, ordnerWarnung }
}

function setFarbe(db, id, farbe) {
  db.prepare('UPDATE faecher SET farbe = ? WHERE id = ?').run(farbe ?? null, id)
  return true
}

function updateGewichtung(db, deps, id, data) {
  // Nur SA/Test/Individuell gewichten die Note; MA & HÜ wirken als Einfluss (eigene Deckelung).
  db.prepare(`
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
    `).run(data.sa ?? null, data.t ?? null, data.custom ?? null, data.maEinfluss ?? null, data.hueEinfluss ?? null, id)
  deps.berechneAlleFuerFach(id)
  return true
}

function resetGewichtung(db, deps, id) {
  db.prepare('UPDATE faecher SET gewichtung_sa = NULL, gewichtung_t = NULL, gewichtung_ma = NULL, gewichtung_hue = NULL, gewichtung_custom = NULL, ma_hue_max_einfluss = NULL, ma_max_einfluss = NULL, hue_max_einfluss = NULL WHERE id = ?').run(id)
  deps.berechneAlleFuerFach(id)
  return true
}

function setBenotungssystem(db, deps, id, system) {
  db.prepare('UPDATE faecher SET benotungssystem = ? WHERE id = ?').run(system, id)
  if (system === 'differenziert') {
    // Default-Niveau 'AHS' für alle Schüler:innen + Initial-Historien-Eintrag
    const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(id)
    if (fach) {
      const schuelerIds = deps.rosterIdsFuerFach(id).map((x) => ({ id: x }))
      const insertNiveau = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
      const insertHist = db.prepare(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?
          )
        `)
      for (const s of schuelerIds) {
        insertNiveau.run(id, s.id, 'AHS')
        insertHist.run(id, s.id, 'AHS', '1900-01-01', id, s.id)
      }
    }
  }
  deps.berechneAlleFuerFach(id)
  return true
}

// Aktuelle Fach-Zuordnung (ids). Bei alle_schueler=1 automatisch alle aktiven Klassen-Schüler:innen.
function getSchuelerIds(db, deps, fachId) {
  return deps.rosterIdsFuerFach(fachId)
}

// Fach-Zuordnung setzen: alle = true → alle Klassen-Schüler:innen; sonst manuelle Teilmenge.
function setSchueler(db, deps, fachId, { alle, schuelerIds = [] }) {
  const fach = db.prepare('SELECT benotungssystem FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return false
  db.transaction(() => {
    db.prepare('UPDATE faecher SET alle_schueler = ? WHERE id = ?').run(alle ? 1 : 0, fachId)
    db.prepare('DELETE FROM fach_schueler WHERE fach_id = ?').run(fachId)   // immer neu aufbauen
    if (!alle) {
      const ins = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
      for (const sid of schuelerIds) ins.run(fachId, sid)
    }
    // Differenziert: neu ins Roster gekommene Schüler:innen brauchen Niveau-Default + Historie
    if (fach.benotungssystem === 'differenziert') {
      const insN = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
      const insH = db.prepare(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, ?, '1900-01-01'
          WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
        `)
      for (const sid of deps.rosterIdsFuerFach(fachId)) { insN.run(fachId, sid, 'AHS'); insH.run(fachId, sid, 'AHS', fachId, sid) }
    }
  })()
  deps.berechneAlleFuerFach(fachId)   // Roster geändert → Zeugnisnoten neu berechnen
  return true
}

module.exports = {
  getAll, getAllImSchuljahr, create, remove, rename, setFarbe,
  updateGewichtung, resetGewichtung, setBenotungssystem, getSchuelerIds, setSchueler,
}
