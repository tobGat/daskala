// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Jahresplanung (Abschnitte je Fach). Async DbPort.
// `deps` = { fs, logError, mat } – `mat` ist das Ports-Bündel für materialien.js.
// `path` ist ein Node-Builtin und in core erlaubt.

const path = require('path')
const materialien = require('./materialien')

async function getAll(db, fachId) {
  return db.select('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY reihenfolge, id', [fachId])
}

async function create(db, deps, d) {
  const maxOrd = (await db.selectOne('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?', [d.fachId])).m
  const info = await db.execute('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)', [d.fachId, d.titel, d.inhalt ?? '', d.lernziele ?? '', d.kompetenzen ?? '', d.datumVon ?? null, d.datumBis ?? null, d.farbe ?? null, maxOrd + 1])
  const id = Number(info.lastInsertRowid)
  try { if (await materialien.materialRoot(db)) { await materialien.ensureAbschnittFolder(db, deps.mat, id); await materialien.schreibeMaterialIndex(db, deps.mat, id) } } catch (e) { deps.logError('jahresplanung:create ordner', e) }
  return id
}

async function update(db, deps, id, d) {
  const alt = await db.selectOne('SELECT titel, fach_id, material_ordner FROM jahresplanung_abschnitte WHERE id=?', [id])
  await db.execute('UPDATE jahresplanung_abschnitte SET titel=?, inhalt=?, lernziele=?, kompetenzen=?, datum_von=?, datum_bis=?, farbe=? WHERE id=?', [d.titel, d.inhalt ?? '', d.lernziele ?? '', d.kompetenzen ?? '', d.datumVon ?? null, d.datumBis ?? null, d.farbe ?? null, id])
  let ordnerWarnung = null
  const root = await materialien.materialRoot(db)
  // deps.fs/mat gibt es nur im Desktop-Bündel (jpDeps); mobil (kernDeps) fehlen sie → Ordner-Umzug überspringen.
  if (root && alt && alt.material_ordner && d.titel != null && d.titel !== alt.titel && deps.fs) {
    const h = await materialien.abschnittHierarchie(db, alt.fach_id)
    if (h) {
      const baseDir = materialien.fachDir(root, h)
      const oldDir = path.join(baseDir, alt.material_ordner)
      if (deps.fs.exists(oldDir)) {
        const neuLeaf = materialien.eindeutigerLeaf(deps.mat, baseDir, materialien.sanitizeSegment(d.titel))
        ordnerWarnung = materialien.verschiebeDir(deps.mat, oldDir, path.join(baseDir, neuLeaf))
        if (!ordnerWarnung) { await db.execute('UPDATE jahresplanung_abschnitte SET material_ordner=? WHERE id=?', [neuLeaf, id]); await materialien.schreibeMaterialIndex(db, deps.mat, id) }
      }
    }
  }
  return { ok: true, ordnerWarnung }
}

async function remove(db, id) {
  await db.execute('DELETE FROM jahresplanung_abschnitte WHERE id=?', [id])
  return true
}

async function getFaecherMitPlan(db) {
  return db.select(`
      SELECT f.id, f.name, f.farbe, k.name as klasse_name, k.id as klasse_id,
             k.ist_vorlage as ist_vorlage,
             COUNT(a.id) as abschnitt_anzahl
      FROM jahresplanung_abschnitte a
      JOIN faecher f ON a.fach_id = f.id
      JOIN klassen k ON f.klasse_id = k.id
      GROUP BY f.id
      ORDER BY k.ist_vorlage DESC, k.name, f.name
    `)
}

async function importVonFach(db, quellFachId, zielFachId, options = {}) {
  const ohneTermine = options && options.ohneTermine === true
  const abschnitte = await db.select('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY reihenfolge', [quellFachId])
  const maxOrd = (await db.selectOne('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?', [zielFachId])).m
  const INS = 'INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)'
  await db.transaction(async (tx) => {
    let i = 0
    for (const a of abschnitte) {
      await tx.execute(INS, [zielFachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen, ohneTermine ? null : a.datum_von, ohneTermine ? null : a.datum_bis, a.farbe, maxOrd + 1 + i])
      i++
    }
  })
  return true
}

// Eine Fach-Planung (z. B. eine Vorlage) auf MEHRERE Ziel-Fächer anwenden.
async function anwendenAufFaecher(db, deps, quellFachId, zielFachIds, options = {}) {
  const ohneTermine = options.ohneTermine !== false
  const ersetzen = options.ersetzen === true
  const mitMaterialien = options.mitMaterialien !== false
  const ziele = (Array.isArray(zielFachIds) ? zielFachIds : []).filter(id => id && id !== quellFachId)
  const abschnitte = await db.select('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY reihenfolge, id', [quellFachId])
  const INS = 'INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)'
  await db.transaction(async (tx) => {
    for (const zielFachId of ziele) {
      if (ersetzen) await tx.execute('DELETE FROM jahresplanung_abschnitte WHERE fach_id = ?', [zielFachId])
      const maxOrd = (await tx.selectOne('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?', [zielFachId])).m
      let i = 0
      for (const a of abschnitte) {
        const na = await tx.execute(INS, [zielFachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen, ohneTermine ? null : a.datum_von, ohneTermine ? null : a.datum_bis, a.farbe, maxOrd + 1 + i])
        i++
        if (mitMaterialien) await materialien.kopiereMaterialien(db, deps.mat, a.id, na.lastInsertRowid)
      }
    }
  })
  return { ok: true, anzahlZiele: ziele.length, anzahlAbschnitte: abschnitte.length }
}

// Import einer vom Chatbot erzeugten JSON-Datei in ein Fach (robustes Parsen + Validierung).
async function importVonDatei(db, deps, fachId, filePath, options = {}) {
  const ersetzen = options.ersetzen === true
  let roh
  try { roh = deps.fs.read(filePath, 'utf-8') }
  catch (e) { deps.logError('importVonDatei:read', e); return { ok: false, fehler: 'Datei konnte nicht gelesen werden.' } }

  // Robust: Code-Fences (```json …```) entfernen; sonst den äußersten {…}/[…]-Block extrahieren.
  const parseJson = (text) => {
    let t = String(text).trim()
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) t = fence[1].trim()
    try { return JSON.parse(t) } catch { /* weiter unten */ }
    const m = t.match(/[[{][\s\S]*[\]}]/)
    if (m) { try { return JSON.parse(m[0]) } catch { /* ignore */ } }
    return undefined
  }
  const parsed = parseJson(roh)
  if (parsed === undefined) return { ok: false, fehler: 'Die Datei enthält kein gültiges JSON.' }

  const liste = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.abschnitte) ? parsed.abschnitte : null)
  if (!liste) return { ok: false, fehler: 'Kein „abschnitte"-Array in der Datei gefunden.' }

  const istDatum = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  const istFarbe = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)
  const str = (v) => Array.isArray(v)
    ? v.map(x => (x == null ? '' : (typeof x === 'object' ? String(x.text ?? x.titel ?? x.name ?? x.kompetenz ?? '') : String(x)))).filter(s => s.trim() !== '').join('\n')
    : (v == null ? '' : String(v))
  const pickDatum = (...vals) => { for (const v of vals) if (istDatum(v)) return v; return null }
  const norm = liste.map(a => (a && typeof a === 'object') ? {
    titel: str(a.titel ?? a.title).trim(),
    inhalt: str(a.inhalt ?? a.beschreibung),
    lernziele: str(a.lernziele ?? a.lernziel ?? a.ziele),
    kompetenzen: str(a.kompetenzen ?? a.kompetenz),
    datum_von: pickDatum(a.datum_von, a.datumVon, a.von),
    datum_bis: pickDatum(a.datum_bis, a.datumBis, a.bis),
    farbe: istFarbe(a.farbe ?? a.color) ? (a.farbe ?? a.color) : null,
  } : null).filter(a => a && a.titel)

  if (norm.length === 0) return { ok: false, fehler: 'Keine gültigen Abschnitte (mit Titel) gefunden.' }

  const INS = 'INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)'
  const neueIds = []
  await db.transaction(async (tx) => {
    if (ersetzen) await tx.execute('DELETE FROM jahresplanung_abschnitte WHERE fach_id = ?', [fachId])
    const maxOrd = (await tx.selectOne('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?', [fachId])).m
    let i = 0
    for (const a of norm) {
      const info = await tx.execute(INS, [fachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen, a.datum_von, a.datum_bis, a.farbe, maxOrd + 1 + i])
      i++
      neueIds.push(Number(info.lastInsertRowid))
    }
  })
  // Material-Ordner je Abschnitt anlegen (konsistent mit jahresplanung:create)
  try { if (await materialien.materialRoot(db)) for (const id of neueIds) { await materialien.ensureAbschnittFolder(db, deps.mat, id); await materialien.schreibeMaterialIndex(db, deps.mat, id) } }
  catch (e) { deps.logError('importVonDatei:ordner', e) }
  return { ok: true, anzahl: neueIds.length }
}

async function swap(db, idA, idB) {
  const a = await db.selectOne('SELECT datum_von, datum_bis, reihenfolge FROM jahresplanung_abschnitte WHERE id = ?', [idA])
  const b = await db.selectOne('SELECT datum_von, datum_bis, reihenfolge FROM jahresplanung_abschnitte WHERE id = ?', [idB])
  if (!a || !b) return false
  await db.transaction(async (tx) => {
    await tx.execute('UPDATE jahresplanung_abschnitte SET datum_von=?, datum_bis=?, reihenfolge=? WHERE id=?', [b.datum_von, b.datum_bis, b.reihenfolge, idA])
    await tx.execute('UPDATE jahresplanung_abschnitte SET datum_von=?, datum_bis=?, reihenfolge=? WHERE id=?', [a.datum_von, a.datum_bis, a.reihenfolge, idB])
  })
  return true
}

module.exports = {
  getAll, create, update, remove, getFaecherMitPlan,
  importVonFach, anwendenAufFaecher, importVonDatei, swap,
}
