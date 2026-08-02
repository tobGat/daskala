// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schüler:innen. Plattformunabhängig, ohne electron.
// db injiziert; deps = { berechneAlleFuerFach } (nur für getLeistungsProfil).
// schueler:exportProfilPDF bleibt in main.js (Export/PDF, Gruppe 8).

function getAll(db, klasseId) {
  const modus = db.prepare('SELECT sortierung FROM klassen WHERE id = ?').get(klasseId)?.sortierung || 'nachname'
  // ORDER-BY aus fester Whitelist (keine Nutzereingabe → sichere Interpolation).
  const order = modus === 'vorname'
    ? 'vorname COLLATE NOCASE, nachname COLLATE NOCASE'
    : modus === 'manuell'
      ? 'reihenfolge, nachname COLLATE NOCASE, vorname COLLATE NOCASE'
      : 'nachname COLLATE NOCASE, vorname COLLATE NOCASE'
  return db.prepare(`SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY ${order}`).all(klasseId)
}

function create(db, { klasseId, vorname, nachname, fachIds = [] }) {
  const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM schueler WHERE klasse_id = ?').get(klasseId)?.m ?? 0
  const info = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)').run(klasseId, vorname, nachname, maxReihenfolge + 1)
  const schuelerId = info.lastInsertRowid
  // In gewählte Fächer aufnehmen: manuelle Fächer bekommen einen fach_schueler-Eintrag,
  // „alle Schüler:innen"-Fächer schließen neue automatisch ein (nichts zu tun).
  if (Array.isArray(fachIds) && fachIds.length) {
    const insFS = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
    const insN  = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
    const insH  = db.prepare(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        SELECT ?, ?, ?, '1900-01-01'
        WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
      `)
    for (const fid of fachIds) {
      const fach = db.prepare('SELECT alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?').get(fid, klasseId)
      if (!fach) continue
      if (!fach.alle_schueler) insFS.run(fid, schuelerId)
      if (fach.benotungssystem === 'differenziert') { insN.run(fid, schuelerId, 'AHS'); insH.run(fid, schuelerId, 'AHS', fid, schuelerId) }
    }
  }
  return schuelerId
}

function remove(db, id) {
  db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(id)
  return true
}

function update(db, id, data) {
  db.prepare(`UPDATE schueler SET vorname = ?, nachname = ?,
      lernschwaeche = CASE WHEN ? IS NOT NULL THEN ? ELSE lernschwaeche END,
      legasthenie   = CASE WHEN ? IS NOT NULL THEN ? ELSE legasthenie   END,
      spf           = CASE WHEN ? IS NOT NULL THEN ? ELSE spf           END
      WHERE id = ?`
  ).run(
    data.vorname, data.nachname,
    data.lernschwaeche ?? null, data.lernschwaeche ?? null,
    data.legasthenie   ?? null, data.legasthenie   ?? null,
    data.spf           ?? null, data.spf           ?? null,
    id
  )
  return true
}

// Avatar (JSON-Config) setzen; null = zurück auf Auto-aus-Name
function setAvatar(db, id, avatar) {
  db.prepare('UPDATE schueler SET avatar = ? WHERE id = ?').run(avatar ?? null, id)
  return true
}

function reorder(db, updates) {
  const stmt = db.prepare('UPDATE schueler SET reihenfolge = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const { id, reihenfolge } of updates) {
      stmt.run(reihenfolge, id)
    }
  })
  tx()
  return true
}

function importBatch(db, klasseId, list, fachIds = []) {
  // Gewählte Fächer (nur gültige der Klasse) einmal auflösen.
  const faecher = (Array.isArray(fachIds) ? fachIds : [])
    .map((fid) => db.prepare('SELECT id, alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?').get(fid, klasseId))
    .filter(Boolean)
  const insFS = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
  const insN  = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
  const insH  = db.prepare(`
      INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
      SELECT ?, ?, ?, '1900-01-01'
      WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
    `)
  const tx = db.transaction(() => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM schueler WHERE klasse_id = ?').get(klasseId)?.m ?? 0
    const stmt = db.prepare('INSERT OR IGNORE INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)')
    list.forEach((s, i) => {
      const info = stmt.run(klasseId, s.vorname, s.nachname, maxReihenfolge + i + 1)
      // Nur wirklich neu angelegte Schüler:innen den Fächern zuordnen.
      if (info.changes && faecher.length) {
        const sid = info.lastInsertRowid
        for (const fach of faecher) {
          if (!fach.alle_schueler) insFS.run(fach.id, sid)
          if (fach.benotungssystem === 'differenziert') { insN.run(fach.id, sid, 'AHS'); insH.run(fach.id, sid, 'AHS', fach.id, sid) }
        }
      }
    })
  })
  tx()
  return true
}

function getLeistungsProfil(db, deps, schuelerId) {
  const schueler = db.prepare('SELECT * FROM schueler WHERE id = ?').get(schuelerId)
  if (!schueler) return null
  // Nur Fächer, in denen der/die Schüler:in im Roster ist (alle_schueler=1 oder in fach_schueler).
  const faecher = db.prepare(`
      SELECT f.* FROM faecher f
      WHERE f.klasse_id = ?
        AND (f.alle_schueler = 1
             OR EXISTS (SELECT 1 FROM fach_schueler fs WHERE fs.fach_id = f.id AND fs.schueler_id = ?))
      ORDER BY f.reihenfolge
    `).all(schueler.klasse_id, schuelerId)

  // Zeugnisnoten aktuell berechnen (S1, S2 und Endnote), damit das Profil immer aktuelle Werte zeigt
  for (const fach of faecher) deps.berechneAlleFuerFach(fach.id)

  const zeugnisnoten = db.prepare('SELECT * FROM zeugnisnoten WHERE schueler_id = ?').all(schuelerId)
  const eintraege = db.prepare(`
      SELECT e.wert, e.kommentar, s.kategorie, s.datum, s.kuerzel, s.notiz, s.semester, s.fach_id, s.reihenfolge
      FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE e.schueler_id = ? AND e.wert IS NOT NULL
      ORDER BY s.fach_id, s.semester, s.reihenfolge
    `).all(schuelerId)
  const notizen = db.prepare(`
      SELECT n.schueler_id, n.fach_id, n.text, f.name AS fach_name FROM notizen n
      JOIN faecher f ON n.fach_id = f.id
      WHERE n.schueler_id = ? AND n.text IS NOT NULL AND n.text != ''
    `).all(schuelerId)
  // Aktuelles Niveau je Fach (für korrekte Rückrechnung differenzierter Noten im Export)
  const niveaus = {}
  db.prepare('SELECT fach_id, niveau FROM schueler_niveau WHERE schueler_id = ?')
    .all(schuelerId)
    .forEach((r) => { niveaus[r.fach_id] = r.niveau })
  // Niveau-Historie je Fach (für die Darstellung von AHS/ST-Wechseln im Leistungsdiagramm)
  const niveauHistorie = {}
  db.prepare(`SELECT fach_id, niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE schueler_id = ? ORDER BY fach_id, gueltig_ab DESC, id DESC`).all(schuelerId)
    .forEach((r) => { (niveauHistorie[r.fach_id] ??= []).push({ niveau: r.niveau, gueltig_ab: r.gueltig_ab }) })
  return { schueler, faecher, zeugnisnoten, eintraege, notizen, niveaus, niveauHistorie }
}

module.exports = { getAll, create, remove, update, setAvatar, reorder, importBatch, getLeistungsProfil }
