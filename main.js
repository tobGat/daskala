const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron')
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
  const { schueler, faecher, zeugnisnoten, eintraege, notizen } = profil

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
    const n1 = znS1?.note_manuell ?? (znS1?.note_berechnet ? Math.round(znS1.note_berechnet) : null)
    const n2 = znS2?.note_manuell ?? (znS2?.note_berechnet ? Math.round(znS2.note_berechnet) : null)
    const maEintr = fachEintr.filter(e => e.kategorie === 'MA' && e.wert)
    const maPos = maEintr.filter(e => e.wert === '+').length
    const maNeg = maEintr.filter(e => e.wert === '-').length
    const maGes = maEintr.length
    const hueEintr = fachEintr.filter(e => e.kategorie === 'HÜ' && e.wert)
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
    sectionsHtml += `<div style="margin-bottom:14px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;page-break-inside:avoid"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:700;color:#4f46e5">${esc(fach.name)}</span><span style="display:flex;align-items:center;gap:5px"><span style="color:#9ca3af;font-size:9px">S1</span>${znBadge(n1)}<span style="color:#9ca3af;font-size:9px;margin-left:4px">S2</span>${znBadge(n2)}</span></div>${content}</div>`
  }

  const datum = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const badges = [
    schueler.lernschwaeche ? '<span style="background:#fef3c7;color:#92400e;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">LS</span>' : '',
    schueler.legasthenie ? '<span style="background:#ede9fe;color:#5b21b6;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">LEG</span>' : '',
    schueler.spf ? '<span style="background:#fee2e2;color:#991b1b;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px;margin-left:4px">SPF</span>' : '',
  ].join('')

  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#1a1a1a;background:#fff}@page{size:A4 portrait;margin:1.5cm}</style></head><body><div style="margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #e5e7eb"><div style="display:flex;align-items:baseline;gap:4px;flex-wrap:wrap"><h1 style="font-size:20px;font-weight:700;color:#1a1a1a">${esc(schueler.nachname)} ${esc(schueler.vorname)}</h1>${badges}</div><div style="font-size:11px;color:#6b7280;margin-top:3px">${esc(klassenname)}</div><div style="font-size:10px;color:#9ca3af;margin-top:1px">Leistungsprofil · exportiert am ${datum} · Daskala</div></div>${sectionsHtml}</body></html>`
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
    return result.filePath
  } catch (e) {
    return null
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
    app.relaunch()
    app.exit(0)
    return true
  } catch (e) {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    return null
  }
}

function setupMenu() {
  const template = [
    {
      label: 'Datei',
      submenu: [
        {
          label: 'Öffnen…',
          accelerator: 'CmdOrCtrl+O',
          click: async (_, win) => {
            const ok = await doOpen(win ?? BrowserWindow.getAllWindows()[0])
            if (ok === null) dialog.showMessageBox(win ?? BrowserWindow.getAllWindows()[0], { type: 'error', message: 'Öffnen fehlgeschlagen.' })
          },
        },
        {
          label: 'Speichern unter…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async (_, win) => {
            const pfad = await doSaveAs(win ?? BrowserWindow.getAllWindows()[0])
            if (pfad === null) dialog.showMessageBox(win ?? BrowserWindow.getAllWindows()[0], { type: 'error', message: 'Speichern fehlgeschlagen.' })
            else if (pfad) dialog.showMessageBox(win ?? BrowserWindow.getAllWindows()[0], { type: 'info', message: `Gespeichert unter:\n${pfad}` })
          },
        },
        { type: 'separator' },
        {
          label: 'Backup erstellen',
          click: async (_, win) => {
            const pfad = doBackupCreate()
            const w = win ?? BrowserWindow.getAllWindows()[0]
            if (pfad) dialog.showMessageBox(w, { type: 'info', message: `Backup erstellt:\n${pfad}` })
            else dialog.showMessageBox(w, { type: 'error', message: 'Backup fehlgeschlagen.' })
          },
        },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        { label: 'Rückgängig', accelerator: 'CmdOrCtrl+Z', click: executeUndo },
        { label: 'Wiederholen', accelerator: 'CmdOrCtrl+Y', click: executeRedo },
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { role: 'selectAll', label: 'Alles auswählen' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function initDB() {
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

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

  // Spalten-Migration für ältere DBs
  try { db.prepare('ALTER TABLE schueler ADD COLUMN lernschwaeche INTEGER DEFAULT 0').run() } catch {}
  try { db.prepare('ALTER TABLE schueler ADD COLUMN legasthenie INTEGER DEFAULT 0').run() } catch {}
  try { db.prepare('ALTER TABLE schueler ADD COLUMN spf INTEGER DEFAULT 0').run() } catch {}
  try { db.prepare('ALTER TABLE klassen ADD COLUMN farbe TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE faecher ADD COLUMN farbe TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE stunden_planung ADD COLUMN musizieren INTEGER DEFAULT 0').run() } catch {}
  try { db.prepare('ALTER TABLE zeugnisnoten ADD COLUMN s1_eingerechnet INTEGER DEFAULT 0').run() } catch {}

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
  try { db.prepare('ALTER TABLE todos ADD COLUMN faelligkeit TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE todos ADD COLUMN erinnerung TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE spalten ADD COLUMN notiz TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE eintraege ADD COLUMN kommentar TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE stunden_planung ADD COLUMN hue_text TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE stunden_planung ADD COLUMN hue_frist_datum TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE stunden_planung ADD COLUMN link TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE stunden_planung ADD COLUMN entfall INTEGER DEFAULT 0').run() } catch {}
  try { db.prepare('ALTER TABLE supplierstunden ADD COLUMN titel TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE supplierstunden ADD COLUMN inhalt TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE supplierstunden ADD COLUMN hue_text TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE supplierstunden ADD COLUMN hue_frist_datum TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE supplierstunden ADD COLUMN link TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE termine ADD COLUMN stunde_id INTEGER').run() } catch {}
  try { db.prepare('ALTER TABLE klassen ADD COLUMN teams_link TEXT').run() } catch {}
  try { db.prepare('ALTER TABLE faecher ADD COLUMN benotungssystem TEXT DEFAULT \'standard\'').run() } catch {}

  // Schüler-Niveau pro Fach (AHS/ST-Differenzierung)
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
  // Migration: datum_von/datum_bis nullable machen + reihenfolge hinzufügen
  try { db.prepare('ALTER TABLE jahresplanung_abschnitte ADD COLUMN reihenfolge INTEGER NOT NULL DEFAULT 0').run() } catch {}
  try {
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
  } catch {}

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
  try { db.prepare('ALTER TABLE sitzplan_tische ADD COLUMN fach_id INTEGER').run() } catch {}

  // Standard-Gewichtungen
  const insertGewichtung = db.prepare(
    'INSERT OR IGNORE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)'
  )
  insertGewichtung.run('SA', 0.4)
  insertGewichtung.run('T', 0.3)
  insertGewichtung.run('MA', 0.2)
  insertGewichtung.run('HÜ', 0.1)
  insertGewichtung.run('CUSTOM', 0.0)

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
  insertEinstellung.run('onedrive_backup_aktiv', '0')

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
}

// ─── OneDrive ─────────────────────────────────────────────────────────────────
function findOneDrivePath() {
  const kandidaten = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
    path.join(process.env.USERPROFILE || '', 'OneDrive'),
    path.join(process.env.USERPROFILE || '', 'OneDrive - Personal'),
    path.join(process.env.USERPROFILE || '', 'OneDrive - Business'),
  ].filter(Boolean)
  return kandidaten.find(p => { try { return fs.existsSync(p) } catch { return false } }) ?? null
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

  // OneDrive-Backup (falls aktiviert)
  try {
    const onedriveAktiv = db.prepare(
      "SELECT wert FROM einstellungen WHERE schluessel = 'onedrive_backup_aktiv'"
    ).get()?.wert
    if (onedriveAktiv === '1') {
      const onedrivePfad = findOneDrivePath()
      if (onedrivePfad) {
        const onedriveBkDir = path.join(onedrivePfad, 'Daskala', 'backups')
        if (!fs.existsSync(onedriveBkDir)) fs.mkdirSync(onedriveBkDir, { recursive: true })
        const onedriveBkPath = path.join(onedriveBkDir, `db_${today}.sqlite`)
        if (!fs.existsSync(onedriveBkPath)) fs.copyFileSync(dbPath, onedriveBkPath)
        // Max 30 OneDrive-Backups
        const odBackups = fs.readdirSync(onedriveBkDir)
          .filter(f => f.startsWith('db_') && f.endsWith('.sqlite'))
          .sort()
        if (odBackups.length > 30) {
          odBackups.slice(0, odBackups.length - 30)
            .forEach(f => fs.unlinkSync(path.join(onedriveBkDir, f)))
        }
      }
    }
  } catch (e) {
    console.error('OneDrive-Backup fehlgeschlagen:', e)
  }
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

function berechneZeugnisnote(fachId, schuelerId, semester) {
  const fach = db.prepare('SELECT * FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return { note: null, s1Eingerechnet: false }

  // Gewichtungen ermitteln (fach-spezifisch oder global)
  const globaleGewichtung = {}
  const rows = db.prepare('SELECT * FROM gewichtung_global').all()
  rows.forEach(r => { globaleGewichtung[r.kategorie] = r.gewichtung })

  const gew = {
    SA: fach.gewichtung_sa ?? globaleGewichtung['SA'] ?? 0.4,
    T: fach.gewichtung_t ?? globaleGewichtung['T'] ?? 0.3,
    MA: fach.gewichtung_ma ?? globaleGewichtung['MA'] ?? 0.2,
    HÜ: fach.gewichtung_hue ?? globaleGewichtung['HÜ'] ?? 0.1,
    CUSTOM: fach.gewichtung_custom ?? globaleGewichtung['CUSTOM'] ?? 0.0,
  }

  const maPlusWert = parseFloat(db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_plus_wert'").get()?.wert ?? '1')
  const maMinusWert = parseFloat(db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_minus_wert'").get()?.wert ?? '5')

  // Spalten für dieses Fach + Semester
  const spalten = db.prepare(
    'SELECT * FROM spalten WHERE fach_id = ? AND semester = ?'
  ).all(fachId, semester)

  // Einträge pro Kategorie sammeln
  const kategorieWerte = { SA: [], T: [], MA: [], HÜ: [], CUSTOM: [] }

  for (const spalte of spalten) {
    const eintrag = db.prepare(
      'SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?'
    ).get(spalte.id, schuelerId)

    const wert = eintrag?.wert ?? ''
    if (!wert || wert === '') continue

    if (spalte.kategorie === 'MA') {
      if (wert === '+') kategorieWerte.MA.push(maPlusWert)
      else if (wert === '-') kategorieWerte.MA.push(maMinusWert)
    } else if (spalte.kategorie === 'HÜ') {
      if (wert === '✓') kategorieWerte['HÜ'].push(1)
      else if (wert === '✗' || wert === '—') kategorieWerte['HÜ'].push(0)
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
      const n = parseInt(wert)
      if (n >= 1 && n <= 5) kategorieWerte[spalte.kategorie].push(n)
    } else if (spalte.kategorie === 'CUSTOM') {
      const n = parseInt(wert)
      if (!isNaN(n) && n >= 1 && n <= 5) kategorieWerte.CUSTOM.push(n)
    }
  }

  const maxNote = 5

  // Durchschnitt pro Kategorie
  let gewichtetesSumme = 0
  let gesamtGewichtung = 0

  for (const [kat, werte] of Object.entries(kategorieWerte)) {
    if (werte.length === 0) continue
    const w = gew[kat] ?? 0
    if (w === 0) continue

    let avg
    if (kat === 'HÜ') {
      // Prozentsatz positiver HÜs → Note 1-maxNote
      const positiv = werte.filter(v => v === 1).length
      const ratio = positiv / werte.length
      avg = maxNote - ratio * (maxNote - 1) // 100% → 1, 0% → maxNote
    } else {
      // Ungültige Noten (> maxNote) bei der Berechnung ignorieren
      const gueltig = werte.filter(v => v <= maxNote)
      if (gueltig.length === 0) continue
      avg = gueltig.reduce((a, b) => a + b, 0) / gueltig.length
    }

    gewichtetesSumme += avg * w
    gesamtGewichtung += w
  }

  if (gesamtGewichtung === 0) return { note: null }
  const note = Math.min(gewichtetesSumme / gesamtGewichtung, maxNote)
  return { note: Math.round(note * 10) / 10 }
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

// Alle Zeugnisnoten für ein Fach neu berechnen (alle aktiven Schüler:innen, S1+S2+Endnote)
function berechneAlleFuerFach(fachId) {
  const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return
  const schueler = db.prepare('SELECT id FROM schueler WHERE klasse_id = ? AND aktiv = 1').all(fach.klasse_id)
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

// ─── IPC Handler registrieren ─────────────────────────────────────────────────
function registerIPC() {
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
    return db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? ORDER BY reihenfolge, name').all(schuljahrId)
  })

  ipcMain.handle('klassen:create', (_, { schuljahrId, name, farbe, teamsLink }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id = ?').get(schuljahrId)?.m ?? 0
    const info = db.prepare('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge, teams_link) VALUES (?, ?, ?, ?, ?)').run(schuljahrId, name, farbe ?? null, maxReihenfolge + 1, teamsLink ?? null)
    return info.lastInsertRowid
  })

  ipcMain.handle('klassen:setTeamsLink', (_, id, link) => {
    db.prepare('UPDATE klassen SET teams_link = ? WHERE id = ?').run(link || null, id)
    return true
  })

  ipcMain.handle('klassen:delete', (_, id) => {
    db.prepare('DELETE FROM klassen WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('klassen:rename', (_, id, name) => {
    db.prepare('UPDATE klassen SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('klassen:setFarbe', (_, id, farbe) => {
    db.prepare('UPDATE klassen SET farbe = ? WHERE id = ?').run(farbe ?? null, id)
    return true
  })

  // Fächer
  ipcMain.handle('faecher:getAll', (_, klasseId) => {
    return db.prepare('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name').all(klasseId)
  })

  ipcMain.handle('faecher:create', (_, { klasseId, name, farbe, benotungssystem }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM faecher WHERE klasse_id = ?').get(klasseId)?.m ?? 0
    const info = db.prepare('INSERT INTO faecher (klasse_id, name, farbe, reihenfolge, benotungssystem) VALUES (?, ?, ?, ?, ?)').run(klasseId, name, farbe ?? null, maxReihenfolge + 1, benotungssystem ?? 'standard')
    // Bei differenziert: Default-Niveau für alle bestehenden Schüler:innen
    if (benotungssystem === 'differenziert') {
      const fachId = info.lastInsertRowid
      const schuelerIds = db.prepare('SELECT id FROM schueler WHERE klasse_id = ? AND aktiv = 1').all(klasseId)
      const insert = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
      for (const s of schuelerIds) insert.run(fachId, s.id, 'AHS')
    }
    // Kompetenz-Vorlagen automatisch anlegen
    initKompetenzVorlagen(info.lastInsertRowid, name)
    return info.lastInsertRowid
  })

  ipcMain.handle('faecher:delete', (_, id) => {
    db.prepare('DELETE FROM faecher WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('faecher:rename', (_, id, name) => {
    db.prepare('UPDATE faecher SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('faecher:setFarbe', (_, id, farbe) => {
    db.prepare('UPDATE faecher SET farbe = ? WHERE id = ?').run(farbe ?? null, id)
    return true
  })

  ipcMain.handle('faecher:updateGewichtung', (_, id, data) => {
    db.prepare(`
      UPDATE faecher SET
        gewichtung_sa = ?,
        gewichtung_t = ?,
        gewichtung_ma = ?,
        gewichtung_hue = ?,
        gewichtung_custom = ?
      WHERE id = ?
    `).run(data.sa ?? null, data.t ?? null, data.ma ?? null, data.hue ?? null, data.custom ?? null, id)
    berechneAlleFuerFach(id)
    return true
  })

  ipcMain.handle('faecher:resetGewichtung', (_, id) => {
    db.prepare('UPDATE faecher SET gewichtung_sa = NULL, gewichtung_t = NULL, gewichtung_ma = NULL, gewichtung_hue = NULL, gewichtung_custom = NULL WHERE id = ?').run(id)
    berechneAlleFuerFach(id)
    return true
  })

  ipcMain.handle('faecher:setBenotungssystem', (_, id, system) => {
    db.prepare('UPDATE faecher SET benotungssystem = ? WHERE id = ?').run(system, id)
    if (system === 'differenziert') {
      // Default-Niveau 'AHS' für alle Schüler:innen anlegen, die noch keins haben
      const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(id)
      if (fach) {
        const schuelerIds = db.prepare('SELECT id FROM schueler WHERE klasse_id = ? AND aktiv = 1').all(fach.klasse_id)
        const insert = db.prepare('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)')
        for (const s of schuelerIds) {
          insert.run(id, s.id, 'AHS')
        }
      }
    }
    berechneAlleFuerFach(id)
    return true
  })

  // Niveau (AHS/ST-Differenzierung)
  ipcMain.handle('niveau:get', (_, fachId) => {
    const rows = db.prepare('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?').all(fachId)
    const map = {}
    for (const r of rows) map[r.schueler_id] = r.niveau
    return map
  })

  ipcMain.handle('niveau:set', (_, fachId, schuelerId, niveau) => {
    db.prepare('INSERT INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?) ON CONFLICT(fach_id, schueler_id) DO UPDATE SET niveau = ?').run(fachId, schuelerId, niveau, niveau)
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

  // Schüler:innen
  ipcMain.handle('schueler:getAll', (_, klasseId) => {
    return db.prepare('SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY nachname, vorname').all(klasseId)
  })

  ipcMain.handle('schueler:create', (_, { klasseId, vorname, nachname }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM schueler WHERE klasse_id = ?').get(klasseId)?.m ?? 0
    const info = db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)').run(klasseId, vorname, nachname, maxReihenfolge + 1)
    return info.lastInsertRowid
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

  ipcMain.handle('schueler:importBatch', (_, klasseId, list) => {
    const tx = db.transaction(() => {
      const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM schueler WHERE klasse_id = ?').get(klasseId)?.m ?? 0
      const stmt = db.prepare('INSERT OR IGNORE INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)')
      list.forEach((s, i) => {
        stmt.run(klasseId, s.vorname, s.nachname, maxReihenfolge + i + 1)
      })
    })
    tx()
    return true
  })

  ipcMain.handle('schueler:getLeistungsProfil', (_, schuelerId) => {
    const schueler = db.prepare('SELECT * FROM schueler WHERE id = ?').get(schuelerId)
    if (!schueler) return null
    const faecher = db.prepare('SELECT f.* FROM faecher f WHERE f.klasse_id = ? ORDER BY f.reihenfolge').all(schueler.klasse_id)

    // Zeugnisnoten aktuell berechnen, damit das Profil immer aktuelle Werte zeigt
    const znStmt = db.prepare(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
    `)
    db.transaction(() => {
      for (const fach of faecher) {
        for (const sem of [1, 2]) {
          const { note, s1Eingerechnet } = berechneZeugnisnote(fach.id, schuelerId, sem)
          if (note !== null) znStmt.run(fach.id, schuelerId, sem, note, s1Eingerechnet ? 1 : 0)
        }
      }
    })()

    const zeugnisnoten = db.prepare('SELECT * FROM zeugnisnoten WHERE schueler_id = ?').all(schuelerId)
    const eintraege = db.prepare(`
      SELECT e.wert, e.kommentar, s.kategorie, s.datum, s.kuerzel, s.semester, s.fach_id, s.reihenfolge
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
    return { schueler, faecher, zeugnisnoten, eintraege, notizen }
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
    const schueler = db.prepare('SELECT id FROM schueler WHERE klasse_id = ? AND aktiv = 1').all(fach.klasse_id)
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
    // Alle Fächer im aktiven Schuljahr neu berechnen, die keine fachspezifischen Gewichtungen haben
    const aktuellesSchuljahr = db.prepare('SELECT id FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1').get()
    if (aktuellesSchuljahr) {
      const faecher = db.prepare(`
        SELECT f.id FROM faecher f
        JOIN klassen k ON f.klasse_id = k.id
        WHERE k.schuljahr_id = ?
          AND f.gewichtung_sa IS NULL AND f.gewichtung_t IS NULL
          AND f.gewichtung_ma IS NULL AND f.gewichtung_hue IS NULL
      `).all(aktuellesSchuljahr.id)
      for (const f of faecher) berechneAlleFuerFach(f.id)
    }
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
    shell.openExternal(url)
    return true
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

  // OneDrive
  ipcMain.handle('onedrive:getInfo', () => {
    const pfad = findOneDrivePath()
    return { pfad, verfuegbar: !!pfad }
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
    const schueler = db.prepare('SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY reihenfolge, nachname, vorname').all(fach.klasse_id)
    const spalten = db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge').all(fachId)
    const eintraege = db.prepare('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)').all(fachId)
    const zeugnisnoten = db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fachId)

    const entryMap = {}
    eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
    const znMap = {}
    zeugnisnoten.forEach(z => { znMap[`${z.schueler_id}_${z.semester}`] = z.note_manuell ?? z.note_berechnet })

    const header = ['Name', ...spalten.map(s => `${s.kuerzel} ${s.datum ?? ''}`), 'ZN S1', 'ZN S2']
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
  ipcMain.handle('jahresabschluss:neuesSchuljahr', (_, { altesSchuljahreId, neueBezeichnung, schuelerZuordnungen }) => {
    const tx = db.transaction(() => {
      // Altes Schuljahr archivieren
      db.prepare('UPDATE schuljahre SET archiviert = 1 WHERE id = ?').run(altesSchuljahreId)

      // Neues Schuljahr anlegen
      const neuesSchuljahr = db.prepare('INSERT INTO schuljahre (bezeichnung) VALUES (?)').run(neueBezeichnung)
      const neuesSchuljahreId = neuesSchuljahr.lastInsertRowid

      // Klassen vorrücken
      const alteKlassen = db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ?').all(altesSchuljahreId)
      const klasseIdMapping = {}

      for (const alteKlasse of alteKlassen) {
        const zuordnung = schuelerZuordnungen.filter(z => z.alteKlasseId === alteKlasse.id)
        // Klasse erstellen (mit neuem Namen wenn angegeben)
        const neuerName = zuordnung[0]?.neuerKlassenName ?? alteKlasse.name
        const neueKlasse = db.prepare('INSERT INTO klassen (schuljahr_id, name, reihenfolge) VALUES (?, ?, ?)').run(neuesSchuljahreId, neuerName, alteKlasse.reihenfolge)
        klasseIdMapping[alteKlasse.id] = neueKlasse.lastInsertRowid

        // Fächer übernehmen (neue Klasse, leere Einträge)
        const alteFaecher = db.prepare('SELECT * FROM faecher WHERE klasse_id = ?').all(alteKlasse.id)
        for (const altesFach of alteFaecher) {
          db.prepare('INSERT INTO faecher (klasse_id, name, reihenfolge) VALUES (?, ?, ?)').run(neueKlasse.lastInsertRowid, altesFach.name, altesFach.reihenfolge)
        }
      }

      // Schüler:innen zuordnen
      for (const z of schuelerZuordnungen) {
        if (z.aktion === 'ausgeschieden') {
          db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(z.schuelerId)
        } else if (z.aktion === 'bleibt' && klasseIdMapping[z.alteKlasseId]) {
          // Schüler:in in neuer Klasse anlegen
          const s = db.prepare('SELECT * FROM schueler WHERE id = ?').get(z.schuelerId)
          db.prepare('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge) VALUES (?, ?, ?, ?)').run(klasseIdMapping[z.alteKlasseId], s.vorname, s.nachname, s.reihenfolge)
          db.prepare('UPDATE schueler SET aktiv = 0 WHERE id = ?').run(z.schuelerId)
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
    const klassen = db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? ORDER BY name').all(aktuellesSchuljahr.id)

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
        const znMap = {}
        zeugnisnoten.forEach(z => { znMap[`${z.schueler_id}_${z.semester}`] = z.note_manuell ?? z.note_berechnet })

        const header = ['Name', ...spalten.map(s => `${s.kuerzel}${s.datum ? ' ' + s.datum.slice(5).replace('-', '.') : ''}`), 'ZN S1', 'ZN S2']
        const rows = [header]
        for (const s of schueler) {
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

    const klassen = db.prepare('SELECT * FROM klassen WHERE schuljahr_id = ? ORDER BY name').all(aktuellesSchuljahr.id)

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
        const znMap = {}
        zeugnisnoten.forEach(z => { znMap[`${z.schueler_id}_${z.semester}`] = z.note_manuell ?? z.note_berechnet })

        const thead = `<tr><th class="name">Name</th>${spalten.map(sp =>
          `<th>${escHtml(sp.kuerzel)}${sp.datum ? '<br>' + sp.datum.slice(5).replace('-', '.') : ''}</th>`
        ).join('')}<th>ZN S1</th><th>ZN S2</th></tr>`

        const tbody = schueler.map(s => {
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
      SELECT t.id as tisch_id, t.typ, t.x, t.y,
             s.id as sitz_id, s.position,
             s.schueler_id,
             sch.vorname, sch.nachname
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
        map[row.tisch_id] = { id: row.tisch_id, typ: row.typ, x: row.x, y: row.y, sitze: [] }
      }
      if (row.sitz_id != null) {
        map[row.tisch_id].sitze.push({
          id: row.sitz_id, position: row.position,
          schueler_id: row.schueler_id, vorname: row.vorname, nachname: row.nachname,
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
      'INSERT INTO sitzplan_tische (klasse_id, fach_id, typ, x, y) VALUES (?, ?, ?, ?, ?)'
    ).run(fach.klasse_id, fachId, source.typ, x, y)
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
    return Number(db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?)').run(d.fachId, d.titel, d.inhalt ?? '', d.datumVon ?? null, d.datumBis ?? null, d.farbe ?? null, maxOrd + 1).lastInsertRowid)
  })
  ipcMain.handle('jahresplanung:update', (_, id, d) => {
    db.prepare('UPDATE jahresplanung_abschnitte SET titel=?, inhalt=?, datum_von=?, datum_bis=?, farbe=? WHERE id=?').run(d.titel, d.inhalt ?? '', d.datumVon ?? null, d.datumBis ?? null, d.farbe ?? null, id)
    return true
  })
  ipcMain.handle('jahresplanung:delete', (_, id) => {
    db.prepare('DELETE FROM jahresplanung_abschnitte WHERE id=?').run(id)
    return true
  })
  ipcMain.handle('jahresplanung:getFaecherMitPlan', () =>
    db.prepare(`
      SELECT f.id, f.name, f.farbe, k.name as klasse_name, k.id as klasse_id,
             COUNT(a.id) as abschnitt_anzahl
      FROM jahresplanung_abschnitte a
      JOIN faecher f ON a.fach_id = f.id
      JOIN klassen k ON f.klasse_id = k.id
      GROUP BY f.id
      ORDER BY k.name, f.name
    `).all()
  )
  ipcMain.handle('jahresplanung:importVonFach', (_, quellFachId, zielFachId) => {
    const abschnitte = db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ?').all(quellFachId)
    const maxOrd = db.prepare('SELECT COALESCE(MAX(reihenfolge),0) as m FROM jahresplanung_abschnitte WHERE fach_id = ?').get(zielFachId).m
    const insert = db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, datum_von, datum_bis, farbe, reihenfolge) VALUES (?,?,?,?,?,?,?)')
    db.transaction(() => {
      abschnitte.forEach((a, i) => insert.run(zielFachId, a.titel, a.inhalt, a.datum_von, a.datum_bis, a.farbe, maxOrd + 1 + i))
    })()
    return true
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
    },
    titleBarStyle: 'default',
    show: false,
    backgroundColor: '#f8fafc',
  })

  win.once('ready-to-show', () => win.show())

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }
}

// ─── App-Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  initPaths()
  initDB()
  createBackup()
  registerIPC()
  setupMenu()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
