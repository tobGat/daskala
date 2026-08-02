// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Sicherungs-Dateilogik (Kopieren der SQLite-Datei, Aufräumen,
// Auflisten). `deps` bündelt FsPort + Pfade + kleine Einstellungs-Helfer:
//   { fs, logError, dbPath, backupDir, bkGet, markiereBackupGemacht }
// Nicht enthalten: Prozess-/Dialog-/Neustart-Logik (backup:wiederherstellen,
// app:reset) – die bleibt in der Plattform-Schicht (main.js).
// `path` ist ein Node-Builtin und in core erlaubt.

const path = require('path')

// Zeitstempel-Kopie der Datenbank in den internen Ordner (db_<ts>.sqlite).
function doBackupCreate(deps) {
  const now = new Date()
  const ts = now.toISOString().replace(/:/g, '-').slice(0, 19)
  const backupPath = path.join(deps.backupDir, `db_${ts}.sqlite`)
  try {
    deps.fs.copy(deps.dbPath, backupPath)
    deps.markiereBackupGemacht()
    return backupPath
  } catch {
    return null
  }
}

// Kopiert die aktuelle Datenbank als Zeitstempel-Datei in einen Zielordner und
// behält (falls `max` gesetzt) nur die neuesten `max` Dateien dieses Präfixes.
function schreibeBackupInOrdner(deps, ordner, prefix, max) {
  try {
    if (!ordner) return null
    if (!deps.fs.exists(ordner)) deps.fs.mkdir(ordner)
    const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19)
    const ziel = path.join(ordner, `${prefix}_${ts}.sqlite`)
    deps.fs.copy(deps.dbPath, ziel)
    if (max) {
      const alte = deps.fs.list(ordner)
        .filter(f => f.startsWith(prefix + '_') && f.endsWith('.sqlite'))
        .sort()
      if (alte.length > max) {
        alte.slice(0, alte.length - max).forEach(f => { try { deps.fs.remove(path.join(ordner, f)) } catch { /* egal */ } })
      }
    }
    return ziel
  } catch (e) {
    deps.logError('schreibeBackupInOrdner', e)
    return null
  }
}

// Aktuelle Signatur der Datenbank (Größe + Zeitstempel) für die Änderungserkennung.
function dbSignatur(deps) {
  try { const st = deps.fs.stat(deps.dbPath); return `${st.size}-${Math.round(st.mtimeMs)}` } catch { return '' }
}

// Art einer Sicherung anhand des Dateinamens (für die Anzeige).
function backupArt(name) {
  if (name.startsWith('db_vor-update') || name.startsWith('Daskala-vor-Update')) return 'vor Update'
  if (name.startsWith('db_vor-reset')) return 'vor Zurücksetzen'
  if (name.startsWith('db_vor-wiederherstellung')) return 'vor Wiederherstellung'
  if (name.startsWith('Daskala-Sicherung')) return 'automatisch'
  return 'manuell'
}

// Alle wiederherstellbaren Sicherungen (interner Ordner + gewählter Sicherungsordner).
function sammleBackups(deps) {
  const out = []
  const scan = (dir, quelle) => {
    if (!dir) return
    let files = []
    try { files = deps.fs.list(dir) } catch { return }
    for (const name of files) {
      if (!name.endsWith('.sqlite')) continue
      try {
        const p = path.join(dir, name)
        const st = deps.fs.stat(p)
        if (!st.isFile) continue
        out.push({ pfad: p, name, quelle, art: backupArt(name), datumIso: new Date(st.mtimeMs).toISOString(), groesse: st.size })
      } catch { /* Datei überspringen */ }
    }
  }
  scan(deps.backupDir, 'intern')
  const ordner = deps.bkGet('backup_ordner')
  if (ordner && path.resolve(ordner) !== path.resolve(deps.backupDir)) scan(ordner, 'ordner')
  out.sort((a, b) => b.datumIso.localeCompare(a.datumIso))
  return out
}

module.exports = { doBackupCreate, schreibeBackupInOrdner, dbSignatur, backupArt, sammleBackups }
