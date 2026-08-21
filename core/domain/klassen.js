// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Klassen. Async DbPort.
// deps = { logError, raeumeFachDatenAuf, materialRoot, verschiebeDir, sanitizeSegment }
// (main.js-Helfer, u. a. Dateisystem für rename). path ist ein Node-Builtin.

const path = require('path')
const { neueUuid } = require('../db/uuid')

async function getAll(db, schuljahrId) {
  return db.select('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY reihenfolge, name', [schuljahrId])
}

async function getVorlagen(db) {
  return db.select('SELECT * FROM klassen WHERE ist_vorlage = 1 ORDER BY reihenfolge, name')
}

async function create(db, { schuljahrId, name, farbe, teamsLink, istVorlage }) {
  const maxReihenfolge = (await db.selectOne('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id = ?', [schuljahrId]))?.m ?? 0
  const info = await db.execute('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge, teams_link, ist_vorlage, uuid) VALUES (?, ?, ?, ?, ?, ?, ?)', [schuljahrId, name, farbe ?? null, maxReihenfolge + 1, teamsLink ?? null, istVorlage ? 1 : 0, neueUuid()])
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
  // Nur Personen, die AUSSCHLIESSLICH dieser Klasse angehören, werden tatsächlich gelöscht (n:m).
  const schuelerCount = (await db.selectOne(`
      SELECT COUNT(*) AS c FROM schueler s
      WHERE (s.klasse_id = ? OR EXISTS (SELECT 1 FROM klassen_schueler ks WHERE ks.schueler_id = s.id AND ks.klasse_id = ?))
        AND NOT EXISTS (SELECT 1 FROM klassen_schueler ks2 WHERE ks2.schueler_id = s.id AND ks2.klasse_id <> ?)
    `, [id, id, id])).c
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
    // n:m: NUR Personen hart löschen, die AUSSCHLIESSLICH dieser Klasse angehören. Geteilte
    // (auch in anderen Klassen) bleiben erhalten – sonst vernichtete das schueler_id-basierte
    // Löschen + ON DELETE CASCADE auch ihre Daten in ANDEREN Klassen (stiller Datenverlust).
    const schuelerIds = (await tx.select(`
      SELECT s.id FROM schueler s
      WHERE (s.klasse_id = ? OR EXISTS (SELECT 1 FROM klassen_schueler ks WHERE ks.schueler_id = s.id AND ks.klasse_id = ?))
        AND NOT EXISTS (SELECT 1 FROM klassen_schueler ks2 WHERE ks2.schueler_id = s.id AND ks2.klasse_id <> ?)
    `, [id, id, id])).map((r) => r.id)

    // Fach-bezogene Nicht-CASCADE-Daten (Noten, Verlauf, Spalten, Zeugnis, Notizen, Stundenplan)
    await deps.raeumeFachDatenAuf(fachIds)

    if (schuelerIds.length > 0) {
      const schuelerPh = schuelerIds.map(() => '?').join(',')
      await tx.execute(`DELETE FROM eintraege WHERE schueler_id IN (${schuelerPh})`, schuelerIds)
      await tx.execute(`DELETE FROM zeugnisnoten WHERE schueler_id IN (${schuelerPh})`, schuelerIds)
      await tx.execute(`DELETE FROM notizen WHERE schueler_id IN (${schuelerPh})`, schuelerIds)
      try { await tx.execute(`DELETE FROM eintraege_verlauf WHERE schueler_id IN (${schuelerPh})`, schuelerIds) } catch (e) { deps.logError('klassen:delete eintraege_verlauf(schueler)', e) }
    }

    // Geteilte Personen mit Stammklasse = dieser Klasse: Stammklasse auf eine überlebende Klasse
    // umhängen (schueler.klasse_id hat kein CASCADE, würde sonst auf die gelöschte Klasse zeigen).
    const geteilt = await tx.select(`
      SELECT s.id FROM schueler s
      WHERE s.klasse_id = ?
        AND EXISTS (SELECT 1 FROM klassen_schueler ks WHERE ks.schueler_id = s.id AND ks.klasse_id <> ?)
    `, [id, id])
    for (const g of geteilt) {
      const neu = await tx.selectOne('SELECT klasse_id FROM klassen_schueler WHERE schueler_id = ? AND klasse_id <> ? ORDER BY aktiv DESC, klasse_id LIMIT 1', [g.id, id])
      if (neu) {
        await tx.execute('UPDATE schueler SET klasse_id = ? WHERE id = ?', [neu.klasse_id, g.id])
        await tx.execute('UPDATE klassen_schueler SET ist_stammklasse = 1 WHERE schueler_id = ? AND klasse_id = ?', [g.id, neu.klasse_id])
      }
    }

    // Mitgliedschaften dieser Klasse explizit lösen (geteilte Personen verlieren nur die hiesige).
    await tx.execute('DELETE FROM klassen_schueler WHERE klasse_id = ?', [id])
    if (schuelerIds.length > 0) {
      const schuelerPh = schuelerIds.map(() => '?').join(',')
      await tx.execute(`DELETE FROM schueler WHERE id IN (${schuelerPh})`, schuelerIds)
    }
    await tx.execute('DELETE FROM faecher WHERE klasse_id = ?', [id])
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
