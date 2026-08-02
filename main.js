// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const fs = require('fs')

// ── Kern-Domänen (Phase-1-Extraktion; plattformunabhängig, ohne Electron) ──
const einstellungenDomain = require('./core/domain/einstellungen')
const schuljahreDomain = require('./core/domain/schuljahre')
const notizenDomain = require('./core/domain/notizen')
const termineDomain = require('./core/domain/termine')
const todosDomain = require('./core/domain/todos')
const gewichtungDomain = require('./core/domain/gewichtung')
const klassenDomain = require('./core/domain/klassen')
const niveauDomain = require('./core/domain/niveau')
const faecherDomain = require('./core/domain/faecher')
const schuelerDomain = require('./core/domain/schueler')
const kompetenzenDomain = require('./core/domain/kompetenzen')
const spaltenDomain = require('./core/domain/spalten')
const eintraegeDomain = require('./core/domain/eintraege')
const zeugnisnotenDomain = require('./core/domain/zeugnisnoten')
const stundenzeitenDomain = require('./core/domain/stundenzeiten')
const stundenplanDomain = require('./core/domain/stundenplan')
const supplierstundenDomain = require('./core/domain/supplierstunden')
const stundenPlanungDomain = require('./core/domain/stundenplanung')
const sitzplanDomain = require('./core/domain/sitzplan')
const customFerienDomain = require('./core/domain/customFerien')
const { createUndo } = require('./core/services/undo')
const kvJahresaufgaben = require('./core/domain/kv/jahresaufgaben')
const kvWochenaufgaben = require('./core/domain/kv/wochenaufgaben')
const kvTrigger = require('./core/domain/kv/trigger')
const kvDoku = require('./core/domain/kv/dokumentation')
const kvRoutine = require('./core/domain/kv/routine')

const materialienDomain = require('./core/domain/materialien')
const jahresplanungDomain = require('./core/domain/jahresplanung')
const exportService = require('./core/services/export')
const wetterService = require('./core/services/wetter')
const backupService = require('./core/services/backup')

// ── Ports (Phase 1.2): plattformabhaengige Adapter, in core injizierbar ──
const { createFsPort } = require('./platform/electron/ports/fs')
const { createPdfPort } = require('./platform/electron/ports/pdf')
const { createHttpPort } = require('./platform/electron/ports/http')
const { createDialogPort } = require('./platform/electron/ports/dialog')
const { createShellPort } = require('./platform/electron/ports/shell')
const fsPort = createFsPort()
const pdfPort = createPdfPort()
const httpPort = createHttpPort()
const dialogPort = createDialogPort()
const shellPort = createShellPort()

const isDev = process.env.NODE_ENV === 'development'

// ─── PDF-Helper ───────────────────────────────────────────────────────────────
// Delegiert an den PdfPort; Signatur bleibt fuer die Export-Handler unveraendert.
const htmlZuPdf = (htmlContent, opts) => pdfPort.fromHtml(htmlContent, opts)

// Dateinamen-Baustein: Schrägstriche → Bindestrich (z.B. Schuljahr „2026/27"),
// sonstige für Dateinamen ungültige Zeichen entfernen, Leerzeichen → _.
function dateiTeil(s) {
  return String(s ?? '').trim()
    .replace(/[/\\]+/g, '-')
    .replace(/[:*?"<>|]+/g, '')
    .replace(/\s+/g, '_') || 'export'
}

// Heutiges Datum als TT-MM-JJJJ für Export-Dateinamen.
function exportDatum() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
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
  // Das SVG hat eine feste width/height (z. B. 96px); ohne Skalierung würde es im 56px-Kasten abgeschnitten.
  // Wir zwingen es per Inline-Style, den Kasten zu füllen (viewBox skaliert korrekt).
  const avatarBox = avatarSvg
    ? `<div style="width:56px;height:56px;border-radius:50%;overflow:hidden;flex-shrink:0">${avatarSvg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" ')}</div>`
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
// Undo/Redo als Kern-Service; Renderer-Notify (BrowserWindow) als Callback injiziert.
const undo = createUndo({
  onApplied: () => BrowserWindow.getAllWindows()[0]?.webContents.send('undo:applied'),
})
const pushUndo = undo.push

// Dünne Wrapper um core/services/backup.js (Dateilogik electron-frei, über FsPort).
function doBackupCreate() {
  return backupService.doBackupCreate({ fs: fsPort, dbPath, backupDir, markiereBackupGemacht })
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
  } catch {
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
    undo.reset()
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
  // Wochen-Rhythmus: Stunde findet nur alle N Wochen statt (1 = jede Woche).
  // anker_datum = Montag einer Woche, in der die Stunde stattfindet (Parität).
  spalteErgaenzen('stundenplan', 'wochen_intervall', 'INTEGER DEFAULT 1')
  spalteErgaenzen('stundenplan', 'anker_datum', 'TEXT')
  // Hinweis: Migrationen für `supplierstunden` und `termine` stehen bewusst
  // NACH deren CREATE TABLE weiter unten – sonst schlagen sie auf einer frischen
  // DB fehl (Tabelle existiert an dieser Stelle noch nicht).
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
  spalteErgaenzen('termine', 'stunde_id', 'INTEGER')
  spalteErgaenzen('termine', 'bis_uhrzeit', 'TEXT')

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
  spalteErgaenzen('supplierstunden', 'titel', 'TEXT')
  spalteErgaenzen('supplierstunden', 'inhalt', 'TEXT')
  spalteErgaenzen('supplierstunden', 'hue_text', 'TEXT')
  spalteErgaenzen('supplierstunden', 'hue_frist_datum', 'TEXT')
  spalteErgaenzen('supplierstunden', 'link', 'TEXT')

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

  // Sub-Aufgaben: parent_id NACH dem CREATE TABLE (sonst schlägt es auf frischer DB fehl).
  spalteErgaenzen('kv_jahresaufgaben', 'parent_id', 'INTEGER REFERENCES kv_jahresaufgaben(id) ON DELETE CASCADE')

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

function schreibeBackupInOrdner(ordner, prefix, max) {
  return backupService.schreibeBackupInOrdner({ fs: fsPort, logError, dbPath }, ordner, prefix, max)
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

function dbSignatur() {
  return backupService.dbSignatur({ fs: fsPort, dbPath })
}

function sammleBackups() {
  return backupService.sammleBackups({ fs: fsPort, backupDir, bkGet })
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
  // Materialien-Domäne (core/domain/materialien.js): Ports + Helfer gebündelt.
  // Lokale Bindungen reichen `db` (reopen-sicher) und `matDeps` durch, damit die
  // bestehenden Aufrufstellen (kernDeps, jahresplanung, klassen:duplizieren)
  // unverändert bleiben.
  const matDeps = { fs: fsPort, shell: shellPort, dialog: dialogPort, logError, oeffneExternSicher, indexName: '_Materialübersicht.txt' }
  const jpDeps = { fs: fsPort, logError, mat: matDeps }
  // Nur die Bindungen, die main.js selbst noch braucht: materialRoot/verschiebeDir
  // (kernDeps), abschnittHierarchie/sammleMaterialien (export:jahresplanungOdt),
  // kopiereMaterialien (klassen:duplizieren). sanitizeSegment bleibt als hoisted
  // Funktion in main.js; die Materialien-Domäne hat ihre eigene, identische Kopie.
  const materialRoot = () => materialienDomain.materialRoot(db)
  const abschnittHierarchie = (fachId) => materialienDomain.abschnittHierarchie(db, fachId)
  const verschiebeDir = (oldDir, newDir) => materialienDomain.verschiebeDir(matDeps, oldDir, newDir)
  const sammleMaterialien = (id) => materialienDomain.sammleMaterialien(db, matDeps, id)
  const kopiereMaterialien = (von, nach) => materialienDomain.kopiereMaterialien(db, matDeps, von, nach)
  // exDeps nach den Material-Bindungen (nutzt abschnittHierarchie/sammleMaterialien).
  const exDeps = { dialog: dialogPort, fs: fsPort, pdf: pdfPort, dateiTeil, exportDatum, rosterFuerFach, znInternZuAnzeige, abschnittHierarchie, sammleMaterialien, sanitizeSegment }

  // main.js-Helfer, die extrahierte Kern-Domänen injiziert bekommen.
  const kernDeps = { pushUndo, berechneAlleFuerSchuljahr, berechneAlleFuerFach, berechneZeugnisnote, berechneEndnote, pruefeNotenTrigger, pruefeFehlstundenSchwellen, erzeugeTrigger, logError, raeumeFachDatenAuf, materialRoot, verschiebeDir, sanitizeSegment, rosterIdsFuerFach, initKompetenzVorlagen }

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
  // Handler delegieren an die Kern-Domäne (siehe core/domain/einstellungen.js).
  ipcMain.handle('einstellungen:get', (_, schluessel) => einstellungenDomain.get(db, schluessel))
  ipcMain.handle('einstellungen:set', (_, schluessel, wert) => einstellungenDomain.set(db, schluessel, wert))
  ipcMain.handle('einstellungen:getAll', () => einstellungenDomain.getAll(db))

  // Schuljahre
  ipcMain.handle('schuljahre:getAll', () => schuljahreDomain.getAll(db))
  ipcMain.handle('schuljahre:create', (_, bezeichnung) => schuljahreDomain.create(db, bezeichnung))

  // Klassen
  ipcMain.handle('klassen:getAll', (_, schuljahrId) => klassenDomain.getAll(db, schuljahrId))
  ipcMain.handle('klassen:getVorlagen', () => klassenDomain.getVorlagen(db))
  ipcMain.handle('klassen:create', (_, data) => klassenDomain.create(db, data))
  ipcMain.handle('klassen:setTeamsLink', (_, id, link) => klassenDomain.setTeamsLink(db, id, link))
  ipcMain.handle('klassen:setIstKv', (_, id, istKv) => klassenDomain.setIstKv(db, id, istKv))
  ipcMain.handle('klassen:getDeleteStats', (_, id) => klassenDomain.getDeleteStats(db, kernDeps, id))
  ipcMain.handle('klassen:delete', (_, id) => klassenDomain.remove(db, kernDeps, id))
  ipcMain.handle('klassen:rename', (_, id, name) => klassenDomain.rename(db, kernDeps, id, name))
  ipcMain.handle('klassen:setFarbe', (_, id, farbe) => klassenDomain.setFarbe(db, id, farbe))
  ipcMain.handle('klassen:setSortierung', (_, id, modus) => klassenDomain.setSortierung(db, id, modus))
  ipcMain.handle('klassen:reorder', (_, updates) => klassenDomain.reorder(db, updates))

  // Fächer
  ipcMain.handle('faecher:getAll', (_, klasseId) => faecherDomain.getAll(db, klasseId))
  ipcMain.handle('faecher:getAllImSchuljahr', (_, schuljahrId) => faecherDomain.getAllImSchuljahr(db, schuljahrId))
  ipcMain.handle('faecher:create', (_, data) => faecherDomain.create(db, kernDeps, data))
  ipcMain.handle('faecher:delete', (_, id) => faecherDomain.remove(db, kernDeps, id))
  ipcMain.handle('faecher:rename', (_, id, name) => faecherDomain.rename(db, kernDeps, id, name))
  ipcMain.handle('faecher:setFarbe', (_, id, farbe) => faecherDomain.setFarbe(db, id, farbe))
  ipcMain.handle('faecher:updateGewichtung', (_, id, data) => faecherDomain.updateGewichtung(db, kernDeps, id, data))
  ipcMain.handle('faecher:resetGewichtung', (_, id) => faecherDomain.resetGewichtung(db, kernDeps, id))
  ipcMain.handle('faecher:setBenotungssystem', (_, id, system) => faecherDomain.setBenotungssystem(db, kernDeps, id, system))
  ipcMain.handle('faecher:getSchuelerIds', (_, fachId) => faecherDomain.getSchuelerIds(db, kernDeps, fachId))
  ipcMain.handle('faecher:setSchueler', (_, fachId, data) => faecherDomain.setSchueler(db, kernDeps, fachId, data))

  // Niveau (AHS/ST-Differenzierung)
  ipcMain.handle('niveau:get', (_, fachId) => niveauDomain.get(db, fachId))
  ipcMain.handle('niveau:getHistorie', (_, fachId) => niveauDomain.getHistorie(db, fachId))
  ipcMain.handle('niveau:set', (_, fachId, schuelerId, niveau, datum) => niveauDomain.set(db, kernDeps, fachId, schuelerId, niveau, datum))
  ipcMain.handle('niveau:deleteHistorie', (_, fachId, schuelerId, gueltigAb) => niveauDomain.deleteHistorie(db, kernDeps, fachId, schuelerId, gueltigAb))

  // ─── Kompetenzbereiche ──────────────────────────────────────────────────────
  ipcMain.handle('kompetenzbereiche:getAll', (_, fachId) => kompetenzenDomain.bereicheGetAll(db, fachId))
  ipcMain.handle('kompetenzbereiche:create', (_, fachId, titel, beschreibung) => kompetenzenDomain.bereichCreate(db, fachId, titel, beschreibung))
  ipcMain.handle('kompetenzbereiche:update', (_, id, data) => kompetenzenDomain.bereichUpdate(db, id, data))
  ipcMain.handle('kompetenzbereiche:delete', (_, id) => kompetenzenDomain.bereichDelete(db, id))
  ipcMain.handle('kompetenzbereiche:reorder', (_, ids) => kompetenzenDomain.bereichReorder(db, ids))
  ipcMain.handle('kompetenzbereiche:initVorlagen', (_, fachId, fachName) => kompetenzenDomain.initVorlagen(db, kernDeps, fachId, fachName))

  // ─── Schüler:innen-Kompetenzen ─────────────────────────────────────────────
  ipcMain.handle('schuelerKompetenzen:getAll', (_, fachId) => kompetenzenDomain.schuelerGetAll(db, fachId))
  ipcMain.handle('schuelerKompetenzen:set', (_, kompetenzbereichId, schuelerId, niveau, notiz) => kompetenzenDomain.schuelerSet(db, kompetenzbereichId, schuelerId, niveau, notiz))

  // Schüler:innen. Reihenfolge richtet sich nach der pro Klasse gewählten Sortierung.
  ipcMain.handle('schueler:getAll', (_, klasseId) => schuelerDomain.getAll(db, klasseId))
  ipcMain.handle('schueler:create', (_, data) => schuelerDomain.create(db, data))
  ipcMain.handle('schueler:delete', (_, id) => schuelerDomain.remove(db, id))
  ipcMain.handle('schueler:update', (_, id, data) => schuelerDomain.update(db, id, data))
  ipcMain.handle('schueler:setAvatar', (_, id, avatar) => schuelerDomain.setAvatar(db, id, avatar))
  ipcMain.handle('schueler:reorder', (_, updates) => schuelerDomain.reorder(db, updates))
  ipcMain.handle('schueler:importBatch', (_, klasseId, list, fachIds = []) => schuelerDomain.importBatch(db, klasseId, list, fachIds))
  ipcMain.handle('schueler:getLeistungsProfil', (_, schuelerId) => schuelerDomain.getLeistungsProfil(db, kernDeps, schuelerId))

  ipcMain.handle('schueler:exportProfilPDF', async (_, { profil, klassenname }) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: `Leistungsprofil_${dateiTeil(profil.schueler.nachname)}_${dateiTeil(profil.schueler.vorname)}_${exportDatum()}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return false
    const html = bauePdfHtml(profil, klassenname)
    const buf = await htmlZuPdf(html)
    fs.writeFileSync(filePath, buf)
    return true
  })

  // Spalten
  ipcMain.handle('spalten:getAll', (_, fachId) => spaltenDomain.getAll(db, fachId))
  ipcMain.handle('spalten:create', (_, data) => spaltenDomain.create(db, data))
  ipcMain.handle('spalten:delete', (_, id) => spaltenDomain.remove(db, id))
  ipcMain.handle('spalten:update', (_, id, data) => spaltenDomain.update(db, kernDeps, id, data))
  ipcMain.handle('spalten:toggleEingeklappt', (_, id) => spaltenDomain.toggleEingeklappt(db, id))
  ipcMain.handle('spalten:setEingeklappt', (_, ids, wert) => spaltenDomain.setEingeklappt(db, ids, wert))
  ipcMain.handle('spalten:sortByKategorie', (_, fachId, semester) => spaltenDomain.sortByKategorie(db, fachId, semester))
  ipcMain.handle('spalten:sortChronologisch', (_, fachId, semester) => spaltenDomain.sortChronologisch(db, fachId, semester))

  // Einträge
  ipcMain.handle('eintraege:getAll', (_, fachId) => eintraegeDomain.getAll(db, fachId))
  ipcMain.handle('eintraege:set', (_, spalteId, schuelerId, wert) => eintraegeDomain.set(db, kernDeps, spalteId, schuelerId, wert))
  ipcMain.handle('eintraege:setKommentar', (_, spalteId, schuelerId, kommentar) => eintraegeDomain.setKommentar(db, spalteId, schuelerId, kommentar))
  ipcMain.handle('verlauf:get', (_, schuelerId, fachId) => eintraegeDomain.verlaufGet(db, schuelerId, fachId))

  // Zeugnisnoten
  ipcMain.handle('zeugnisnoten:getAll', (_, fachId) => zeugnisnotenDomain.getAll(db, fachId))
  ipcMain.handle('zeugnisnoten:berechne', (_, fachId, schuelerId, semester) => zeugnisnotenDomain.berechne(db, kernDeps, fachId, schuelerId, semester))
  ipcMain.handle('zeugnisnoten:setManuell', (_, fachId, schuelerId, semester, note) => zeugnisnotenDomain.setManuell(db, kernDeps, fachId, schuelerId, semester, note))
  ipcMain.handle('zeugnisnoten:clearManuell', (_, fachId, schuelerId, semester) => zeugnisnotenDomain.clearManuell(db, kernDeps, fachId, schuelerId, semester))
  ipcMain.handle('zeugnisnoten:berechneFach', (_, fachId) => zeugnisnotenDomain.berechneFach(db, kernDeps, fachId))

  // Notizen
  ipcMain.handle('notizen:get', (_, schuelerId, fachId) => notizenDomain.get(db, schuelerId, fachId))
  ipcMain.handle('notizen:set', (_, schuelerId, fachId, text) => notizenDomain.set(db, kernDeps, schuelerId, fachId, text))

  // Gewichtung global
  ipcMain.handle('gewichtungGlobal:getAll', () => gewichtungDomain.getAll(db))
  ipcMain.handle('gewichtungGlobal:update', (_, kategorie, gewichtung) => gewichtungDomain.update(db, kernDeps, kategorie, gewichtung))

  // Alle Zeugnisnoten im aktuellen Schuljahr neu berechnen
  // (z.B. nach Änderung von s1_gewichtung, ma_plus_wert, ma_minus_wert)
  ipcMain.handle('noten:rechneAllesNeu', () => {
    const aktuellesSchuljahr = db.prepare('SELECT id FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
    berechneAlleFuerSchuljahr(aktuellesSchuljahr?.id)
    return true
  })

  // Stundenzeiten
  ipcMain.handle('stundenzeiten:getAll', () => stundenzeitenDomain.getAll(db))
  ipcMain.handle('stundenzeiten:update', (_, id, data) => stundenzeitenDomain.update(db, id, data))
  ipcMain.handle('stundenzeiten:create', () => stundenzeitenDomain.create(db))
  ipcMain.handle('stundenzeiten:delete', (_, id) => stundenzeitenDomain.remove(db, id))
  ipcMain.handle('stundenzeiten:saveAll', (_, rows) => stundenzeitenDomain.saveAll(db, kernDeps, rows))

  // Stundenplan
  ipcMain.handle('stundenplan:getAll', () => stundenplanDomain.getAll(db))
  ipcMain.handle('stundenplan:create', (_, data) => stundenplanDomain.create(db, data))
  ipcMain.handle('stundenplan:delete', (_, id) => stundenplanDomain.remove(db, id))
  ipcMain.handle('stundenplan:update', (_, id, data) => stundenplanDomain.update(db, id, data))
  ipcMain.handle('stundenplan:verschieben', (_, id, wochentag, stundeId) => stundenplanDomain.verschieben(db, id, wochentag, stundeId))
  ipcMain.handle('stundenplan:getByKlasse', (_, klasseId) => stundenplanDomain.getByKlasse(db, klasseId))
  ipcMain.handle('stundenplan:getParallelFach', (_, aktuelleKlasseId, fachName) => stundenplanDomain.getParallelFach(db, aktuelleKlasseId, fachName))

  // Stunden-Planung
  ipcMain.handle('stundenPlanung:get', (_, stundenplanId, wocheDatum) => stundenPlanungDomain.get(db, stundenplanId, wocheDatum))

  // ─── Supplierstunden ─────────────────────────────────────────────────────────
  ipcMain.handle('supplierstunden:getWoche', (_, wocheDatum) => supplierstundenDomain.getWoche(db, wocheDatum))
  ipcMain.handle('supplierstunden:create', (_, data) => supplierstundenDomain.create(db, data))
  ipcMain.handle('supplierstunden:delete', (_, id) => supplierstundenDomain.remove(db, id))
  ipcMain.handle('supplierstunden:update', (_, id, data) => supplierstundenDomain.update(db, id, data))

  ipcMain.handle('shell:open', (_, url) => {
    return oeffneExternSicher(url)
  })

  ipcMain.handle('app:clipboard', (_, text) => {
    try { clipboard.writeText(String(text ?? '')); return true } catch (e) { logError('app:clipboard', e); return false }
  })

  ipcMain.handle('stundenPlanung:getWoche', (_, wocheDatum) => stundenPlanungDomain.getWoche(db, wocheDatum))
  ipcMain.handle('stundenPlanung:save', (_, stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link) => stundenPlanungDomain.save(db, stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link))
  ipcMain.handle('stundenPlanung:getHueWoche', (_, wocheDatum) => stundenPlanungDomain.getHueWoche(db, wocheDatum))
  ipcMain.handle('stundenPlanung:checkMusizieren', (_, wocheDatum, klasseId, excludeStundenplanId) => stundenPlanungDomain.checkMusizieren(db, wocheDatum, klasseId, excludeStundenplanId))

  ipcMain.handle('stundenPlanung:setEntfall', (_, stundenplanId, wocheDatum, vorruecken, ferienZeitraeume) => stundenPlanungDomain.setEntfall(db, stundenplanId, wocheDatum, vorruecken, ferienZeitraeume))
  ipcMain.handle('stundenPlanung:removeEntfall', (_, stundenplanId, wocheDatum) => stundenPlanungDomain.removeEntfall(db, stundenplanId, wocheDatum))
  ipcMain.handle('stundenPlanung:delete', (_, stundenplanId, wocheDatum) => stundenPlanungDomain.remove(db, stundenplanId, wocheDatum))

  // Todos
  ipcMain.handle('todos:getAll', (_, schuljahrId) => todosDomain.getAll(db, schuljahrId))
  ipcMain.handle('todos:create', (_, data) => todosDomain.create(db, data))
  ipcMain.handle('todos:update', (_, id, data) => todosDomain.update(db, id, data))
  ipcMain.handle('todos:delete', (_, id) => todosDomain.remove(db, id))
  ipcMain.handle('todos:toggleErledigt', (_, id) => todosDomain.toggleErledigt(db, id))

  // Backup
  ipcMain.handle('backup:create', () => doBackupCreate())

  ipcMain.handle('backup:getList', () => {
    try {
      return fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.sqlite'))
        .sort()
        .reverse()
    } catch {
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

  // ─── Wetter (Logik in core/services/wetter.js; ueber HttpPort) ──────────────
  const wetterDeps = { http: httpPort, bkGet, logError }
  ipcMain.handle('wetter:getWoche', (_, bundesland, montagDatum) => wetterService.getWoche(wetterDeps, bundesland, montagDatum))
  ipcMain.handle('wetter:sucheOrt', (_, query) => wetterService.sucheOrt(wetterDeps, query))

  ipcMain.handle('db:saveAs', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return doSaveAs(win)
  })

  ipcMain.handle('db:open', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return doOpen(win)
  })

  // ─── Undo/Redo ─────────────────────────────────────────────────────────────
  ipcMain.handle('undo:execute', () => undo.execute())
  ipcMain.handle('undo:redo', () => undo.redo())
  ipcMain.handle('undo:state', () => undo.state())


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

  // ─── Export (Logik in core/services/export.js; exDeps = Ports + Helfer) ──────
  ipcMain.handle('export:toJson', () => exportService.toJson(db, exDeps))
  ipcMain.handle('export:fachOds', (_, fachId) => exportService.fachOds(db, exDeps, fachId))

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
  ipcMain.handle('planung:getVorhandeneWochen', () => stundenPlanungDomain.getVorhandeneWochen(db))

  // ─── Export: Planungs-PDF ──────────────────────────────────────────────────
  ipcMain.handle('export:planungPdf', (_, wochen, einzeln) => exportService.planungPdf(db, exDeps, wochen, einzeln))

  // ─── Export: Stundenplan als ansprechendes PDF (Querformat, zum Aufhängen) ──
  ipcMain.handle('export:stundenplanPdf', (_, titelZusatz) => exportService.stundenplanPdf(db, exDeps, titelZusatz))

  // ─── Export: Jahresplanung als ODT (tabellarisch, Querformat) ─────────────
  ipcMain.handle('export:jahresplanungOdt', (_, fachId) => exportService.jahresplanungOdt(db, exDeps, fachId))
  ipcMain.handle('export:fachPlanungDocx', (_, fachId, fachName, klasseName, wochenDaten) => exportService.fachPlanungDocx(db, exDeps, fachId, fachName, klasseName, wochenDaten))
  ipcMain.handle('export:allSchuelerOds', () => exportService.allSchuelerOds(db, exDeps))
  ipcMain.handle('export:allSchuelerPdf', () => exportService.allSchuelerPdf(db, exDeps))
  ipcMain.handle('export:archivPdf', (_, schuljahrId) => exportService.archivPdf(db, exDeps, schuljahrId))
  ipcMain.handle('export:archivOds', (_, schuljahrId) => exportService.archivOds(db, exDeps, schuljahrId))

  // ─── Sitzplan ───────────────────────────────────────────────────────────────
  ipcMain.handle('sitzplan:getTische', (_, fachId) => sitzplanDomain.getTische(db, fachId))
  ipcMain.handle('sitzplan:createTisch', (_, fachId, typ, x, y) => sitzplanDomain.createTisch(db, fachId, typ, x, y))
  ipcMain.handle('sitzplan:deleteTisch', (_, tischId) => sitzplanDomain.deleteTisch(db, tischId))
  ipcMain.handle('sitzplan:moveTisch', (_, tischId, x, y) => sitzplanDomain.moveTisch(db, tischId, x, y))
  ipcMain.handle('sitzplan:setRotation', (_, tischId, rotation) => sitzplanDomain.setRotation(db, tischId, rotation))
  ipcMain.handle('sitzplan:assignSchueler', (_, sitzplatzId, schuelerId) => sitzplanDomain.assignSchueler(db, sitzplatzId, schuelerId))
  ipcMain.handle('sitzplan:duplicateTisch', (_, fachId, sourceTischId, x, y) => sitzplanDomain.duplicateTisch(db, fachId, sourceTischId, x, y))

  // ─── Custom Ferien ───────────────────────────────────────────────────────────
  ipcMain.handle('customFerien:getAll', (_, schuljahrId) => customFerienDomain.getAll(db, schuljahrId))
  ipcMain.handle('customFerien:save', (_, schuljahrId, ferien) => customFerienDomain.save(db, schuljahrId, ferien))

  // ─── Termine ─────────────────────────────────────────────────────────────────
  ipcMain.handle('termine:getAll', (_, schuljahrId) => termineDomain.getAll(db, schuljahrId))
  ipcMain.handle('termine:create', (_, data) => termineDomain.create(db, data))
  ipcMain.handle('termine:update', (_, id, data) => termineDomain.update(db, id, data))
  ipcMain.handle('termine:delete', (_, id) => termineDomain.remove(db, id))

  // ─── Jahresplanung ────────────────────────────────────────────────────────────
  ipcMain.handle('jahresplanung:getAll', (_, fachId) => jahresplanungDomain.getAll(db, fachId))
  ipcMain.handle('jahresplanung:create', (_, d) => jahresplanungDomain.create(db, jpDeps, d))
  ipcMain.handle('jahresplanung:update', (_, id, d) => jahresplanungDomain.update(db, jpDeps, id, d))
  ipcMain.handle('jahresplanung:delete', (_, id) => jahresplanungDomain.remove(db, id))
  ipcMain.handle('jahresplanung:getFaecherMitPlan', () => jahresplanungDomain.getFaecherMitPlan(db))
  ipcMain.handle('jahresplanung:importVonFach', (_, quellFachId, zielFachId, options = {}) => jahresplanungDomain.importVonFach(db, quellFachId, zielFachId, options))
  ipcMain.handle('jahresplanung:anwendenAufFaecher', (_, quellFachId, zielFachIds, options = {}) => jahresplanungDomain.anwendenAufFaecher(db, jpDeps, quellFachId, zielFachIds, options))
  ipcMain.handle('jahresplanung:importVonDatei', (_, fachId, filePath, options = {}) => jahresplanungDomain.importVonDatei(db, jpDeps, fachId, filePath, options))
  ipcMain.handle('jahresplanung:swap', (_, idA, idB) => jahresplanungDomain.swap(db, idA, idB))

  // ─── Materialien (Abschnitts-Ordner) ─────────────────────────────────────────
  // Handler-Logik in core/domain/materialien.js; lokale Bindungen (materialRoot,
  // ensureAbschnittFolder, schreibeMaterialIndex, verschiebeDir, kopiereMaterialien …)
  // stehen am Anfang von registerIPC. sanitizeSegment bleibt hier (Export + kernDeps).

  // Freitext → dateisystem-sicheres Segment (Windows-Regeln)
  function sanitizeSegment(name, fallback = 'Unbenannt') {
    let s = String(name ?? '').trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')  // verbotene + Steuerzeichen
      .replace(/[. ]+$/g, '')                       // keine End-Punkte/-Leerzeichen
    if (s.length > 120) s = s.slice(0, 120).replace(/[. ]+$/g, '')
    if (!s || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(s)) s = fallback
    return s
  }

  ipcMain.handle('materialien:waehleRoot', () => materialienDomain.waehleRoot(db, matDeps))
  ipcMain.handle('materialien:getRoot', () => materialienDomain.getRoot(db))
  ipcMain.handle('materialien:list', (_, abschnittId) => materialienDomain.list(db, matDeps, abschnittId))
  ipcMain.handle('materialien:dateienHinzufuegen', (_, abschnittId) => materialienDomain.dateienHinzufuegen(db, matDeps, abschnittId))
  ipcMain.handle('materialien:linkHinzufuegen', (_, abschnittId, data) => materialienDomain.linkHinzufuegen(db, matDeps, abschnittId, data))
  ipcMain.handle('materialien:metaSetzen', (_, data) => materialienDomain.metaSetzen(db, matDeps, data))
  ipcMain.handle('materialien:entfernen', (_, data) => materialienDomain.entfernen(db, matDeps, data))
  ipcMain.handle('materialien:oeffnen', (_, data) => materialienDomain.oeffnen(db, matDeps, data))
  ipcMain.handle('materialien:ordnerOeffnen', (_, abschnittId) => materialienDomain.ordnerOeffnen(db, matDeps, abschnittId))

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
  ipcMain.handle('kv:jahresaufgaben:getAlle', (_, klasseId, schuljahrId) => kvJahresaufgaben.getAlle(db, klasseId, schuljahrId))
  ipcMain.handle('kv:jahresaufgaben:createTemplate', (_, data) => kvJahresaufgaben.createTemplate(db, data))
  ipcMain.handle('kv:jahresaufgaben:updateTemplate', (_, id, data) => kvJahresaufgaben.updateTemplate(db, id, data))
  ipcMain.handle('kv:jahresaufgaben:deleteTemplate', (_, id) => kvJahresaufgaben.deleteTemplate(db, id))
  ipcMain.handle('kv:jahresaufgaben:setStatus', (_, aufgabeId, klasseId, schuljahrId, erledigtAm, notiz) => kvJahresaufgaben.setStatus(db, aufgabeId, klasseId, schuljahrId, erledigtAm, notiz))

  // Wochenaufgaben
  ipcMain.handle('kv:wochenaufgaben:getAlle', () => kvWochenaufgaben.getAlle(db))
  ipcMain.handle('kv:wochenaufgaben:createTemplate', (_, data) => kvWochenaufgaben.createTemplate(db, data))
  ipcMain.handle('kv:wochenaufgaben:updateTemplate', (_, id, data) => kvWochenaufgaben.updateTemplate(db, id, data))
  ipcMain.handle('kv:wochenaufgaben:deleteTemplate', (_, id) => kvWochenaufgaben.deleteTemplate(db, id))
  ipcMain.handle('kv:wochenaufgaben:getStatusFuerWochen', (_, klasseId, schuljahrId, wochen) => kvWochenaufgaben.getStatusFuerWochen(db, klasseId, schuljahrId, wochen))
  ipcMain.handle('kv:wochenaufgaben:setStatus', (_, aufgabeId, klasseId, schuljahrId, kw, jahr, erledigtAm, notiz) => kvWochenaufgaben.setStatus(db, aufgabeId, klasseId, schuljahrId, kw, jahr, erledigtAm, notiz))

  // Trigger — gefiltert (offene / archivierte / nach Schweregrad)
  ipcMain.handle('kv:trigger:getAlle', (_, klasseId, opts = {}) => kvTrigger.getAlle(db, klasseId, opts))
  ipcMain.handle('kv:trigger:getAlleFuerSchueler', (_, schuelerId) => kvTrigger.getAlleFuerSchueler(db, schuelerId))
  ipcMain.handle('kv:trigger:reagieren', (_, id, reaktion) => kvTrigger.reagieren(db, id, reaktion))
  ipcMain.handle('kv:trigger:create', (_, data) => kvTrigger.create(db, kernDeps, data))
  ipcMain.handle('kv:trigger:delete', (_, id) => kvTrigger.remove(db, id))

  // Aktenvermerke
  ipcMain.handle('kv:aktenvermerke:getAlleFuerKlasse', (_, klasseId) => kvDoku.aktenGetAlleFuerKlasse(db, klasseId))
  ipcMain.handle('kv:aktenvermerke:getAlleFuerSchueler', (_, schuelerId) => kvDoku.aktenGetAlleFuerSchueler(db, schuelerId))
  ipcMain.handle('kv:aktenvermerke:create', (_, data) => kvDoku.aktenCreate(db, kernDeps, data))
  ipcMain.handle('kv:aktenvermerke:update', (_, id, data) => kvDoku.aktenUpdate(db, id, data))
  ipcMain.handle('kv:aktenvermerke:delete', (_, id) => kvDoku.aktenDelete(db, id))

  // Elternkontakte
  ipcMain.handle('kv:elternkontakte:getAlleFuerSchueler', (_, schuelerId) => kvDoku.elternGetAlleFuerSchueler(db, schuelerId))
  ipcMain.handle('kv:elternkontakte:getOffeneFuerKlasse', (_, klasseId) => kvDoku.elternGetOffeneFuerKlasse(db, klasseId))
  ipcMain.handle('kv:elternkontakte:create', (_, data) => kvDoku.elternCreate(db, data))
  ipcMain.handle('kv:elternkontakte:update', (_, id, data) => kvDoku.elternUpdate(db, id, data))
  ipcMain.handle('kv:elternkontakte:setErledigt', (_, id, erledigt) => kvDoku.elternSetErledigt(db, id, erledigt))
  ipcMain.handle('kv:elternkontakte:delete', (_, id) => kvDoku.elternDelete(db, id))

  // Fehlstunden
  ipcMain.handle('kv:fehlstunden:getAlleFuerSchueler', (_, schuelerId) => kvDoku.fehlGetAlleFuerSchueler(db, schuelerId))
  ipcMain.handle('kv:fehlstunden:create', (_, data) => kvDoku.fehlCreate(db, kernDeps, data))
  ipcMain.handle('kv:fehlstunden:update', (_, id, data) => kvDoku.fehlUpdate(db, kernDeps, id, data))
  ipcMain.handle('kv:fehlstunden:delete', (_, id) => kvDoku.fehlDelete(db, kernDeps, id))

  // Periodische Prüfung: offene Eltern-Rückrufe älter als 3 Tage → Trigger
  ipcMain.handle('kv:pruefeOffeneRueckrufe', () => kvRoutine.pruefeOffeneRueckrufe(db, kernDeps))
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
    if (key === 'z' && !input.shift) { event.preventDefault(); undo.execute() }
    else if (key === 'y' || (key === 'z' && input.shift)) { event.preventDefault(); undo.redo() }
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
  // Im Microsoft-Store-Paket (MSIX) übernimmt der Store die Updates; die App ist
  // dort schreibgeschützt installiert – electron-updater darf nicht laufen.
  if (app.windowsStore) return
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
  if (app.windowsStore) return { ok: false, grund: 'store' }
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
