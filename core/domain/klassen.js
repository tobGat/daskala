// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Klassen. Async DbPort.
// deps = { logError, raeumeFachDatenAuf, materialRoot, verschiebeDir, sanitizeSegment }
// (main.js-Helfer, u. a. Dateisystem für rename). path ist ein Node-Builtin.

const path = require('path')

async function getAll(db, schuljahrId) {
  return db.select('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY reihenfolge, name', [schuljahrId])
}

async function getVorlagen(db) {
  return db.select('SELECT * FROM klassen WHERE ist_vorlage = 1 ORDER BY reihenfolge, name')
}

async function create(db, { schuljahrId, name, farbe, teamsLink, istVorlage }) {
  const maxReihenfolge = (await db.selectOne('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id = ?', [schuljahrId]))?.m ?? 0
  const info = await db.execute('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge, teams_link, ist_vorlage) VALUES (?, ?, ?, ?, ?, ?)', [schuljahrId, name, farbe ?? null, maxReihenfolge + 1, teamsLink ?? null, istVorlage ? 1 : 0])
  return info.lastInsertRowid
}

async function setTeamsLink(db, id, link) {
  await db.execute('UPDATE klassen SET teams_link = ? WHERE id = ?', [link || null, id])
  return true
}

async function setIstKv(db, id, istKv) {
  await db.execute('UPDATE klassen SET ist_kv = ? WHERE id = ?', [istKv ? 1 : 0, id])
  return true
}

// Vorschau auf eine Klassen-Löschung: zählt alle abhängigen Datensätze.
async function getDeleteStats(db, deps, id) {
  const klasse = await db.selectOne('SELECT * FROM klassen WHERE id = ?', [id])
  if (!klasse) return null
  const fachCount = (await db.selectOne('SELECT COUNT(*) AS c FROM faecher WHERE klasse_id = ?', [id])).c
  const schuelerCount = (await db.selectOne('SELECT COUNT(*) AS c FROM schueler WHERE klasse_id = ?', [id])).c
  const noteCount = (await db.selectOne(`
      SELECT COUNT(*) AS c FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      JOIN faecher f ON s.fach_id = f.id
      WHERE f.klasse_id = ? AND e.wert IS NOT NULL AND e.wert != ''
    `, [id])).c
  const todoCount = (await db.selectOne('SELECT COUNT(*) AS c FROM todos WHERE klasse_id = ?', [id])).c
  const terminCount = (await db.selectOne('SELECT COUNT(*) AS c FROM termine WHERE klasse_id = ?', [id])).c
  // KV-Daten (alle haben ON DELETE CASCADE — verschwinden automatisch)
  let kvAktenvermerkeCount = 0, kvElternkontakteCount = 0, kvFehlstundenCount = 0, kvTriggerCount = 0
  try {
    kvAktenvermerkeCount = (await db.selectOne('SELECT COUNT(*) AS c FROM kv_aktenvermerke WHERE klasse_id = ?', [id])).c
    kvElternkontakteCount = (await db.selectOne('SELECT COUNT(*) AS c FROM kv_elternkontakte WHERE schueler_id IN (SELECT id FROM schueler WHERE klasse_id = ?)', [id])).c
    kvFehlstundenCount = (await db.selectOne('SELECT COUNT(*) AS c FROM kv_fehlstunden WHERE schueler_id IN (SELECT id FROM schueler WHERE klasse_id = ?)', [id])).c
    kvTriggerCount = (await db.selectOne('SELECT COUNT(*) AS c FROM kv_trigger WHERE klasse_id = ?', [id])).c
  } catch (e) { deps.logError('klassen:loeschInfo kv-zaehler', e) }
  return { klasse, fachCount, schuelerCount, noteCount, todoCount, terminCount, kvAktenvermerkeCount, kvElternkontakteCount, kvFehlstundenCount, kvTriggerCount }
}

// Klasse vollständig löschen (kaskadierend in Transaktion). Räumt Tabellen ohne
// ON DELETE CASCADE manuell auf.
async function remove(db, deps, id) {
  await db.transaction(async (tx) => {
    const fachIds = (await tx.select('SELECT id FROM faecher WHERE klasse_id = ?', [id])).map((r) => r.id)
    const schuelerIds = (await tx.select('SELECT id FROM schueler WHERE klasse_id = ?', [id])).map((r) => r.id)

    // Fach-bezogene Nicht-CASCADE-Daten (Noten, Verlauf, Spalten, Zeugnis, Notizen, Stundenplan)
    await deps.raeumeFachDatenAuf(fachIds)

    if (schuelerIds.length > 0) {
      const schuelerPh = schuelerIds.map(() => '?').join(',')
      await tx.execute(`DELETE FROM eintraege WHERE schueler_id IN (${schuelerPh})`, schuelerIds)
      await tx.execute(`DELETE FROM zeugnisnoten WHERE schueler_id IN (${schuelerPh})`, schuelerIds)
      await tx.execute(`DELETE FROM notizen WHERE schueler_id IN (${schuelerPh})`, schuelerIds)
      try { await tx.execute(`DELETE FROM eintraege_verlauf WHERE schueler_id IN (${schuelerPh})`, schuelerIds) } catch (e) { deps.logError('klassen:delete eintraege_verlauf(schueler)', e) }
    }

    await tx.execute('DELETE FROM faecher WHERE klasse_id = ?', [id])
    await tx.execute('DELETE FROM schueler WHERE klasse_id = ?', [id])
    await tx.execute('DELETE FROM klassen WHERE id = ?', [id])
  })
  return true
}

async function rename(db, deps, id, name) {
  const root = await deps.materialRoot()
  const alt = root ? await db.selectOne('SELECT k.name AS kn, s.bezeichnung AS sb FROM klassen k JOIN schuljahre s ON k.schuljahr_id=s.id WHERE k.id=?', [id]) : null
  await db.execute('UPDATE klassen SET name = ? WHERE id = ?', [name, id])
  let ordnerWarnung = null
  if (alt) ordnerWarnung = await deps.verschiebeDir(
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(alt.kn)),
    path.join(root, deps.sanitizeSegment(alt.sb), deps.sanitizeSegment(name)))
  return { ok: true, ordnerWarnung }
}

async function setFarbe(db, id, farbe) {
  await db.execute('UPDATE klassen SET farbe = ? WHERE id = ?', [farbe ?? null, id])
  return true
}

// Sortier-Modus der Schüler:innen-Liste dieser Klasse setzen (Whitelist-validiert).
async function setSortierung(db, id, modus) {
  const wert = ['vorname', 'nachname', 'manuell'].includes(modus) ? modus : 'nachname'
  await db.execute('UPDATE klassen SET sortierung = ? WHERE id = ?', [wert, id])
  return true
}

// Manuelle Reihenfolge der Klassen-Tabs speichern (Drag-and-Drop im Header).
async function reorder(db, updates) {
  await db.transaction(async (tx) => {
    for (const { id, reihenfolge } of updates) await tx.execute('UPDATE klassen SET reihenfolge = ? WHERE id = ?', [reihenfolge, id])
  })
  return true
}

module.exports = { getAll, getVorlagen, create, setTeamsLink, setIstKv, getDeleteStats, remove, rename, setFarbe, setSortierung, reorder }
