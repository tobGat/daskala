// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')
const os = require('os')


const isDev = process.env.NODE_ENV === 'development'

// ─── PDF-Helper ───────────────────────────────────────────────────────────────
async function htmlZuPdf(htmlContent) {
  const tmpFile = path.join(os.tmpdir(), `daskala_${Date.now()}.html`)
  fs.writeFileSync(tmpFile, htmlContent, 'utf8')
  const win = new BrowserWindow({
    show: false, width: 800, height: 1100,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  await win.loadFile(tmpFile)
  const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
  win.destroy()
  try { fs.unlinkSync(tmpFile) } catch {}
  return pdfBuffer
}

// ─── Leistungsprofil-PDF-HTML ─────────────────────────────────────────────────
function bauePdfHtml(profil, klassenname) {
  const { schueler, faecher, zeugnisnoten, eintraege, notizen, niveaus = {}, avatarSvg } = profil

  function esc(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function noteColor(n) {
    if (!n) return '#9ca3af'
    if (n <= 1.5) return '#22c55e'
    if (n <= 2.5) return '#84cc16'
    if (n <= 3.5) return '#eab308'
    if (n <= 4.5) return '#f97316'
    return '#ef4444'
  }

  function buildSvg(fachEintr) {
    const W = 480, H = 120
    const padL = 25, padT = 14, padR = 10, padB = 14
    const plotW = W - padL - padR
    const plotH = H - padT - padB
    const sa = fachEintr
      .filter(e => e.kategorie === 'SA' && parseInt(e.wert) >= 1 && parseInt(e.wert) <= 5)
      .sort((a, b) => a.semester - b.semester || a.reihenfolge - b.reihenfolge)
    const t = fachEintr
      .filter(e => e.kategorie === 'T' && parseInt(e.wert) >= 1 && parseInt(e.wert) <= 5)
      .sort((a, b) => a.semester - b.semester || a.reihenfolge - b.reihenfolge)
    if (!sa.length && !t.length) return ''
    const all = [...sa.map(p => ({ p, typ: 'SA' })), ...t.map(p => ({ p, typ: 'T' }))]
      .sort((a, b) => a.p.semester - b.p.semester || a.p.reihenfolge - b.p.reihenfolge)
    const n = all.length
    const positions = all.map((_, i) => padL + (n === 1 ? plotW / 2 : i / (n - 1) * plotW))
    const idxMap = new Map(all.map((item, i) => [item, i]))
    function xOf(item) { return positions[idxMap.get(item)] }
    function yOf(note) { return padT + (+note - 1) / 4 * plotH }
    const saItems = all.filter(it => it.typ === 'SA')
    const tItems = all.filter(it => it.typ === 'T')
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%">`
    for (let g = 1; g <= 5; g++) {
      const y = yOf(g)
      svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="0.75"/>`
      svg += `<text x="${padL - 3}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#9ca3af">${g}</text>`
    }
    if (saItems.length > 1) {
      const pts = saItems.map(it => `${xOf(it).toFixed(1)},${yOf(it.p.wert).toFixed(1)}`).join(' ')
      svg += `<polyline points="${pts}" fill="none" stroke="#f97316" stroke-width="1.5" stroke-opacity="0.5"/>`
    }
    saItems.forEach(it => {
      const x = xOf(it).toFixed(1), y = yOf(it.p.wert).toFixed(1), yt = (yOf(it.p.wert) - 7).toFixed(1)
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#f97316"/>`
      svg += `<text x="${x}" y="${yt}" text-anchor="middle" font-size="8" fill="#f97316">${esc(it.p.kuerzel || 'SA')}</text>`
    })
    if (tItems.length > 1) {
      const pts = tItems.map(it => `${xOf(it).toFixed(1)},${yOf(it.p.wert).toFixed(1)}`).join(' ')
      svg += `<polyline points="${pts}" fill="none" stroke="#8b5cf6" stroke-width="1.5" stroke-opacity="0.5"/>`
    }
    tItems.forEach(it => {
      const x = xOf(it).toFixed(1), y = yOf(it.p.wert).toFixed(1), yt = (yOf(it.p.wert) - 7).toFixed(1)
      svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#8b5cf6"/>`
      svg += `<text x="${x}" y="${yt}" text-anchor="middle" font-size="8" fill="#8b5cf6">${esc(it.p.kuerzel || 'T')}</text>`
    })
    svg += '</svg>'
    return svg
  }

  let sectionsHtml = ''
  for (const fach of faecher) {
    const fachEintr = eintraege.filter(e => e.fach_id === fach.id)
    const znS1 = zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 1)
    const znS2 = zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 2)
    const istDiff = fach.benotungssystem === 'differenziert'
    const niveau = niveaus[fach.id] ?? 'AHS'
    const n1 = znInternZuAnzeige(znS1?.note_manuell ?? znS1?.note_berechnet, niveau, istDiff)
    const n2 = znInternZuAnzeige(znS2?.note_manuell ?? znS2?.note_berechnet, niveau, istDiff)
    const maEintr = fachEintr.filter(e => e.kategorie === 'MA' && e.wert)
    const maPos = maEintr.filter(e => e.wert === '+').length
    const maNeg = maEintr.filter(e => e.wert === '-').length
    const maGes = maEintr.length
    const hueEintr = fachEintr.filter(e => e.kategorie === 'HÜ' && e.wert && e.wert !== '—')
    const huePos = hueEintr.filter(e => e.wert === '✓').length
    const hueGes = hueEintr.length
    const fachNotizen = notizen.filter(n => n.fach_id === fach.id)
    const znBadge = (n) => n !== null
      ? `<span style="background:${noteColor(n)};color:#fff;padding:1px 7px;border-radius:10px;font-weight:700;font-size:11px">${n}</span>`
      : `<span style="color:#9ca3af">—</span>`
    const svg = buildSvg(fachEintr)
    const hasDaten = svg || maGes > 0 || hueGes > 0 || fachNotizen.length > 0
    let content = ''
    if (svg) {
      content += `<div style="background:#f9fafb;border-radius:6px;padding:6px 8px 4px;margin-top:6px">${svg}<div style="display:flex;gap:16px;margin-top:2px"><span style="font-size:8px;color:#9ca3af">● SA (orange)</span><span style="font-size:8px;color:#9ca3af">● Test (lila)</span></div></div>`
    }
    if (maGes > 0) {
      const maPct = Math.round(maPos / maGes * 100)
      const negPct = Math.round(maNeg / maGes * 100)
      const leerPct = Math.max(0, 100 - maPct - negPct)
      content += `<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span style="width:22px;font-size:9px;color:#6b7280;font-weight:600">MA</span><div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;display:flex"><div style="width:${maPct}%;background:#22c55e;height:100%"></div><div style="width:${negPct}%;background:#ef4444;height:100%"></div><div style="width:${leerPct}%;height:100%"></div></div><span style="font-size:9px;color:#6b7280;white-space:nowrap">${maPos} pos. / ${maNeg} neg. / ${maGes} ges. (${maPct}%)</span></div>`
    }
    if (hueGes > 0) {
      const huePct = Math.round(huePos / hueGes * 100)
      content += `<div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span style="width:22px;font-size:9px;color:#6b7280;font-weight:600">HÜ</span><div style="flex:1;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;display:flex"><div style="width:${huePct}%;background:#3b82f6;height:100%"></div><div style="width:${100 - huePct}%;height:100%"></div></div><span style="font-size:9px;color:#6b7280;white-space:nowrap">${huePos}/${hueGes} gemacht (${huePct}%)</span></div>`
    }
    if (fachNotizen.length > 0) {
      content += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #f3f4f6">`
      fachNotizen.forEach(n => { content += `<p style="font-size:9px;color:#6b7280;font-style:italic;line-height:1.5;margin:1px 0">${esc(n.text)}</p>` })
      content += `</div>`
    }
    if (!hasDaten) content += `<p style="font-size:9px;color:#d1d5db;font-style:italic;margin-top:4px">Keine Daten vorhanden</p>`
    sectionsHtml += `<div style="margin-bottom:14px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;page-break-inside:avoid"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:700;color:#4f46e5">${esc(fach.name)}</span><span style="display:flex;align-items:center;gap:5px"><span style="color:#9ca3af;font-size:9px">SN 1</span>${znBadge(n1)}<span style="color:#9ca3af;font-size:9px;margin-left:4px">SN 2</span>${znBadge(n2)}</span></div>${content}</div>`
  }

  const datum = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const badges = [
    schueler.lernschwaeche ? '<span style="background:#fef3c7;color:#92400e;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">LS</span>' : '',
    schueler.legasthenie ? '<span style="background:#ede9fe;color:#5b21b6;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">LEG</span>' : '',
    schueler.spf ? '<span style="background:#fee2e2;color:#991b1b;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">SPF</span>' : '',
  ].join('')

  // Avatar-SVG wird vom Renderer erzeugt und in profil.avatarSvg mitgeliefert (kein DiceBear im Main-Prozess).
  const avatarBox = avatarSvg
    ? `<div style="width:56px;height:56px;border-radius:50%;overflow:hidden;flex-shrink:0">${avatarSvg}</div>`
    : ''

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#1a1a1a;background:#fff}@page{size:A4 portrait;margin:1.5cm}</style></head><body><div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e5e7eb">${avatarBox}<div style="flex:1"><div style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap"><h1 style="font-size:20px;font-weight:700;color:#1a1a1a">${esc(schueler.nachname)} ${esc(schueler.vorname)}</h1>${badges}</div><div style="font-size:11px;color:#6b7280;margin-top:3px">${esc(klassenname)}</div><div style="font-size:10px;color:#9ca3af;margin-top:1px">Leistungsprofil · exportiert am ${datum} · Daskala</div></div></div>${sectionsHtml}</body></html>`
}

// ─── Pfade (lazy: werden in initPaths() nach app.whenReady gesetzt) ───────────
let userDataPath, dbPath, backupDir

function initPaths() {
  userDataPath = app.getPath('userData')
  dbPath = path.join(userDataPath, 'db.sqlite')
  backupDir = path.join(userDataPath, 'backups')
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  // Migration: Daten aus altem Klassenbuch-Verzeichnis übernehmen
  if (!fs.existsSync(dbPath)) {
    const alteDb = path.join(path.dirname(userDataPath), 'Klassenbuch', 'db.sqlite')
    if (fs.existsSync(alteDb)) {
      try {
        fs.copyFileSync(alteDb, dbPath)
        console.log('Datenbank von Klassenbuch nach Daskala migriert.')
      } catch (e) {
        console.error('Migration fehlgeschlagen:', e)
      }
    }
  }
}

// ─── SQLite ───────────────────────────────────────────────────────────────────
let Database
try {
  Database = require('better-sqlite3')
} catch (e) {
  console.error('better-sqlite3 nicht gefunden:', e)
}

let db

// ─── Undo/Redo ────────────────────────────────────────────────────────────────
const undoStack = []
const redoStack = []

function pushUndo(action) {
  undoStack.push(action)
  if (undoStack.length > 50) undoStack.shift()
  redoStack.length = 0
}

function executeUndo() {
  if (undoStack.length === 0) return
  const action = undoStack.pop()
  try { action.undo(); redoStack.push(action) } catch (e) { console.error('Undo fehlgeschlagen:', e) }
  BrowserWindow.getAllWindows()[0]?.webContents.send('undo:applied')
}

function executeRedo() {
  if (redoStack.length === 0) return
  const action = redoStack.pop()
  try { action.redo(); undoStack.push(action) } catch (e) { console.error('Redo fehlgeschlagen:', e) }
  BrowserWindow.getAllWindows()[0]?.webContents.send('undo:applied')
}

function doBackupCreate() {
  const now = new Date()
  const ts = now.toISOString().replace(/:/g, '-').slice(0, 19)
  const backupPath = path.join(backupDir, `db_${ts}.sqlite`)
  try {
    fs.copyFileSync(dbPath, backupPath)
    markiereBackupGemacht()
    return backupPath
  } catch (e) {
    return null
  }
}

async function doSaveAs(win) {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: 'daskala.sqlite',
    filters: [{ name: 'Daskala Datenbank', extensions: ['sqlite'] }],
  })
  if (result.canceled) return false
  try {
    fs.copyFileSync(dbPath, result.filePath)
    markiereBackupGemacht()
    return result.filePath
  } catch (e) {
    return null
  }
}

// Nach einem Datenbank-Wechsel (Öffnen/Wiederherstellen/Zurücksetzen) den frischen
// Zustand anzeigen. In Produktion via sauberem Prozess-Neustart. In der Entwicklung
// würde app.relaunch()+exit über `concurrently -k` den Vite-Dev-Server mitbeenden
// (→ weißes Fenster); dort deshalb die DB neu initialisieren und nur das Fenster neu laden.
function neustartNachDatenwechsel() {
  if (isDev) {
    try { initDB() } catch (e) { logError('initDB(reload)', e) }
    undoStack.length = 0
    redoStack.length = 0
    BrowserWindow.getAllWindows()[0]?.webContents.reload()
  } else {
    app.relaunch()
    app.exit(0)
  }
}

async function doOpen(win) {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Daskala Datenbank', extensions: ['sqlite'] }],
  })
  if (result.canceled) return false
  try {
    db.close()
    fs.copyFileSync(result.filePaths[0], dbPath)
    for (const suffix of ['-wal', '-shm']) {
      const f = dbPath + suffix
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
    }
    neustartNachDatenwechsel()
    return true
  } catch (e) {
    logError('datenbank:importieren', e)
    try { db = new Database(dbPath); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON') } catch (e2) { logError('datenbank:importieren reopen', e2) }
    return null
  }
}

function setupMenu() {
  // Kein Anwendungsmenü (die „Datei/Bearbeiten"-Leiste ist entfernt).
  // Die Tastenkürzel (Rückgängig/Wiederholen, Öffnen, Speichern unter) sind
  // stattdessen in createWindow() über 'before-input-event' registriert.
  Menu.setApplicationMenu(null)
}

// Aktuelle Schema-Version. Erhöhen, wenn eine neue EINMALIGE Migration
// (Daten-Umbau / Tabellen-Rebuild) hinzukommt. Reine Spalten-Ergänzungen
// brauchen das nicht – die laufen idempotent über spalteErgaenzen().
const SCHEMA_VERSION = 1

// Ergänzt eine Spalte nur, wenn sie laut PRAGMA table_info noch fehlt.
// Ersetzt das frühere „ALTER TABLE … ADD COLUMN" in try/catch: kein
// absichtliches Werfen bei jedem Start mehr, echte Fehler landen im Log.
// Tabellen-/Spaltennamen sind ausschließlich feste Literale (keine Eingabe).
function spalteErgaenzen(tabelle, spalte, definition) {
  const vorhanden = db
    .prepare(`PRAGMA table_info(${tabelle})`)
    .all()
    .some((c) => c.name === spalte)
  if (vorhanden) return
  try {
    db.exec(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${definition}`)
  } catch (e) {
    logError(`migration:spalte ${tabelle}.${spalte}`, e)
  }
}

// Räumt alle Nicht-CASCADE-Kinddaten der angegebenen Fächer ab: Noten (über Spalten),
// Änderungsverlauf, Spalten, Zeugnisnoten, Notizen und Stundenplan(-Planung).
// Die faecher-Zeilen selbst bleiben stehen – der Aufrufer löscht sie danach; die
// echten CASCADE-Kinder (schueler_niveau, fach_schueler, jahresplanung, sitzplan …)
// räumt SQLite dabei automatisch ab. Aufrufer ist für die Transaktion zuständig.
function raeumeFachDatenAuf(fachIds) {
  const ids = (Array.isArray(fachIds) ? fachIds : [fachIds]).filter((x) => x != null)
  if (ids.length === 0) return
  const ph = ids.map(() => '?').join(',')
  // Notenraster: Einträge (über Spalten) + Änderungsverlauf + Spalten
  db.prepare(`DELETE FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id IN (${ph}))`).run(...ids)
  db.prepare(`DELETE FROM eintraege_verlauf WHERE fach_id IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM spalten WHERE fach_id IN (${ph})`).run(...ids)
  // Zeugnisnoten + Notizen (kein CASCADE auf fach)
  db.prepare(`DELETE FROM zeugnisnoten WHERE fach_id IN (${ph})`).run(...ids)
  db.prepare(`DELETE FROM notizen WHERE fach_id IN (${ph})`).run(...ids)
  // Stundenplan: Planung kaskadiert zwar über stundenplan, wird aber vor dem
  // Löschen der stundenplan-Zeilen explizit entfernt (Reihenfolge/Klarheit).
  db.prepare(`DELETE FROM stunden_planung WHERE stundenplan_id IN (SELECT id FROM stundenplan WHERE fach_id IN (${ph}))`).run(...ids)
  db.prepare(`DELETE FROM stundenplan WHERE fach_id IN (${ph})`).run(...ids)
}

function initDB() {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Schema-Version einmalig lesen: steuert die nicht-idempotenten Migrationen unten.
  const schemaVersion = db.pragma('user_version', { simple: true })

  db.exec(`
    CREATE TABLE IF NOT EXISTS einstellungen (
      schluessel TEXT PRIMARY KEY,
      wert TEXT
    );

    CREATE TABLE IF NOT EXISTS schuljahre (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bezeichnung TEXT NOT NULL,
      archiviert INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS klassen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schuljahr_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id)
    );

    CREATE TABLE IF NOT EXISTS faecher (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      gewichtung_sa REAL,
      gewichtung_t REAL,
      gewichtung_ma REAL,
      gewichtung_hue REAL,
      gewichtung_custom REAL,
      ma_max_einfluss REAL,
      hue_max_einfluss REAL,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id)
    );

    CREATE TABLE IF NOT EXISTS schueler (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      vorname TEXT NOT NULL,
      nachname TEXT NOT NULL,
      reihenfolge INTEGER DEFAULT 0,
      aktiv INTEGER DEFAULT 1,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id)
    );

    CREATE TABLE IF NOT EXISTS spalten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      semester INTEGER NOT NULL DEFAULT 1,
      kategorie TEXT NOT NULL,
      kuerzel TEXT NOT NULL,
      datum TEXT,
      reihenfolge INTEGER DEFAULT 0,
      eingeklappt INTEGER DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    );

    CREATE TABLE IF NOT EXISTS eintraege (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spalte_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      wert TEXT DEFAULT '',
      UNIQUE(spalte_id, schueler_id),
      FOREIGN KEY (spalte_id) REFERENCES spalten(id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id)
    );

    CREATE TABLE IF NOT EXISTS eintraege_verlauf (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id       INTEGER,
      spalte_id     INTEGER NOT NULL,
      schueler_id   INTEGER NOT NULL,
      wert_alt      TEXT,
      wert_neu      TEXT,
      kommentar_alt TEXT,
      kommentar_neu TEXT,
      zeitstempel   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      aktion        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS zeugnisnoten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      note_berechnet REAL,
      note_manuell INTEGER,
      UNIQUE(fach_id, schueler_id, semester),
      FOREIGN KEY (fach_id) REFERENCES faecher(id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id)
    );

    CREATE TABLE IF NOT EXISTS notizen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      text TEXT DEFAULT '',
      UNIQUE(schueler_id, fach_id),
      FOREIGN KEY (schueler_id) REFERENCES schueler(id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    );

    CREATE TABLE IF NOT EXISTS gewichtung_global (
      kategorie TEXT PRIMARY KEY,
      gewichtung REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stundenzeiten (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stunde INTEGER NOT NULL,
      beginn TEXT NOT NULL,
      ende TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stundenplan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wochentag INTEGER NOT NULL,
      stunde_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      FOREIGN KEY (stunde_id) REFERENCES stundenzeiten(id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id)
    );

    CREATE TABLE IF NOT EXISTS stunden_planung (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stundenplan_id INTEGER NOT NULL,
      woche_datum TEXT NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT NOT NULL DEFAULT '',
      musizieren INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (stundenplan_id) REFERENCES stundenplan(id) ON DELETE CASCADE,
      UNIQUE(stundenplan_id, woche_datum)
    );
  `)

  // ── Spalten-Migration für ältere DBs (idempotent, nur falls Spalte fehlt) ──
  spalteErgaenzen('schueler', 'lernschwaeche', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schueler', 'legasthenie', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schueler', 'spf', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schueler', 'avatar', 'TEXT')
  spalteErgaenzen('klassen', 'farbe', 'TEXT')
  spalteErgaenzen('faecher', 'farbe', 'TEXT')
  spalteErgaenzen('stunden_planung', 'musizieren', 'INTEGER DEFAULT 0')
  spalteErgaenzen('zeugnisnoten', 's1_eingerechnet', 'INTEGER DEFAULT 0')

  // Fach-spezifische Deckelung des MA/HÜ-Einflusses (NULL = globaler Standard).
  // MA & HÜ getrennt steuerbar; frühere gemeinsame Spalte 'ma_hue_max_einfluss' als Migrationsquelle.
  spalteErgaenzen('faecher', 'ma_hue_max_einfluss', 'REAL')
  spalteErgaenzen('faecher', 'ma_max_einfluss', 'REAL')
  spalteErgaenzen('faecher', 'hue_max_einfluss', 'REAL')

  // Einmalige Daten-Migrationen – dürfen NICHT bei jedem Start laufen (siehe user_version).
  if (schemaVersion < 1) {
    // Alte MA/HÜ-Fachgewichte entfernen: MA & HÜ sind nur noch Einfluss, kein Gewicht mehr.
    try {
      db.prepare('UPDATE faecher SET gewichtung_ma = NULL, gewichtung_hue = NULL WHERE gewichtung_ma IS NOT NULL OR gewichtung_hue IS NOT NULL').run()
    } catch (e) { logError('migration:gewichtung-ma-hue-loeschen', e) }
    // Alten gemeinsamen Wert einmalig auf beide getrennten Spalten übertragen.
    // Muss einmalig sein – ein später bewusst geleerter Wert würde sonst neu befüllt.
    try {
      db.prepare('UPDATE faecher SET ma_max_einfluss = ma_hue_max_einfluss, hue_max_einfluss = ma_hue_max_einfluss WHERE ma_hue_max_einfluss IS NOT NULL AND ma_max_einfluss IS NULL AND hue_max_einfluss IS NULL').run()
    } catch (e) { logError('migration:ma-hue-aufteilen', e) }
  }

  // Todos-Tabelle
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titel TEXT NOT NULL,
      erledigt INTEGER DEFAULT 0,
      klasse_id INTEGER,
      fach_id INTEGER,
      faelligkeit TEXT,
      erinnerung TEXT,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE SET NULL
    )
  `)
  spalteErgaenzen('todos', 'faelligkeit', 'TEXT')
  spalteErgaenzen('todos', 'erinnerung', 'TEXT')
  spalteErgaenzen('spalten', 'notiz', 'TEXT')
  spalteErgaenzen('eintraege', 'kommentar', 'TEXT')
  spalteErgaenzen('stunden_planung', 'hue_text', 'TEXT')
  spalteErgaenzen('stunden_planung', 'hue_frist_datum', 'TEXT')
  spalteErgaenzen('stunden_planung', 'link', 'TEXT')
  spalteErgaenzen('stunden_planung', 'entfall', 'INTEGER DEFAULT 0')
  spalteErgaenzen('supplierstunden', 'titel', 'TEXT')
  spalteErgaenzen('supplierstunden', 'inhalt', 'TEXT')
  spalteErgaenzen('supplierstunden', 'hue_text', 'TEXT')
  spalteErgaenzen('supplierstunden', 'hue_frist_datum', 'TEXT')
  spalteErgaenzen('supplierstunden', 'link', 'TEXT')
  spalteErgaenzen('termine', 'stunde_id', 'INTEGER')
  spalteErgaenzen('klassen', 'teams_link', 'TEXT')
  spalteErgaenzen('faecher', 'benotungssystem', "TEXT DEFAULT 'standard'")
  spalteErgaenzen('faecher', 'alle_schueler', 'INTEGER DEFAULT 1')

  // Fach-spezifische Schüler-Teilmenge (Gruppen). Nur befüllt, wenn faecher.alle_schueler = 0.
  db.exec(`
    CREATE TABLE IF NOT EXISTS fach_schueler (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Schüler-Niveau pro Fach (AHS/ST-Differenzierung) — aktueller Stand
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_niveau (
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau TEXT NOT NULL DEFAULT 'AHS',
      PRIMARY KEY (fach_id, schueler_id),
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Niveau-Historie: Verlauf der Wechsel mit Gültigkeitsdatum
  // Pro Wechsel ein Eintrag mit gueltig_ab (TEXT 'YYYY-MM-DD').
  // Das aktuelle Niveau ist der jüngste Eintrag mit gueltig_ab <= heute.
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_niveau_historie (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau TEXT NOT NULL,
      gueltig_ab TEXT NOT NULL,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)
  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_niveau_historie_lookup
      ON schueler_niveau_historie (fach_id, schueler_id, gueltig_ab)`).run()
  } catch {}

  // Termine
  db.exec(`
    CREATE TABLE IF NOT EXISTS termine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titel TEXT NOT NULL,
      datum TEXT NOT NULL,
      uhrzeit TEXT,
      notiz TEXT,
      klasse_id INTEGER,
      schuljahr_id INTEGER NOT NULL,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE SET NULL,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id) ON DELETE CASCADE
    )
  `)

  // Benutzerdefinierte Ferien (Ergänzung/Überschreibung der berechneten Ferien)
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_ferien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schuljahr_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      von TEXT NOT NULL,
      bis TEXT NOT NULL,
      FOREIGN KEY (schuljahr_id) REFERENCES schuljahre(id) ON DELETE CASCADE
    )
  `)

  // Kompetenzbereiche pro Fach
  db.exec(`
    CREATE TABLE IF NOT EXISTS kompetenzbereiche (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL,
      beschreibung TEXT,
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    )
  `)

  // Schüler:innen-Kompetenzen (Niveau pro Kompetenzbereich)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schueler_kompetenzen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kompetenzbereich_id INTEGER NOT NULL,
      schueler_id INTEGER NOT NULL,
      niveau INTEGER NOT NULL DEFAULT 0,
      notiz TEXT,
      aktualisiert TEXT,
      UNIQUE(kompetenzbereich_id, schueler_id),
      FOREIGN KEY (kompetenzbereich_id) REFERENCES kompetenzbereiche(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE CASCADE
    )
  `)

  // Supplierstunden
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplierstunden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      woche_datum TEXT NOT NULL,
      wochentag INTEGER NOT NULL,
      stunde_id INTEGER NOT NULL,
      klasse_text TEXT NOT NULL DEFAULT '',
      fach_text TEXT NOT NULL DEFAULT '',
      notiz TEXT,
      FOREIGN KEY (stunde_id) REFERENCES stundenzeiten(id) ON DELETE CASCADE
    )
  `)

  // Jahresplanung
  db.exec(`
    CREATE TABLE IF NOT EXISTS jahresplanung_abschnitte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT DEFAULT '',
      datum_von TEXT,
      datum_bis TEXT,
      farbe TEXT,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    );
  `)
  // Migration: datum_von/datum_bis nullable machen + reihenfolge hinzufügen.
  // reihenfolge muss VOR dem evtl. Tabellen-Rebuild existieren (wird dort referenziert).
  spalteErgaenzen('jahresplanung_abschnitte', 'reihenfolge', 'INTEGER NOT NULL DEFAULT 0')
  // Einmaliger Tabellen-Rebuild (nur sehr alte DBs) – hier vor abschnitt_materialien,
  // das per FK auf diese Tabelle verweist; darum an dieser Stelle und nicht zentral.
  if (schemaVersion < 1) try {
    // Prüfe ob datum_von noch NOT NULL ist (alte DBs)
    const info = db.prepare("PRAGMA table_info(jahresplanung_abschnitte)").all()
    const vonCol = info.find(c => c.name === 'datum_von')
    if (vonCol && vonCol.notnull === 1) {
      db.exec(`
        CREATE TABLE jahresplanung_abschnitte_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fach_id INTEGER NOT NULL,
          titel TEXT NOT NULL DEFAULT '',
          inhalt TEXT DEFAULT '',
          datum_von TEXT,
          datum_bis TEXT,
          farbe TEXT,
          reihenfolge INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
        );
        INSERT INTO jahresplanung_abschnitte_new (id, fach_id, titel, inhalt, datum_von, datum_bis, farbe, reihenfolge)
          SELECT id, fach_id, titel, inhalt, datum_von, datum_bis, farbe, COALESCE(reihenfolge, 0) FROM jahresplanung_abschnitte;
        DROP TABLE jahresplanung_abschnitte;
        ALTER TABLE jahresplanung_abschnitte_new RENAME TO jahresplanung_abschnitte;
      `)
    }
  } catch (e) { logError('migration:jahresplanung-datum-nullable', e) }
  // Leaf-Ordnername pro Abschnitt (Materialordner). Elternpfade werden live abgeleitet.
  spalteErgaenzen('jahresplanung_abschnitte', 'material_ordner', 'TEXT')
  spalteErgaenzen('jahresplanung_abschnitte', 'lernziele', 'TEXT')
  spalteErgaenzen('jahresplanung_abschnitte', 'kompetenzen', 'TEXT')

  // Materialien pro Abschnitt: Links + optionale Datei-Metadaten (Sidecar keyed by Dateiname).
  // Dokumente selbst liegen als Dateien im Ordner (Wahrheit), hier nur Metadaten.
  db.exec(`
    CREATE TABLE IF NOT EXISTS abschnitt_materialien (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      abschnitt_id INTEGER NOT NULL,
      typ TEXT NOT NULL,               -- 'datei' | 'link'
      ref TEXT NOT NULL,               -- Dateiname (datei) / URL (link)
      anzeigename TEXT,
      beschreibung TEXT,
      reihenfolge INTEGER NOT NULL DEFAULT 0,
      erstellt_am TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (abschnitt_id) REFERENCES jahresplanung_abschnitte(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_abschnitt_materialien_abschnitt
      ON abschnitt_materialien(abschnitt_id);
  `)

  // Sitzplan-Tabellen
  db.exec(`
    CREATE TABLE IF NOT EXISTS sitzplan_fach_zuweisungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitzplatz_id INTEGER NOT NULL,
      fach_id INTEGER NOT NULL,
      schueler_id INTEGER,
      UNIQUE(sitzplatz_id, fach_id),
      FOREIGN KEY (sitzplatz_id) REFERENCES sitzplan_sitzplaetze(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE SET NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS sitzplan_tische (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id INTEGER NOT NULL,
      typ TEXT NOT NULL DEFAULT 'einzel',
      x REAL NOT NULL DEFAULT 100,
      y REAL NOT NULL DEFAULT 100,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sitzplan_sitzplaetze (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tisch_id INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      schueler_id INTEGER,
      UNIQUE(tisch_id, position),
      FOREIGN KEY (tisch_id) REFERENCES sitzplan_tische(id) ON DELETE CASCADE,
      FOREIGN KEY (schueler_id) REFERENCES schueler(id) ON DELETE SET NULL
    );
  `)
  spalteErgaenzen('sitzplan_tische', 'fach_id', 'INTEGER')
  // Drehung eines Tisches in Grad (0/90/180/270) für den Sitzplan.
  spalteErgaenzen('sitzplan_tische', 'rotation', 'INTEGER NOT NULL DEFAULT 0')

  // Sortierung der Schüler:innen-Liste pro Klasse: 'nachname' (Default), 'vorname' oder 'manuell'.
  spalteErgaenzen('klassen', 'sortierung', "TEXT DEFAULT 'nachname'")

  // ─── KV-Modul (Klassenvorstand) ──────────────────────────────────────────────
  spalteErgaenzen('klassen', 'ist_kv', 'INTEGER DEFAULT 0')
  spalteErgaenzen('klassen', 'ist_vorlage', 'INTEGER DEFAULT 0')
  spalteErgaenzen('schuljahre', 'start_datum', 'TEXT')
  spalteErgaenzen('schuljahre', 'end_datum', 'TEXT')
  // Sub-Aufgaben: parent_id auf eigene Tabelle, NULL = Top-Level
  spalteErgaenzen('kv_jahresaufgaben', 'parent_id', 'INTEGER REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE')

  db.exec(`
    -- Jahresaufgaben-Templates
    CREATE TABLE IF NOT EXISTS kv_jahresaufgaben (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      monat        INTEGER NOT NULL,
      titel        TEXT NOT NULL,
      beschreibung TEXT,
      rechtsbezug  TEXT,
      kategorie    TEXT,
      sortierung   INTEGER DEFAULT 0
    );

    -- Erledigungs-Status pro Klasse + Schuljahr
    CREATE TABLE IF NOT EXISTS kv_jahresaufgaben_status (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id   INTEGER NOT NULL REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE,
      schuljahr_id INTEGER NOT NULL REFERENCES schuljahre(id) ON DELETE CASCADE,
      klasse_id    INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      erledigt_am  TEXT,
      notiz        TEXT,
      UNIQUE(aufgabe_id, schuljahr_id, klasse_id)
    );

    -- Wochenaufgaben-Templates
    CREATE TABLE IF NOT EXISTS kv_wochenaufgaben (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titel       TEXT NOT NULL,
      rechtsbezug TEXT,
      sortierung  INTEGER DEFAULT 0,
      aktiv       INTEGER DEFAULT 1
    );

    -- Wochenaufgaben-Status pro Klasse + KW
    CREATE TABLE IF NOT EXISTS kv_wochenaufgaben_status (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id    INTEGER NOT NULL REFERENCES kv_wochenaufgaben(id) ON DELETE CASCADE,
      schuljahr_id  INTEGER NOT NULL REFERENCES schuljahre(id) ON DELETE CASCADE,
      klasse_id     INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      kalenderwoche INTEGER NOT NULL,
      jahr          INTEGER NOT NULL,
      erledigt_am   TEXT,
      notiz         TEXT,
      UNIQUE(aufgabe_id, klasse_id, kalenderwoche, jahr)
    );

    -- Trigger-Events (manuell + automatisch)
    CREATE TABLE IF NOT EXISTS kv_trigger (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      klasse_id    INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      schueler_id  INTEGER REFERENCES schueler(id) ON DELETE CASCADE,
      typ          TEXT NOT NULL,
      schweregrad  TEXT NOT NULL DEFAULT 'info',
      ausloeser    TEXT,
      beschreibung TEXT,
      erstellt_am  TEXT DEFAULT (datetime('now', 'localtime')),
      reagiert_am  TEXT,
      reaktion     TEXT,
      archiviert   INTEGER DEFAULT 0
    );

    -- Aktenvermerke
    CREATE TABLE IF NOT EXISTS kv_aktenvermerke (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id    INTEGER REFERENCES schueler(id) ON DELETE CASCADE,
      klasse_id      INTEGER NOT NULL REFERENCES klassen(id) ON DELETE CASCADE,
      datum          TEXT NOT NULL,
      typ            TEXT NOT NULL,
      titel          TEXT NOT NULL,
      beschreibung   TEXT NOT NULL,
      zeugen         TEXT,
      folgemassnahme TEXT,
      erstellt_am    TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- Elternkontakte
    CREATE TABLE IF NOT EXISTS kv_elternkontakte (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id INTEGER NOT NULL REFERENCES schueler(id) ON DELETE CASCADE,
      datum       TEXT NOT NULL,
      art         TEXT NOT NULL,
      initiator   TEXT NOT NULL,
      thema       TEXT NOT NULL,
      inhalt      TEXT,
      erledigt    INTEGER DEFAULT 1
    );

    -- Fehlstunden
    CREATE TABLE IF NOT EXISTS kv_fehlstunden (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      schueler_id  INTEGER NOT NULL REFERENCES schueler(id) ON DELETE CASCADE,
      datum        TEXT NOT NULL,
      stunden      INTEGER NOT NULL,
      entschuldigt INTEGER NOT NULL DEFAULT 0,
      grund        TEXT
    );
  `)

  try {
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_trigger_klasse_archiv ON kv_trigger (klasse_id, archiviert)`).run()
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_aktenvermerke_klasse ON kv_aktenvermerke (klasse_id, datum DESC)`).run()
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_kv_fehlstunden_schueler ON kv_fehlstunden (schueler_id, datum)`).run()
  } catch {}

  // ─── KV-Seed-Daten (nur bei leeren Tabellen) ────────────────────────────────
  if (db.prepare('SELECT COUNT(*) as c FROM kv_jahresaufgaben').get().c === 0) {
    const ja = db.prepare('INSERT INTO kv_jahresaufgaben (monat, titel, beschreibung, rechtsbezug, kategorie, sortierung) VALUES (?, ?, ?, ?, ?, ?)')
    // Monat (1..12 Kalender), Titel, Beschreibung, Rechtsbezug, Kategorie, Sortierung
    const seeds = [
      // September — Schulbeginn, Organisation
      [9, 'Klassenliste & Sitzplan',         'Aktuelle Klassenliste prüfen, Sitzplan festlegen.', null,          'organisation', 1],
      [9, 'Begrüßung & Klassenregeln',       'Erste Klassenstunde, Regeln gemeinsam besprechen.', null,          'organisation', 2],
      [9, 'Belehrungen durchführen',         'Hausordnung, Brandschutz, Verhalten bei Unfällen.', '§ 47 SchUG',   'doku',         3],
      [9, 'Notfallkontakte einholen',        'Telefon- und Mailadressen der Eltern aktualisieren.', null,        'doku',         4],
      [9, 'Klassendienste verteilen',        'Tafeldienst, Garderobendienst, Klassenbuchführung.', null,         'organisation', 5],
      [9, 'Termin Klassenforum festlegen',   'Datum für das Klassenforum vorbereiten.',          '§ 63a SchUG',  'elternarbeit', 6],
      // Oktober — Elternarbeit, Beobachtung
      [10, 'Klassenforum durchführen',       'Wahl Elternvertretung, Information über Vorhaben.','§ 63a SchUG', 'elternarbeit', 1],
      [10, 'Erste Elterngespräche',          'Persönlicher Kontakt zu allen Familien herstellen.', null,        'elternarbeit', 2],
      [10, 'Klassendynamik beobachten',      'Erste Aktenvermerke zu auffälligem Verhalten.',     null,         'doku',         3],
      [10, 'Schulveranstaltungen planen',    'Wandertage, Projekttage langfristig vorbereiten.',  null,         'organisation', 4],
      // November — Leistungsstand
      [11, 'Leistungsstand erheben',         'Mit Fachlehrer:innen Rücksprache halten.',          '§ 54 SchUG', 'doku',         1],
      [11, 'Elternsprechtag',                'Vorbereitung & Durchführung.',                       null,        'elternarbeit', 2],
      [11, 'Frühwarnungen vorbereiten',      'Schüler:innen mit Gefährdung dokumentieren.',       '§ 19 SchUG','doku',         3],
      [11, 'Aktenvermerke aktualisieren',    'Beobachtungen verschriftlichen.',                    null,        'doku',         4],
      // Dezember — Frühwarnungen, Konferenz
      [12, 'Frühwarnungen versenden',        'Schriftliche Verständigung Eltern + Bestätigung.', '§ 19 Abs. 4 SchUG','doku',  1],
      [12, 'Konferenzanträge einbringen',    'Vorbereitung Notenkonferenz Semester 1.',           null,        'konferenz',    2],
      [12, 'Verhaltensbeurteilung vorbereiten','Vorschläge zur Verhaltensnote.',                  '§ 20 SchUG', 'konferenz',    3],
      [12, 'Weihnachtsfeier organisieren',   'Klassenaktion zum Semesterende.',                    null,        'organisation', 4],
      // Jänner — Semester 1 abschließen
      [1, 'Notenkonferenz Sem. 1',           'Teilnahme + Protokollführung.',                      '§ 20 SchUG', 'konferenz',    1],
      [1, 'Schulnachrichten ausgeben',       'Verteilung und Empfangsbestätigung.',                '§ 19 SchUG', 'doku',         2],
      [1, 'Elterngespräche bei Gefährdung',  'Persönliche Rücksprache bei NG/Frühwarnung.',        null,        'elternarbeit', 3],
      [1, 'Aktenvermerke verifizieren',      'Vollständigkeit aller Vorfälle prüfen.',             null,        'doku',         4],
      // Februar — Semester 2 startet
      [2, 'Semester 2 — Zielvereinbarungen', 'Mit der Klasse neue Ziele formulieren.',             null,        'organisation', 1],
      [2, 'Schulveranstaltungen Sem.2',      'Sportwoche, Projekttage anmelden + genehmigen.',     null,        'organisation', 2],
      [2, 'Fehlstundenkonto prüfen',         'Grenzen 5/15/30 Stunden im Auge behalten.',          '§ 45 SchUG','doku',         3],
      // März — Standortbestimmung
      [3, 'Leistungsstand erheben',          'Zweite Rücksprache mit Fachlehrer:innen.',           '§ 54 SchUG','doku',         1],
      [3, 'Elternsprechtag',                 'Frühjahrs-Sprechtag durchführen.',                   null,        'elternarbeit', 2],
      [3, 'Aktenvermerke aktualisieren',     'Quartalsweise Sichtung.',                            null,        'doku',         3],
      [3, 'Berufsorientierung planen',       'Falls altersrelevant: BO-Termine festlegen.',        null,        'organisation', 4],
      // April — Frühwarnungen 2
      [4, 'Frühwarnungen Sem. 2 versenden',  'Schriftliche Verständigung bei Gefährdung.',         '§ 19 SchUG','doku',         1],
      [4, 'Elterngespräche bei NG-Gefahr',   'Persönlicher Kontakt + Folgemaßnahmen.',             null,        'elternarbeit', 2],
      [4, 'Schulveranstaltungs-Check',       'Genehmigungsstatus aller geplanten Aktionen.',       null,        'organisation', 3],
      // Mai — Endphase Vorbereitung
      [5, 'Konferenzanträge einbringen',     'Vorbereitung Schlusskonferenz, Verhaltensnoten.',    '§ 20 SchUG','konferenz',    1],
      [5, 'Verhaltensbeurteilung finalisieren','Endbewertung Verhalten.',                          '§ 20 SchUG','konferenz',    2],
      [5, 'Aktenvermerke schließen',         'Offene Vorfälle dokumentieren und abschließen.',     null,        'doku',         3],
      [5, 'Klassenausflug organisieren',     'Letzte Aktion vor Schulschluss.',                    null,        'organisation', 4],
      // Juni — Abschluss
      [6, 'Notenkonferenz Schulschluss',     'Teilnahme + Beschluss Aufstiegsentscheidungen.',     '§ 20 SchUG','konferenz',    1],
      [6, 'Zeugnisse vorbereiten',           'Zeugnisformulare, Vermerke, Unterschriften.',        null,        'doku',         2],
      [6, 'Zeugnisverteilung',               'Persönliche Übergabe + Abschluss.',                  null,        'organisation', 3],
      [6, 'Klassendokumentation archivieren','KV-Akten ordentlich ablegen.',                        null,        'doku',         4],
      [6, 'Rückmeldung an Direktion',        'KV-Jahresbericht (kurz).',                            null,        'doku',         5],
      // Juli / August — Nachhol, Wiederholungsprüfungen
      [7, 'Wiederholungsprüfungen begleiten','Termine kommunizieren, organisatorische Unterstützung.','§ 23 SchUG','organisation',1],
      [8, 'Vorbereitung neues Schuljahr',    'Klassenliste sichten, Sitzplan-Entwurf, To-Dos sammeln.',null,    'organisation', 1],
    ]
    for (const s of seeds) ja.run(...s)
  }

  if (db.prepare('SELECT COUNT(*) as c FROM kv_wochenaufgaben').get().c === 0) {
    const wa = db.prepare('INSERT INTO kv_wochenaufgaben (titel, rechtsbezug, sortierung) VALUES (?, ?, ?)')
    const wseeds = [
      ['Klassenbuch durchgesehen',                  '§ 54 SchUG', 1],
      ['Entschuldigungen eingesammelt',             '§ 45 SchUG', 2],
      ['Fehlstundenkonto geprüft (5/15/30 h)',      null,         3],
      ['Rückmeldungen vom Lehrer:innenteam',        '§ 54 SchUG', 4],
      ['Aktenvermerke nachgezogen',                 null,         5],
      ['Offene Eltern-Rückrufe/Mails',              '§ 48 SchUG', 6],
      ['Wochenausblick (Termine, Veranstaltungen)', null,         7],
    ]
    for (const w of wseeds) wa.run(...w)
  }

  // Standard-Gewichtungen (Summe = 100 %)
  // Nur bei frischer DB werden alle eingefügt; bestehende Werte bleiben unangetastet.
  const insertGewichtung = db.prepare(
    'INSERT OR IGNORE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)'
  )
  insertGewichtung.run('SA', 0.35)
  insertGewichtung.run('T', 0.25)
  insertGewichtung.run('MA', 0.20)
  insertGewichtung.run('HÜ', 0.10)
  insertGewichtung.run('CUSTOM', 0.10)

  // Duplikate in stundenzeiten bereinigen (fehlerhafter INSERT OR IGNORE ohne UNIQUE)
  db.prepare(`
    DELETE FROM stundenzeiten WHERE id NOT IN (
      SELECT MIN(id) FROM stundenzeiten GROUP BY stunde
    )
  `).run()

  // Standard-Stundenzeiten nur einfügen wenn Tabelle leer
  const stundenCount = db.prepare('SELECT COUNT(*) as c FROM stundenzeiten').get().c
  if (stundenCount === 0) {
    const stunden = [
      [1, '07:55', '08:40'],
      [2, '08:45', '09:30'],
      [3, '09:45', '10:30'],
      [4, '10:35', '11:20'],
      [5, '11:25', '12:10'],
      [6, '12:15', '13:00'],
      [7, '13:05', '13:50'],
      [8, '13:55', '14:40'],
    ]
    const insertStunde = db.prepare(
      'INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)'
    )
    for (const [stunde, beginn, ende] of stunden) {
      insertStunde.run(stunde, beginn, ende)
    }
  }

  // Standard-Einstellungen
  const insertEinstellung = db.prepare(
    'INSERT OR IGNORE INTO einstellungen (schluessel, wert) VALUES (?, ?)'
  )
  insertEinstellung.run('erststart_abgeschlossen', '0')
  insertEinstellung.run('theme', 'hell')
  insertEinstellung.run('ma_plus_wert', '1')
  insertEinstellung.run('ma_minus_wert', '5')
  insertEinstellung.run('semester2_monat', '2')
  // Planungs-Features (Stundenplan, Jahres-/Klassenplanung) — default aus.
  // Wer die Planung in Daskala separat zu einem Tool wie Teachino nutzen möchte,
  // schaltet das in den Einstellungen ein.
  insertEinstellung.run('planung_aktiv', '0')

  // Aktuelles Schuljahr ermitteln
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const schuljahrBez = month >= 9
    ? `${year}/${String(year + 1).slice(2)}`
    : `${year - 1}/${String(year).slice(2)}`
  insertEinstellung.run('schuljahr_aktuell', schuljahrBez)

  const semester = month >= 9 || month <= 1 ? '1' : '2'
  insertEinstellung.run('semester_aktuell', semester)

  // Alle einmaligen Migrationen dieser Version sind durchlaufen → Schema-Version festschreiben.
  if (schemaVersion < SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`)
}

// ─── Backup ───────────────────────────────────────────────────────────────────
function createBackup() {
  const today = new Date().toISOString().slice(0, 10)
  const backupPath = path.join(backupDir, `db_${today}.sqlite`)
  if (!fs.existsSync(backupPath)) {
    try {
      fs.copyFileSync(dbPath, backupPath)
      // Max 30 Backups lokal
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('db_') && f.endsWith('.sqlite'))
        .sort()
      if (backups.length > 30) {
        const toDelete = backups.slice(0, backups.length - 30)
        toDelete.forEach(f => fs.unlinkSync(path.join(backupDir, f)))
      }
    } catch (e) {
      console.error('Backup fehlgeschlagen:', e)
    }
  }

}

// ─── Sicherungs-Erinnerung, automatische & Vor-Update-Sicherungen ────────────
const BACKUP_ERINNERUNG_TAGE = 4   // nach so vielen Tagen ohne Sicherung erinnern

function bkGet(key) {
  return db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(key)?.wert ?? null
}
function bkSet(key, wert) {
  db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run(key, wert)
}

// Kopiert die aktuelle Datenbank als Zeitstempel-Datei in einen Zielordner und
// behält (falls `max` gesetzt) nur die neuesten `max` Dateien dieses Präfixes.
function schreibeBackupInOrdner(ordner, prefix, max) {
  try {
    if (!ordner) return null
    if (!fs.existsSync(ordner)) fs.mkdirSync(ordner, { recursive: true })
    const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19)
    const ziel = path.join(ordner, `${prefix}_${ts}.sqlite`)
    fs.copyFileSync(dbPath, ziel)
    if (max) {
      const alte = fs.readdirSync(ordner)
        .filter(f => f.startsWith(prefix + '_') && f.endsWith('.sqlite'))
        .sort()
      if (alte.length > max) {
        alte.slice(0, alte.length - max).forEach(f => { try { fs.unlinkSync(path.join(ordner, f)) } catch {} })
      }
    }
    return ziel
  } catch (e) {
    logError('schreibeBackupInOrdner', e)
    return null
  }
}

// Merkt sich, dass gerade gesichert wurde → setzt die Erinnerungsuhr zurück.
function markiereBackupGemacht() {
  try { bkSet('backup_letzte', new Date().toISOString()); bkSet('backup_snooze_bis', '') } catch (e) { logError('markiereBackupGemacht', e) }
}

function backupAutoAktiv() {
  return bkGet('backup_automatisch') === '1' && !!bkGet('backup_ordner')
}

// Wie viele automatische Sicherungen aufbewahrt werden (konfigurierbar).
function backupMax() {
  return Math.max(1, parseInt(bkGet('backup_max'), 10) || BACKUP_MAX_STANDARD)
}

// Aktuelle Signatur der Datenbank (Größe + Zeitstempel) für die Änderungserkennung.
function dbSignatur() {
  try { const st = fs.statSync(dbPath); return `${st.size}-${Math.round(st.mtimeMs)}` } catch { return '' }
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
function sammleBackups() {
  const out = []
  const scan = (dir, quelle) => {
    if (!dir) return
    let files = []
    try { files = fs.readdirSync(dir) } catch { return }
    for (const name of files) {
      if (!name.endsWith('.sqlite')) continue
      try {
        const p = path.join(dir, name)
        const st = fs.statSync(p)
        if (!st.isFile()) continue
        out.push({ pfad: p, name, quelle, art: backupArt(name), datumIso: new Date(st.mtimeMs).toISOString(), groesse: st.size })
      } catch { /* Datei überspringen */ }
    }
  }
  scan(backupDir, 'intern')
  const ordner = bkGet('backup_ordner')
  if (ordner && path.resolve(ordner) !== path.resolve(backupDir)) scan(ordner, 'ordner')
  out.sort((a, b) => b.datumIso.localeCompare(a.datumIso))
  return out
}

// Standardanzahl aufbewahrter automatischer Sicherungen.
const BACKUP_MAX_STANDARD = 10

// Beim Start: automatische Sicherung – aber sparsam:
//   • höchstens einmal pro Tag,
//   • nur wenn sich die Datenbank seit der letzten Auto-Sicherung geändert hat,
//   • es werden nur die letzten N Sicherungen behalten (ältere gelöscht).
function autoBackupWennAktiv() {
  try {
    if (!backupAutoAktiv()) return
    const heute = new Date().toISOString().slice(0, 10)
    if ((bkGet('backup_letzte') || '').slice(0, 10) === heute) return   // max. 1×/Tag
    // WAL in die Hauptdatei schreiben – macht die Sicherung vollständig und die
    // Änderungserkennung (Größe/Zeitstempel) zuverlässig.
    try { db.pragma('wal_checkpoint(TRUNCATE)') } catch {}
    const sig = dbSignatur()
    if (sig && sig === bkGet('backup_auto_sig')) return   // unverändert → keine neue Kopie
    const p = schreibeBackupInOrdner(bkGet('backup_ordner'), 'Daskala-Sicherung', backupMax())
    if (p) { markiereBackupGemacht(); if (sig) bkSet('backup_auto_sig', sig) }
  } catch (e) { logError('autoBackupWennAktiv', e) }
}

// Vor einem Update eine Sicherung anlegen – intern und (falls konfiguriert) im Zielordner.
function backupVorUpdate() {
  try {
    schreibeBackupInOrdner(backupDir, 'db_vor-update', null)
    const ordner = bkGet('backup_ordner')
    if (ordner) schreibeBackupInOrdner(ordner, 'Daskala-vor-Update', 10)
    markiereBackupGemacht()
  } catch (e) { logError('backupVorUpdate', e) }
}

// ─── App-Sperre (PIN) ────────────────────────────────────────────────────────
// Merkt sich, ob die App gerade gesperrt ist (blockiert Tastenkürzel).
let appGesperrt = false
function hashPin(pin) {
  return require('crypto').createHash('sha256').update('daskala-pin:' + String(pin)).digest('hex')
}

// ─── Wetter (Open-Meteo, kostenlos, ohne API-Key) ────────────────────────────
const https = require('https')
// Näherung: Koordinaten der Landeshauptstädte je Bundesland.
const WETTER_KOORD = {
  'Wien':             [48.2082, 16.3738],
  'Niederösterreich': [48.2047, 15.6256],
  'Burgenland':       [47.8457, 16.5231],
  'Oberösterreich':   [48.3069, 14.2858],
  'Steiermark':       [47.0707, 15.4395],
  'Kärnten':          [46.6247, 14.3050],
  'Salzburg':         [47.8095, 13.0550],
  'Tirol':            [47.2692, 11.4041],
  'Vorarlberg':       [47.5031,  9.7471],
}
const wetterCache = new Map()   // key -> { zeit, data }

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Daskala' } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return }
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => req.destroy(new Error('timeout')))
  })
}

// ─── Zeugnisnoten-Berechnung ──────────────────────────────────────────────────
// ─── Kompetenz-Vorlagen (Lehrplan NEU) ──────────────────────────────────────
const KOMPETENZ_VORLAGEN = {
  'deutsch': ['Zuhören und Sprechen', 'Lesen', 'Verfassen von Texten (Schreiben)', 'Sprachbewusstsein'],
  'mathematik': ['Zahlen und Operationen', 'Größen und Messen', 'Raum und Form', 'Daten und Zufall', 'Funktionale Zusammenhänge'],
  'englisch': ['Hören (Listening)', 'Lesen (Reading)', 'An Gesprächen teilnehmen', 'Zusammenhängendes Sprechen', 'Schreiben (Writing)'],
  'biologie': ['Wissen organisieren', 'Erkenntnisse gewinnen', 'Schlüsse ziehen', 'Handeln'],
  'geographie': ['Orientierungskompetenz', 'Synthesekompetenz', 'Methodenkompetenz', 'Handlungskompetenz'],
  'geschichte': ['Historische Fragekompetenz', 'Historische Methodenkompetenz', 'Historische Sachkompetenz', 'Historische Orientierungskompetenz'],
  'physik': ['Wissen organisieren', 'Erkenntnisse gewinnen', 'Schlüsse ziehen', 'Handeln'],
  'chemie': ['Wissen organisieren', 'Erkenntnisse gewinnen', 'Schlüsse ziehen', 'Handeln'],
  'musik': ['Singen und Musizieren', 'Hören und Erfassen', 'Bewegen und Darstellen', 'Wissen und Reflektieren'],
  'bildnerische erziehung': ['Wahrnehmen', 'Gestalten', 'Reflektieren'],
}

function initKompetenzVorlagen(fachId, fachName) {
  if (!fachName) return
  const nameLower = fachName.toLowerCase()
  const match = Object.keys(KOMPETENZ_VORLAGEN).find(key => nameLower.includes(key))
  if (!match) return
  const vorlagen = KOMPETENZ_VORLAGEN[match]
  const existing = db.prepare('SELECT COUNT(*) as c FROM kompetenzbereiche WHERE fach_id = ?').get(fachId)
  if (existing.c > 0) return // Bereits Kompetenzbereiche vorhanden
  const insert = db.prepare('INSERT INTO kompetenzbereiche (fach_id, titel, reihenfolge) VALUES (?, ?, ?)')
  vorlagen.forEach((titel, idx) => insert.run(fachId, titel, idx))
}

// Niveau-Auflösung für ein Datum aus der Historie. niveauHist absteigend sortiert nach gueltig_ab.
// Fallback: aktuelles Niveau (jüngster Eintrag bzw. übergebener Default).
function niveauZurZeit(niveauHist, datum, fallback) {
  if (!niveauHist || niveauHist.length === 0) return fallback
  if (!datum) return niveauHist[0].niveau
  for (const h of niveauHist) {
    if (h.gueltig_ab <= datum) return h.niveau
  }
  // Datum vor erstem Historien-Eintrag → ältestes bekanntes Niveau
  return niveauHist[niveauHist.length - 1].niveau
}

// Offset für interne 1-7-Skala bei differenzierten Fächern. AHS → 0, ST → +2.
function niveauOffset(niveau) { return niveau === 'ST' ? 2 : 0 }

// Interner Notenwert (bei differenzierten Fächern 1-7) → angezeigte ganze Zeugnisnote (1-5).
// Bei Standardfächern (istDifferenziert = false) ist der Offset 0 → reine Rundung/Deckelung.
// Spiegelt die Bildschirm-Logik aus ZeugnisnoteZelle.jsx für konsistente Werte im Export.
function znInternZuAnzeige(intern, niveau, istDifferenziert) {
  if (intern === null || intern === undefined) return null
  const off = istDifferenziert ? niveauOffset(niveau) : 0
  return Math.max(1, Math.min(5, Math.round(intern - off)))
}

function berechneZeugnisnote(fachId, schuelerId, semester) {
  const fach = db.prepare('SELECT * FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return { note: null }

  const istDifferenziert = fach.benotungssystem === 'differenziert'
  const maxNote = istDifferenziert ? 7 : 5

  // Niveau-Historie laden (nur bei differenzierten Fächern relevant)
  let niveauHist = []
  let niveauFallback = 'AHS'
  if (istDifferenziert) {
    niveauHist = db.prepare(`
      SELECT niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ?
      ORDER BY gueltig_ab DESC, id DESC
    `).all(fachId, schuelerId)
    niveauFallback = db.prepare(
      'SELECT niveau FROM schueler_niveau WHERE fach_id = ? AND schueler_id = ?'
    ).get(fachId, schuelerId)?.niveau ?? 'AHS'
  }
  const offsetFor = (datum) => istDifferenziert
    ? niveauOffset(niveauZurZeit(niveauHist, datum, niveauFallback))
    : 0
  const aktuellerOffset = istDifferenziert ? niveauOffset(niveauFallback) : 0

  // Gewichte der NOTE-BILDENDEN Kategorien (nur SA, Test, Individuell).
  // Mitarbeit & Hausübung bilden KEINE Note mehr, sondern verschieben sie nur leicht (siehe unten).
  const globaleGewichtung = {}
  db.prepare('SELECT * FROM gewichtung_global').all()
    .forEach(r => { globaleGewichtung[r.kategorie] = r.gewichtung })
  const gew = {
    SA: fach.gewichtung_sa ?? globaleGewichtung['SA'] ?? 0.4,
    T: fach.gewichtung_t ?? globaleGewichtung['T'] ?? 0.3,
    CUSTOM: fach.gewichtung_custom ?? globaleGewichtung['CUSTOM'] ?? 0.0,
  }

  // Maximaler Einfluss von Mitarbeit bzw. Hausübung in Notenstufen (niveau-frei), getrennt steuerbar.
  // Fach-Deckelung (faecher.ma_max_einfluss / hue_max_einfluss) hat Vorrang vor dem globalen Wert;
  // ältere Installationen fallen auf den gemeinsamen Alt-Wert 'ma_hue_max_einfluss' (Standard 0,5) zurück.
  const globalAltEinfluss = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_hue_max_einfluss'").get()?.wert
  const globalMaEinfluss = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_max_einfluss'").get()?.wert ?? globalAltEinfluss ?? '0.5'
  const globalHueEinfluss = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'hue_max_einfluss'").get()?.wert ?? globalAltEinfluss ?? '0.5'
  const maxMaEinfluss = fach.ma_max_einfluss != null ? fach.ma_max_einfluss : parseFloat(globalMaEinfluss)
  const maxHueEinfluss = fach.hue_max_einfluss != null ? fach.hue_max_einfluss : parseFloat(globalHueEinfluss)
  // Einfluss pro einzelnem Eintrag (jedes +/✓ bzw. −/✗). Standard 0,1.
  const einflussSchritt = parseFloat(
    db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_hue_schritt'").get()?.wert ?? '0.1'
  )

  const spalten = db.prepare(
    'SELECT * FROM spalten WHERE fach_id = ? AND semester = ?'
  ).all(fachId, semester)

  // Basisnote aus echten Noten (SA/T/Individuell, intern inkl. Niveau-Offset).
  const basisWerte = { SA: [], T: [], CUSTOM: [] }
  // Mitarbeit & Hausübung werden nur gezählt (niveau-frei, keine Noten).
  let maPlus = 0, maMinus = 0, huePos = 0, hueNeg = 0

  for (const spalte of spalten) {
    const wert = db.prepare(
      'SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?'
    ).get(spalte.id, schuelerId)?.wert ?? ''
    if (!wert) continue

    if (spalte.kategorie === 'MA') {
      if (wert === '+') maPlus++
      else if (wert === '-') maMinus++
    } else if (spalte.kategorie === 'HÜ') {
      if (wert === '✓') huePos++
      else if (wert === '✗') hueNeg++
      // '—' = "nicht gewertet / entfällt": bewusst ohne Noteneinfluss, zählt nicht mit.
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
      const n = parseInt(wert)
      if (n >= 1 && n <= 5) basisWerte[spalte.kategorie].push(n + offsetFor(spalte.datum))
    } else if (spalte.kategorie === 'CUSTOM') {
      const n = parseInt(wert)
      if (!isNaN(n) && n >= 1 && n <= 5) basisWerte.CUSTOM.push(n + offsetFor(spalte.datum))
    }
  }

  // Basisnote: gewichteter Durchschnitt; Gewichte der vorhandenen Kategorien werden neu normiert.
  let summe = 0, gesamtGewichtung = 0
  for (const [kat, werte] of Object.entries(basisWerte)) {
    if (werte.length === 0) continue
    const w = gew[kat] ?? 0
    if (w === 0) continue
    const avg = werte.reduce((a, b) => a + b, 0) / werte.length
    summe += avg * w
    gesamtGewichtung += w
  }
  const hatBasis = gesamtGewichtung > 0
  const basisIntern = hatBasis ? summe / gesamtGewichtung : null

  // MA-/HÜ-Einfluss "pro Eintrag": jeder Eintrag ein kleiner Schritt. MA und HÜ wirken UNABHÄNGIG
  // voneinander – jeweils eigene Deckelung, danach summiert. Positiv = verbessert.
  const maGesamt = maPlus + maMinus
  const hueGesamt = huePos + hueNeg
  const hatMAHUE = maGesamt > 0 || hueGesamt > 0

  let maEinfluss = maGesamt > 0 ? (maPlus - maMinus) * einflussSchritt : 0
  maEinfluss = Math.max(-maxMaEinfluss, Math.min(maxMaEinfluss, maEinfluss))
  let hueEinfluss = hueGesamt > 0 ? (huePos - hueNeg) * einflussSchritt : 0
  hueEinfluss = Math.max(-maxHueEinfluss, Math.min(maxHueEinfluss, hueEinfluss))
  const einfluss = maEinfluss + hueEinfluss

  // Verhältnis (−1…+1) nur für die grobe Fallback-Note, wenn es keine echten Noten gibt.
  const ratios = []
  if (maGesamt > 0) ratios.push((maPlus - maMinus) / maGesamt)
  if (hueGesamt > 0) ratios.push((huePos - hueNeg) / hueGesamt)
  const verhaeltnis = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0

  let noteIntern
  if (hatBasis) {
    noteIntern = basisIntern - einfluss  // viele +/✓ verbessern → kleinerer Wert
  } else if (hatMAHUE) {
    // Keine echten Noten → grobe, niveau-freie Orientierungsnote aus MA/HÜ:
    // +1 → 1, 0 → 3, −1 → 5. + aktuellerOffset, damit die Anzeige (− Offset) sie niveau-frei zeigt.
    noteIntern = (3 - verhaeltnis * 2) + aktuellerOffset
  } else {
    return { note: null }
  }

  noteIntern = Math.max(1, Math.min(maxNote, noteIntern))
  return { note: Math.round(noteIntern * 10) / 10 }
}

function berechneEndnote(fachId, schuelerId) {
  const s1Zn = db.prepare('SELECT note_manuell, note_berechnet FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = 1').get(fachId, schuelerId)
  const s2Zn = db.prepare('SELECT note_manuell, note_berechnet FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = 2').get(fachId, schuelerId)
  const s1Note = s1Zn?.note_manuell ?? s1Zn?.note_berechnet ?? null
  const s2Note = s2Zn?.note_manuell ?? s2Zn?.note_berechnet ?? null
  if (s1Note !== null && s2Note !== null) {
    const s1Gewicht = parseFloat(db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 's1_gewichtung'").get()?.wert ?? '0.5')
    return Math.round((s1Note * s1Gewicht + s2Note * (1 - s1Gewicht)) * 10) / 10
  }
  if (s1Note !== null) return s1Note
  if (s2Note !== null) return s2Note
  return null
}

// Alle Fächer im angegebenen Schuljahr neu berechnen
function berechneAlleFuerSchuljahr(schuljahrId) {
  if (!schuljahrId) return
  const faecher = db.prepare(`
    SELECT f.id FROM faecher f
    JOIN klassen k ON f.klasse_id = k.id
    WHERE k.schuljahr_id = ?
  `).all(schuljahrId)
  for (const f of faecher) berechneAlleFuerFach(f.id)
}

// Roster eines Fachs: alle_schueler=1 → alle aktiven Klassen-Schüler:innen (live, kein Junction);
// alle_schueler=0 → nur die in fach_schueler eingetragene Teilmenge. Der "alle"-Zweig fragt
// fach_schueler NIE ab → Altbestand (Default 1, keine Junction-Zeilen) liefert korrekt alle.
function rosterFuerFach(fachId) {
  const fach = db.prepare('SELECT klasse_id, alle_schueler FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return []
  if (fach.alle_schueler) {
    return db.prepare('SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY reihenfolge, nachname, vorname').all(fach.klasse_id)
  }
  return db.prepare(`
    SELECT s.* FROM schueler s
    JOIN fach_schueler fs ON fs.schueler_id = s.id
    WHERE fs.fach_id = ? AND s.aktiv = 1
    ORDER BY s.reihenfolge, s.nachname, s.vorname
  `).all(fachId)
}
function rosterIdsFuerFach(fachId) {
  return rosterFuerFach(fachId).map(s => s.id)
}

// Alle Zeugnisnoten für ein Fach neu berechnen (Roster-Schüler:innen, S1+S2+Endnote)
function berechneAlleFuerFach(fachId) {
  const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return
  const schueler = rosterIdsFuerFach(fachId).map(id => ({ id }))
  if (!schueler.length) return
  // Immer aktualisieren (auch wenn note=null), damit veraltete Werte überschrieben werden
  const upsert = db.prepare(`
    INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(fach_id, schueler_id, semester)
    DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
  `)
  const updateOnly = db.prepare(`
    UPDATE zeugnisnoten SET note_berechnet = ?, s1_eingerechnet = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?
  `)
  db.transaction(() => {
    // Erst S1 und S2 berechnen
    for (const s of schueler) {
      for (const sem of [1, 2]) {
        const { note } = berechneZeugnisnote(fachId, s.id, sem)
        if (note !== null) {
          upsert.run(fachId, s.id, sem, note, 0)
        } else {
          // Veralteten Wert löschen (falls Zeile existiert)
          updateOnly.run(null, 0, fachId, s.id, sem)
        }
      }
    }
    // Dann Endnote (liest die eben gespeicherten S1/S2-Noten)
    for (const s of schueler) {
      const endnote = berechneEndnote(fachId, s.id)
      if (endnote !== null) {
        upsert.run(fachId, s.id, 3, endnote, 1)
      } else {
        updateOnly.run(null, 1, fachId, s.id, 3)
      }
    }
  })()
}

// ─── KV-Trigger-Helper ────────────────────────────────────────────────────────
// Erzeugt einen Trigger, falls noch kein offener gleicher Art für die Person/Klasse existiert.
function erzeugeTrigger(klasseId, schuelerId, typ, schweregrad, ausloeser, beschreibung) {
  const existing = db.prepare(`
    SELECT id FROM kv_trigger
    WHERE klasse_id = ?
      AND COALESCE(schueler_id, -1) = COALESCE(?, -1)
      AND typ = ?
      AND archiviert = 0
  `).get(klasseId, schuelerId ?? null, typ)
  if (existing) return existing.id
  const info = db.prepare(`
    INSERT INTO kv_trigger (klasse_id, schueler_id, typ, schweregrad, ausloeser, beschreibung)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(klasseId, schuelerId ?? null, typ, schweregrad, ausloeser ?? null, beschreibung ?? null)
  return info.lastInsertRowid
}

// Prüft Fehlstunden-Schwellen für einen Schüler (≥15 warn, ≥30 critical).
// Archiviert auch wieder, wenn unter Schwelle gefallen.
function pruefeFehlstundenSchwellen(schuelerId) {
  const schueler = db.prepare('SELECT id, klasse_id FROM schueler WHERE id = ?').get(schuelerId)
  if (!schueler) return
  const klasse = db.prepare('SELECT ist_kv FROM klassen WHERE id = ?').get(schueler.klasse_id)
  if (!klasse?.ist_kv) return  // Trigger nur bei KV-Klassen
  const summe = db.prepare(`
    SELECT COALESCE(SUM(stunden), 0) AS s FROM kv_fehlstunden
    WHERE schueler_id = ? AND entschuldigt = 0
  `).get(schuelerId).s

  const setzeOderArchiviereTrigger = (typ, schweregrad, schwelle, label) => {
    if (summe >= schwelle) {
      erzeugeTrigger(schueler.klasse_id, schuelerId, typ, schweregrad,
        `${summe} unentschuldigte Fehlstunden (Schwelle ${schwelle})`, label)
    } else {
      // Archivieren wenn unter Schwelle und offen
      db.prepare(`
        UPDATE kv_trigger SET archiviert = 1, reagiert_am = datetime('now','localtime'),
          reaktion = COALESCE(reaktion, 'Schwelle unterschritten')
        WHERE klasse_id = ? AND schueler_id = ? AND typ = ? AND archiviert = 0
      `).run(schueler.klasse_id, schuelerId, typ)
    }
  }
  setzeOderArchiviereTrigger('fehlstunden_30', 'critical', 30, '§ 45 SchUG — Schulpflichtverletzung')
  setzeOderArchiviereTrigger('fehlstunden_15', 'warn',     15, '§ 45 SchUG — frühzeitige Warnung')
}

// Prüft, ob nach einem Note-Eintrag eine Frühwarnung erzeugt werden soll.
function pruefeNotenTrigger(spalteId, schuelerId, wertNeu, wertAlt) {
  if (!wertNeu) return
  // Nur SA/T/CUSTOM-Noten (1..5) sind relevant
  const n = parseInt(wertNeu)
  if (!(n >= 1 && n <= 5)) return
  const spalte = db.prepare('SELECT s.kategorie, s.fach_id, f.klasse_id, f.name AS fach_name FROM spalten s JOIN faecher f ON f.id = s.fach_id WHERE s.id = ?').get(spalteId)
  if (!spalte) return
  if (!['SA', 'T', 'CUSTOM'].includes(spalte.kategorie)) return
  const klasse = db.prepare('SELECT ist_kv FROM klassen WHERE id = ?').get(spalte.klasse_id)
  if (!klasse?.ist_kv) return

  let warnung = null
  if (n === 5) {
    warnung = { ausloeser: `Note 5 in ${spalte.fach_name}`, grund: 'Nicht Genügend eingetragen' }
  } else if (wertAlt) {
    const a = parseInt(wertAlt)
    if (a >= 1 && a <= 5 && (n - a) >= 2) {
      warnung = { ausloeser: `Note ${a} → ${n} in ${spalte.fach_name}`, grund: 'Verschlechterung um ≥ 2 Stufen' }
    }
  }
  if (warnung) {
    erzeugeTrigger(spalte.klasse_id, schuelerId, 'fruehwarnung', 'warn', warnung.ausloeser, warnung.grund)
  }
}

// Zentrales Fehler-Logging: Konsole + persistente error.log im userData-Ordner,
// damit Fehler auch ohne offene Dev-Tools nachvollziehbar sind.
function logError(context, err) {
  console.error(`[${context}]`, err)
  try {
    if (userDataPath) {
      const msg = err && err.stack ? err.stack : String(err)
      fs.appendFileSync(path.join(userDataPath, 'error.log'), `${new Date().toISOString()} [${context}] ${msg}\n`)
    }
  } catch {
    // Bewusst still: Scheitert das Schreiben ins Log, darf der Logger nicht selbst werfen
    // (sonst Endlosschleife). Die Konsolen-Ausgabe oben ist bereits erfolgt.
  }
}

// Öffnet eine URL extern – aber nur mit sicheren Schemata (http/https/mailto).
// Verhindert, dass importierte/gespeicherte Links via file:/javascript:/… Unerwünschtes auslösen.
function oeffneExternSicher(url) {
  try {
    const u = new URL(String(url ?? ''))
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      shell.openExternal(url)
      return true
    }
    logError('oeffneExternSicher', 'blockiertes Protokoll: ' + u.protocol + ' (' + String(url).slice(0, 80) + ')')
    return false
  } catch (e) {
    logError('oeffneExternSicher', e)
    return false
  }
}

// ─── IPC Handler registrieren ─────────────────────────────────────────────────
function registerIPC() {
  // Zentraler Fehler-Wrapper: fängt Ausnahmen aus ALLEN nachfolgend registrierten
  // Handlern ab, protokolliert sie mit Kanalnamen und reicht sie als abgelehntes
  // Promise an den Renderer weiter – ohne alle Handler einzeln anzufassen.
  const _origHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = (channel, listener) =>
    _origHandle(channel, async (event, ...args) => {
      try {
        return await listener(event, ...args)
      } catch (e) {
        logError(`IPC '${channel}'`, e)
        throw e
      }
    })

  // Einstellungen
  ipcMain.handle('einstellungen:get', (_, schluessel) => {
    return db.prepare('SELECT wert FROM einstellungen WHERE schluessel = ?').get(schluessel)?.wert ?? null
  })

  ipcMain.handle('einstellungen:set', (_, schluessel, wert) => {
    db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run(schluessel, wert)
    return true
  })

  ipcMain.handle('einstellungen:getAll', () => {
    const rows = db.prepare('SELECT * FROM einstellungen').all()
    const result = {}
    rows.forEach(r => { result[r.schluessel] = r.wert })
    return result
  })

  // Schuljahre
  ipcMain.handle('schuljahre:getAll', () => {
    return db.prepare('SELECT * FROM schuljahre ORDER BY id DESC').all()
  })

  ipcMain.handle('schuljahre:create', (_, bezeichnung) => {
    const info = db.prepare('INSERT INTO schuljahre (bezeichnung) VALUES (?)').run(bezeichnung)
    return info.lastInsertRowid
  })

  // Klassen
  ipcMain.handle('klassen:getAll', (_, schuljahrId) => {
    return db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY reihenfolge, name').all(schuljahrId)
  })

  // Vorlagenklassen: bewusst OHNE Schuljahr-Filter, damit sie Jahreswechsel überdauern.
  ipcMain.handle('klassen:getVorlagen', () => {
    return db.prepare('SELECT * FROM klassen WHERE ist_vorlage = 1 ORDER BY reihenfolge, name').all()
  })

  ipcMain.handle('klassen:create', (_, { schuljahrId, name, farbe, teamsLink, istVorlage }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id = ?').get(schuljahrId)?.m ?? 0
    const info = db.prepare('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge, teams_link, ist_vorlage) VALUES (?, ?, ?, ?, ?, ?)').run(schuljahrId, name, farbe ?? null, maxReihenfolge + 1, teamsLink ?? null, istVorlage ? 1 : 0)
    return info.lastInsertRowid
  })

  ipcMain.handle('klassen:setTeamsLink', (_, id, link) => {
    db.prepare('UPDATE klassen SET teams_link = ? WHERE id = ?').run(link || null, id)
    return true
  })

  ipcMain.handle('klassen:setIstKv', (_, id, istKv) => {
    db.prepare('UPDATE klassen SET ist_kv = ? WHERE id = ?').run(istKv ? 1 : 0, id)
    return true
  })

  // Vorschau auf eine Klassen-Löschung: zählt alle abhängigen Datensätze.
  // Wird vom UI vor dem eigentlichen Löschen aufgerufen, damit der User sieht,
  // was alles verschwindet (Schüler:innen, Fächer, eingetragene Noten etc.).
  ipcMain.handle('klassen:getDeleteStats', (_, id) => {
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
    } catch (e) { logError('klassen:loeschInfo kv-zaehler', e) }
    return { klasse, fachCount, schuelerCount, noteCount, todoCount, terminCount, kvAktenvermerkeCount, kvElternkontakteCount, kvFehlstundenCount, kvTriggerCount }
  })

  // Klasse vollständig löschen (kaskadierend in Transaktion).
  // Räumt Tabellen ohne ON DELETE CASCADE manuell auf.
  ipcMain.handle('klassen:delete', (_, id) => {
    const tx = db.transaction(() => {
      // Alle abhängigen Fach-IDs und Schüler-IDs für diese Klasse einsammeln
      const fachIds    = db.prepare('SELECT id FROM faecher WHERE klasse_id = ?').all(id).map(r => r.id)
      const schuelerIds = db.prepare('SELECT id FROM schueler WHERE klasse_id = ?').all(id).map(r => r.id)

      // Fach-bezogene Nicht-CASCADE-Daten (Noten, Verlauf, Spalten, Zeugnis, Notizen, Stundenplan)
      raeumeFachDatenAuf(fachIds)

      if (schuelerIds.length > 0) {
        const schuelerPh = schuelerIds.map(() => '?').join(',')
        // Restliche schüler-bezogene Daten, die nicht über die Fach-IDs erfasst wurden
        db.prepare(`DELETE FROM eintraege WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds)
        db.prepare(`DELETE FROM zeugnisnoten WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds)
        db.prepare(`DELETE FROM notizen WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds)
        try { db.prepare(`DELETE FROM eintraege_verlauf WHERE schueler_id IN (${schuelerPh})`).run(...schuelerIds) } catch (e) { logError('klassen:delete eintraege_verlauf(schueler)', e) }
      }

      // Faecher + Schüler (kein CASCADE auf klassen)
      db.prepare('DELETE FROM faecher WHERE klasse_id = ?').run(id)
      db.prepare('DELETE FROM schueler WHERE klasse_id = ?').run(id)
      // Die Klasse selbst (CASCADE räumt todos / sitzplan_tische auf; termine.klasse_id → NULL)
      db.prepare('DELETE FROM klassen WHERE id = ?').run(id)
    })
    tx()
    return true
  })

  ipcMain.handle('klassen:rename', (_, id, name) => {
    const root = materialRoot()
    const alt = root ? db.prepare('SELECT k.name AS kn, s.bezeichnung AS sb FROM klassen k JOIN schuljahre s ON k.schuljahr_id=s.id WHERE k.id=?').get(id) : null
    db.prepare('UPDATE klassen SET name = ? WHERE id = ?').run(name, id)
    let ordnerWarnung = null
    if (alt) ordnerWarnung = verschiebeDir(
      path.join(root, sanitizeSegment(alt.sb), sanitizeSegment(alt.kn)),
      path.join(root, sanitizeSegment(alt.sb), sanitizeSegment(name)))
    return { ok: true, ordnerWarnung }
  })

  ipcMain.handle('klassen:setFarbe', (_, id, farbe) => {
    db.prepare('UPDATE klassen SET farbe = ? WHERE id = ?').run(farbe ?? null, id)
    return true
  })

  // Sortier-Modus der Schüler:innen-Liste dieser Klasse setzen (Whitelist-validiert).
  ipcMain.handle('klassen:setSortierung', (_, id, modus) => {
    const wert = ['vorname', 'nachname', 'manuell'].includes(modus) ? modus : 'nachname'
    db.prepare('UPDATE klassen SET sortierung = ? WHERE id = ?').run(wert, id)
    return true
  })

  // Manuelle Reihenfolge der Klassen-Tabs speichern (Drag-and-Drop im Header).
  ipcMain.handle('klassen:reorder', (_, updates) => {
    const stmt = db.prepare('UPDATE klassen SET reihenfolge = ? WHERE id = ?')
    const tx = db.transaction(() => {
      for (const { id, reihenfolge } of updates) stmt.run(reihenfolge, id)
    })
    tx()
    return true
  })

  // Fächer
  ipcMain.handle('faecher:getAll', (_, klasseId) => {
    return db.prepare('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name').all(klasseId)
  })

  // Alle Fächer echter Klassen eines Schuljahrs (für den Ziel-Picker beim Anwenden von Vorlagen).
  ipcMain.handle('faecher:getAllImSchuljahr', (_, schuljahrId) => {
    return db.prepare(`
      SELECT f.id, f.name, f.farbe, f.klasse_id,
             k.name AS klasse_name, k.farbe AS klasse_farbe, k.reihenfolge AS klasse_reihenfolge
      FROM faecher f JOIN klassen k ON k.id = f.klasse_id
      WHERE k.schuljahr_id = ? AND k.ist_vorlage = 0
      ORDER BY k.reihenfolge, k.name, f.reihenfolge, f.name
    `).all(schuljahrId)
  })

  ipcMain.handle('faecher:create', (_, { klasseId, name, farbe, benotungssystem, alleSchueler = 1, schuelerIds = [] }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM faecher WHERE klasse_id = ?').get(klasseId)?.m ?? 0
    const info = db.prepare('INSERT INTO faecher (klasse_id, name, farbe, reihenfolge, benotungssystem, alle_schueler) VALUES (?, ?, ?, ?, ?, ?)')
      .run(klasseId, name, farbe ?? null, maxReihenfolge + 1, benotungssystem ?? 'standard', alleSchueler ? 1 : 0)
    const fachId = info.lastInsertRowid
    // Manuelle Teilmenge: gewählte Schüler:innen als Fach-Mitglieder eintragen
    if (!alleSchueler && schuelerIds.length) {
      const insFS = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
      for (const sid of schuelerIds) insFS.run(fachId, sid)
    }
    // Bei differenziert: Default-Niveau für die Roster-Schüler:innen (NACH fach_schueler-Insert)
    if (benotungssystem === 'differenziert') {
      const insert = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
      for (const sid of rosterIdsFuerFach(fachId)) insert.run(fachId, sid, 'AHS')
    }
    // Kompetenz-Vorlagen automatisch anlegen
    initKompetenzVorlagen(fachId, name)
    return fachId
  })

  ipcMain.handle('faecher:delete', (_, id) => {
    // Zuerst alle Nicht-CASCADE-Kinddaten abräumen: sonst schlägt das Löschen bei
    // vorhandenen Spalten/Noten/Zeugnisnoten/Stundenplan an foreign_keys=ON fehl
    // (und hinterließe sonst verwaiste Zeilen). Alles atomar in einer Transaktion.
    db.transaction(() => {
      raeumeFachDatenAuf([id])
      db.prepare('DELETE FROM faecher WHERE id = ?').run(id)
    })()
    return true
  })

  ipcMain.handle('faecher:rename', (_, id, name) => {
    const root = materialRoot()
    const alt = root ? db.prepare('SELECT f.name AS fn, k.name AS kn, s.bezeichnung AS sb FROM faecher f JOIN klassen k ON f.klasse_id=k.id JOIN schuljahre s ON k.schuljahr_id=s.id WHERE f.id=?').get(id) : null
    db.prepare('UPDATE faecher SET name = ? WHERE id = ?').run(name, id)
    let ordnerWarnung = null
    if (alt) ordnerWarnung = verschiebeDir(
      path.join(root, sanitizeSegment(alt.sb), sanitizeSegment(alt.kn), sanitizeSegment(alt.fn)),
      path.join(root, sanitizeSegment(alt.sb), sanitizeSegment(alt.kn), sanitizeSegment(name)))
    return { ok: true, ordnerWarnung }
  })

  ipcMain.handle('faecher:setFarbe', (_, id, farbe) => {
    db.prepare('UPDATE faecher SET farbe = ? WHERE id = ?').run(farbe ?? null, id)
    return true
  })

  ipcMain.handle('faecher:updateGewichtung', (_, id, data) => {
    // Nur SA/Test/Individuell gewichten die Note; MA & HÜ wirken als Einfluss (eigene Deckelung).
    db.prepare(`
      UPDATE faecher SET
        gewichtung_sa = ?,
        gewichtung_t = ?,
        gewichtung_ma = NULL,
        gewichtung_hue = NULL,
        gewichtung_custom = ?,
        ma_hue_max_einfluss = NULL,
        ma_max_einfluss = ?,
        hue_max_einfluss = ?
      WHERE id = ?
    `).run(data.sa ?? null, data.t ?? null, data.custom ?? null, data.maEinfluss ?? null, data.hueEinfluss ?? null, id)
    berechneAlleFuerFach(id)
    return true
  })

  ipcMain.handle('faecher:resetGewichtung', (_, id) => {
    db.prepare('UPDATE faecher SET gewichtung_sa = NULL, gewichtung_t = NULL, gewichtung_ma = NULL, gewichtung_hue = NULL, gewichtung_custom = NULL, ma_hue_max_einfluss = NULL, ma_max_einfluss = NULL, hue_max_einfluss = NULL WHERE id = ?').run(id)
    berechneAlleFuerFach(id)
    return true
  })

  ipcMain.handle('faecher:setBenotungssystem', (_, id, system) => {
    db.prepare('UPDATE faecher SET benotungssystem = ? WHERE id = ?').run(system, id)
    if (system === 'differenziert') {
      // Default-Niveau 'AHS' für alle Schüler:innen + Initial-Historien-Eintrag
      const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(id)
      if (fach) {
        const schuelerIds = rosterIdsFuerFach(id).map(x => ({ id: x }))
        const insertNiveau = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
        const insertHist = db.prepare(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?
          )
        `)
        for (const s of schuelerIds) {
          insertNiveau.run(id, s.id, 'AHS')
          insertHist.run(id, s.id, 'AHS', '1900-01-01', id, s.id)
        }
      }
    }
    berechneAlleFuerFach(id)
    return true
  })

  // Aktuelle Fach-Zuordnung (ids). Bei alle_schueler=1 automatisch alle aktiven Klassen-Schüler:innen.
  ipcMain.handle('faecher:getSchuelerIds', (_, fachId) => {
    return rosterIdsFuerFach(fachId)
  })

  // Fach-Zuordnung setzen: alle = true → alle Klassen-Schüler:innen; sonst manuelle Teilmenge.
  ipcMain.handle('faecher:setSchueler', (_, fachId, { alle, schuelerIds = [] }) => {
    const fach = db.prepare('SELECT benotungssystem FROM faecher WHERE id = ?').get(fachId)
    if (!fach) return false
    db.transaction(() => {
      db.prepare('UPDATE faecher SET alle_schueler = ? WHERE id = ?').run(alle ? 1 : 0, fachId)
      db.prepare('DELETE FROM fach_schueler WHERE fach_id = ?').run(fachId)   // immer neu aufbauen
      if (!alle) {
        const ins = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
        for (const sid of schuelerIds) ins.run(fachId, sid)
      }
      // Differenziert: neu ins Roster gekommene Schüler:innen brauchen Niveau-Default + Historie
      if (fach.benotungssystem === 'differenziert') {
        const insN = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
        const insH = db.prepare(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, ?, '1900-01-01'
          WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
        `)
        for (const sid of rosterIdsFuerFach(fachId)) { insN.run(fachId, sid, 'AHS'); insH.run(fachId, sid, 'AHS', fachId, sid) }
      }
    })()
    berechneAlleFuerFach(fachId)   // Roster geändert → Zeugnisnoten neu berechnen
    return true
  })

  // Niveau (AHS/ST-Differenzierung)
  ipcMain.handle('niveau:get', (_, fachId) => {
    const rows = db.prepare('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?').all(fachId)
    const map = {}
    for (const r of rows) map[r.schueler_id] = r.niveau
    return map
  })

  // Niveau setzen — mit optionalem Datum für rückwirkenden oder zukünftigen Wechsel.
  // Ohne datum: gilt ab heute. Schreibt in beide Tabellen (aktueller Stand + Historie).
  ipcMain.handle('niveau:set', (_, fachId, schuelerId, niveau, datum) => {
    const gueltigAb = datum || new Date().toISOString().slice(0, 10)
    db.transaction(() => {
      // Aktuellen Stand aktualisieren (nur wenn der Wechsel "jetzt oder früher" gilt)
      const heute = new Date().toISOString().slice(0, 10)
      if (gueltigAb <= heute) {
        db.prepare(`
          INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)
          ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = excluded.niveau
        `).run(fachId, schuelerId, niveau)
      }
      // Sicherstellen, dass es einen Initial-Historien-Eintrag gibt (1900-01-01) — sonst
      // wären Einträge vor dem Wechseldatum ohne Niveau-Zuordnung.
      const hatInitial = db.prepare(`
        SELECT 1 FROM schueler_niveau_historie
        WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = '1900-01-01'
      `).get(fachId, schuelerId)
      if (!hatInitial) {
        // Erst-Wechsel: vorheriges Niveau (Default AHS) als Initial setzen
        const altNiveau = niveau === 'AHS' ? 'ST' : 'AHS'
        db.prepare(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          VALUES (?, ?, ?, '1900-01-01')
        `).run(fachId, schuelerId, altNiveau)
      }
      // Existierenden Eintrag mit dem gleichen gueltig_ab überschreiben (idempotent)
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
    berechneAlleFuerFach(fachId)
    return true
  })

  // Historie aller Niveau-Wechsel für ein Fach (für Renderer: Zellen-Hintergrundfarbe)
  // Rückgabe: { schuelerId: [{ niveau, gueltig_ab }, ...] } absteigend nach Datum
  ipcMain.handle('niveau:getHistorie', (_, fachId) => {
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
  })

  // Einen einzelnen Historien-Eintrag löschen (z.B. versehentlich erstellter Wechsel)
  ipcMain.handle('niveau:deleteHistorie', (_, fachId, schuelerId, gueltigAb) => {
    // Initial-Eintrag '1900-01-01' nicht löschbar — er ist der Anker
    if (gueltigAb === '1900-01-01') return false
    db.prepare(`
      DELETE FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab = ?
    `).run(fachId, schuelerId, gueltigAb)
    // Aktuellen Stand neu setzen aus dem jüngsten verbleibenden Eintrag
    const aktuell = db.prepare(`
      SELECT niveau FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ? AND gueltig_ab <= ?
      ORDER BY gueltig_ab DESC, id DESC LIMIT 1
    `).get(fachId, schuelerId, new Date().toISOString().slice(0, 10))
    if (aktuell) {
      db.prepare(`
        INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)
        ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = excluded.niveau
      `).run(fachId, schuelerId, aktuell.niveau)
    }
    berechneAlleFuerFach(fachId)
    return true
  })

  // ─── Kompetenzbereiche ──────────────────────────────────────────────────────
  ipcMain.handle('kompetenzbereiche:getAll', (_, fachId) =>
    db.prepare('SELECT * FROM kompetenzbereiche WHERE fach_id = ? ORDER BY reihenfolge, id').all(fachId)
  )

  ipcMain.handle('kompetenzbereiche:create', (_, fachId, titel, beschreibung) => {
    const maxR = db.prepare('SELECT MAX(reihenfolge) as m FROM kompetenzbereiche WHERE fach_id = ?').get(fachId)?.m ?? 0
    const info = db.prepare('INSERT INTO kompetenzbereiche (fach_id, titel, beschreibung, reihenfolge) VALUES (?, ?, ?, ?)').run(fachId, titel, beschreibung ?? null, maxR + 1)
    return info.lastInsertRowid
  })

  ipcMain.handle('kompetenzbereiche:update', (_, id, { titel, beschreibung }) => {
    db.prepare('UPDATE kompetenzbereiche SET titel = ?, beschreibung = ? WHERE id = ?').run(titel, beschreibung ?? null, id)
    return true
  })

  ipcMain.handle('kompetenzbereiche:delete', (_, id) => {
    db.prepare('DELETE FROM kompetenzbereiche WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('kompetenzbereiche:reorder', (_, ids) => {
    const stmt = db.prepare('UPDATE kompetenzbereiche SET reihenfolge = ? WHERE id = ?')
    ids.forEach((id, idx) => stmt.run(idx, id))
    return true
  })

  ipcMain.handle('kompetenzbereiche:initVorlagen', (_, fachId, fachName) => {
    initKompetenzVorlagen(fachId, fachName)
    return true
  })

  // ─── Schüler:innen-Kompetenzen ─────────────────────────────────────────────
  ipcMain.handle('schuelerKompetenzen:getAll', (_, fachId) => {
    return db.prepare(`
      SELECT sk.* FROM schueler_kompetenzen sk
      JOIN kompetenzbereiche kb ON kb.id = sk.kompetenzbereich_id
      WHERE kb.fach_id = ?
    `).all(fachId)
  })

  ipcMain.handle('schuelerKompetenzen:set', (_, kompetenzbereichId, schuelerId, niveau, notiz) => {
    db.prepare(`
      INSERT INTO schueler_kompetenzen (kompetenzbereich_id, schueler_id, niveau, notiz, aktualisiert)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(kompetenzbereich_id, schueler_id) DO UPDATE SET
        niveau = excluded.niveau, notiz = excluded.notiz, aktualisiert = excluded.aktualisiert
    `).run(kompetenzbereichId, schuelerId, niveau, notiz ?? null)
    return true
  })

  // Schüler:innen. Reihenfolge richtet sich nach der pro Klasse gewählten Sortierung.
  ipcMain.handle('schueler:getAll', (_, klasseId) => {
    const modus = db.prepare('SELECT sortierung FROM klassen WHERE id = ?').get(klasseId)?.sortierung || 'nachname'
    // ORDER-BY aus fester Whitelist (keine Nutzereingabe → sichere Interpolation).
    const order = modus === 'vorname'
      ? 'vorname COLLATE NOCASE, nachname COLLATE NOCASE'
      : modus === 'manuell'
        ? 'reihenfolge, nachname COLLATE NOCASE, vorname COLLATE NOCASE'
        : 'nachname COLLATE NOCASE, vorname COLLATE NOCASE'
    return db.prepare(`SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY ${order}`).all(klasseId)
  })

  ipcMain.handle('schueler:create', (_, { klasseId, vorname, nachname, fachIds = [] }) => {
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
  })

  ipcMain.handle('schueler:delete', (_, id) => {
    db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('schueler:update', (_, id, data) => {
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
  })

  // Avatar (JSON-Config) setzen; null = zurück auf Auto-aus-Name
  ipcMain.handle('schueler:setAvatar', (_, id, avatar) => {
    db.prepare('UPDATE schueler SET avatar = ? WHERE id = ?').run(avatar ?? null, id)
    return true
  })

  ipcMain.handle('schueler:reorder', (_, updates) => {
    const stmt = db.prepare('UPDATE schueler SET reihenfolge = ? WHERE id = ?')
    const tx = db.transaction(() => {
      for (const { id, reihenfolge } of updates) {
        stmt.run(reihenfolge, id)
      }
    })
    tx()
    return true
  })

  ipcMain.handle('schueler:importBatch', (_, klasseId, list, fachIds = []) => {
    // Gewählte Fächer (nur gültige der Klasse) einmal auflösen.
    const faecher = (Array.isArray(fachIds) ? fachIds : [])
      .map(fid => db.prepare('SELECT id, alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?').get(fid, klasseId))
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
  })

  ipcMain.handle('schueler:getLeistungsProfil', (_, schuelerId) => {
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
    for (const fach of faecher) berechneAlleFuerFach(fach.id)

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
      .forEach(r => { niveaus[r.fach_id] = r.niveau })
    // Niveau-Historie je Fach (für die Darstellung von AHS/ST-Wechseln im Leistungsdiagramm)
    const niveauHistorie = {}
    db.prepare(`SELECT fach_id, niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE schueler_id = ? ORDER BY fach_id, gueltig_ab DESC, id DESC`).all(schuelerId)
      .forEach(r => { (niveauHistorie[r.fach_id] ??= []).push({ niveau: r.niveau, gueltig_ab: r.gueltig_ab }) })
    return { schueler, faecher, zeugnisnoten, eintraege, notizen, niveaus, niveauHistorie }
  })

  ipcMain.handle('schueler:exportProfilPDF', async (_, { profil, klassenname }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `Leistungsprofil_${profil.schueler.nachname}_${profil.schueler.vorname}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return false
    const html = bauePdfHtml(profil, klassenname)
    const buf = await htmlZuPdf(html)
    fs.writeFileSync(filePath, buf)
    return true
  })

  // Spalten
  ipcMain.handle('spalten:getAll', (_, fachId) => {
    return db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge, datum').all(fachId)
  })

  ipcMain.handle('spalten:create', (_, data) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM spalten WHERE fach_id = ? AND semester = ?').get(data.fachId, data.semester)?.m ?? 0
    const info = db.prepare(`
      INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge, notiz)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.fachId, data.semester, data.kategorie, data.kuerzel, data.datum, maxReihenfolge + 1, data.notiz ?? null)
    return info.lastInsertRowid
  })

  ipcMain.handle('spalten:delete', (_, id) => {
    const betroffene = db.prepare('SELECT spalte_id, schueler_id, wert, kommentar FROM eintraege WHERE spalte_id = ?').all(id)
    if (betroffene.length > 0) {
      const spalte = db.prepare('SELECT fach_id FROM spalten WHERE id = ?').get(id)
      const verlaufStmt = db.prepare(`
        INSERT INTO eintraege_verlauf (fach_id, spalte_id, schueler_id, wert_alt, wert_neu, kommentar_alt, kommentar_neu, aktion)
        VALUES (?, ?, ?, ?, NULL, ?, NULL, 'spalte_geloescht')
      `)
      db.transaction(() => {
        for (const e of betroffene) {
          verlaufStmt.run(spalte?.fach_id ?? null, e.spalte_id, e.schueler_id, e.wert, e.kommentar)
        }
      })()
    }
    db.prepare('DELETE FROM eintraege WHERE spalte_id = ?').run(id)
    db.prepare('DELETE FROM spalten WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('spalten:update', (_, id, data) => {
    const old = db.prepare('SELECT kuerzel, datum, notiz FROM spalten WHERE id = ?').get(id)
    db.prepare('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?').run(data.kuerzel, data.datum, data.notiz ?? null, id)
    if (old) pushUndo({
      description: 'Spalte umbenennen',
      undo: () => db.prepare('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?').run(old.kuerzel, old.datum, old.notiz, id),
      redo: () => db.prepare('UPDATE spalten SET kuerzel = ?, datum = ?, notiz = ? WHERE id = ?').run(data.kuerzel, data.datum, data.notiz ?? null, id),
    })
    return true
  })

  ipcMain.handle('spalten:toggleEingeklappt', (_, id) => {
    db.prepare('UPDATE spalten SET eingeklappt = CASE WHEN eingeklappt = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('spalten:setEingeklappt', (_, ids, wert) => {
    const stmt = db.prepare('UPDATE spalten SET eingeklappt = ? WHERE id = ?')
    const tx = db.transaction(() => {
      for (const id of ids) stmt.run(wert ? 1 : 0, id)
    })
    tx()
    return true
  })

  ipcMain.handle('spalten:sortByKategorie', (_, fachId, semester) => {
    const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? AND semester = ? ORDER BY kategorie, datum').all(fachId, semester)
    const stmt = db.prepare('UPDATE spalten SET reihenfolge = ? WHERE id = ?')
    const tx = db.transaction(() => {
      spalten.forEach((s, i) => stmt.run(i + 1, s.id))
    })
    tx()
    return true
  })

  // Spalten wieder chronologisch (nach Datum) sortieren; Spalten ohne Datum ans Ende.
  ipcMain.handle('spalten:sortChronologisch', (_, fachId, semester) => {
    const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? AND semester = ? ORDER BY datum IS NULL, datum, id').all(fachId, semester)
    const stmt = db.prepare('UPDATE spalten SET reihenfolge = ? WHERE id = ?')
    const tx = db.transaction(() => {
      spalten.forEach((s, i) => stmt.run(i + 1, s.id))
    })
    tx()
    return true
  })

  // Einträge
  ipcMain.handle('eintraege:getAll', (_, fachId) => {
    return db.prepare(`
      SELECT e.* FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE s.fach_id = ?
    `).all(fachId)
  })

  ipcMain.handle('eintraege:set', (_, spalteId, schuelerId, wert) => {
    const existing = db.prepare('SELECT wert, kommentar FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').get(spalteId, schuelerId)
    const oldWert = existing ? existing.wert : null
    const wertAlt = existing?.wert ?? null
    const wertNeu = wert || null
    if (wertAlt !== wertNeu) {
      const spalte = db.prepare('SELECT fach_id FROM spalten WHERE id = ?').get(spalteId)
      const kommentarAlt = existing?.kommentar ?? null
      db.prepare(`
        INSERT INTO eintraege_verlauf (fach_id, spalte_id, schueler_id, wert_alt, wert_neu, kommentar_alt, kommentar_neu, aktion)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'aenderung')
      `).run(spalte?.fach_id ?? null, spalteId, schuelerId, wertAlt, wertNeu, kommentarAlt, kommentarAlt)
    }
    const apply = (w) => {
      const hasKommentar = !!db.prepare("SELECT 1 FROM eintraege WHERE spalte_id = ? AND schueler_id = ? AND kommentar IS NOT NULL AND kommentar != ''").get(spalteId, schuelerId)
      if (w === '' || w === null) {
        if (hasKommentar) {
          db.prepare('UPDATE eintraege SET wert = NULL WHERE spalte_id = ? AND schueler_id = ?').run(spalteId, schuelerId)
        } else {
          db.prepare('DELETE FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').run(spalteId, schuelerId)
        }
      } else {
        db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?) ON CONFLICT(spalte_id, schueler_id) DO UPDATE SET wert = excluded.wert').run(spalteId, schuelerId, w)
      }
    }
    apply(wert)
    pushUndo({ description: 'Eintrag', undo: () => apply(oldWert), redo: () => apply(wert) })
    // KV-Trigger-Hook: nur wenn sich der Wert geändert hat
    if (wertAlt !== wertNeu) {
      try { pruefeNotenTrigger(spalteId, schuelerId, wertNeu, wertAlt) } catch (e) { console.error('[KV] pruefeNotenTrigger:', e) }
    }
    return true
  })

  ipcMain.handle('eintraege:setKommentar', (_, spalteId, schuelerId, kommentar) => {
    const existing = db.prepare('SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').get(spalteId, schuelerId)
    const k = kommentar?.trim() || null
    if (existing) {
      db.prepare('UPDATE eintraege SET kommentar = ? WHERE spalte_id = ? AND schueler_id = ?').run(k, spalteId, schuelerId)
    } else if (k) {
      db.prepare('INSERT INTO eintraege (spalte_id, schueler_id, wert, kommentar) VALUES (?, ?, NULL, ?)').run(spalteId, schuelerId, k)
    }
    return true
  })

  ipcMain.handle('verlauf:get', (_, schuelerId, fachId) => {
    return db.prepare(`
      SELECT
        v.id, v.spalte_id, v.schueler_id,
        v.wert_alt, v.wert_neu, v.kommentar_alt, v.kommentar_neu,
        v.zeitstempel, v.aktion,
        s.kategorie, s.kuerzel, s.datum
      FROM eintraege_verlauf v
      LEFT JOIN spalten s ON s.id = v.spalte_id
      WHERE v.schueler_id = ? AND v.fach_id = ?
      ORDER BY v.zeitstempel DESC
      LIMIT 100
    `).all(schuelerId, fachId)
  })

  // Zeugnisnoten
  ipcMain.handle('zeugnisnoten:getAll', (_, fachId) => {
    return db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fachId)
  })

  ipcMain.handle('zeugnisnoten:berechne', (_, fachId, schuelerId, semester) => {
    const note = semester === 3
      ? berechneEndnote(fachId, schuelerId)
      : berechneZeugnisnote(fachId, schuelerId, semester).note
    if (note !== null) {
      db.prepare(`
        INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(fach_id, schueler_id, semester)
        DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
      `).run(fachId, schuelerId, semester, note, semester === 3 ? 1 : 0)
    }
    return note
  })

  ipcMain.handle('zeugnisnoten:setManuell', (_, fachId, schuelerId, semester, note) => {
    const existing = db.prepare('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?').get(fachId, schuelerId, semester)
    const rowExisted = !!existing
    const oldManuell = existing ? existing.note_manuell : undefined
    const berechnet = semester === 3
      ? berechneEndnote(fachId, schuelerId)
      : berechneZeugnisnote(fachId, schuelerId, semester).note
    const upsert = (n) => db.prepare(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, note_manuell, s1_eingerechnet)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, note_manuell = excluded.note_manuell, s1_eingerechnet = excluded.s1_eingerechnet
    `).run(fachId, schuelerId, semester, berechnet, n, semester === 3 ? 1 : 0)
    upsert(note)
    pushUndo({
      description: 'Zeugnisnote',
      undo: () => {
        if (!rowExisted) {
          db.prepare('DELETE FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester)
        } else {
          db.prepare('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(oldManuell ?? null, fachId, schuelerId, semester)
        }
      },
      redo: () => upsert(note),
    })
    return true
  })

  ipcMain.handle('zeugnisnoten:clearManuell', (_, fachId, schuelerId, semester) => {
    const existing = db.prepare('SELECT note_manuell FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = ?').get(fachId, schuelerId, semester)
    const oldManuell = existing?.note_manuell ?? null
    db.prepare('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester)
    pushUndo({
      description: 'Zeugnisnote zurücksetzen',
      undo: () => db.prepare('UPDATE zeugnisnoten SET note_manuell = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(oldManuell, fachId, schuelerId, semester),
      redo: () => db.prepare('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester),
    })
    return true
  })

  ipcMain.handle('zeugnisnoten:berechneFach', (_, fachId) => {
    // Alle Schüler:innen: S1, S2 und Endnote neu berechnen
    const fach = db.prepare('SELECT * FROM faecher WHERE id = ?').get(fachId)
    if (!fach) return false
    const schueler = rosterIdsFuerFach(fachId).map(id => ({ id }))
    const upsert = db.prepare(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
    `)
    const updateOnly = db.prepare(`
      UPDATE zeugnisnoten SET note_berechnet = ?, s1_eingerechnet = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?
    `)
    db.transaction(() => {
      for (const s of schueler) {
        for (const sem of [1, 2]) {
          const { note } = berechneZeugnisnote(fachId, s.id, sem)
          if (note !== null) {
            upsert.run(fachId, s.id, sem, note, 0)
          } else {
            updateOnly.run(null, 0, fachId, s.id, sem)
          }
        }
      }
      for (const s of schueler) {
        const endnote = berechneEndnote(fachId, s.id)
        if (endnote !== null) {
          upsert.run(fachId, s.id, 3, endnote, 1)
        } else {
          updateOnly.run(null, 1, fachId, s.id, 3)
        }
      }
    })()
    return true
  })

  // Notizen
  ipcMain.handle('notizen:get', (_, schuelerId, fachId) => {
    return db.prepare('SELECT text FROM notizen WHERE schueler_id = ? AND fach_id = ?').get(schuelerId, fachId)?.text ?? ''
  })

  ipcMain.handle('notizen:set', (_, schuelerId, fachId, text) => {
    const existing = db.prepare('SELECT text FROM notizen WHERE schueler_id = ? AND fach_id = ?').get(schuelerId, fachId)
    const oldText = existing ? existing.text : null
    const apply = (t) => {
      if (t === null) {
        db.prepare('DELETE FROM notizen WHERE schueler_id = ? AND fach_id = ?').run(schuelerId, fachId)
      } else {
        db.prepare('INSERT OR REPLACE INTO notizen (schueler_id, fach_id, text) VALUES (?, ?, ?)').run(schuelerId, fachId, t)
      }
    }
    apply(text)
    pushUndo({ description: 'Notiz', undo: () => apply(oldText), redo: () => apply(text) })
    return true
  })

  // Gewichtung global
  ipcMain.handle('gewichtungGlobal:getAll', () => {
    return db.prepare('SELECT * FROM gewichtung_global').all()
  })

  ipcMain.handle('gewichtungGlobal:update', (_, kategorie, gewichtung) => {
    db.prepare('INSERT OR REPLACE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)').run(kategorie, gewichtung)
    // Alle Fächer im aktiven Schuljahr neu berechnen (auch teilweise globale Gewichtungen sind betroffen)
    const aktuellesSchuljahr = db.prepare('SELECT id FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
    berechneAlleFuerSchuljahr(aktuellesSchuljahr?.id)
    return true
  })

  // Alle Zeugnisnoten im aktuellen Schuljahr neu berechnen
  // (z.B. nach Änderung von s1_gewichtung, ma_plus_wert, ma_minus_wert)
  ipcMain.handle('noten:rechneAllesNeu', () => {
    const aktuellesSchuljahr = db.prepare('SELECT id FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
    berechneAlleFuerSchuljahr(aktuellesSchuljahr?.id)
    return true
  })

  // Stundenzeiten
  ipcMain.handle('stundenzeiten:getAll', () => {
    return db.prepare('SELECT * FROM stundenzeiten ORDER BY stunde').all()
  })

  ipcMain.handle('stundenzeiten:update', (_, id, data) => {
    db.prepare('UPDATE stundenzeiten SET beginn = ?, ende = ? WHERE id = ?').run(data.beginn, data.ende, id)
    return true
  })

  ipcMain.handle('stundenzeiten:create', () => {
    const max = db.prepare('SELECT MAX(stunde) as m FROM stundenzeiten').get()
    const naechste = (max?.m ?? 0) + 1
    const info = db.prepare('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)').run(naechste, '00:00', '00:00')
    return info.lastInsertRowid
  })

  ipcMain.handle('stundenzeiten:delete', (_, id) => {
    db.prepare('DELETE FROM stundenzeiten WHERE id = ?').run(id)
    return true
  })

  // Komplette Stundenzeiten-Liste in einem Rutsch speichern.
  // rows = [{ id?, beginn:'HH:MM', ende:'HH:MM' }] in Anzeigereihenfolge.
  // Bestehende IDs werden per UPDATE beibehalten (damit stundenplan.stunde_id gültig bleibt);
  // entfernte Stunden werden inkl. abhängiger stundenplan-/planungs-Zeilen kaskadiert gelöscht.
  ipcMain.handle('stundenzeiten:saveAll', (_, rows) => {
    const liste = Array.isArray(rows) ? rows : []
    const tx = db.transaction(() => {
      const existing = db.prepare('SELECT id FROM stundenzeiten').all().map(r => r.id)
      const keepIds = new Set(liste.filter(r => r.id != null).map(r => r.id))

      // Entfernte Stunden inkl. Referenzen löschen (foreign_keys = ON, stundenplan kein CASCADE)
      const entfernt = existing.filter(id => !keepIds.has(id))
      const delPlanung = db.prepare('DELETE FROM stunden_planung WHERE stundenplan_id IN (SELECT id FROM stundenplan WHERE stunde_id = ?)')
      const delPlan    = db.prepare('DELETE FROM stundenplan WHERE stunde_id = ?')
      const delZeit    = db.prepare('DELETE FROM stundenzeiten WHERE id = ?')
      for (const id of entfernt) {
        try { delPlanung.run(id) } catch (e) { logError('stundenzeiten:speichern stunden_planung', e) }
        delPlan.run(id)          // supplierstunden.stunde_id kaskadiert über stundenzeiten
        delZeit.run(id)          // supplierstunden ON DELETE CASCADE
      }

      // Upsert in Reihenfolge; stunde durchgehend 1..N neu vergeben
      const upd = db.prepare('UPDATE stundenzeiten SET stunde = ?, beginn = ?, ende = ? WHERE id = ?')
      const ins = db.prepare('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)')
      const existingSet = new Set(existing)
      liste.forEach((r, i) => {
        const nr = i + 1
        if (r.id != null && existingSet.has(r.id)) {
          upd.run(nr, r.beginn, r.ende, r.id)
        } else {
          ins.run(nr, r.beginn, r.ende)
        }
      })
    })
    tx()
    return db.prepare('SELECT * FROM stundenzeiten ORDER BY stunde').all()
  })

  // Stundenplan
  ipcMain.handle('stundenplan:getAll', () => {
    return db.prepare(`
      SELECT sp.*, sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name, k.name AS klasse_name,
             k.id AS klasse_id, k.teams_link AS klasse_teams_link
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sp.stunde_id = sz.id
      JOIN faecher f ON sp.fach_id = f.id
      JOIN klassen k ON f.klasse_id = k.id
      ORDER BY sp.wochentag, sz.stunde
    `).all()
  })

  ipcMain.handle('stundenplan:create', (_, data) => {
    const info = db.prepare('INSERT INTO stundenplan (wochentag, stunde_id, fach_id) VALUES (?, ?, ?)').run(data.wochentag, data.stundeId, data.fachId)
    return info.lastInsertRowid
  })

  ipcMain.handle('stundenplan:delete', (_, id) => {
    db.prepare('DELETE FROM stundenplan WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('stundenplan:update', (_, id, data) => {
    db.prepare('UPDATE stundenplan SET fach_id = ? WHERE id = ?').run(data.fachId, id)
    return true
  })

  ipcMain.handle('stundenplan:getByKlasse', (_, klasseId) => {
    return db.prepare(`
      SELECT sp.id, sp.wochentag, sp.stunde_id, sp.fach_id,
             sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name,
             k.name AS klasse_name, k.id AS klasse_id, k.teams_link AS klasse_teams_link
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sz.id = sp.stunde_id
      JOIN faecher f ON f.id = sp.fach_id
      JOIN klassen k ON k.id = f.klasse_id
      WHERE k.id = ?
      ORDER BY sp.wochentag, sz.stunde
    `).all(klasseId)
  })

  ipcMain.handle('stundenplan:getParallelFach', (_, aktuelleKlasseId, fachName) => {
    // Parallelklassen-Fächer finden (gleicher Name, anderes Klasse, selbes Schuljahr)
    const parallelFaecher = db.prepare(`
      SELECT f.id AS fach_id, f.name AS fach_name,
             k.id AS klasse_id, k.name AS klasse_name, k.teams_link AS klasse_teams_link
      FROM faecher f
      JOIN klassen k ON f.klasse_id = k.id
      WHERE f.name = ?
        AND k.schuljahr_id = (SELECT schuljahr_id FROM klassen WHERE id = ?)
        AND k.id != ?
      ORDER BY k.name
    `).all(fachName, aktuelleKlasseId, aktuelleKlasseId)

    // Für jedes parallele Fach die Stundenplan-Slots laden
    const slotsStmt = db.prepare(`
      SELECT sp.id, sp.wochentag, sp.stunde_id, sp.fach_id,
             sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name,
             k.name AS klasse_name, k.id AS klasse_id, k.teams_link AS klasse_teams_link
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sz.id = sp.stunde_id
      JOIN faecher f ON f.id = sp.fach_id
      JOIN klassen k ON k.id = f.klasse_id
      WHERE f.id = ?
      ORDER BY sp.wochentag, sz.stunde
    `)

    return parallelFaecher.map(pf => ({
      ...pf,
      slots: slotsStmt.all(pf.fach_id),
    }))
  })

  // Stunden-Planung
  ipcMain.handle('stundenPlanung:get', (_, stundenplanId, wocheDatum) => {
    return db.prepare(
      'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
    ).get(stundenplanId, wocheDatum) ?? null
  })

  // ─── Supplierstunden ─────────────────────────────────────────────────────────
  ipcMain.handle('supplierstunden:getWoche', (_, wocheDatum) =>
    db.prepare('SELECT * FROM supplierstunden WHERE woche_datum = ?').all(wocheDatum)
  )

  ipcMain.handle('supplierstunden:create', (_, { wocheDatum, wochentag, stundeId, klasseText, fachText, notiz }) => {
    const info = db.prepare(
      'INSERT INTO supplierstunden (woche_datum, wochentag, stunde_id, klasse_text, fach_text, notiz) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(wocheDatum, wochentag, stundeId, klasseText, fachText, notiz ?? null)
    return info.lastInsertRowid
  })

  ipcMain.handle('supplierstunden:delete', (_, id) => {
    db.prepare('DELETE FROM supplierstunden WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('supplierstunden:update', (_, id, { fachText, klasseText, notiz, titel, inhalt, hueText, hueFristDatum, link }) => {
    db.prepare(`
      UPDATE supplierstunden
      SET fach_text = ?, klasse_text = ?, notiz = ?, titel = ?, inhalt = ?, hue_text = ?, hue_frist_datum = ?, link = ?
      WHERE id = ?
    `).run(fachText ?? '', klasseText ?? '', notiz ?? null, titel ?? null, inhalt ?? null, hueText ?? null, hueFristDatum ?? null, link ?? null, id)
    return true
  })

  ipcMain.handle('shell:open', (_, url) => {
    return oeffneExternSicher(url)
  })

  ipcMain.handle('app:clipboard', (_, text) => {
    try { clipboard.writeText(String(text ?? '')); return true } catch (e) { logError('app:clipboard', e); return false }
  })

  ipcMain.handle('stundenPlanung:getWoche', (_, wocheDatum) => {
    return db.prepare(
      'SELECT * FROM stunden_planung WHERE woche_datum = ?'
    ).all(wocheDatum)
  })

  ipcMain.handle('stundenPlanung:save', (_, stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link) => {
    db.prepare(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET
        titel = excluded.titel, inhalt = excluded.inhalt, musizieren = excluded.musizieren,
        hue_text = excluded.hue_text, hue_frist_datum = excluded.hue_frist_datum, link = excluded.link
    `).run(stundenplanId, wocheDatum, titel, inhalt, musizieren ? 1 : 0, hueText ?? null, hueFristDatum ?? null, link ?? null)
    return true
  })

  ipcMain.handle('stundenPlanung:getHueWoche', (_, wocheDatum) => {
    const d = new Date(wocheDatum + 'T00:00:00')
    const sonntag = new Date(d)
    sonntag.setDate(d.getDate() + 6)
    const sonntagStr = `${sonntag.getFullYear()}-${String(sonntag.getMonth()+1).padStart(2,'0')}-${String(sonntag.getDate()).padStart(2,'0')}`
    const rows = db.prepare(`
      SELECT sp.*, s.wochentag AS quell_wochentag, s.stunde_id, s.fach_id
      FROM stunden_planung sp
      JOIN stundenplan s ON s.id = sp.stundenplan_id
      WHERE sp.hue_frist_datum >= ? AND sp.hue_frist_datum <= ?
        AND sp.hue_text IS NOT NULL AND sp.hue_text != ''
    `).all(wocheDatum, sonntagStr)
    // Wochentag aus dem Fristdatum ableiten (1=Mo..5=Fr)
    // und den passenden Stundenplan-Slot für das Fach an diesem Tag finden
    return rows.map(row => {
      const fristDate = new Date(row.hue_frist_datum + 'T00:00:00')
      const fristWochentag = fristDate.getDay() === 0 ? 7 : fristDate.getDay() // 1=Mo..7=So
      // Finde den Stundenplan-Eintrag für dieses Fach am Frist-Wochentag
      const zielSlot = db.prepare('SELECT stunde_id FROM stundenplan WHERE fach_id = ? AND wochentag = ? LIMIT 1').get(row.fach_id, fristWochentag)
      return {
        ...row,
        wochentag: fristWochentag,
        stunde_id: zielSlot?.stunde_id ?? row.stunde_id,
      }
    })
  })

  ipcMain.handle('stundenPlanung:checkMusizieren', (_, wocheDatum, klasseId, excludeStundenplanId) => {
    const row = db.prepare(`
      SELECT spl.id FROM stunden_planung spl
      JOIN stundenplan sp ON spl.stundenplan_id = sp.id
      JOIN faecher f ON sp.fach_id = f.id
      WHERE spl.woche_datum = ?
        AND f.klasse_id = ?
        AND spl.musizieren = 1
        AND spl.stundenplan_id != ?
        AND LOWER(f.name) LIKE '%musik%'
    `).get(wocheDatum, klasseId, excludeStundenplanId)
    return !!row
  })

  ipcMain.handle('stundenPlanung:setEntfall', (_, stundenplanId, wocheDatum, vorruecken, ferienZeitraeume) => {
    // Entfall-Eintrag erstellen/aktualisieren
    db.prepare(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, entfall)
      VALUES (?, ?, '', '', 1)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET entfall = 1
    `).run(stundenplanId, wocheDatum)

    if (vorruecken) {
      // Vorrücken: Planungen ab dem Entfall-Slot um je eine Stunde IN DIE ZUKUNFT schieben.
      // Ferien-Tage werden dabei übersprungen.
      //
      // 1. Fach-ID des entfallenen Slots ermitteln
      const slot = db.prepare('SELECT * FROM stundenplan WHERE id = ?').get(stundenplanId)
      if (!slot) return true

      // 2. Alle wöchentlichen Slots für dieses Fach chronologisch laden
      const alleSlots = db.prepare(`
        SELECT sp.id, sp.wochentag, sz.stunde as stunde_nr
        FROM stundenplan sp
        JOIN stundenzeiten sz ON sz.id = sp.stunde_id
        WHERE sp.fach_id = ?
        ORDER BY sp.wochentag, sz.stunde
      `).all(slot.fach_id)

      if (alleSlots.length === 0) return true

      const cancelIdx = alleSlots.findIndex(s => s.id === stundenplanId)
      if (cancelIdx === -1) return true

      function addWeeks(dateStr, weeks) {
        const d = new Date(dateStr + 'T00:00:00')
        d.setDate(d.getDate() + weeks * 7)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      // Helper: Prüft ob ein bestimmter Wochentag in einer Woche ein Ferientag ist
      function istFerientag(weekDatum, wochentag) {
        if (!ferienZeitraeume || ferienZeitraeume.length === 0) return false
        const d = new Date(weekDatum + 'T00:00:00')
        d.setDate(d.getDate() + (wochentag - 1))
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return ferienZeitraeume.some(f => dateStr >= f.von && dateStr <= f.bis)
      }

      // 3. Ab dem Entfall-Slot vorwärts wandern und ALLE Slots sammeln (auch leere),
      //    Ferien-Tage überspringen. Wir sammeln: Entfall-Slot + alle folgenden mit Planung.
      const slots = [] // { slotId, weekDatum, planning|null }
      let curIdx = cancelIdx
      let curWeek = wocheDatum

      // Entfall-Slot selbst
      const entfallPlanung = db.prepare(
        'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
      ).get(stundenplanId, wocheDatum)
      slots.push({ slotId: stundenplanId, weekDatum: wocheDatum, planning: entfallPlanung })

      // Folgende Slots sammeln, solange sie eine Planung haben (Ferien überspringen)
      const maxSteps = alleSlots.length * 52
      for (let step = 0; step < maxSteps; step++) {
        const atEndOfCycle = curIdx === alleSlots.length - 1
        const nextIdx = (curIdx + 1) % alleSlots.length
        const nextWeek = atEndOfCycle ? addWeeks(curWeek, 1) : curWeek

        // Ferientag? → überspringen, aber weiterzählen
        if (istFerientag(nextWeek, alleSlots[nextIdx].wochentag)) {
          curIdx = nextIdx
          curWeek = nextWeek
          continue
        }

        const planning = db.prepare(
          'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ? AND entfall = 0'
        ).get(alleSlots[nextIdx].id, nextWeek)

        slots.push({ slotId: alleSlots[nextIdx].id, weekDatum: nextWeek, planning: planning ?? null })

        if (!planning) break // Erster leerer Slot → Ende der Kette

        curIdx = nextIdx
        curWeek = nextWeek
      }

      // 4. Planungen verschieben: Jeder Slot bekommt die Planung des vorherigen Slots.
      //    slots[0] = Entfall (wird zum entfall markiert)
      //    slots[1] bekommt Planung von slots[0]  (Di-Inhalt → Mi)
      //    slots[2] bekommt Planung von slots[1]  (Mi-Inhalt → Do)
      //    ...
      //    slots[N] (letzter, war leer) bekommt Planung von slots[N-1]
      if (slots.length >= 2) {
        const vorrueckTransaction = db.transaction(() => {
          // Von hinten nach vorne verschieben, um keine Daten zu überschreiben
          for (let i = slots.length - 1; i >= 1; i--) {
            const ziel = slots[i]       // Ziel-Slot (weiter in der Zukunft)
            const quelle = slots[i - 1] // Quell-Slot (näher an der Gegenwart)

            if (quelle.planning && (quelle.planning.titel || quelle.planning.inhalt || quelle.planning.hue_text || quelle.planning.link)) {
              // Planung vom Quell-Slot in den Ziel-Slot kopieren
              const p = quelle.planning
              db.prepare(`
                INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link, entfall)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET
                  titel = excluded.titel, inhalt = excluded.inhalt, musizieren = excluded.musizieren,
                  hue_text = excluded.hue_text, hue_frist_datum = excluded.hue_frist_datum,
                  link = excluded.link, entfall = 0
              `).run(ziel.slotId, ziel.weekDatum, p.titel, p.inhalt, p.musizieren, p.hue_text, p.hue_frist_datum, p.link)
            } else {
              // Quell-Slot war leer → Ziel-Slot leeren
              db.prepare('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ? AND entfall = 0')
                .run(ziel.slotId, ziel.weekDatum)
            }
          }
          // Entfall-Slot als Entfall markieren (Inhalt wird geleert, entfall=1 bleibt)
          db.prepare(`
            UPDATE stunden_planung SET titel = '', inhalt = '', musizieren = 0,
              hue_text = NULL, hue_frist_datum = NULL, link = NULL, entfall = 1
            WHERE stundenplan_id = ? AND woche_datum = ?
          `).run(stundenplanId, wocheDatum)
        })
        vorrueckTransaction()
      }
    }
    return true
  })

  ipcMain.handle('stundenPlanung:removeEntfall', (_, stundenplanId, wocheDatum) => {
    // Entfall aufheben – wenn keine anderen Inhalte vorhanden sind, Eintrag löschen
    const existing = db.prepare('SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?').get(stundenplanId, wocheDatum)
    if (existing && !existing.titel && !existing.inhalt && !existing.hue_text && !existing.link) {
      db.prepare('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?').run(stundenplanId, wocheDatum)
    } else {
      db.prepare('UPDATE stunden_planung SET entfall = 0 WHERE stundenplan_id = ? AND woche_datum = ?').run(stundenplanId, wocheDatum)
    }
    return true
  })

  ipcMain.handle('stundenPlanung:delete', (_, stundenplanId, wocheDatum) => {
    db.prepare(
      'DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
    ).run(stundenplanId, wocheDatum)
    return true
  })

  // Todos
  ipcMain.handle('todos:getAll', (_, schuljahrId) => {
    return db.prepare(`
      SELECT t.*, k.name as klasse_name, f.name as fach_name
      FROM todos t
      LEFT JOIN klassen k ON k.id = t.klasse_id
      LEFT JOIN faecher f ON f.id = t.fach_id
      WHERE t.klasse_id IS NULL OR k.schuljahr_id = ?
      ORDER BY t.erledigt, t.reihenfolge, t.id
    `).all(schuljahrId)
  })

  ipcMain.handle('todos:create', (_, { titel, klasseId, fachId, faelligkeit, erinnerung }) => {
    console.log('[main] todos:create:', { titel, faelligkeit, erinnerung })
    const maxReihenfolge = klasseId
      ? db.prepare('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id = ?').get(klasseId)?.m ?? 0
      : db.prepare('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id IS NULL').get()?.m ?? 0
    const info = db.prepare(
      'INSERT INTO todos (titel, klasse_id, fach_id, faelligkeit, erinnerung, reihenfolge) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(titel, klasseId ?? null, fachId ?? null, faelligkeit ?? null, erinnerung ?? null, maxReihenfolge + 1)
    return info.lastInsertRowid
  })

  ipcMain.handle('todos:update', (_, id, { titel, fachId, faelligkeit, erinnerung }) => {
    db.prepare('UPDATE todos SET titel = ?, fach_id = ?, faelligkeit = ?, erinnerung = ? WHERE id = ?')
      .run(titel, fachId ?? null, faelligkeit ?? null, erinnerung ?? null, id)
    return true
  })

  ipcMain.handle('todos:delete', (_, id) => {
    db.prepare('DELETE FROM todos WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('todos:toggleErledigt', (_, id) => {
    db.prepare('UPDATE todos SET erledigt = CASE WHEN erledigt = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id)
    return true
  })

  // Backup
  ipcMain.handle('backup:create', () => doBackupCreate())

  ipcMain.handle('backup:getList', () => {
    try {
      return fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.sqlite'))
        .sort()
        .reverse()
    } catch (e) {
      return []
    }
  })

  // Alle wiederherstellbaren Sicherungen mit Datum/Art/Größe.
  ipcMain.handle('backup:liste', () => {
    try { return sammleBackups() } catch (e) { logError('backup:liste', e); return [] }
  })

  // Eine Sicherung wiederherstellen: aktuelle Daten sichern, DB ersetzen, neu starten.
  ipcMain.handle('backup:wiederherstellen', (_, pfad) => {
    try {
      if (!pfad || !fs.existsSync(pfad)) return { ok: false, fehler: 'Datei nicht gefunden.' }
      // Nur aus bekannten Backup-Orten zulassen.
      const ordner = bkGet('backup_ordner')
      const erlaubt = [backupDir, ordner].filter(Boolean)
        .some(d => path.resolve(pfad).startsWith(path.resolve(d) + path.sep))
      if (!erlaubt) return { ok: false, fehler: 'Ungültiger Pfad.' }
      // SQLite-Header prüfen.
      let kopf = ''
      try {
        const fd = fs.openSync(pfad, 'r'); const buf = Buffer.alloc(16)
        fs.readSync(fd, buf, 0, 16, 0); fs.closeSync(fd)
        kopf = buf.toString('utf8', 0, 15)
      } catch { /* ignore */ }
      if (kopf !== 'SQLite format 3') return { ok: false, fehler: 'Keine gültige Datenbank-Datei.' }
      // Aktuelle Daten sichern (WAL vorher einschreiben).
      try { db.pragma('wal_checkpoint(TRUNCATE)') } catch {}
      schreibeBackupInOrdner(backupDir, 'db_vor-wiederherstellung', null)
      try { db.close() } catch {}
      fs.copyFileSync(pfad, dbPath)
      // Alte WAL/SHM entfernen, damit die wiederhergestellte DB sauber öffnet.
      for (const suffix of ['-wal', '-shm']) {
        const f = dbPath + suffix
        try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch {}
      }
      neustartNachDatenwechsel()
      return { ok: true }
    } catch (e) {
      logError('backup:wiederherstellen', e)
      // Falls die DB geschlossen wurde, aber das Kopieren scheiterte: wieder öffnen.
      try { db = new Database(dbPath); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON') } catch (e2) { logError('backup:wiederherstellen reopen', e2) }
      return { ok: false, fehler: 'Wiederherstellung fehlgeschlagen.' }
    }
  })

  // Status für die Sicherungs-Erinnerung.
  ipcMain.handle('backup:status', () => {
    const autoAktiv = backupAutoAktiv()
    const ordner = bkGet('backup_ordner') || ''
    const letzte = bkGet('backup_letzte') || null
    const snoozeBis = bkGet('backup_snooze_bis') || null
    const now = new Date()
    let tageSeit = null
    if (letzte) tageSeit = Math.floor((now - new Date(letzte)) / 86400000)
    const snoozeAktiv = !!snoozeBis && new Date(snoozeBis) > now
    const faellig = !autoAktiv && !snoozeAktiv && (letzte === null || tageSeit >= BACKUP_ERINNERUNG_TAGE)
    return { autoAktiv, ordner, letzte, tageSeit, faellig, intervall: BACKUP_ERINNERUNG_TAGE }
  })

  // Jetzt sichern: in den konfigurierten Ordner – oder einen einmalig gewählten.
  ipcMain.handle('backup:jetzt', async () => {
    let ordner = bkGet('backup_ordner')
    if (!ordner) {
      const r = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Ordner für die Sicherung wählen',
      })
      if (r.canceled || !r.filePaths[0]) return null
      ordner = r.filePaths[0]
    }
    const p = schreibeBackupInOrdner(ordner, 'Daskala-Sicherung', backupMax())
    if (p) { markiereBackupGemacht(); bkSet('backup_auto_sig', dbSignatur()) }
    return p
  })

  // Ordner für automatische Sicherungen wählen (und merken).
  ipcMain.handle('backup:waehleOrdner', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Ordner für automatische Sicherungen',
    })
    if (r.canceled || !r.filePaths[0]) return null
    bkSet('backup_ordner', r.filePaths[0])
    return r.filePaths[0]
  })

  // Automatische Sicherung ein-/ausschalten.
  ipcMain.handle('backup:setAutomatisch', (_, an) => {
    bkSet('backup_automatisch', an ? '1' : '0')
    if (an && bkGet('backup_ordner')) {
      const p = schreibeBackupInOrdner(bkGet('backup_ordner'), 'Daskala-Sicherung', backupMax())
      if (p) { markiereBackupGemacht(); bkSet('backup_auto_sig', dbSignatur()) }
    }
    return { ok: true, autoAktiv: backupAutoAktiv() }
  })

  ipcMain.handle('backup:ordnerZuruecksetzen', () => {
    bkSet('backup_ordner', '')
    bkSet('backup_automatisch', '0')
    return true
  })

  // Erinnerung um einige Tage verschieben.
  ipcMain.handle('backup:snooze', (_, tage) => {
    const bis = new Date()
    bis.setDate(bis.getDate() + (Number(tage) || 3))
    bkSet('backup_snooze_bis', bis.toISOString())
    return true
  })

  // App komplett zurücksetzen: Sicherheitskopie, Datenbank löschen, neu starten.
  ipcMain.handle('app:reset', () => {
    try {
      try { schreibeBackupInOrdner(backupDir, 'db_vor-reset', null) } catch (e) { logError('reset-backup', e) }
      try { db.close() } catch {}
      for (const suffix of ['', '-wal', '-shm']) {
        const f = dbPath + suffix
        try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch (e) { logError('app:reset unlink', e) }
      }
    } catch (e) { logError('app:reset', e) }
    neustartNachDatenwechsel()
    return true
  })

  // Laufende App-Version (für das „Was ist neu"-Modal nach Updates).
  ipcMain.handle('app:version', () => app.getVersion())

  // ─── App-Sperre ─────────────────────────────────────────────────────────────
  ipcMain.handle('sperre:status', () => ({
    aktiv: bkGet('sperre_aktiv') === '1' && !!bkGet('sperre_pin_hash'),
  }))
  ipcMain.handle('sperre:setPin', (_, pin) => {
    if (!pin || String(pin).length < 4) return { ok: false }
    bkSet('sperre_pin_hash', hashPin(pin))
    bkSet('sperre_aktiv', '1')
    return { ok: true }
  })
  ipcMain.handle('sperre:deaktivieren', () => {
    bkSet('sperre_aktiv', '0')
    bkSet('sperre_pin_hash', '')
    appGesperrt = false
    return true
  })
  ipcMain.handle('sperre:pruefe', (_, pin) => {
    const hash = bkGet('sperre_pin_hash')
    const ok = !!hash && hashPin(pin) === hash
    if (ok) appGesperrt = false
    return ok
  })
  ipcMain.handle('sperre:setGesperrt', (_, wert) => {
    appGesperrt = !!wert
    return true
  })

  // ─── Wetter ─────────────────────────────────────────────────────────────────
  // Tagesvorhersage (Mo–Fr) einer Woche für das eingestellte Bundesland.
  ipcMain.handle('wetter:getWoche', async (_, bundesland, montagDatum) => {
    try {
      // Genauer Ort (falls gesetzt) hat Vorrang vor der Bundesland-Hauptstadt.
      let koord = null
      const lat = parseFloat(bkGet('wetter_lat'))
      const lon = parseFloat(bkGet('wetter_lon'))
      if (!isNaN(lat) && !isNaN(lon)) koord = [lat, lon]
      else koord = WETTER_KOORD[bundesland]
      if (!koord || !montagDatum) return null
      const startD = new Date(montagDatum + 'T00:00:00')
      if (isNaN(startD)) return null
      const endD = new Date(startD); endD.setDate(endD.getDate() + 4)   // Mo..Fr
      const heute = new Date(); heute.setHours(0, 0, 0, 0)
      const tageBisStart = (startD - heute) / 86400000
      const tageBisEnde  = (endD - heute) / 86400000
      // Open-Meteo-Vorhersage sinnvoll etwa -3 … +15 Tage; sonst kein Wetter.
      if (tageBisEnde < -3 || tageBisStart > 15) return null
      // Lokale (nicht UTC-)Datums-Strings, sonst verschiebt sich der Tag.
      const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const start = iso(startD), ende = iso(endD)
      const key = `${koord[0]},${koord[1]},${start}`
      const cached = wetterCache.get(key)
      if (cached && (Date.now() - cached.zeit) < 3600000) return cached.data
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${koord[0]}&longitude=${koord[1]}`
        + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
        + `&hourly=weather_code,temperature_2m&timezone=Europe%2FVienna`
        + `&start_date=${start}&end_date=${ende}`
      const json = await httpsGetJson(url)
      const d = json.daily || {}
      // Alle Stundenwerte je Tag (für Zellen-Symbole und die Tageszeiten Vm/Mi/Ab).
      const h = json.hourly || {}
      const proTag = {}   // 'YYYY-MM-DD' -> { 'HH': { code, temp } }
      ;(h.time || []).forEach((t, i) => {
        const [datum, zeit] = t.split('T')
        const hh = (zeit || '').slice(0, 2)
        if (!datum || !hh) return
        if (!proTag[datum]) proTag[datum] = {}
        proTag[datum][hh] = { code: h.weather_code?.[i] ?? null, temp: h.temperature_2m?.[i] ?? null }
      })
      const out = {}
      ;(d.time || []).forEach((t, i) => {
        const st = proTag[t] || {}
        out[t] = {
          code: d.weather_code?.[i] ?? null,
          tmax: d.temperature_2m_max?.[i] ?? null,
          tmin: d.temperature_2m_min?.[i] ?? null,
          vm: st['09'] || null,
          mi: st['13'] || null,
          ab: st['18'] || null,
          stunden: st,
        }
      })
      wetterCache.set(key, { zeit: Date.now(), data: out })
      return out
    } catch (e) {
      logError('wetter:getWoche', e)
      return null
    }
  })

  // Ortssuche (Geocoding) für eine genauere Wettervorschau.
  ipcMain.handle('wetter:sucheOrt', async (_, query) => {
    try {
      const q = (query || '').trim()
      if (q.length < 2) return []
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`
      const json = await httpsGetJson(url)
      return (json.results || []).map(r => ({
        name: r.name,
        admin1: r.admin1 || '',
        land: r.country_code || r.country || '',
        lat: r.latitude,
        lon: r.longitude,
      }))
    } catch (e) {
      logError('wetter:sucheOrt', e)
      return []
    }
  })

  ipcMain.handle('db:saveAs', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return doSaveAs(win)
  })

  ipcMain.handle('db:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return doOpen(win)
  })

  // ─── Undo/Redo ─────────────────────────────────────────────────────────────
  ipcMain.handle('undo:execute', () => {
    if (undoStack.length === 0) return { ok: false }
    executeUndo()
    return { ok: true }
  })

  ipcMain.handle('undo:redo', () => {
    if (redoStack.length === 0) return { ok: false }
    executeRedo()
    return { ok: true }
  })

  ipcMain.handle('undo:state', () => ({
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undoDescription: undoStack[undoStack.length - 1]?.description,
    redoDescription: redoStack[redoStack.length - 1]?.description,
  }))


  // Dialog
  ipcMain.handle('dialog:openFile', async (_, filters) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('dialog:saveFile', async (_, filters, defaultName) => {
    const result = await dialog.showSaveDialog({ filters, defaultPath: defaultName })
    return result.canceled ? null : result.filePath
  })

  // Generischer Text-Datei-Export (Speicherort per Dialog wählen, Inhalt kommt aus dem Renderer).
  ipcMain.handle('datei:speichereText', async (_, content, defaultName, filters) => {
    const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters })
    if (result.canceled) return false
    try {
      fs.writeFileSync(result.filePath, String(content ?? ''), 'utf-8')
      return true
    } catch (e) {
      logError('datei:speichereText', e)
      return false
    }
  })

  // Export: JSON
  ipcMain.handle('export:toJson', async () => {
    const savePath = await dialog.showSaveDialog({
      defaultPath: 'daskala_export.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (savePath.canceled) return false

    const data = {
      schuljahre: db.prepare('SELECT * FROM schuljahre').all(),
      klassen: db.prepare('SELECT * FROM klassen').all(),
      faecher: db.prepare('SELECT * FROM faecher').all(),
      schueler: db.prepare('SELECT * FROM schueler').all(),
      spalten: db.prepare('SELECT * FROM spalten').all(),
      eintraege: db.prepare('SELECT * FROM eintraege').all(),
      zeugnisnoten: db.prepare('SELECT * FROM zeugnisnoten').all(),
      notizen: db.prepare('SELECT * FROM notizen').all(),
      gewichtung_global: db.prepare('SELECT * FROM gewichtung_global').all(),
      einstellungen: db.prepare('SELECT * FROM einstellungen').all(),
    }
    fs.writeFileSync(savePath.filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  })

  // Export: Excel
  ipcMain.handle('export:toExcel', async (_, fachId) => {
    const XLSX = require('xlsx')

    const savePath = await dialog.showSaveDialog({
      defaultPath: 'noten_export.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (savePath.canceled) return false

    const fach = db.prepare('SELECT f.*, k.name AS klasse_name FROM faecher f JOIN klassen k ON f.klasse_id = k.id WHERE f.id = ?').get(fachId)
    const schueler = rosterFuerFach(fachId)
    const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge').all(fachId)
    const eintraege = db.prepare('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)').all(fachId)
    const zeugnisnoten = db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fachId)

    const entryMap = {}
    eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
    const istDiff = fach.benotungssystem === 'differenziert'
    const niveauMap = {}
    if (istDiff) {
      db.prepare('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?').all(fachId)
        .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
    }
    const znMap = {}
    zeugnisnoten.forEach(z => {
      znMap[`${z.schueler_id}_${z.semester}`] =
        znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
    })

    const header = ['Name', ...spalten.map(s => `${s.kuerzel} ${s.datum ?? ''}`), 'SN 1', 'SN 2']
    const rows = [header]

    for (const s of schueler) {
      const row = [`${s.nachname} ${s.vorname}`]
      for (const sp of spalten) {
        row.push(entryMap[`${sp.id}_${s.id}`] ?? '')
      }
      row.push(znMap[`${s.id}_1`] ?? '')
      row.push(znMap[`${s.id}_2`] ?? '')
      rows.push(row)
    }

    const ws = XLSX.utils.aoa_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `${fach.klasse_name} ${fach.name}`)
    XLSX.writeFile(wb, savePath.filePath)
    return true
  })

  // Import: CSV/Excel Schüler:innen
  ipcMain.handle('import:schuelerFromFile', async (_, filePath) => {
    const ext = path.extname(filePath).toLowerCase()
    let list = []

    if (ext === '.csv') {
      const content = fs.readFileSync(filePath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      const header = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase())
      const vornameIdx = header.findIndex(h => h.includes('vorname'))
      const nachnameIdx = header.findIndex(h => h.includes('nachname') || h.includes('name'))
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''))
        if (cols.length < 2) continue
        list.push({
          vorname: cols[vornameIdx !== -1 ? vornameIdx : 0],
          nachname: cols[nachnameIdx !== -1 ? nachnameIdx : 1],
        })
      }
    } else {
      const XLSX = require('xlsx')
      const wb = XLSX.readFile(filePath)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      for (const row of data) {
        const vorname = row['Vorname'] ?? row['vorname'] ?? ''
        const nachname = row['Nachname'] ?? row['nachname'] ?? row['Name'] ?? ''
        if (vorname || nachname) list.push({ vorname, nachname })
      }
    }

    return list.filter(s => s.vorname || s.nachname)
  })

  // Jahresabschluss
  ipcMain.handle('jahresabschluss:neuesSchuljahr', (_, { altesSchuljahreId, neueBezeichnung, klassen = null, schuelerZuordnungen }) => {
    const tx = db.transaction(() => {
      // Altes Schuljahr archivieren
      db.prepare('UPDATE schuljahre SET archiviert = 1 WHERE id = ?').run(altesSchuljahreId)

      // Neues Schuljahr anlegen
      const neuesSchuljahr = db.prepare('INSERT INTO schuljahre (bezeichnung) VALUES (?)').run(neueBezeichnung)
      const neuesSchuljahreId = neuesSchuljahr.lastInsertRowid

      // Aktuelles Schuljahr persistieren, damit Kalender/Stundenplan/Ferien auch nach Neustart folgen
      db.prepare('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)').run('schuljahr_aktuell', neueBezeichnung)

      const klasseIdMapping = {}
      const fachIdMapping = {}
      const schuelerIdMapping = {}

      // Auswahl der vorzurückenden Klassen/Fächer. Fehlt "klassen" (Alt-Aufrufer) → alle Klassen, alle Fächer.
      let auswahl = klassen
      if (!auswahl) {
        auswahl = db.prepare('SELECT id FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0').all(altesSchuljahreId)
          .map(k => ({ alteKlasseId: k.id, neuerName: null, fachIds: null }))   // fachIds null = alle Fächer
      }

      for (const kSel of auswahl) {
        const alteKlasse = db.prepare('SELECT * FROM klassen WHERE id = ?').get(kSel.alteKlasseId)
        if (!alteKlasse) continue
        const neueKlasse = db.prepare('INSERT INTO klassen (schuljahr_id, name, reihenfolge) VALUES (?, ?, ?)')
          .run(neuesSchuljahreId, kSel.neuerName ?? alteKlasse.name, alteKlasse.reihenfolge)
        klasseIdMapping[alteKlasse.id] = neueKlasse.lastInsertRowid

        // Nur ausgewählte Fächer übernehmen (fachIds null = alle)
        const fachFilter = Array.isArray(kSel.fachIds) ? new Set(kSel.fachIds) : null
        const alteFaecher = db.prepare('SELECT * FROM faecher WHERE klasse_id = ?').all(alteKlasse.id)
        for (const altesFach of alteFaecher) {
          if (fachFilter && !fachFilter.has(altesFach.id)) continue   // nicht angehakt → nicht vorrücken
          const nf = db.prepare('INSERT INTO faecher (klasse_id, name, reihenfolge, alle_schueler) VALUES (?, ?, ?, ?)')
            .run(neueKlasse.lastInsertRowid, altesFach.name, altesFach.reihenfolge, altesFach.alle_schueler ?? 1)
          fachIdMapping[altesFach.id] = nf.lastInsertRowid
        }
      }

      // Schüler:innen zuordnen (nur für vorgerückte Klassen; klasseIdMapping existiert nur für diese)
      for (const z of schuelerZuordnungen) {
        if (!klasseIdMapping[z.alteKlasseId]) continue   // Klasse nicht vorgerückt → Schüler:in bleibt im alten Jahr
        if (z.aktion === 'ausgeschieden') {
          db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(z.schuelerId)
        } else if (z.aktion === 'bleibt') {
          // Schüler:in in neuer Klasse anlegen
          const s = db.prepare('SELECT * FROM schueler WHERE id = ?').get(z.schuelerId)
          const ns = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)').run(klasseIdMapping[z.alteKlasseId], s.vorname, s.nachname, s.reihenfolge)
          schuelerIdMapping[z.schuelerId] = ns.lastInsertRowid
          db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(z.schuelerId)
        }
      }

      // Fach-Zuordnung (Gruppenfächer) ins neue Jahr übernehmen, IDs remappt (nur "bleibt"-Schüler:innen).
      for (const [altFachId, neuFachId] of Object.entries(fachIdMapping)) {
        const f = db.prepare('SELECT alle_schueler FROM faecher WHERE id = ?').get(neuFachId)
        if (f.alle_schueler) continue   // "alle"-Fächer brauchen keine Junction-Zeilen
        const rows = db.prepare('SELECT schueler_id FROM fach_schueler WHERE fach_id = ?').all(altFachId)
        const ins = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
        for (const r of rows) {
          const neuSid = schuelerIdMapping[r.schueler_id]
          if (neuSid) ins.run(neuFachId, neuSid)   // ausgeschiedene fehlen im Mapping → übersprungen
        }
      }

      return neuesSchuljahreId
    })

    return tx()
  })

  // ─── Planung: verfügbare Wochen ────────────────────────────────────────────
  ipcMain.handle('planung:getVorhandeneWochen', () => {
    return db.prepare('SELECT DISTINCT woche_datum FROM stunden_planung ORDER BY woche_datum').all().map(r => r.woche_datum)
  })

  // ─── Export: Planungs-PDF ──────────────────────────────────────────────────
  ipcMain.handle('export:planungPdf', async (_, wochen, einzeln) => {
    const WOCHENTAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr']

    function getKW(d) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
      const dayNum = date.getUTCDay() || 7
      date.setUTCDate(date.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
      return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
    }

    function wocheLabel(datum) {
      const d = new Date(datum)
      const fr = new Date(d); fr.setDate(d.getDate() + 4)
      return `KW ${getKW(d)} · ${d.getDate()}.${d.getMonth()+1}. – ${fr.getDate()}.${fr.getMonth()+1}.${fr.getFullYear()}`
    }

    function escHtml(t) {
      return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    function formatInhalt(text) {
      return escHtml(text)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^- (.+)/gm, '• $1')
        .replace(/---/g, '<hr/>')
    }

    const css = `
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a}
      @page{size:A4;margin:1.5cm}
      h1{font-size:20px;font-weight:300;margin-bottom:4px}
      .meta{font-size:10px;color:#666;margin-bottom:24px}
      .woche{margin-bottom:28px;page-break-inside:avoid}
      .woche-titel{font-size:13px;font-weight:700;color:#4f46e5;border-bottom:2px solid #6366f1;padding-bottom:4px;margin-bottom:10px}
      .stunde{margin-bottom:8px;padding:8px 10px;border-left:3px solid #e0e0e0}
      .stunde-meta{font-size:9px;color:#888;margin-bottom:3px}
      .stunde-titel{font-size:12px;font-weight:600;margin-bottom:4px}
      .stunde-inhalt{font-size:10px;white-space:pre-wrap;line-height:1.5;color:#374151}
      hr{border:none;border-top:1px solid #ddd;margin:4px 0}
    `

    function generiereWocheHtml(wocheDatum) {
      const planungen = db.prepare(`
        SELECT sp.*, st.wochentag, sz.stunde, sz.beginn, sz.ende,
               f.name AS fach_name, k.name AS klasse_name
        FROM stunden_planung sp
        JOIN stundenplan st ON st.id = sp.stundenplan_id
        JOIN stundenzeiten sz ON sz.id = st.stunde_id
        JOIN faecher f ON f.id = st.fach_id
        JOIN klassen k ON k.id = f.klasse_id
        WHERE sp.woche_datum = ?
        ORDER BY st.wochentag, sz.stunde
      `).all(wocheDatum)
      if (!planungen.length) return ''
      const stunden = planungen.map(p => `
        <div class="stunde">
          <div class="stunde-meta">${WOCHENTAGE[p.wochentag]||''} · ${p.stunde}. Stunde (${p.beginn}–${p.ende}) · ${escHtml(p.fach_name)} · ${escHtml(p.klasse_name)}</div>
          ${p.titel ? `<div class="stunde-titel">${escHtml(p.titel)}</div>` : ''}
          ${p.inhalt ? `<div class="stunde-inhalt">${formatInhalt(p.inhalt)}</div>` : ''}
        </div>`).join('')
      return `<div class="woche"><div class="woche-titel">${wocheLabel(wocheDatum)}</div>${stunden}</div>`
    }

    const generiereHtml = (wochen) => {
      const body = wochen.map(w => generiereWocheHtml(w)).join('')
      return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>${css}</style></head>
      <body><h1>Stundenplanung – Daskala</h1><div class="meta">Exportiert am ${new Date().toLocaleDateString('de-AT')}</div>${body}</body></html>`
    }

    if (einzeln) {
      for (const wocheDatum of wochen) {
        const savePath = await dialog.showSaveDialog({
          defaultPath: `planung_${wocheDatum}.pdf`,
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
        if (!savePath.canceled) {
          const buf = await htmlZuPdf(generiereHtml([wocheDatum]))
          fs.writeFileSync(savePath.filePath, buf)
        }
      }
      return true
    } else {
      const savePath = await dialog.showSaveDialog({
        defaultPath: 'planung_export.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (savePath.canceled) return false
      const buf = await htmlZuPdf(generiereHtml(wochen))
      fs.writeFileSync(savePath.filePath, buf)
      return true
    }
  })

  // ─── Export: Jahresplanung als ODT (tabellarisch, Querformat) ─────────────
  ipcMain.handle('export:jahresplanungOdt', async (_, fachId) => {
    const JSZip = require('jszip')
    const h = abschnittHierarchie(fachId)
    if (!h) return false
    const abschnitte = db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id=? ORDER BY reihenfolge, id').all(fachId)
    if (abschnitte.length === 0) {
      dialog.showMessageBox({ type: 'info', message: 'Keine Abschnitte in der Jahresplanung vorhanden.' })
      return false
    }
    const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    const fdat = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${parseInt(dd)}.${parseInt(m)}.${y}` }
    // Mehrzeiliger Text → ODT-Absätze (grobe Markdown-Bereinigung, "- " → "• ").
    const absaetze = (raw, style) => {
      const zeilen = String(raw || '').split('\n')
        .map(l => l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^\s*[-*]\s+/, '• ').trimEnd())
        .filter(l => l.trim() !== '')
      if (zeilen.length === 0) return `<text:p text:style-name="${style}"/>`
      return zeilen.map(l => `<text:p text:style-name="${style}">${esc(l)}</text:p>`).join('')
    }
    const matZelle = (a) => {
      const { dateien, links } = sammleMaterialien(a.id)
      const items = []
      for (const d of dateien) items.push(`• ${d.anzeigename || d.ref}${d.fehlt ? ' (fehlt)' : ''}`)
      for (const l of links) items.push(`• ${l.anzeigename || l.ref}`)
      if (items.length === 0) return `<text:p text:style-name="PStd"/>`
      return items.map(t => `<text:p text:style-name="PStd">${esc(t)}</text:p>`).join('')
    }
    const zeile = (a) => {
      const zeitraum = a.datum_von ? `${fdat(a.datum_von)} – ${fdat(a.datum_bis)}` : 'Nicht eingeplant'
      const inhalt = `<text:p text:style-name="PTitel">${esc(a.titel || 'Ohne Titel')}</text:p>` + absaetze(a.inhalt, 'PStd')
      const ziele = (a.lernziele && a.lernziele.trim()) ? absaetze(a.lernziele, 'PStd') : '<text:p text:style-name="PStd">–</text:p>'
      const komp = (a.kompetenzen && a.kompetenzen.trim()) ? absaetze(a.kompetenzen, 'PStd') : '<text:p text:style-name="PStd">–</text:p>'
      return '<table:table-row>'
        + `<table:table-cell table:style-name="Zelle"><text:p text:style-name="${a.datum_von ? 'PZeit' : 'PZeitLeer'}">${esc(zeitraum)}</text:p></table:table-cell>`
        + `<table:table-cell table:style-name="Zelle">${inhalt}</table:table-cell>`
        + `<table:table-cell table:style-name="Zelle">${ziele}</table:table-cell>`
        + `<table:table-cell table:style-name="Zelle">${komp}</table:table-cell>`
        + `<table:table-cell table:style-name="Zelle">${matZelle(a)}</table:table-cell>`
        + '</table:table-row>'
    }

    const content = `<?xml version="1.0" encoding="UTF-8"?>`
      + `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">`
      + `<office:automatic-styles>`
      + `<style:style style:name="Tabelle1" style:family="table"><style:table-properties style:width="26.7cm" table:align="margins"/></style:style>`
      + `<style:style style:name="Tabelle1.A" style:family="table-column"><style:table-column-properties style:column-width="3.2cm"/></style:style>`
      + `<style:style style:name="Tabelle1.B" style:family="table-column"><style:table-column-properties style:column-width="8.3cm"/></style:style>`
      + `<style:style style:name="Tabelle1.C" style:family="table-column"><style:table-column-properties style:column-width="5.3cm"/></style:style>`
      + `<style:style style:name="Tabelle1.D" style:family="table-column"><style:table-column-properties style:column-width="5.3cm"/></style:style>`
      + `<style:style style:name="Tabelle1.E" style:family="table-column"><style:table-column-properties style:column-width="4.6cm"/></style:style>`
      + `<style:style style:name="Zelle" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #99a0ad" fo:padding="0.12cm"/></style:style>`
      + `<style:style style:name="Kopf" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #99a0ad" fo:padding="0.14cm" fo:background-color="#4f46e5"/></style:style>`
      + `<style:style style:name="PStd" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.05cm"/><style:text-properties fo:font-size="10pt"/></style:style>`
      + `<style:style style:name="PTitel" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.1cm"/><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>`
      + `<style:style style:name="PZeit" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:font-weight="bold" fo:color="#374151"/></style:style>`
      + `<style:style style:name="PZeitLeer" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:font-style="italic" fo:color="#9aa0ac"/></style:style>`
      + `<style:style style:name="PKopf" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:font-weight="bold" fo:color="#ffffff"/></style:style>`
      + `<style:style style:name="PTitelDoc" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.05cm"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>`
      + `<style:style style:name="PMeta" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="9pt" fo:color="#888888"/></style:style>`
      + `</office:automatic-styles>`
      + `<office:body><office:text>`
      + `<text:p text:style-name="PTitelDoc">Jahresplanung – ${esc(h.fach_name)}</text:p>`
      + `<text:p text:style-name="PMeta">${esc(h.klasse_name)} · ${esc(h.schuljahr_bez)} · Exportiert am ${new Date().toLocaleDateString('de-AT')}</text:p>`
      + `<table:table table:name="Jahresplanung" table:style-name="Tabelle1">`
      + `<table:table-column table:style-name="Tabelle1.A"/><table:table-column table:style-name="Tabelle1.B"/><table:table-column table:style-name="Tabelle1.C"/><table:table-column table:style-name="Tabelle1.D"/><table:table-column table:style-name="Tabelle1.E"/>`
      + `<table:table-header-rows><table:table-row>`
      + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Zeitraum</text:p></table:table-cell>`
      + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Inhalt</text:p></table:table-cell>`
      + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Zielsetzungen</text:p></table:table-cell>`
      + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Kompetenzen</text:p></table:table-cell>`
      + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Materialien</text:p></table:table-cell>`
      + `</table:table-row></table:table-header-rows>`
      + abschnitte.map(zeile).join('')
      + `</table:table></office:text></office:body></office:document-content>`

    const styles = `<?xml version="1.0" encoding="UTF-8"?>`
      + `<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">`
      + `<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="29.7cm" fo:page-height="21cm" style:print-orientation="landscape" fo:margin-top="1.5cm" fo:margin-bottom="1.5cm" fo:margin-left="1.5cm" fo:margin-right="1.5cm"/></style:page-layout></office:automatic-styles>`
      + `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>`
      + `</office:document-styles>`

    const manifest = `<?xml version="1.0" encoding="UTF-8"?>`
      + `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">`
      + `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>`
      + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`
      + `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>`
      + `</manifest:manifest>`

    const savePath = await dialog.showSaveDialog({
      defaultPath: `Jahresplanung_${sanitizeSegment(h.fach_name)}_${sanitizeSegment(h.klasse_name)}.odt`,
      filters: [{ name: 'OpenDocument-Text', extensions: ['odt'] }],
    })
    if (savePath.canceled) return false
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
    zip.file('META-INF/manifest.xml', manifest)
    zip.file('styles.xml', styles)
    zip.file('content.xml', content)
    const buf = await zip.generateAsync({ type: 'nodebuffer' })
    fs.writeFileSync(savePath.filePath, buf)
    return true
  })

  // ─── Export: Fach-Planung als DOCX ────────────────────────────────────────
  ipcMain.handle('export:fachPlanungDocx', async (_, fachId, fachName, klasseName, wochenDaten) => {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, AlignmentType, BorderStyle, HeadingLevel } = require('docx')

    const WOCHENTAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr']

    // Alle Stundenplan-Slots für dieses Fach
    const fachSlots = db.prepare(`
      SELECT st.id, st.wochentag, sz.stunde, sz.beginn, sz.ende
      FROM stundenplan st
      JOIN stundenzeiten sz ON sz.id = st.stunde_id
      WHERE st.fach_id = ?
      ORDER BY st.wochentag, sz.stunde
    `).all(fachId)

    if (fachSlots.length === 0) return false

    const slotIds = fachSlots.map(s => s.id)

    // Planungen für alle angefragten Wochen laden
    const planStmt = db.prepare(`
      SELECT sp.*, sp.stundenplan_id
      FROM stunden_planung sp
      WHERE sp.stundenplan_id IN (${slotIds.map(() => '?').join(',')})
        AND sp.woche_datum = ?
    `)

    const noBorder = { style: BorderStyle.NONE, size: 0 }
    const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder }
    const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
    const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

    const sections = []
    const exportierteKWs = []

    for (let wi = 0; wi < wochenDaten.length; wi++) {
      const wd = wochenDaten[wi]
      const planungen = planStmt.all(...slotIds, wd.wocheDatum)
      const planMap = {}
      for (const p of planungen) planMap[p.stundenplan_id] = p

      // Nur Wochen mit mindestens einer Planung
      const hatPlanung = fachSlots.some(s => planMap[s.id]?.titel || planMap[s.id]?.inhalt)
      if (!hatPlanung) continue

      // Tabellenzeilen: Header + je eine Zeile pro Slot
      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({ width: { size: 1800, type: WidthType.DXA }, borders: cellBorders, shading: { fill: 'F3F4F6' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Stunde', bold: true, size: 18, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, shading: { fill: 'F3F4F6' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Thema', bold: true, size: 18, font: 'Arial' })] })] }),
          new TableCell({ borders: cellBorders, shading: { fill: 'F3F4F6' },
            children: [new Paragraph({ children: [new TextRun({ text: 'Inhalt', bold: true, size: 18, font: 'Arial' })] })] }),
          new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, shading: { fill: 'F3F4F6' },
            children: [new Paragraph({ children: [new TextRun({ text: 'HÜ', bold: true, size: 18, font: 'Arial' })] })] }),
        ],
      })

      const dataRows = fachSlots.map(slot => {
        const plan = planMap[slot.id]
        const stundeText = `${WOCHENTAGE[slot.wochentag]} ${slot.stunde}. (${slot.beginn}–${slot.ende})`

        const inhaltParas = (plan?.inhalt || '').split('\n').filter(l => l.trim()).map(line =>
          new Paragraph({ children: [new TextRun({ text: line, size: 18, font: 'Arial' })] })
        )
        if (inhaltParas.length === 0) inhaltParas.push(new Paragraph({ children: [] }))

        return new TableRow({
          children: [
            new TableCell({ width: { size: 1800, type: WidthType.DXA }, borders: cellBorders, verticalAlign: 'top',
              children: [new Paragraph({ children: [new TextRun({ text: stundeText, size: 18, font: 'Arial', color: '666666' })] })] }),
            new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, verticalAlign: 'top',
              children: [new Paragraph({ children: [new TextRun({ text: plan?.titel || '', size: 18, font: 'Arial', bold: !!plan?.titel })] })] }),
            new TableCell({ borders: cellBorders, verticalAlign: 'top', children: inhaltParas }),
            new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, verticalAlign: 'top',
              children: [new Paragraph({ children: [new TextRun({ text: plan?.hue_text || '', size: 18, font: 'Arial', italics: true })] })] }),
          ],
        })
      })

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      })

      exportierteKWs.push(wd.kw)
      sections.push({
        properties: wi > 0 ? { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } } : { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children: [
          ...(wi === 0 ? [
            new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${fachName} – ${klasseName}`, font: 'Arial' })] }),
            new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Exportiert am ${new Date().toLocaleDateString('de-AT')}`, size: 18, font: 'Arial', color: '999999' })] }),
          ] : []),
          new Paragraph({ spacing: { before: 200, after: 100 },
            children: [new TextRun({ text: `KW ${wd.kw} · ${wd.montagStr} – ${wd.freitagStr}${wd.jahr}`, bold: true, size: 22, font: 'Arial', color: '4F46E5' })] }),
          table,
        ],
      })
    }

    if (sections.length === 0) {
      dialog.showMessageBox({ type: 'info', message: 'Keine Planungsdaten zum Exportieren vorhanden.' })
      return false
    }

    const doc = new Document({ sections })
    const buf = await Packer.toBuffer(doc)

    const kwMin = Math.min(...exportierteKWs)
    const kwMax = Math.max(...exportierteKWs)
    const kwLabel = kwMin === kwMax ? `KW${kwMin}` : `KW${kwMin}-${kwMax}`

    const savePath = await dialog.showSaveDialog({
      defaultPath: `planung_${fachName}_${klasseName}_${kwLabel}.docx`,
      filters: [{ name: 'Word-Dokument', extensions: ['docx'] }],
    })
    if (savePath.canceled) return false
    fs.writeFileSync(savePath.filePath, buf)
    return true
  })

  // ─── Export: Alle Schüler:innen Excel ─────────────────────────────────────
  ipcMain.handle('export:allSchuelerExcel', async () => {
    const XLSX = require('xlsx')
    const savePath = await dialog.showSaveDialog({
      defaultPath: 'daskala_noten.xlsx',
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    })
    if (savePath.canceled) return false

    const aktuellesSchuljahr = db.prepare('SELECT * FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
    if (!aktuellesSchuljahr) return false

    const wb = XLSX.utils.book_new()
    const klassen = db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY name').all(aktuellesSchuljahr.id)

    for (const klasse of klassen) {
      const faecher = db.prepare('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name').all(klasse.id)
      const schueler = db.prepare('SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY reihenfolge, nachname, vorname').all(klasse.id)
      if (!schueler.length) continue

      for (const fach of faecher) {
        const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge').all(fach.id)
        const eintraege = db.prepare('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)').all(fach.id)
        const zeugnisnoten = db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fach.id)
        const entryMap = {}
        eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
        const istDiff = fach.benotungssystem === 'differenziert'
        const niveauMap = {}
        if (istDiff) {
          db.prepare('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?').all(fach.id)
            .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
        }
        const znMap = {}
        zeugnisnoten.forEach(z => {
          znMap[`${z.schueler_id}_${z.semester}`] =
            znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
        })

        const header = ['Name', ...spalten.map(s => `${s.kuerzel}${s.datum ? ' ' + s.datum.slice(5).replace('-', '.') : ''}`), 'SN 1', 'SN 2']
        const rows = [header]
        for (const s of rosterFuerFach(fach.id)) {
          const badges = [s.lernschwaeche ? 'LS' : null, s.legasthenie ? 'LEG' : null].filter(Boolean)
          const name = `${s.nachname} ${s.vorname}${badges.length ? ' [' + badges.join(' ') + ']' : ''}`
          const row = [name, ...spalten.map(sp => entryMap[`${sp.id}_${s.id}`] ?? ''), znMap[`${s.id}_1`] ?? '', znMap[`${s.id}_2`] ?? '']
          rows.push(row)
        }

        const sheetName = `${klasse.name} ${fach.name}`.slice(0, 31)
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
      }
    }

    XLSX.writeFile(wb, savePath.filePath)
    return true
  })

  // ─── Export: Alle Schüler:innen PDF ───────────────────────────────────────
  ipcMain.handle('export:allSchuelerPdf', async () => {
    const savePath = await dialog.showSaveDialog({
      defaultPath: 'daskala_noten.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (savePath.canceled) return false

    const aktuellesSchuljahr = db.prepare('SELECT * FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
    if (!aktuellesSchuljahr) return false

    const klassen = db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY name').all(aktuellesSchuljahr.id)

    const css = `
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:10px;color:#1a1a1a}
      @page{size:A4 landscape;margin:1.5cm}
      h1{font-size:18px;font-weight:300;margin-bottom:2px}
      .schuljahr{font-size:10px;color:#666;margin-bottom:20px}
      .klasse-fach{margin-bottom:28px;page-break-inside:avoid}
      .klasse-fach-titel{font-size:13px;font-weight:700;color:#4f46e5;border-bottom:2px solid #6366f1;padding-bottom:3px;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:9px}
      th{background:#f4f4f5;text-align:center;padding:4px 6px;border:1px solid #e0e0e0;font-weight:600;white-space:nowrap}
      th.name{text-align:left;min-width:120px}
      td{padding:3px 6px;border:1px solid #e0e0e0;text-align:center}
      td.name{text-align:left;font-weight:500}
      td.zn{font-weight:700}
      .badge{font-size:8px;background:#fef3c7;color:#92400e;border-radius:2px;padding:0 2px;margin-left:2px}
      .badge.leg{background:#ede9fe;color:#5b21b6}
      tr:nth-child(even) td{background:#fafafa}
    `

    function escHtml(t) {
      return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }

    let bodyHtml = `<h1>Notenübersicht – Daskala</h1><div class="schuljahr">${escHtml(aktuellesSchuljahr.bezeichnung)}</div>`

    for (const klasse of klassen) {
      const faecher = db.prepare('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name').all(klasse.id)
      const schueler = db.prepare('SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY reihenfolge, nachname, vorname').all(klasse.id)
      if (!schueler.length) continue

      for (const fach of faecher) {
        const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge').all(fach.id)
        const eintraege = db.prepare('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)').all(fach.id)
        const zeugnisnoten = db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fach.id)
        const entryMap = {}
        eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
        const istDiff = fach.benotungssystem === 'differenziert'
        const niveauMap = {}
        if (istDiff) {
          db.prepare('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?').all(fach.id)
            .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
        }
        const znMap = {}
        zeugnisnoten.forEach(z => {
          znMap[`${z.schueler_id}_${z.semester}`] =
            znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
        })

        const thead = `<tr><th class="name">Name</th>${spalten.map(sp =>
          `<th>${escHtml(sp.kuerzel)}${sp.datum ? '<br>' + sp.datum.slice(5).replace('-', '.') : ''}</th>`
        ).join('')}<th>SN 1</th><th>SN 2</th></tr>`

        const tbody = rosterFuerFach(fach.id).map(s => {
          const lsBadge = s.lernschwaeche ? '<span class="badge">LS</span>' : ''
          const legBadge = s.legasthenie ? '<span class="badge leg">LEG</span>' : ''
          const cells = spalten.map(sp => `<td>${escHtml(entryMap[`${sp.id}_${s.id}`] ?? '')}</td>`).join('')
          return `<tr><td class="name">${escHtml(s.nachname)} ${escHtml(s.vorname)}${lsBadge}${legBadge}</td>${cells}<td class="zn">${znMap[`${s.id}_1`] ?? ''}</td><td class="zn">${znMap[`${s.id}_2`] ?? ''}</td></tr>`
        }).join('')

        bodyHtml += `<div class="klasse-fach"><div class="klasse-fach-titel">${escHtml(klasse.name)} · ${escHtml(fach.name)}</div><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`
      }
    }

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`
    const buf = await htmlZuPdf(html)
    fs.writeFileSync(savePath.filePath, buf)
    return true
  })

  // ─── Sitzplan ───────────────────────────────────────────────────────────────
  ipcMain.handle('sitzplan:getTische', (_, fachId) => {
    const rows = db.prepare(`
      SELECT t.id as tisch_id, t.typ, t.x, t.y, t.rotation,
             s.id as sitz_id, s.position,
             s.schueler_id,
             sch.vorname, sch.nachname, sch.avatar
      FROM sitzplan_tische t
      LEFT JOIN sitzplan_sitzplaetze s ON s.tisch_id = t.id
      LEFT JOIN schueler sch ON sch.id = s.schueler_id
      WHERE t.fach_id = ?
      ORDER BY t.id, s.position
    `).all(fachId)
    // Gruppiere Rows zu Tisch-Objekten
    const map = {}
    for (const row of rows) {
      if (!map[row.tisch_id]) {
        map[row.tisch_id] = { id: row.tisch_id, typ: row.typ, x: row.x, y: row.y, rotation: row.rotation ?? 0, sitze: [] }
      }
      if (row.sitz_id != null) {
        map[row.tisch_id].sitze.push({
          id: row.sitz_id, position: row.position,
          schueler_id: row.schueler_id, vorname: row.vorname, nachname: row.nachname, avatar: row.avatar,
        })
      }
    }
    return Object.values(map)
  })

  ipcMain.handle('sitzplan:createTisch', (_, fachId, typ, x, y) => {
    const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
    const tisch = db.prepare(
      'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y) VALUES (?, ?, ?, ?, ?)'
    ).run(fach.klasse_id, fachId, typ, x, y)
    const tischId = tisch.lastInsertRowid
    db.prepare('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, 0)').run(tischId)
    if (typ === 'doppel') {
      db.prepare('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, 1)').run(tischId)
    }
    return tischId
  })

  ipcMain.handle('sitzplan:deleteTisch', (_, tischId) => {
    db.prepare('DELETE FROM sitzplan_tische WHERE id = ?').run(tischId)
    return true
  })

  ipcMain.handle('sitzplan:moveTisch', (_, tischId, x, y) => {
    db.prepare('UPDATE sitzplan_tische SET x = ?, y = ? WHERE id = ?').run(x, y, tischId)
    return true
  })

  ipcMain.handle('sitzplan:setRotation', (_, tischId, rotation) => {
    const r = ((Number(rotation) % 360) + 360) % 360 // auf 0/90/180/270 normalisieren
    db.prepare('UPDATE sitzplan_tische SET rotation = ? WHERE id = ?').run(r, tischId)
    return true
  })

  ipcMain.handle('sitzplan:assignSchueler', (_, sitzplatzId, schuelerId) => {
    db.prepare('UPDATE sitzplan_sitzplaetze SET schueler_id = ? WHERE id = ?')
      .run(schuelerId ?? null, sitzplatzId)
    return true
  })

  ipcMain.handle('sitzplan:duplicateTisch', (_, fachId, sourceTischId, x, y) => {
    const source = db.prepare('SELECT * FROM sitzplan_tische WHERE id = ?').get(sourceTischId)
    const sourceSitze = db.prepare('SELECT * FROM sitzplan_sitzplaetze WHERE tisch_id = ? ORDER BY position').all(sourceTischId)
    const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
    const tisch = db.prepare(
      'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y, rotation) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(fach.klasse_id, fachId, source.typ, x, y, source.rotation ?? 0)
    const newTischId = tisch.lastInsertRowid
    for (const sitz of sourceSitze) {
      db.prepare('INSERT INTO sitzplan_sitzplaetze (tisch_id, position) VALUES (?, ?)')
        .run(newTischId, sitz.position)
    }
    return newTischId
  })

  // ─── Custom Ferien ───────────────────────────────────────────────────────────
  ipcMain.handle('customFerien:getAll', (_, schuljahrId) =>
    db.prepare('SELECT * FROM custom_ferien WHERE schuljahr_id = ? ORDER BY von').all(schuljahrId)
  )

  ipcMain.handle('customFerien:save', (_, schuljahrId, ferien) => {
    // ferien = [{ id?, name, von, bis }, ...]
    // Komplett ersetzen: alle löschen und neu einfügen
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM custom_ferien WHERE schuljahr_id = ?').run(schuljahrId)
      const insert = db.prepare('INSERT INTO custom_ferien (schuljahr_id, name, von, bis) VALUES (?, ?, ?, ?)')
      for (const f of ferien) {
        if (f.name && f.von && f.bis) {
          insert.run(schuljahrId, f.name, f.von, f.bis)
        }
      }
    })
    transaction()
    return true
  })

  // ─── Termine ─────────────────────────────────────────────────────────────────
  ipcMain.handle('termine:getAll', (_, schuljahrId) =>
    db.prepare(`
      SELECT t.*, k.name as klasse_name
      FROM termine t
      LEFT JOIN klassen k ON k.id = t.klasse_id
      WHERE t.schuljahr_id = ?
      ORDER BY t.datum, t.uhrzeit
    `).all(schuljahrId)
  )

  ipcMain.handle('termine:create', (_, { titel, datum, uhrzeit, notiz, klasseId, schuljahrId, stundeId }) => {
    console.log('[main] termine:create', { titel, datum, uhrzeit, notiz, klasseId, schuljahrId, stundeId })
    const info = db.prepare(
      'INSERT INTO termine (titel, datum, uhrzeit, notiz, klasse_id, schuljahr_id, stunde_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(titel, datum, uhrzeit ?? null, notiz ?? null, klasseId ?? null, schuljahrId, stundeId ?? null)
    console.log('[main] termine:create → id', info.lastInsertRowid)
    return info.lastInsertRowid
  })

  ipcMain.handle('termine:update', (_, id, { titel, datum, uhrzeit, notiz, klasseId, stundeId }) => {
    db.prepare('UPDATE termine SET titel = ?, datum = ?, uhrzeit = ?, notiz = ?, klasse_id = ?, stunde_id = ? WHERE id = ?')
      .run(titel, datum, uhrzeit ?? null, notiz ?? null, klasseId ?? null, stundeId ?? null, id)
    return true
  })

  ipcMain.handle('termine:delete', (_, id) => {
    db.prepare('DELETE FROM termine WHERE id = ?').run(id)
    return true
  })

  // ─── Jahresplanung ────────────────────────────────────────────────────────────
  ipcMain.handle('jahresplanung:getAll', (_, fachId) =>
    db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY reihenfolge, id').all(fachId)
  )
  ipcMain.handle('jahresplanung:create', (_, d) => {
    const maxOrd = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?').get(d.fachId).m
    const id = Number(db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)').run(d.fachId, d.titel, d.inhalt ?? '', d.lernziele ?? '', d.kompetenzen ?? '', d.datumVon ?? null, d.datumBis ?? null, d.farbe ?? null, maxOrd + 1).lastInsertRowid)
    try { if (materialRoot()) { ensureAbschnittFolder(id); schreibeMaterialIndex(id) } } catch (e) { logError('jahresplanung:create ordner', e) }
    return id
  })
  ipcMain.handle('jahresplanung:update', (_, id, d) => {
    const alt = db.prepare('SELECT titel, fach_id, material_ordner FROM jahresplanung_abschnitte WHERE id=?').get(id)
    db.prepare('UPDATE jahresplanung_abschnitte SET titel=?, inhalt=?, lernziele=?, kompetenzen=?, datum_von=?, datum_bis=?, farbe=? WHERE id=?').run(d.titel, d.inhalt ?? '', d.lernziele ?? '', d.kompetenzen ?? '', d.datumVon ?? null, d.datumBis ?? null, d.farbe ?? null, id)
    let ordnerWarnung = null
    const root = materialRoot()
    if (root && alt && alt.material_ordner && d.titel != null && d.titel !== alt.titel) {
      const h = abschnittHierarchie(alt.fach_id)
      if (h) {
        const baseDir = fachDir(root, h)
        const oldDir = path.join(baseDir, alt.material_ordner)
        if (fs.existsSync(oldDir)) {
          const neuLeaf = eindeutigerLeaf(baseDir, sanitizeSegment(d.titel))
          ordnerWarnung = verschiebeDir(oldDir, path.join(baseDir, neuLeaf))
          if (!ordnerWarnung) { db.prepare('UPDATE jahresplanung_abschnitte SET material_ordner=? WHERE id=?').run(neuLeaf, id); schreibeMaterialIndex(id) }
        }
      }
    }
    return { ok: true, ordnerWarnung }
  })
  ipcMain.handle('jahresplanung:delete', (_, id) => {
    db.prepare('DELETE FROM jahresplanung_abschnitte WHERE id=?').run(id)
    return true
  })
  ipcMain.handle('jahresplanung:getFaecherMitPlan', () =>
    db.prepare(`
      SELECT f.id, f.name, f.farbe, k.name as klasse_name, k.id as klasse_id,
             k.ist_vorlage as ist_vorlage,
             COUNT(a.id) as abschnitt_anzahl
      FROM jahresplanung_abschnitte a
      JOIN faecher f ON a.fach_id = f.id
      JOIN klassen k ON f.klasse_id = k.id
      GROUP BY f.id
      ORDER BY k.ist_vorlage DESC, k.name, f.name
    `).all()
  )
  ipcMain.handle('jahresplanung:importVonFach', (_, quellFachId, zielFachId, options = {}) => {
    const ohneTermine = options && options.ohneTermine === true
    const abschnitte = db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY reihenfolge').all(quellFachId)
    const maxOrd = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?').get(zielFachId).m
    const insert = db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)')
    db.transaction(() => {
      abschnitte.forEach((a, i) => insert.run(
        zielFachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen,
        ohneTermine ? null : a.datum_von,
        ohneTermine ? null : a.datum_bis,
        a.farbe, maxOrd + 1 + i
      ))
    })()
    return true
  })
  // Eine Fach-Planung (z. B. eine Vorlage) auf MEHRERE Ziel-Fächer anwenden.
  // ohneTermine (Default true) = Datumsangaben strippen; ersetzen = Ziel-Planung vorher löschen;
  // mitMaterialien (Default true) = Dokumente/Links je Abschnitt mitkopieren.
  ipcMain.handle('jahresplanung:anwendenAufFaecher', (_, quellFachId, zielFachIds, options = {}) => {
    const ohneTermine = options.ohneTermine !== false
    const ersetzen = options.ersetzen === true
    const mitMaterialien = options.mitMaterialien !== false
    const ziele = (Array.isArray(zielFachIds) ? zielFachIds : []).filter(id => id && id !== quellFachId)
    const abschnitte = db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY reihenfolge, id').all(quellFachId)
    const insert = db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)')
    const tx = db.transaction(() => {
      for (const zielFachId of ziele) {
        if (ersetzen) db.prepare('DELETE FROM jahresplanung_abschnitte WHERE fach_id = ?').run(zielFachId)
        const maxOrd = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?').get(zielFachId).m
        abschnitte.forEach((a, i) => {
          const na = insert.run(zielFachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen,
            ohneTermine ? null : a.datum_von, ohneTermine ? null : a.datum_bis,
            a.farbe, maxOrd + 1 + i)
          if (mitMaterialien) kopiereMaterialien(a.id, na.lastInsertRowid)
        })
      }
    })
    tx()
    return { ok: true, anzahlZiele: ziele.length, anzahlAbschnitte: abschnitte.length }
  })
  // Import einer vom Chatbot erzeugten JSON-Datei in ein Fach (robustes Parsen + Validierung).
  ipcMain.handle('jahresplanung:importVonDatei', (_, fachId, filePath, options = {}) => {
    const ersetzen = options.ersetzen === true
    let roh
    try { roh = fs.readFileSync(filePath, 'utf-8') }
    catch (e) { logError('importVonDatei:read', e); return { ok: false, fehler: 'Datei konnte nicht gelesen werden.' } }

    // Robust: Code-Fences (```json …```) entfernen; sonst den äußersten {…}/[…]-Block extrahieren.
    const parseJson = (text) => {
      let t = String(text).trim()
      const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
      if (fence) t = fence[1].trim()
      try { return JSON.parse(t) } catch {}
      const m = t.match(/[[{][\s\S]*[\]}]/)
      if (m) { try { return JSON.parse(m[0]) } catch {} }
      return undefined
    }
    const parsed = parseJson(roh)
    if (parsed === undefined) return { ok: false, fehler: 'Die Datei enthält kein gültiges JSON.' }

    const liste = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.abschnitte) ? parsed.abschnitte : null)
    if (!liste) return { ok: false, fehler: 'Kein „abschnitte"-Array in der Datei gefunden.' }

    const istDatum = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    const istFarbe = (s) => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s)
    // Strings direkt; Arrays (falls der Chatbot Listen liefert) zeilenweise zusammenführen.
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

    const insert = db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)')
    const neueIds = []
    db.transaction(() => {
      if (ersetzen) db.prepare('DELETE FROM jahresplanung_abschnitte WHERE fach_id = ?').run(fachId)
      const maxOrd = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?').get(fachId).m
      norm.forEach((a, i) => {
        const info = insert.run(fachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen, a.datum_von, a.datum_bis, a.farbe, maxOrd + 1 + i)
        neueIds.push(Number(info.lastInsertRowid))
      })
    })()
    // Material-Ordner je Abschnitt anlegen (konsistent mit jahresplanung:create)
    try { if (materialRoot()) for (const id of neueIds) { ensureAbschnittFolder(id); schreibeMaterialIndex(id) } }
    catch (e) { logError('importVonDatei:ordner', e) }
    return { ok: true, anzahl: neueIds.length }
  })
  ipcMain.handle('jahresplanung:swap', (_, idA, idB) => {
    const a = db.prepare('SELECT datum_von, datum_bis, reihenfolge FROM jahresplanung_abschnitte WHERE id = ?').get(idA)
    const b = db.prepare('SELECT datum_von, datum_bis, reihenfolge FROM jahresplanung_abschnitte WHERE id = ?').get(idB)
    if (!a || !b) return false
    const upd = db.prepare('UPDATE jahresplanung_abschnitte SET datum_von=?, datum_bis=?, reihenfolge=? WHERE id=?')
    db.transaction(() => {
      upd.run(b.datum_von, b.datum_bis, b.reihenfolge, idA)
      upd.run(a.datum_von, a.datum_bis, a.reihenfolge, idB)
    })()
    return true
  })

  // ─── Materialien (Abschnitts-Ordner) ─────────────────────────────────────────
  const MATERIAL_INDEX_NAME = '_Materialübersicht.txt'

  // Freitext → dateisystem-sicheres Segment (Windows-Regeln)
  function sanitizeSegment(name, fallback = 'Unbenannt') {
    let s = String(name ?? '').trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')  // verbotene + Steuerzeichen
      .replace(/[. ]+$/g, '')                       // keine End-Punkte/-Leerzeichen
    if (s.length > 120) s = s.slice(0, 120).replace(/[. ]+$/g, '')
    if (!s || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) s = fallback
    return s
  }
  function materialRoot() {
    return db.prepare("SELECT wert FROM einstellungen WHERE schluessel='material_root_pfad'").get()?.wert || null
  }
  function abschnittHierarchie(fachId) {
    return db.prepare(`SELECT f.name AS fach_name, k.name AS klasse_name, s.bezeichnung AS schuljahr_bez
      FROM faecher f JOIN klassen k ON f.klasse_id=k.id JOIN schuljahre s ON k.schuljahr_id=s.id
      WHERE f.id=?`).get(fachId)
  }
  function fachDir(root, h) {
    return path.join(root, sanitizeSegment(h.schuljahr_bez), sanitizeSegment(h.klasse_name), sanitizeSegment(h.fach_name))
  }
  function eindeutigerLeaf(baseDir, wunsch) {
    let leaf = wunsch, n = 2
    while (fs.existsSync(path.join(baseDir, leaf))) leaf = `${wunsch} (${n++})`
    return leaf
  }
  function eindeutigerDateiname(dir, name) {
    const ext = path.extname(name), base = path.basename(name, ext)
    let ziel = name, n = 2
    while (fs.existsSync(path.join(dir, ziel))) ziel = `${base} (${n++})${ext}`
    return ziel
  }
  // Legt den Ordner an, weist material_ordner bei Erstnutzung zu. Null wenn Root fehlt.
  function ensureAbschnittFolder(abschnittId) {
    const root = materialRoot(); if (!root) return null
    const a = db.prepare('SELECT id, fach_id, titel, material_ordner FROM jahresplanung_abschnitte WHERE id=?').get(abschnittId)
    if (!a) return null
    const h = abschnittHierarchie(a.fach_id); if (!h) return null
    const baseDir = fachDir(root, h)
    fs.mkdirSync(baseDir, { recursive: true })
    let leaf = a.material_ordner
    if (!leaf) {
      leaf = eindeutigerLeaf(baseDir, sanitizeSegment(a.titel || 'Abschnitt'))
      db.prepare('UPDATE jahresplanung_abschnitte SET material_ordner=? WHERE id=?').run(leaf, abschnittId)
    }
    const dir = path.join(baseDir, leaf)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }
  // Read-only-Auflösung (kein Anlegen).
  function abschnittFolderIfExists(abschnittId) {
    const root = materialRoot(); if (!root) return null
    const a = db.prepare('SELECT fach_id, material_ordner FROM jahresplanung_abschnitte WHERE id=?').get(abschnittId)
    if (!a || !a.material_ordner) return null
    const h = abschnittHierarchie(a.fach_id); if (!h) return null
    const dir = path.join(fachDir(root, h), a.material_ordner)
    return fs.existsSync(dir) ? dir : null
  }
  function verschiebeDir(oldDir, newDir) {
    try {
      if (!oldDir || !newDir || oldDir === newDir) return null
      if (!fs.existsSync(oldDir)) return null
      if (fs.existsSync(newDir)) return 'Zielordner existiert bereits – bitte manuell zusammenführen.'
      fs.mkdirSync(path.dirname(newDir), { recursive: true })
      fs.renameSync(oldDir, newDir)
      return null
    } catch (e) { logError('verschiebeDir', e); return 'Ordner konnte nicht verschoben werden (evtl. geöffnet).' }
  }
  // Gemeinsame Auflistung (Dokumente aus Ordner + Datei-Meta + Links aus DB). Index-Datei/Dotfiles übersprungen.
  function sammleMaterialien(abschnittId) {
    const dir = abschnittFolderIfExists(abschnittId)
    const meta = db.prepare('SELECT * FROM abschnitt_materialien WHERE abschnitt_id=? ORDER BY reihenfolge, id').all(abschnittId)
    const metaDatei = new Map(meta.filter(m => m.typ === 'datei').map(m => [m.ref, m]))
    const dateien = []
    const gesehen = new Set()
    if (dir) {
      for (const de of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!de.isFile() || de.name.startsWith('.') || de.name === MATERIAL_INDEX_NAME) continue
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
  function schreibeMaterialIndex(abschnittId) {
    try {
      const dir = abschnittFolderIfExists(abschnittId)
      if (!dir) return
      const a = db.prepare('SELECT fach_id, titel FROM jahresplanung_abschnitte WHERE id=?').get(abschnittId)
      const h = a ? abschnittHierarchie(a.fach_id) : null
      const { dateien, links } = sammleMaterialien(abschnittId)
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
      fs.writeFileSync(path.join(dir, MATERIAL_INDEX_NAME), z.join('\r\n'), 'utf8')
    } catch (e) { logError('schreibeMaterialIndex', e) }
  }

  ipcMain.handle('materialien:waehleRoot', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    db.prepare("INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES ('material_root_pfad', ?)").run(r.filePaths[0])
    return r.filePaths[0]
  })
  ipcMain.handle('materialien:getRoot', () => materialRoot())
  ipcMain.handle('materialien:list', (_, abschnittId) => {
    const root = materialRoot()
    const { dir, dateien, links } = sammleMaterialien(abschnittId)
    return { root: !!root, ordner: dir, dateien, links }
  })
  ipcMain.handle('materialien:dateienHinzufuegen', async (_, abschnittId) => {
    const r = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (r.canceled) return { ok: false, grund: 'abbruch' }
    let dir
    try { dir = ensureAbschnittFolder(abschnittId) } catch (e) { logError('materialien:dateien mkdir', e); return { ok: false, grund: 'fs' } }
    if (!dir) return { ok: false, grund: 'kein_root' }
    for (const src of r.filePaths) {
      try { fs.copyFileSync(src, path.join(dir, eindeutigerDateiname(dir, path.basename(src)))) }
      catch (e) { logError('materialien:copy', e) }
    }
    schreibeMaterialIndex(abschnittId)
    return { ok: true }
  })
  ipcMain.handle('materialien:linkHinzufuegen', (_, abschnittId, data) => {
    const { url, anzeigename, beschreibung } = data || {}
    if (!url) return { ok: false }
    const max = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) m FROM abschnitt_materialien WHERE abschnitt_id=?').get(abschnittId).m
    db.prepare(`INSERT INTO abschnitt_materialien (abschnitt_id,typ,ref,anzeigename,beschreibung,reihenfolge,erstellt_am)
      VALUES (?,?,?,?,?,?,datetime('now'))`).run(abschnittId, 'link', url, anzeigename || null, beschreibung || null, max + 1)
    schreibeMaterialIndex(abschnittId)
    return { ok: true }
  })
  ipcMain.handle('materialien:metaSetzen', (_, data) => {
    const { abschnittId, typ, ref, id, anzeigename, beschreibung } = data || {}
    if (typ === 'link' && id) {
      db.prepare('UPDATE abschnitt_materialien SET anzeigename=?, beschreibung=? WHERE id=?').run(anzeigename || null, beschreibung || null, id)
    } else if (typ === 'datei') {
      const ex = db.prepare("SELECT id FROM abschnitt_materialien WHERE abschnitt_id=? AND typ='datei' AND ref=?").get(abschnittId, ref)
      if (ex) db.prepare('UPDATE abschnitt_materialien SET anzeigename=?, beschreibung=? WHERE id=?').run(anzeigename || null, beschreibung || null, ex.id)
      else db.prepare("INSERT INTO abschnitt_materialien (abschnitt_id,typ,ref,anzeigename,beschreibung) VALUES (?,'datei',?,?,?)").run(abschnittId, ref, anzeigename || null, beschreibung || null)
    }
    schreibeMaterialIndex(abschnittId)
    return { ok: true }
  })
  ipcMain.handle('materialien:entfernen', (_, data) => {
    const { abschnittId, typ, ref, id } = data || {}
    if (typ === 'datei') {
      const dir = abschnittFolderIfExists(abschnittId)
      if (dir) { try { fs.unlinkSync(path.join(dir, ref)) } catch (e) { logError('materialien:unlink', e) } }
      db.prepare("DELETE FROM abschnitt_materialien WHERE abschnitt_id=? AND typ='datei' AND ref=?").run(abschnittId, ref)
    } else if (id) {
      db.prepare('DELETE FROM abschnitt_materialien WHERE id=?').run(id)
    }
    schreibeMaterialIndex(abschnittId)
    return { ok: true }
  })
  ipcMain.handle('materialien:oeffnen', async (_, data) => {
    const { abschnittId, typ, ref } = data || {}
    if (typ === 'link') { return { ok: oeffneExternSicher(ref) } }
    const dir = abschnittFolderIfExists(abschnittId)
    if (!dir) return { ok: false, grund: 'kein_ordner' }
    const err = await shell.openPath(path.join(dir, ref))
    return { ok: !err, fehler: err || null }
  })
  ipcMain.handle('materialien:ordnerOeffnen', async (_, abschnittId) => {
    let dir
    try { dir = ensureAbschnittFolder(abschnittId) } catch (e) { logError('materialien:ordnerOeffnen', e); return { ok: false, grund: 'fs' } }
    if (!dir) return { ok: false, grund: 'kein_root' }
    schreibeMaterialIndex(abschnittId)
    const err = await shell.openPath(dir)
    return { ok: !err, fehler: err || null }
  })

  // Materialien eines Abschnitts (Links + Datei-Metadaten + echte Dateien) auf einen anderen kopieren.
  function kopiereMaterialien(vonAbschnittId, nachAbschnittId) {
    const rows = db.prepare('SELECT typ, ref, anzeigename, beschreibung, reihenfolge FROM abschnitt_materialien WHERE abschnitt_id=? ORDER BY reihenfolge, id').all(vonAbschnittId)
    const ins = db.prepare('INSERT INTO abschnitt_materialien (abschnitt_id, typ, ref, anzeigename, beschreibung, reihenfolge) VALUES (?,?,?,?,?,?)')
    for (const r of rows) ins.run(nachAbschnittId, r.typ, r.ref, r.anzeigename, r.beschreibung, r.reihenfolge)
    try {
      const vonDir = abschnittFolderIfExists(vonAbschnittId)
      if (!vonDir) return
      const nachDir = ensureAbschnittFolder(nachAbschnittId)
      if (!nachDir) return
      for (const de of fs.readdirSync(vonDir, { withFileTypes: true })) {
        if (!de.isFile() || de.name.startsWith('.') || de.name === MATERIAL_INDEX_NAME) continue
        fs.copyFileSync(path.join(vonDir, de.name), path.join(nachDir, de.name))
      }
      schreibeMaterialIndex(nachAbschnittId)
    } catch (e) { logError('kopiereMaterialien', e) }
  }

  // Eine echte Klasse duplizieren: Fächer immer; optional Jahresplanung+Materialien und/oder Schüler:innen (ohne Noten).
  ipcMain.handle('klassen:duplizieren', (_, { klasseId, neuerName, mitPlanung, mitSchueler }) => {
    const tx = db.transaction(() => {
      const orig = db.prepare('SELECT * FROM klassen WHERE id=?').get(klasseId)
      if (!orig) return null
      const maxReihen = db.prepare('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id=?').get(orig.schuljahr_id)?.m ?? 0
      const nk = db.prepare('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge, teams_link, ist_vorlage, ist_kv) VALUES (?,?,?,?,?,0,?)')
        .run(orig.schuljahr_id, (neuerName && neuerName.trim()) || (orig.name + ' (Kopie)'), orig.farbe ?? null, maxReihen + 1, orig.teams_link ?? null, orig.ist_kv ?? 0)
      const neueKlasseId = nk.lastInsertRowid

      // Schüler:innen kopieren (ohne Noten)
      const schuelerMap = {}
      if (mitSchueler) {
        const schueler = db.prepare('SELECT * FROM schueler WHERE klasse_id=? AND aktiv=1 ORDER BY reihenfolge, id').all(klasseId)
        const insS = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, aktiv, avatar, lernschwaeche, legasthenie, spf) VALUES (?,?,?,?,1,?,?,?,?)')
        for (const s of schueler) {
          const r = insS.run(neueKlasseId, s.vorname, s.nachname, s.reihenfolge, s.avatar ?? null, s.lernschwaeche ?? 0, s.legasthenie ?? 0, s.spf ?? 0)
          schuelerMap[s.id] = r.lastInsertRowid
        }
      }

      // Fächer kopieren (mit Einstellungen)
      const faecher = db.prepare('SELECT * FROM faecher WHERE klasse_id=? ORDER BY reihenfolge, id').all(klasseId)
      for (const f of faecher) {
        const nf = db.prepare(`INSERT INTO faecher
          (klasse_id, name, farbe, reihenfolge, benotungssystem, alle_schueler,
           gewichtung_sa, gewichtung_t, gewichtung_custom, ma_max_einfluss, hue_max_einfluss)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
          neueKlasseId, f.name, f.farbe ?? null, f.reihenfolge, f.benotungssystem ?? 'standard', f.alle_schueler ?? 1,
          f.gewichtung_sa, f.gewichtung_t, f.gewichtung_custom, f.ma_max_einfluss, f.hue_max_einfluss)
        const neuFachId = nf.lastInsertRowid
        initKompetenzVorlagen(neuFachId, f.name)

        if (mitSchueler) {
          // Gruppenfächer: Mitgliedschaften auf die neuen Schüler:innen remappen
          if (!(f.alle_schueler ?? 1)) {
            const rows = db.prepare('SELECT schueler_id FROM fach_schueler WHERE fach_id=?').all(f.id)
            const insFS = db.prepare('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)')
            for (const r of rows) { const ns = schuelerMap[r.schueler_id]; if (ns) insFS.run(neuFachId, ns) }
          }
          // Differenziert: Niveau-Default (AHS) für die Roster-Schüler:innen
          if (f.benotungssystem === 'differenziert') {
            const insN = db.prepare("INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, 'AHS')")
            for (const sid of rosterIdsFuerFach(neuFachId)) insN.run(neuFachId, sid)
          }
        }

        // Jahresplanung + Materialien (Termine bleiben erhalten)
        if (mitPlanung) {
          const abschnitte = db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id=? ORDER BY reihenfolge, id').all(f.id)
          for (const a of abschnitte) {
            const na = db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, lernziele, kompetenzen, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?,?,?)')
              .run(neuFachId, a.titel, a.inhalt, a.lernziele, a.kompetenzen, a.datum_von, a.datum_bis, a.farbe, a.reihenfolge)
            kopiereMaterialien(a.id, na.lastInsertRowid)
          }
        }
      }
      return neueKlasseId
    })
    return tx()
  })

  // ─── KV-Modul (Klassenvorstand) ──────────────────────────────────────────────

  // Jahresaufgaben: Template + Status per Klasse + Schuljahr (LEFT JOIN)
  // Liefert auch parent_id (NULL = Top-Level, sonst Sub-Aufgabe)
  ipcMain.handle('kv:jahresaufgaben:getAlle', (_, klasseId, schuljahrId) => {
    return db.prepare(`
      SELECT
        a.id, a.monat, a.titel, a.beschreibung, a.rechtsbezug, a.kategorie, a.sortierung, a.parent_id,
        s.id AS status_id, s.erledigt_am, s.notiz
      FROM kv_jahresaufgaben a
      LEFT JOIN kv_jahresaufgaben_status s
        ON s.aufgabe_id = a.id AND s.klasse_id = ? AND s.schuljahr_id = ?
      ORDER BY a.monat, a.sortierung, a.id
    `).all(klasseId, schuljahrId)
  })

  // Jahresaufgaben — Template-CRUD
  // Bei parent_id wird die Sub-Aufgabe an die Parent-Aufgabe gehängt; sie erbt den Monat des Parents
  // (und kann optional eigene Sortierung am Ende der Geschwister-Subs).
  ipcMain.handle('kv:jahresaufgaben:createTemplate', (_, data) => {
    let monat = data.monat
    if (data.parentId) {
      const parent = db.prepare('SELECT monat FROM kv_jahresaufgaben WHERE id = ?').get(data.parentId)
      if (parent) monat = parent.monat
    }
    const maxSort = data.parentId
      ? db.prepare('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_jahresaufgaben WHERE parent_id = ?').get(data.parentId).m
      : db.prepare('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_jahresaufgaben WHERE monat = ? AND parent_id IS NULL').get(monat).m
    const info = db.prepare(`
      INSERT INTO kv_jahresaufgaben (monat, titel, beschreibung, rechtsbezug, kategorie, sortierung, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(monat, data.titel, data.beschreibung ?? null, data.rechtsbezug ?? null, data.kategorie ?? null, maxSort + 1, data.parentId ?? null)
    return info.lastInsertRowid
  })

  ipcMain.handle('kv:jahresaufgaben:updateTemplate', (_, id, data) => {
    // Wenn Sub-Aufgabe: Monat & Kategorie kommen vom Parent — wir lassen sie aber updatebar
    db.prepare(`
      UPDATE kv_jahresaufgaben
      SET monat = ?, titel = ?, beschreibung = ?, rechtsbezug = ?, kategorie = ?
      WHERE id = ?
    `).run(data.monat, data.titel, data.beschreibung ?? null, data.rechtsbezug ?? null, data.kategorie ?? null, id)
    return true
  })

  ipcMain.handle('kv:jahresaufgaben:deleteTemplate', (_, id) => {
    // Status-Einträge kaskadieren via ON DELETE CASCADE weg
    db.prepare('DELETE FROM kv_jahresaufgaben WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('kv:jahresaufgaben:setStatus', (_, aufgabeId, klasseId, schuljahrId, erledigtAm, notiz) => {
    // Defensive Prüfung: fehlende IDs würden sonst als kryptischer NOT-NULL-Fehler auflaufen.
    if (aufgabeId == null || klasseId == null || schuljahrId == null) {
      throw new Error(`kv:jahresaufgaben:setStatus – fehlende ID (aufgabeId=${aufgabeId}, klasseId=${klasseId}, schuljahrId=${schuljahrId})`)
    }
    db.prepare(`
      INSERT INTO kv_jahresaufgaben_status (aufgabe_id, schuljahr_id, klasse_id, erledigt_am, notiz)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(aufgabe_id, schuljahr_id, klasse_id) DO UPDATE SET
        erledigt_am = excluded.erledigt_am,
        notiz       = excluded.notiz
    `).run(aufgabeId, schuljahrId, klasseId, erledigtAm ?? null, notiz ?? null)
    return true
  })

  // Wochenaufgaben
  ipcMain.handle('kv:wochenaufgaben:getAlle', () => {
    return db.prepare('SELECT * FROM kv_wochenaufgaben WHERE aktiv = 1 ORDER BY sortierung, id').all()
  })

  // Wochenaufgaben — Template-CRUD
  ipcMain.handle('kv:wochenaufgaben:createTemplate', (_, data) => {
    const maxSort = db.prepare('SELECT COALESCE(MAX(sortierung), 0) AS m FROM kv_wochenaufgaben').get().m
    const info = db.prepare(`
      INSERT INTO kv_wochenaufgaben (titel, rechtsbezug, sortierung, aktiv)
      VALUES (?, ?, ?, 1)
    `).run(data.titel, data.rechtsbezug ?? null, maxSort + 1)
    return info.lastInsertRowid
  })

  ipcMain.handle('kv:wochenaufgaben:updateTemplate', (_, id, data) => {
    db.prepare(`
      UPDATE kv_wochenaufgaben SET titel = ?, rechtsbezug = ? WHERE id = ?
    `).run(data.titel, data.rechtsbezug ?? null, id)
    return true
  })

  ipcMain.handle('kv:wochenaufgaben:deleteTemplate', (_, id) => {
    // Status-Einträge kaskadieren weg
    db.prepare('DELETE FROM kv_wochenaufgaben WHERE id = ?').run(id)
    return true
  })

  // Status für mehrere Wochen (für die Tabellen-Ansicht)
  // wochen: Array von { kw, jahr }
  ipcMain.handle('kv:wochenaufgaben:getStatusFuerWochen', (_, klasseId, schuljahrId, wochen) => {
    if (!Array.isArray(wochen) || wochen.length === 0) return []
    // Bauen ein OR-Konstrukt — bei 10 Wochen × 1 Klasse völlig OK
    const conditions = wochen.map(() => '(kalenderwoche = ? AND jahr = ?)').join(' OR ')
    const params = [klasseId, schuljahrId, ...wochen.flatMap(w => [w.kw, w.jahr])]
    return db.prepare(`
      SELECT * FROM kv_wochenaufgaben_status
      WHERE klasse_id = ? AND schuljahr_id = ? AND (${conditions})
    `).all(...params)
  })

  ipcMain.handle('kv:wochenaufgaben:setStatus', (_, aufgabeId, klasseId, schuljahrId, kw, jahr, erledigtAm, notiz) => {
    db.prepare(`
      INSERT INTO kv_wochenaufgaben_status (aufgabe_id, schuljahr_id, klasse_id, kalenderwoche, jahr, erledigt_am, notiz)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(aufgabe_id, klasse_id, kalenderwoche, jahr) DO UPDATE SET
        erledigt_am = excluded.erledigt_am,
        notiz       = excluded.notiz
    `).run(aufgabeId, schuljahrId, klasseId, kw, jahr, erledigtAm ?? null, notiz ?? null)
    return true
  })

  // Trigger — gefiltert (offene / archivierte / nach Schweregrad)
  ipcMain.handle('kv:trigger:getAlle', (_, klasseId, opts = {}) => {
    const { archiviert = 0, schweregrad } = opts
    // Spalten mit t. qualifizieren – kv_trigger UND schueler haben je eine Spalte klasse_id,
    // sonst: "ambiguous column name: klasse_id".
    const wheres = ['t.klasse_id = ?', 't.archiviert = ?']
    const params = [klasseId, archiviert ? 1 : 0]
    if (schweregrad) { wheres.push('t.schweregrad = ?'); params.push(schweregrad) }
    return db.prepare(`
      SELECT t.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_trigger t
      LEFT JOIN schueler s ON s.id = t.schueler_id
      WHERE ${wheres.join(' AND ')}
      ORDER BY
        CASE t.schweregrad WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
        t.erstellt_am DESC
    `).all(...params)
  })

  ipcMain.handle('kv:trigger:getAlleFuerSchueler', (_, schuelerId) => {
    return db.prepare(`
      SELECT * FROM kv_trigger WHERE schueler_id = ? ORDER BY erstellt_am DESC
    `).all(schuelerId)
  })

  ipcMain.handle('kv:trigger:reagieren', (_, id, reaktion) => {
    db.prepare(`
      UPDATE kv_trigger
      SET reagiert_am = datetime('now','localtime'), reaktion = ?, archiviert = 1
      WHERE id = ?
    `).run(reaktion ?? null, id)
    return true
  })

  ipcMain.handle('kv:trigger:create', (_, { klasseId, schuelerId, typ, schweregrad, ausloeser, beschreibung }) => {
    return erzeugeTrigger(klasseId, schuelerId ?? null, typ, schweregrad ?? 'info', ausloeser ?? null, beschreibung ?? null)
  })

  ipcMain.handle('kv:trigger:delete', (_, id) => {
    db.prepare('DELETE FROM kv_trigger WHERE id = ?').run(id)
    return true
  })

  // Aktenvermerke
  ipcMain.handle('kv:aktenvermerke:getAlleFuerKlasse', (_, klasseId) => {
    return db.prepare(`
      SELECT a.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_aktenvermerke a
      LEFT JOIN schueler s ON s.id = a.schueler_id
      WHERE a.klasse_id = ?
      ORDER BY a.datum DESC, a.id DESC
    `).all(klasseId)
  })

  ipcMain.handle('kv:aktenvermerke:getAlleFuerSchueler', (_, schuelerId) => {
    return db.prepare('SELECT * FROM kv_aktenvermerke WHERE schueler_id = ? ORDER BY datum DESC, id DESC').all(schuelerId)
  })

  ipcMain.handle('kv:aktenvermerke:create', (_, data) => {
    const info = db.prepare(`
      INSERT INTO kv_aktenvermerke (schueler_id, klasse_id, datum, typ, titel, beschreibung, zeugen, folgemassnahme)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.schuelerId ?? null, data.klasseId, data.datum, data.typ,
      data.titel, data.beschreibung, data.zeugen ?? null, data.folgemassnahme ?? null
    )
    // Trigger auto: Bei Typ "vorfall" → info-Trigger
    if (data.typ === 'vorfall') {
      erzeugeTrigger(
        data.klasseId, data.schuelerId ?? null, 'vorfall', 'info',
        `Aktenvermerk: ${data.titel}`,
        data.beschreibung
      )
    }
    return info.lastInsertRowid
  })

  ipcMain.handle('kv:aktenvermerke:update', (_, id, data) => {
    db.prepare(`
      UPDATE kv_aktenvermerke
      SET datum = ?, typ = ?, titel = ?, beschreibung = ?, zeugen = ?, folgemassnahme = ?
      WHERE id = ?
    `).run(data.datum, data.typ, data.titel, data.beschreibung, data.zeugen ?? null, data.folgemassnahme ?? null, id)
    return true
  })

  ipcMain.handle('kv:aktenvermerke:delete', (_, id) => {
    db.prepare('DELETE FROM kv_aktenvermerke WHERE id = ?').run(id)
    return true
  })

  // Elternkontakte
  ipcMain.handle('kv:elternkontakte:getAlleFuerSchueler', (_, schuelerId) => {
    return db.prepare(`
      SELECT * FROM kv_elternkontakte WHERE schueler_id = ?
      ORDER BY erledigt ASC, datum DESC, id DESC
    `).all(schuelerId)
  })

  ipcMain.handle('kv:elternkontakte:getOffeneFuerKlasse', (_, klasseId) => {
    return db.prepare(`
      SELECT e.*, s.vorname AS schueler_vorname, s.nachname AS schueler_nachname
      FROM kv_elternkontakte e
      JOIN schueler s ON s.id = e.schueler_id
      WHERE s.klasse_id = ? AND e.erledigt = 0
      ORDER BY e.datum ASC
    `).all(klasseId)
  })

  ipcMain.handle('kv:elternkontakte:create', (_, data) => {
    const info = db.prepare(`
      INSERT INTO kv_elternkontakte (schueler_id, datum, art, initiator, thema, inhalt, erledigt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.schuelerId, data.datum, data.art, data.initiator, data.thema, data.inhalt ?? null, data.erledigt ? 1 : 0)
    return info.lastInsertRowid
  })

  ipcMain.handle('kv:elternkontakte:update', (_, id, data) => {
    db.prepare(`
      UPDATE kv_elternkontakte
      SET datum = ?, art = ?, initiator = ?, thema = ?, inhalt = ?, erledigt = ?
      WHERE id = ?
    `).run(data.datum, data.art, data.initiator, data.thema, data.inhalt ?? null, data.erledigt ? 1 : 0, id)
    return true
  })

  ipcMain.handle('kv:elternkontakte:setErledigt', (_, id, erledigt) => {
    db.prepare('UPDATE kv_elternkontakte SET erledigt = ? WHERE id = ?').run(erledigt ? 1 : 0, id)
    return true
  })

  ipcMain.handle('kv:elternkontakte:delete', (_, id) => {
    db.prepare('DELETE FROM kv_elternkontakte WHERE id = ?').run(id)
    return true
  })

  // Fehlstunden
  ipcMain.handle('kv:fehlstunden:getAlleFuerSchueler', (_, schuelerId, schuljahrId) => {
    // Schuljahr-Filterung: Wir kennen kein start/end pro Datensatz; nutze Bezeichnung
    // → Pragmatic: alle Fehlstunden zurückgeben (das Frontend kann filtern wenn nötig)
    return db.prepare('SELECT * FROM kv_fehlstunden WHERE schueler_id = ? ORDER BY datum DESC, id DESC').all(schuelerId)
  })

  ipcMain.handle('kv:fehlstunden:create', (_, data) => {
    const info = db.prepare(`
      INSERT INTO kv_fehlstunden (schueler_id, datum, stunden, entschuldigt, grund)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.schuelerId, data.datum, data.stunden, data.entschuldigt ? 1 : 0, data.grund ?? null)
    // Trigger-Schwellen prüfen
    pruefeFehlstundenSchwellen(data.schuelerId)
    return info.lastInsertRowid
  })

  ipcMain.handle('kv:fehlstunden:update', (_, id, data) => {
    db.prepare(`
      UPDATE kv_fehlstunden SET datum = ?, stunden = ?, entschuldigt = ?, grund = ? WHERE id = ?
    `).run(data.datum, data.stunden, data.entschuldigt ? 1 : 0, data.grund ?? null, id)
    const row = db.prepare('SELECT schueler_id FROM kv_fehlstunden WHERE id = ?').get(id)
    if (row) pruefeFehlstundenSchwellen(row.schueler_id)
    return true
  })

  ipcMain.handle('kv:fehlstunden:delete', (_, id) => {
    const row = db.prepare('SELECT schueler_id FROM kv_fehlstunden WHERE id = ?').get(id)
    db.prepare('DELETE FROM kv_fehlstunden WHERE id = ?').run(id)
    if (row) pruefeFehlstundenSchwellen(row.schueler_id)
    return true
  })

  // Periodische Prüfung: offene Eltern-Rückrufe älter als 3 Tage → Trigger
  ipcMain.handle('kv:pruefeOffeneRueckrufe', () => {
    const heute = new Date()
    const dreiTageZurueck = new Date(heute.getTime() - 3 * 86400000)
    const cutoff = `${dreiTageZurueck.getFullYear()}-${String(dreiTageZurueck.getMonth() + 1).padStart(2, '0')}-${String(dreiTageZurueck.getDate()).padStart(2, '0')}`
    const offene = db.prepare(`
      SELECT e.id, e.thema, e.datum, s.id AS schueler_id, s.klasse_id, s.vorname, s.nachname
      FROM kv_elternkontakte e
      JOIN schueler s ON s.id = e.schueler_id
      JOIN klassen k ON k.id = s.klasse_id
      WHERE e.erledigt = 0 AND e.datum <= ? AND k.ist_kv = 1
    `).all(cutoff)
    for (const o of offene) {
      erzeugeTrigger(
        o.klasse_id, o.schueler_id, 'elternkontakt', 'warn',
        `Offener Rückruf seit ${o.datum}`,
        `Thema: ${o.thema}`
      )
    }
    return offene.length
  })
}

// ─── Fenster erstellen ────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'daskalalogo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'default',
    show: false,
    backgroundColor: '#f8fafc',
  })

  win.once('ready-to-show', () => win.show())

  // Härtung: keine neuen Fenster aus dem Renderer; externe Ziele nur über die
  // Schema-Allowlist extern öffnen; keine Navigation aus der App heraus.
  win.webContents.setWindowOpenHandler(({ url }) => {
    oeffneExternSicher(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    const erlaubt = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://')
    if (!erlaubt) { event.preventDefault(); oeffneExternSicher(url) }
  })

  // Tastenkürzel (Ersatz für das entfernte Menü): Rückgängig/Wiederholen, Öffnen, Speichern unter.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (appGesperrt) return   // gesperrt: keine App-Kürzel (PIN-Eingabe bleibt möglich)
    if (!(input.control || input.meta)) return
    const key = (input.key || '').toLowerCase()
    if (key === 'z' && !input.shift) { event.preventDefault(); executeUndo() }
    else if (key === 'y' || (key === 'z' && input.shift)) { event.preventDefault(); executeRedo() }
    else if (key === 'o' && !input.shift) { event.preventDefault(); doOpen(win) }
    else if (key === 's' && input.shift) { event.preventDefault(); doSaveAs(win) }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
}

// ─── App-Lifecycle ────────────────────────────────────────────────────────────
// ─── Automatische Updates (GitHub Releases) ──────────────────────────────────
// Nur im gepackten Build aktiv; im Dev fehlt die Update-Konfiguration.
function setupAutoUpdate() {
  if (!app.isPackaged) return
  const send = (data) => BrowserWindow.getAllWindows()[0]?.webContents.send('update:status', data)
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-available', (info) => send({ status: 'available', version: info?.version }))
  autoUpdater.on('update-downloaded', (info) => {
    // Vor jedem Update eine Sicherung – deckt auch die Installation beim Beenden ab.
    try { backupVorUpdate() } catch (e) { logError('backupVorUpdate', e) }
    send({ status: 'downloaded', version: info?.version })
  })
  autoUpdater.on('error', (err) => logError('autoUpdater', err))
  autoUpdater.checkForUpdates().catch((e) => logError('checkForUpdates', e))
}
// Vom Renderer ausgelöst, wenn der/die Nutzer:in „jetzt neu starten" wählt.
ipcMain.handle('update:installieren', () => {
  // Frische Sicherung unmittelbar vor der Installation.
  try { backupVorUpdate() } catch (e) { logError('backupVorUpdate(install)', e) }
  try { autoUpdater.quitAndInstall() } catch (e) { logError('quitAndInstall', e) }
  return true
})

// Manuelle Update-Prüfung (Button in den Einstellungen). Ist ein Update vorhanden,
// lädt es dank autoDownload im Hintergrund; die vorhandenen Listener aus
// setupAutoUpdate() zeigen dann das „Neu starten"-Banner. Im Dev-Build gibt es
// keine Update-Konfiguration → ehrliche Rückmeldung statt Fehler.
ipcMain.handle('update:pruefen', async () => {
  if (!app.isPackaged) return { ok: false, grund: 'dev' }
  try {
    const r = await autoUpdater.checkForUpdates()
    return { ok: true, version: r?.updateInfo?.version ?? null, aktuell: app.getVersion() }
  } catch (e) {
    logError('update:pruefen', e)
    return { ok: false, grund: 'fehler' }
  }
})

app.whenReady().then(() => {
  initPaths()
  initDB()
  createBackup()
  autoBackupWennAktiv()
  registerIPC()
  setupMenu()
  createWindow()
  setupAutoUpdate()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
