// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Materialien je Jahresplanungs-Abschnitt (Dateien im Dateisystem +
// Link-/Meta-Einträge in der DB + menschenlesbare Übersichtsdatei im Ordner).
//
// `db` wird pro Aufruf übergeben (reopen-sicher). `deps` bündelt die Ports und
// Helfer:  { fs, shell, dialog, logError, oeffneExternSicher, indexName }.
// `path` ist ein Node-Builtin und in der Kern-Schicht erlaubt.

const path = require('path')

// ── Reine Helfer ──────────────────────────────────────────────────────────────
// Freitext → dateisystem-sicheres Segment (Windows-Regeln).
function sanitizeSegment(name, fallback = 'Unbenannt') {
  let s = String(name ?? '').trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')  // Windows-verbotene Zeichen + Steuerzeichen 0x00-0x1f
    .replace(/[. ]+$/g, '')                      // keine End-Punkte/-Leerzeichen
  if (s.length > 120) s = s.slice(0, 120).replace(/[. ]+$/g, '')
  if (!s || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) s = fallback
  return s
}

function materialRoot(db) {
  return db.prepare("SELECT wert FROM einstellungen WHERE schluessel='material_root_pfad'").get()?.wert || null
}

function abschnittHierarchie(db, fachId) {
  return db.prepare(`SELECT f.name AS fach_name, k.name AS klasse_name, s.bezeichnung AS schuljahr_bez
      FROM faecher f JOIN klassen k ON f.klasse_id=k.id JOIN schuljahre s ON k.schuljahr_id=s.id
      WHERE f.id=?`).get(fachId)
}

function fachDir(root, h) {
  return path.join(root, sanitizeSegment(h.schuljahr_bez), sanitizeSegment(h.klasse_name), sanitizeSegment(h.fach_name))
}

function eindeutigerLeaf(deps, baseDir, wunsch) {
  let leaf = wunsch, n = 2
  while (deps.fs.exists(path.join(baseDir, leaf))) leaf = `${wunsch} (${n++})`
  return leaf
}

function eindeutigerDateiname(deps, dir, name) {
  const ext = path.extname(name), base = path.basename(name, ext)
  let ziel = name, n = 2
  while (deps.fs.exists(path.join(dir, ziel))) ziel = `${base} (${n++})${ext}`
  return ziel
}

// Legt den Ordner an, weist material_ordner bei Erstnutzung zu. Null wenn Root fehlt.
function ensureAbschnittFolder(db, deps, abschnittId) {
  const root = materialRoot(db); if (!root) return null
  const a = db.prepare('SELECT id, fach_id, titel, material_ordner FROM jahresplanung_abschnitte WHERE id=?').get(abschnittId)
  if (!a) return null
  const h = abschnittHierarchie(db, a.fach_id); if (!h) return null
  const baseDir = fachDir(root, h)
  deps.fs.mkdir(baseDir)
  let leaf = a.material_ordner
  if (!leaf) {
    leaf = eindeutigerLeaf(deps, baseDir, sanitizeSegment(a.titel || 'Abschnitt'))
    db.prepare('UPDATE jahresplanung_abschnitte SET material_ordner=? WHERE id=?').run(leaf, abschnittId)
  }
  const dir = path.join(baseDir, leaf)
  deps.fs.mkdir(dir)
  return dir
}

// Read-only-Auflösung (kein Anlegen).
function abschnittFolderIfExists(db, deps, abschnittId) {
  const root = materialRoot(db); if (!root) return null
  const a = db.prepare('SELECT fach_id, material_ordner FROM jahresplanung_abschnitte WHERE id=?').get(abschnittId)
  if (!a || !a.material_ordner) return null
  const h = abschnittHierarchie(db, a.fach_id); if (!h) return null
  const dir = path.join(fachDir(root, h), a.material_ordner)
  return deps.fs.exists(dir) ? dir : null
}

function verschiebeDir(deps, oldDir, newDir) {
  try {
    if (!oldDir || !newDir || oldDir === newDir) return null
    if (!deps.fs.exists(oldDir)) return null
    if (deps.fs.exists(newDir)) return 'Zielordner existiert bereits – bitte manuell zusammenführen.'
    deps.fs.mkdir(path.dirname(newDir))
    deps.fs.move(oldDir, newDir)
    return null
  } catch (e) { deps.logError('verschiebeDir', e); return 'Ordner konnte nicht verschoben werden (evtl. geöffnet).' }
}

// Gemeinsame Auflistung (Dokumente aus Ordner + Datei-Meta + Links aus DB). Index-Datei/Dotfiles übersprungen.
function sammleMaterialien(db, deps, abschnittId) {
  const dir = abschnittFolderIfExists(db, deps, abschnittId)
  const meta = db.prepare('SELECT * FROM abschnitt_materialien WHERE abschnitt_id=? ORDER BY reihenfolge, id').all(abschnittId)
  const metaDatei = new Map(meta.filter(m => m.typ === 'datei').map(m => [m.ref, m]))
  const dateien = []
  const gesehen = new Set()
  if (dir) {
    for (const de of deps.fs.list(dir, { withFileTypes: true })) {
      if (!de.isFile() || de.name.startsWith('.') || de.name === deps.indexName) continue
      const m = metaDatei.get(de.name)
      gesehen.add(de.name)
      dateien.push({ typ: 'datei', ref: de.name, id: m?.id ?? null, anzeigename: m?.anzeigename ?? null, beschreibung: m?.beschreibung ?? null, fehlt: false })
    }
  }
  for (const m of metaDatei.values()) {
    if (!gesehen.has(m.ref)) dateien.push({ typ: 'datei', ref: m.ref, id: m.id, anzeigename: m.anzeigename, beschreibung: m.beschreibung, fehlt: true })
  }
  const links = meta.filter(m => m.typ === 'link').map(m => ({ typ: 'link', id: m.id, ref: m.ref, anzeigename: m.anzeigename, beschreibung: m.beschreibung }))
  return { dir, dateien, links }
}

// Menschenlesbare Übersichts-Datei im Ordner (neu geschrieben bei jeder Änderung).
function schreibeMaterialIndex(db, deps, abschnittId) {
  try {
    const dir = abschnittFolderIfExists(db, deps, abschnittId)
    if (!dir) return
    const a = db.prepare('SELECT fach_id, titel FROM jahresplanung_abschnitte WHERE id=?').get(abschnittId)
    const h = a ? abschnittHierarchie(db, a.fach_id) : null
    const { dateien, links } = sammleMaterialien(db, deps, abschnittId)
    const z = []
    z.push(`Materialübersicht — ${a?.titel ?? ''}`)
    if (h) z.push(`${h.fach_name} · ${h.klasse_name} · ${h.schuljahr_bez}`)
    z.push(`Stand: ${new Date().toLocaleString('de-AT')}`)
    z.push('')
    z.push('DOKUMENTE')
    if (dateien.length === 0) z.push('  (keine)')
    for (const d of dateien) {
      z.push(`  - ${d.anzeigename ? d.anzeigename + '  [' + d.ref + ']' : d.ref}${d.fehlt ? '  (Datei fehlt)' : ''}`)
      if (d.beschreibung) z.push(`      ${d.beschreibung}`)
    }
    z.push('')
    z.push('LINKS')
    if (links.length === 0) z.push('  (keine)')
    for (const l of links) {
      z.push(`  - ${l.anzeigename || l.ref}`)
      z.push(`      ${l.ref}`)
      if (l.beschreibung) z.push(`      ${l.beschreibung}`)
    }
    deps.fs.write(path.join(dir, deps.indexName), z.join('\r\n'), 'utf8')
  } catch (e) { deps.logError('schreibeMaterialIndex', e) }
}

// Materialien eines Abschnitts (Links + Datei-Metadaten + echte Dateien) auf einen anderen kopieren.
function kopiereMaterialien(db, deps, vonAbschnittId, nachAbschnittId) {
  const rows = db.prepare('SELECT typ, ref, anzeigename, beschreibung, reihenfolge FROM abschnitt_materialien WHERE abschnitt_id=? ORDER BY reihenfolge, id').all(vonAbschnittId)
  const ins = db.prepare('INSERT INTO abschnitt_materialien (abschnitt_id, typ, ref, anzeigename, beschreibung, reihenfolge) VALUES (?,?,?,?,?,?)')
  for (const r of rows) ins.run(nachAbschnittId, r.typ, r.ref, r.anzeigename, r.beschreibung, r.reihenfolge)
  try {
    const vonDir = abschnittFolderIfExists(db, deps, vonAbschnittId)
    if (!vonDir) return
    const nachDir = ensureAbschnittFolder(db, deps, nachAbschnittId)
    if (!nachDir) return
    for (const de of deps.fs.list(vonDir, { withFileTypes: true })) {
      if (!de.isFile() || de.name.startsWith('.') || de.name === deps.indexName) continue
      deps.fs.copy(path.join(vonDir, de.name), path.join(nachDir, de.name))
    }
    schreibeMaterialIndex(db, deps, nachAbschnittId)
  } catch (e) { deps.logError('kopiereMaterialien', e) }
}

// ── Handler-Logik ─────────────────────────────────────────────────────────────
async function waehleRoot(db, deps) {
  const gewaehlt = await deps.dialog.openDirectory({ createDirectory: true })
  if (!gewaehlt) return null
  db.prepare("INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES ('material_root_pfad', ?)").run(gewaehlt)
  return gewaehlt
}

function getRoot(db) {
  return materialRoot(db)
}

function list(db, deps, abschnittId) {
  const root = materialRoot(db)
  const { dir, dateien, links } = sammleMaterialien(db, deps, abschnittId)
  return { root: !!root, ordner: dir, dateien, links }
}

async function dateienHinzufuegen(db, deps, abschnittId) {
  const dateien = await deps.dialog.openFiles({ multiSelections: true })
  if (!dateien) return { ok: false, grund: 'abbruch' }
  let dir
  try { dir = ensureAbschnittFolder(db, deps, abschnittId) } catch (e) { deps.logError('materialien:dateien mkdir', e); return { ok: false, grund: 'fs' } }
  if (!dir) return { ok: false, grund: 'kein_root' }
  for (const src of dateien) {
    try { deps.fs.copy(src, path.join(dir, eindeutigerDateiname(deps, dir, path.basename(src)))) }
    catch (e) { deps.logError('materialien:copy', e) }
  }
  schreibeMaterialIndex(db, deps, abschnittId)
  return { ok: true }
}

function linkHinzufuegen(db, deps, abschnittId, data) {
  const { url, anzeigename, beschreibung } = data || {}
  if (!url) return { ok: false }
  const max = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) m FROM abschnitt_materialien WHERE abschnitt_id=?').get(abschnittId).m
  db.prepare(`INSERT INTO abschnitt_materialien (abschnitt_id,typ,ref,anzeigename,beschreibung,reihenfolge,erstellt_am)
      VALUES (?,?,?,?,?,?,datetime('now'))`).run(abschnittId, 'link', url, anzeigename || null, beschreibung || null, max + 1)
  schreibeMaterialIndex(db, deps, abschnittId)
  return { ok: true }
}

function metaSetzen(db, deps, data) {
  const { abschnittId, typ, ref, id, anzeigename, beschreibung } = data || {}
  if (typ === 'link' && id) {
    db.prepare('UPDATE abschnitt_materialien SET anzeigename=?, beschreibung=? WHERE id=?').run(anzeigename || null, beschreibung || null, id)
  } else if (typ === 'datei') {
    const ex = db.prepare("SELECT id FROM abschnitt_materialien WHERE abschnitt_id=? AND typ='datei' AND ref=?").get(abschnittId, ref)
    if (ex) db.prepare('UPDATE abschnitt_materialien SET anzeigename=?, beschreibung=? WHERE id=?').run(anzeigename || null, beschreibung || null, ex.id)
    else db.prepare("INSERT INTO abschnitt_materialien (abschnitt_id,typ,ref,anzeigename,beschreibung) VALUES (?,'datei',?,?,?)").run(abschnittId, ref, anzeigename || null, beschreibung || null)
  }
  schreibeMaterialIndex(db, deps, abschnittId)
  return { ok: true }
}

function entfernen(db, deps, data) {
  const { abschnittId, typ, ref, id } = data || {}
  if (typ === 'datei') {
    const dir = abschnittFolderIfExists(db, deps, abschnittId)
    if (dir) { try { deps.fs.remove(path.join(dir, ref)) } catch (e) { deps.logError('materialien:unlink', e) } }
    db.prepare("DELETE FROM abschnitt_materialien WHERE abschnitt_id=? AND typ='datei' AND ref=?").run(abschnittId, ref)
  } else if (id) {
    db.prepare('DELETE FROM abschnitt_materialien WHERE id=?').run(id)
  }
  schreibeMaterialIndex(db, deps, abschnittId)
  return { ok: true }
}

async function oeffnen(db, deps, data) {
  const { abschnittId, typ, ref } = data || {}
  if (typ === 'link') { return { ok: deps.oeffneExternSicher(ref) } }
  const dir = abschnittFolderIfExists(db, deps, abschnittId)
  if (!dir) return { ok: false, grund: 'kein_ordner' }
  const err = await deps.shell.openPath(path.join(dir, ref))
  return { ok: !err, fehler: err || null }
}

async function ordnerOeffnen(db, deps, abschnittId) {
  let dir
  try { dir = ensureAbschnittFolder(db, deps, abschnittId) } catch (e) { deps.logError('materialien:ordnerOeffnen', e); return { ok: false, grund: 'fs' } }
  if (!dir) return { ok: false, grund: 'kein_root' }
  schreibeMaterialIndex(db, deps, abschnittId)
  const err = await deps.shell.openPath(dir)
  return { ok: !err, fehler: err || null }
}

module.exports = {
  // reine/DB-Helfer (auch von jahresplanung & klassen:duplizieren genutzt)
  sanitizeSegment, materialRoot, abschnittHierarchie, fachDir, eindeutigerLeaf, eindeutigerDateiname,
  ensureAbschnittFolder, abschnittFolderIfExists, verschiebeDir, sammleMaterialien, schreibeMaterialIndex, kopiereMaterialien,
  // Handler-Logik
  waehleRoot, getRoot, list, dateienHinzufuegen, linkHinzufuegen, metaSetzen, entfernen, oeffnen, ordnerOeffnen,
}
