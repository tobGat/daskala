// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schüler:innen. Async DbPort.
// deps = { berechneAlleFuerFach } (nur für getLeistungsProfil).

async function getAll(db, klasseId) {
  const modus = (await db.selectOne('SELECT sortierung FROM klassen WHERE id = ?', [klasseId]))?.sortierung || 'nachname'
  // ORDER-BY aus fester Whitelist (keine Nutzereingabe → sichere Interpolation).
  const order = modus === 'vorname'
    ? 'vorname COLLATE NOCASE, nachname COLLATE NOCASE'
    : modus === 'manuell'
      ? 'reihenfolge, nachname COLLATE NOCASE, vorname COLLATE NOCASE'
      : 'nachname COLLATE NOCASE, vorname COLLATE NOCASE'
  return db.select(`SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY ${order}`, [klasseId])
}

async function create(db, { klasseId, vorname, nachname, fachIds = [] }) {
  const maxReihenfolge = (await db.selectOne('SELECT MAX(reihenfolge) as m FROM schueler WHERE klasse_id = ?', [klasseId]))?.m ?? 0
  const info = await db.execute('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)', [klasseId, vorname, nachname, maxReihenfolge + 1])
  const schuelerId = info.lastInsertRowid
  // In gewählte Fächer aufnehmen: manuelle Fächer bekommen einen fach_schueler-Eintrag,
  // „alle Schüler:innen"-Fächer schließen neue automatisch ein (nichts zu tun).
  if (Array.isArray(fachIds) && fachIds.length) {
    for (const fid of fachIds) {
      const fach = await db.selectOne('SELECT alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?', [fid, klasseId])
      if (!fach) continue
      if (!fach.alle_schueler) await db.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fid, schuelerId])
      if (fach.benotungssystem === 'differenziert') {
        await db.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fid, schuelerId, 'AHS'])
        await db.execute(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        SELECT ?, ?, ?, '1900-01-01'
        WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
      `, [fid, schuelerId, 'AHS', fid, schuelerId])
      }
    }
  }
  return schuelerId
}

async function remove(db, id) {
  await db.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [id])
  return true
}

async function update(db, id, data) {
  await db.execute(`UPDATE schueler SET vorname = ?, nachname = ?,
      lernschwaeche = CASE WHEN ? IS NOT NULL THEN ? ELSE lernschwaeche END,
      legasthenie   = CASE WHEN ? IS NOT NULL THEN ? ELSE legasthenie   END,
      spf           = CASE WHEN ? IS NOT NULL THEN ? ELSE spf           END
      WHERE id = ?`,
  [
    data.vorname, data.nachname,
    data.lernschwaeche ?? null, data.lernschwaeche ?? null,
    data.legasthenie ?? null, data.legasthenie ?? null,
    data.spf ?? null, data.spf ?? null,
    id,
  ])
  return true
}

// Avatar (JSON-Config) setzen; null = zurück auf Auto-aus-Name
async function setAvatar(db, id, avatar) {
  await db.execute('UPDATE schueler SET avatar = ? WHERE id = ?', [avatar ?? null, id])
  return true
}

async function reorder(db, updates) {
  await db.transaction(async (tx) => {
    for (const { id, reihenfolge } of updates) await tx.execute('UPDATE schueler SET reihenfolge = ? WHERE id = ?', [reihenfolge, id])
  })
  return true
}

async function importBatch(db, klasseId, list, fachIds = []) {
  // Gewählte Fächer (nur gültige der Klasse) einmal auflösen.
  const faecher = []
  for (const fid of (Array.isArray(fachIds) ? fachIds : [])) {
    const f = await db.selectOne('SELECT id, alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?', [fid, klasseId])
    if (f) faecher.push(f)
  }
  await db.transaction(async (tx) => {
    const maxReihenfolge = (await tx.selectOne('SELECT MAX(reihenfolge) as m FROM schueler WHERE klasse_id = ?', [klasseId]))?.m ?? 0
    let i = 0
    for (const s of list) {
      const info = await tx.execute('INSERT OR IGNORE INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)', [klasseId, s.vorname, s.nachname, maxReihenfolge + i + 1])
      i++
      // Nur wirklich neu angelegte Schüler:innen den Fächern zuordnen.
      if (info.changes && faecher.length) {
        const sid = info.lastInsertRowid
        for (const fach of faecher) {
          if (!fach.alle_schueler) await tx.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fach.id, sid])
          if (fach.benotungssystem === 'differenziert') {
            await tx.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fach.id, sid, 'AHS'])
            await tx.execute(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        SELECT ?, ?, ?, '1900-01-01'
        WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
      `, [fach.id, sid, 'AHS', fach.id, sid])
          }
        }
      }
    }
  })
  return true
}

async function getLeistungsProfil(db, deps, schuelerId) {
  const schueler = await db.selectOne('SELECT * FROM schueler WHERE id = ?', [schuelerId])
  if (!schueler) return null
  // Nur Fächer, in denen der/die Schüler:in im Roster ist (alle_schueler=1 oder in fach_schueler).
  const faecher = await db.select(`
      SELECT f.* FROM faecher f
      WHERE f.klasse_id = ?
        AND (f.alle_schueler = 1
             OR EXISTS (SELECT 1 FROM fach_schueler fs WHERE fs.fach_id = f.id AND fs.schueler_id = ?))
      ORDER BY f.reihenfolge
    `, [schueler.klasse_id, schuelerId])

  // Zeugnisnoten aktuell berechnen (S1, S2 und Endnote), damit das Profil immer aktuelle Werte zeigt
  for (const fach of faecher) await deps.berechneAlleFuerFach(fach.id)

  const zeugnisnoten = await db.select('SELECT * FROM zeugnisnoten WHERE schueler_id = ?', [schuelerId])
  const eintraege = await db.select(`
      SELECT e.wert, e.kommentar, s.kategorie, s.datum, s.kuerzel, s.notiz, s.semester, s.fach_id, s.reihenfolge
      FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE e.schueler_id = ? AND e.wert IS NOT NULL
      ORDER BY s.fach_id, s.semester, s.reihenfolge
    `, [schuelerId])
  const notizen = await db.select(`
      SELECT n.schueler_id, n.fach_id, n.text, f.name AS fach_name FROM notizen n
      JOIN faecher f ON n.fach_id = f.id
      WHERE n.schueler_id = ? AND n.text IS NOT NULL AND n.text != ''
    `, [schuelerId])
  // Aktuelles Niveau je Fach (für korrekte Rückrechnung differenzierter Noten im Export)
  const niveaus = {}
  ;(await db.select('SELECT fach_id, niveau FROM schueler_niveau WHERE schueler_id = ?', [schuelerId]))
    .forEach((r) => { niveaus[r.fach_id] = r.niveau })
  // Niveau-Historie je Fach (für die Darstellung von AHS/ST-Wechseln im Leistungsdiagramm)
  const niveauHistorie = {}
  ;(await db.select(`SELECT fach_id, niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE schueler_id = ? ORDER BY fach_id, gueltig_ab DESC, id DESC`, [schuelerId]))
    .forEach((r) => { (niveauHistorie[r.fach_id] ??= []).push({ niveau: r.niveau, gueltig_ab: r.gueltig_ab }) })
  return { schueler, faecher, zeugnisnoten, eintraege, notizen, niveaus, niveauHistorie }
}

module.exports = { getAll, create, remove, update, setAvatar, reorder, importBatch, getLeistungsProfil }
