// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Klassen. Plattformunabhängig, ohne electron.
// db injiziert; deps = { logError, raeumeFachDatenAuf, materialRoot,
// verschiebeDir, sanitizeSegment } (main.js-Helfer, u. a. Dateisystem für rename).
// path ist ein Node-Builtin und darf im Kern direkt genutzt werden.

const path = require('path')

function getAll(db, schuljahrId) {
  return db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY reihenfolge, name').all(schuljahrId)
}

function getVorlagen(db) {
  return db.prepare('SELECT * FROM klassen WHERE ist_vorlage = 1 ORDER BY reihenfolge, name').all()
}

function create(db, { schuljahrId, name, farbe, teamsLink, istVorlage }) {
  const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id = ?').get(schuljahrId)?.m ?? 0
  const info = db.prepare('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge, teams_link, ist_vorlage) VALUES (?, ?, ?, ?, ?, ?)').run(schuljahrId, name, farbe ?? null, maxReihenfolge + 1, teamsLink ?? null, istVorlage ? 1 : 0)
  return info.lastInsertRowid
}

function setTeamsLink(db, id, link) {
  db.prepare('UPDATE klassen SET teams_link = ? WHERE id = ?').run(link || null, id)
  return true
}

function setIstKv(db, id, istKv) {
  db.prepare('UPDATE klassen SET ist_kv = ? WHERE id = ?').run(istKv ? 1 : 0, id)
  return true
}

// Vorschau auf eine Klassen-Löschung: zählt alle abhängigen Datensätze.
function getDeleteStats(db, deps, id) {
  const klasse = db.prepare('SELECT * FROM klassen WHERE id = ?').get(id)
  if (!klasse) return null
  const fachCount    = db.prepare('SELECT COUNT(*) AS c FROM faecher WHERE klasse_id = ?').get(id).c
  const schuelerCount = db.prepare('SELECT COUNT(*) AS c FROM schueler WHERE klasse_id = ?').get(id).c
  const noteCount    = db.prepare(`
      SELECT COUNT(*) AS c FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      JOIN faecher f ON s.fach_id = f.id
      WHERE f.klasse_id = ? AND e.wert IS NOT NULL AND e.wert != ''
    `).get(id).c
  const todoCount    = db.prepare('SELECT COUNT(*) AS c FROM todos WHERE klasse_id = ?').get(id).c
  const terminCount  = db.prepare('SELECT COUNT(*) AS c FROM termine WHERE klasse_id = ?').get(id).c
  // KV-Daten (alle haben ON DELETE CASCADE — verschwinden automatisch)
  let kvAktenvermerkeCount = 0, kvElternkontakteCount = 0, kvFehlstundenCount = 0, kvTriggerCount = 0
  try {
    kvAktenvermerkeCount  = db.prepare('SELECT COUNT(*) AS c FROM kv_aktenvermerke WHERE klasse_id = ?').get(id).c
    kvElternkontakteCount = db.prepare(`SELECT COUNT(*) AS c FROM kv_elternkontakte WHERE schueler_id IN (SELECT id FROM schueler WHERE klasse_id = ?)`).get(id).c
    kvFehlstundenCount    = db.prepare(`SELECT COUNT(*) AS c FROM kv_fehlstunden WHERE schueler_id IN (SELECT id FROM schueler WHERE klasse_id = ?)`).get(id).c
    kvTriggerCount        = db.prepare('SELECT COUNT(*) AS c FROM kv_trigger WHERE klasse_id = ?').get(id).c
  } catch (e) { deps.logError('klassen:loeschInfo kv-zaehler', e) }
  return { klasse, fachCount, schuelerCount, noteCount, todoCount, terminCount, kvAktenvermerkeCount, kvElternkontakteCount, kvFehlstundenCount, kvTriggerCount }
}

// Klasse vollständig löschen (kaskadierend in Transaktion). Räumt Tabellen ohne
// ON DELETE CASCADE manuell auf.
function remove(db, deps, id) {
  const tx = db.transaction(() => {
    const fachIds    = db.prepare('SELECT id FROM faecher WHERE klasse_id = ?').all(id).map((r) => r.id)
    const schuelerIds = db.prepare('SELECT id FROM schueler WHERE klasse_id = ?').all(id).map((r) => r.id)

    // Fach-bezogene Nicht-CASCADE-Daten (Noten, Verlauf, Spalten, Zeugnis, Notizen, Stundenplan)
    deps.raeumeFachDatenAuf(fachIds)

    if (schuelerIds.length > 0) {
      const schuelerPh = schuelerIds.map(() => '?').join(',')
      db.prepare(`DELETE FROM eintraege WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds)
      db.prepare(`DELETE FROM zeugnisnoten WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds)
      db.prepare(`DELETE FROM notizen WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds)
      try { db.prepare(`DELETE FROM eintraege_verlauf WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds) } catch (e) { deps.logError('klassen:delete eintraege_verlauf(schueler)', e) }
    }

    db.prepare('DELETE FROM faecher WHERE klasse_id = ?').run(id)
    db.prepare('DELETE FROM schueler WHERE klasse_id = ?').run(id)
    db.prepare('DELETE FROM klassen WHERE id = ?').run(id)
  })
  tx()
  return true
}

function rename(db, deps, id, name) {
  const root = deps.materialRoot()
  const alt = root ? db.prepare('SELECT k.name AS kn, s.bezeichnung AS sb FROM klassen k JOIN schuljahre s ON k.schuljahr_id=s.id WHERE k.id=?').get(id) : null
  db.prepare('UPDATE klassen SET name = ? WHERE id = ?').run(name, id)
  let ordnerWarnung = null
  if (alt) ordnerWarnung = deps.verschiebeDir(
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(alt.kn)),
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(name)))
  return { ok: true, ordnerWarnung }
}

function setFarbe(db, id, farbe) {
  db.prepare('UPDATE klassen SET farbe = ? WHERE id = ?').run(farbe ?? null, id)
  return true
}

// Sortier-Modus der Schüler:innen-Liste dieser Klasse setzen (Whitelist-validiert).
function setSortierung(db, id, modus) {
  const wert = ['vorname', 'nachname', 'manuell'].includes(modus) ? modus : 'nachname'
  db.prepare('UPDATE klassen SET sortierung = ? WHERE id = ?').run(wert, id)
  return true
}

// Manuelle Reihenfolge der Klassen-Tabs speichern (Drag-and-Drop im Header).
function reorder(db, updates) {
  const stmt = db.prepare('UPDATE klassen SET reihenfolge = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const { id, reihenfolge } of updates) stmt.run(reihenfolge, id)
  })
  tx()
  return true
}

module.exports = { getAll, getVorlagen, create, setTeamsLink, setIstKv, getDeleteStats, remove, rename, setFarbe, setSortierung, reorder }
