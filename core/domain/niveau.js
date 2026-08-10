// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schüler-Niveau (AHS/ST-Differenzierung) inkl. Historie.
// Async DbPort; deps = { berechneAlleFuerFach } (Notenberechnung nach Änderung).

const HEUTE = () => new Date().toISOString().slice(0, 10)

async function get(db, fachId) {
  const rows = await db.select('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?', [fachId])
  const map = {}
  for (const r of rows) map[r.schueler_id] = r.niveau
  return map
}

async function getHistorie(db, fachId) {
  const rows = await db.select(`
    SELECT schueler_id, niveau, gueltig_ab FROM schueler_niveau_historie
    WHERE fach_id = ?
    ORDER BY schueler_id, gueltig_ab DESC, id DESC
  `, [fachId])
  const map = {}
  for (const r of rows) {
    if (!map[r.schueler_id]) map[r.schueler_id] = []
    map[r.schueler_id].push({ niveau: r.niveau, gueltig_ab: r.gueltig_ab })
  }
  return map
}

async function set(db, deps, fachId, schuelerId, niveau, datum) {
  const gueltigAb = datum || HEUTE()
  await db.transaction(async (tx) => {
    // Aktuellen Stand aktualisieren (nur wenn der Wechsel "jetzt oder früher" gilt)
    const heute = HEUTE()
    if (gueltigAb <= heute) {
      await tx.execute(`
        INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)
        ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = excluded.niveau
      `, [fachId, schuelerId, niveau])
    }
    // Sicherstellen, dass es einen Initial-Historien-Eintrag gibt (1900-01-01).
    const hatInitial = await tx.selectOne(`
      SELECT 1 FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = '1900-01-01'
    `, [fachId, schuelerId])
    if (!hatInitial) {
      const altNiveau = niveau === 'AHS' ? 'ST' : 'AHS'
      await tx.execute(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        VALUES (?, ?, ?, '1900-01-01')
      `, [fachId, schuelerId, altNiveau])
    }
    const existiert = await tx.selectOne(`
      SELECT id FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = ?
    `, [fachId, schuelerId, gueltigAb])
    if (existiert) {
      await tx.execute('UPDATE schueler_niveau_historie SET niveau = ? WHERE id = ?', [niveau, existiert.id])
    } else {
      await tx.execute(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        VALUES (?, ?, ?, ?)
      `, [fachId, schuelerId, niveau, gueltigAb])
    }
  })
  await deps.berechneAlleFuerFach(fachId)
  return true
}

async function deleteHistorie(db, deps, fachId, schuelerId, gueltigAb) {
  // Initial-Eintrag '1900-01-01' nicht löschbar — er ist der Anker
  if (gueltigAb === '1900-01-01') return false
  await db.execute(`
    DELETE FROM schueler_niveau_historie
    WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = ?
  `, [fachId, schuelerId, gueltigAb])
  const aktuell = await db.selectOne(`
    SELECT niveau FROM schueler_niveau_historie
    WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab <= ?
    ORDER BY gueltig_ab DESC, id DESC LIMIT 1
  `, [fachId, schuelerId, HEUTE()])
  if (aktuell) {
    await db.execute(`
      INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)
      ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = excluded.niveau
    `, [fachId, schuelerId, aktuell.niveau])
  }
  await deps.berechneAlleFuerFach(fachId)
  return true
}

module.exports = { get, getHistorie, set, deleteHistorie }
