// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schüler-Niveau (AHS/ST-Differenzierung) inkl. Historie.
// db injiziert; deps = { berechneAlleFuerFach } (Notenberechnung nach Änderung).

const HEUTE = () => new Date().toISOString().slice(0, 10)

function get(db, fachId) {
  const rows = db.prepare('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?').all(fachId)
  const map = {}
  for (const r of rows) map[r.schueler_id] = r.niveau
  return map
}

function getHistorie(db, fachId) {
  const rows = db.prepare(`
    SELECT schueler_id, niveau, gueltig_ab FROM schueler_niveau_historie
    WHERE fach_id = ?
    ORDER BY schueler_id, gueltig_ab DESC, id DESC
  `).all(fachId)
  const map = {}
  for (const r of rows) {
    if (!map[r.schueler_id]) map[r.schueler_id] = []
    map[r.schueler_id].push({ niveau: r.niveau, gueltig_ab: r.gueltig_ab })
  }
  return map
}

function set(db, deps, fachId, schuelerId, niveau, datum) {
  const gueltigAb = datum || HEUTE()
  db.transaction(() => {
    // Aktuellen Stand aktualisieren (nur wenn der Wechsel "jetzt oder früher" gilt)
    const heute = HEUTE()
    if (gueltigAb <= heute) {
      db.prepare(`
        INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)
        ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = excluded.niveau
      `).run(fachId, schuelerId, niveau)
    }
    // Sicherstellen, dass es einen Initial-Historien-Eintrag gibt (1900-01-01).
    const hatInitial = db.prepare(`
      SELECT 1 FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = '1900-01-01'
    `).get(fachId, schuelerId)
    if (!hatInitial) {
      const altNiveau = niveau === 'AHS' ? 'ST' : 'AHS'
      db.prepare(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        VALUES (?, ?, ?, '1900-01-01')
      `).run(fachId, schuelerId, altNiveau)
    }
    const existiert = db.prepare(`
      SELECT id FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = ?
    `).get(fachId, schuelerId, gueltigAb)
    if (existiert) {
      db.prepare('UPDATE schueler_niveau_historie SET niveau = ? WHERE id = ?').run(niveau, existiert.id)
    } else {
      db.prepare(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        VALUES (?, ?, ?, ?)
      `).run(fachId, schuelerId, niveau, gueltigAb)
    }
  })()
  deps.berechneAlleFuerFach(fachId)
  return true
}

function deleteHistorie(db, deps, fachId, schuelerId, gueltigAb) {
  // Initial-Eintrag '1900-01-01' nicht löschbar — er ist der Anker
  if (gueltigAb === '1900-01-01') return false
  db.prepare(`
    DELETE FROM schueler_niveau_historie
    WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = ?
  `).run(fachId, schuelerId, gueltigAb)
  const aktuell = db.prepare(`
    SELECT niveau FROM schueler_niveau_historie
    WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab <= ?
    ORDER BY gueltig_ab DESC, id DESC LIMIT 1
  `).get(fachId, schuelerId, HEUTE())
  if (aktuell) {
    db.prepare(`
      INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)
      ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = excluded.niveau
    `).run(fachId, schuelerId, aktuell.niveau)
  }
  deps.berechneAlleFuerFach(fachId)
  return true
}

module.exports = { get, getHistorie, set, deleteHistorie }
