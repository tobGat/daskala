const { app, BrowserWindow, ipcMain, dialog } = require('electron')
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
      reihenfolge INTEGER DEFAULT 0,
      FOREIGN KEY (klasse_id) REFERENCES klassen(id) ON DELETE CASCADE,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE SET NULL
    )
  `)
  try { db.prepare('ALTER TABLE todos ADD COLUMN faelligkeit TEXT').run() } catch {}

  // Jahresplanung
  db.exec(`
    CREATE TABLE IF NOT EXISTS jahresplanung_abschnitte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fach_id INTEGER NOT NULL,
      titel TEXT NOT NULL DEFAULT '',
      inhalt TEXT DEFAULT '',
      datum_von TEXT NOT NULL,
      datum_bis TEXT NOT NULL,
      farbe TEXT,
      FOREIGN KEY (fach_id) REFERENCES faecher(id) ON DELETE CASCADE
    );
  `)

  // Sitzplan-Tabellen
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

  if (spalten.length === 0) {
    // Keine S2-Spalten – S1-ZN als Fallback wenn keine S1-Einträge vorhanden
    if (semester === 2) {
      const s1EintraegeAnzahl = db.prepare(`
        SELECT COUNT(*) as cnt FROM eintraege e
        JOIN spalten s ON e.spalte_id = s.id
        WHERE s.fach_id = ? AND s.semester = 1 AND e.schueler_id = ? AND e.wert != ''
      `).get(fachId, schuelerId)?.cnt ?? 0
      if (s1EintraegeAnzahl === 0) {
        const s1Zn = db.prepare(
          'SELECT note_manuell, note_berechnet FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = 1'
        ).get(fachId, schuelerId)
        const s1Note = s1Zn?.note_manuell ?? s1Zn?.note_berechnet ?? null
        if (s1Note !== null) {
          return { note: s1Note, s1Eingerechnet: true }
        }
      }
    }
    return { note: null, s1Eingerechnet: false }
  }

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

  // Durchschnitt pro Kategorie
  let gewichtetesSumme = 0
  let gesamtGewichtung = 0

  for (const [kat, werte] of Object.entries(kategorieWerte)) {
    if (werte.length === 0) continue
    const w = gew[kat] ?? 0
    if (w === 0) continue

    let avg
    if (kat === 'HÜ') {
      // Prozentsatz positiver HÜs → Note 1-5
      const positiv = werte.filter(v => v === 1).length
      const ratio = positiv / werte.length
      avg = 5 - ratio * 4 // 100% → 1, 0% → 5
    } else {
      avg = werte.reduce((a, b) => a + b, 0) / werte.length
    }

    gewichtetesSumme += avg * w
    gesamtGewichtung += w
  }

  // ── S1-ZN einbeziehen (nur Semester 2, wenn keine S1-Einträge vorhanden) ──
  if (semester === 2) {
    const s1EintraegeAnzahl = db.prepare(`
      SELECT COUNT(*) as cnt FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE s.fach_id = ? AND s.semester = 1 AND e.schueler_id = ? AND e.wert != ''
    `).get(fachId, schuelerId)?.cnt ?? 0

    if (s1EintraegeAnzahl === 0) {
      const s1Zn = db.prepare(
        'SELECT note_manuell, note_berechnet FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = 1'
      ).get(fachId, schuelerId)
      const s1Note = s1Zn?.note_manuell ?? s1Zn?.note_berechnet ?? null

      if (s1Note !== null) {
        const s1GewichtStr = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 's1_gewichtung'").get()?.wert
        const s1Gewicht = parseFloat(s1GewichtStr ?? '0.5')

        if (gesamtGewichtung === 0) {
          return { note: s1Note, s1Eingerechnet: true }
        }
        const s2Note = gewichtetesSumme / gesamtGewichtung
        const jahresNote = s1Note * s1Gewicht + s2Note * (1 - s1Gewicht)
        return { note: Math.round(jahresNote * 10) / 10, s1Eingerechnet: true }
      }
    }
  }

  if (gesamtGewichtung === 0) return { note: null, s1Eingerechnet: false }
  const note = gewichtetesSumme / gesamtGewichtung
  return { note: Math.round(note * 10) / 10, s1Eingerechnet: false }
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

  ipcMain.handle('klassen:create', (_, { schuljahrId, name, farbe }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM klassen WHERE schuljahr_id = ?').get(schuljahrId)?.m ?? 0
    const info = db.prepare('INSERT INTO klassen (schuljahr_id, name, farbe, reihenfolge) VALUES (?, ?, ?, ?)').run(schuljahrId, name, farbe ?? null, maxReihenfolge + 1)
    return info.lastInsertRowid
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

  ipcMain.handle('faecher:create', (_, { klasseId, name, farbe }) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM faecher WHERE klasse_id = ?').get(klasseId)?.m ?? 0
    const info = db.prepare('INSERT INTO faecher (klasse_id, name, farbe, reihenfolge) VALUES (?, ?, ?, ?)').run(klasseId, name, farbe ?? null, maxReihenfolge + 1)
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
    return true
  })

  ipcMain.handle('faecher:resetGewichtung', (_, id) => {
    db.prepare('UPDATE faecher SET gewichtung_sa = NULL, gewichtung_t = NULL, gewichtung_ma = NULL, gewichtung_hue = NULL, gewichtung_custom = NULL WHERE id = ?').run(id)
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

  // Spalten
  ipcMain.handle('spalten:getAll', (_, fachId) => {
    return db.prepare('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge, datum').all(fachId)
  })

  ipcMain.handle('spalten:create', (_, data) => {
    const maxReihenfolge = db.prepare('SELECT MAX(reihenfolge) as m FROM spalten WHERE fach_id = ? AND semester = ?').get(data.fachId, data.semester)?.m ?? 0
    const info = db.prepare(`
      INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.fachId, data.semester, data.kategorie, data.kuerzel, data.datum, maxReihenfolge + 1)
    return info.lastInsertRowid
  })

  ipcMain.handle('spalten:delete', (_, id) => {
    db.prepare('DELETE FROM eintraege WHERE spalte_id = ?').run(id)
    db.prepare('DELETE FROM spalten WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('spalten:update', (_, id, data) => {
    db.prepare('UPDATE spalten SET kuerzel = ?, datum = ? WHERE id = ?').run(data.kuerzel, data.datum, id)
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
    if (wert === '' || wert === null) {
      db.prepare('DELETE FROM eintraege WHERE spalte_id = ? AND schueler_id = ?').run(spalteId, schuelerId)
    } else {
      db.prepare('INSERT OR REPLACE INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)').run(spalteId, schuelerId, wert)
    }
    return true
  })

  // Zeugnisnoten
  ipcMain.handle('zeugnisnoten:getAll', (_, fachId) => {
    return db.prepare('SELECT * FROM zeugnisnoten WHERE fach_id = ?').all(fachId)
  })

  ipcMain.handle('zeugnisnoten:berechne', (_, fachId, schuelerId, semester) => {
    const { note, s1Eingerechnet } = berechneZeugnisnote(fachId, schuelerId, semester)
    if (note !== null) {
      db.prepare(`
        INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(fach_id, schueler_id, semester)
        DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
      `).run(fachId, schuelerId, semester, note, s1Eingerechnet ? 1 : 0)
    }
    return note
  })

  ipcMain.handle('zeugnisnoten:setManuell', (_, fachId, schuelerId, semester, note) => {
    const { note: berechnet, s1Eingerechnet } = berechneZeugnisnote(fachId, schuelerId, semester)
    db.prepare(`
      INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, note_manuell, s1_eingerechnet)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fach_id, schueler_id, semester)
      DO UPDATE SET note_berechnet = excluded.note_berechnet, note_manuell = excluded.note_manuell, s1_eingerechnet = excluded.s1_eingerechnet
    `).run(fachId, schuelerId, semester, berechnet, note, s1Eingerechnet ? 1 : 0)
    return true
  })

  ipcMain.handle('zeugnisnoten:clearManuell', (_, fachId, schuelerId, semester) => {
    db.prepare('UPDATE zeugnisnoten SET note_manuell = NULL WHERE fach_id = ? AND schueler_id = ? AND semester = ?').run(fachId, schuelerId, semester)
    return true
  })

  ipcMain.handle('zeugnisnoten:berechneFach', (_, fachId) => {
    // Alle Schüler:innen und beide Semester neu berechnen
    const fach = db.prepare('SELECT * FROM faecher WHERE id = ?').get(fachId)
    if (!fach) return false
    const schueler = db.prepare('SELECT id FROM schueler WHERE klasse_id = ? AND aktiv = 1').all(fach.klasse_id)
    const tx = db.transaction(() => {
      for (const s of schueler) {
        for (const sem of [1, 2]) {
          const { note, s1Eingerechnet } = berechneZeugnisnote(fachId, s.id, sem)
          if (note !== null) {
            db.prepare(`
              INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(fach_id, schueler_id, semester)
              DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
            `).run(fachId, s.id, sem, note, s1Eingerechnet ? 1 : 0)
          }
        }
      }
    })
    tx()
    return true
  })

  // Notizen
  ipcMain.handle('notizen:get', (_, schuelerId, fachId) => {
    return db.prepare('SELECT text FROM notizen WHERE schueler_id = ? AND fach_id = ?').get(schuelerId, fachId)?.text ?? ''
  })

  ipcMain.handle('notizen:set', (_, schuelerId, fachId, text) => {
    db.prepare('INSERT OR REPLACE INTO notizen (schueler_id, fach_id, text) VALUES (?, ?, ?)').run(schuelerId, fachId, text)
    return true
  })

  // Gewichtung global
  ipcMain.handle('gewichtungGlobal:getAll', () => {
    return db.prepare('SELECT * FROM gewichtung_global').all()
  })

  ipcMain.handle('gewichtungGlobal:update', (_, kategorie, gewichtung) => {
    db.prepare('INSERT OR REPLACE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)').run(kategorie, gewichtung)
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
             k.id AS klasse_id
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

  // Stunden-Planung
  ipcMain.handle('stundenPlanung:get', (_, stundenplanId, wocheDatum) => {
    return db.prepare(
      'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
    ).get(stundenplanId, wocheDatum) ?? null
  })

  ipcMain.handle('stundenPlanung:getWoche', (_, wocheDatum) => {
    return db.prepare(
      'SELECT * FROM stunden_planung WHERE woche_datum = ?'
    ).all(wocheDatum)
  })

  ipcMain.handle('stundenPlanung:save', (_, stundenplanId, wocheDatum, titel, inhalt) => {
    db.prepare(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET titel = excluded.titel, inhalt = excluded.inhalt
    `).run(stundenplanId, wocheDatum, titel, inhalt)
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

  ipcMain.handle('todos:create', (_, { titel, klasseId, fachId, faelligkeit }) => {
    const maxReihenfolge = klasseId
      ? db.prepare('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id = ?').get(klasseId)?.m ?? 0
      : db.prepare('SELECT MAX(reihenfolge) as m FROM todos WHERE klasse_id IS NULL').get()?.m ?? 0
    const info = db.prepare(
      'INSERT INTO todos (titel, klasse_id, fach_id, faelligkeit, reihenfolge) VALUES (?, ?, ?, ?, ?)'
    ).run(titel, klasseId ?? null, fachId ?? null, faelligkeit ?? null, maxReihenfolge + 1)
    return info.lastInsertRowid
  })

  ipcMain.handle('todos:update', (_, id, { titel, fachId, faelligkeit }) => {
    db.prepare('UPDATE todos SET titel = ?, fach_id = ?, faelligkeit = ? WHERE id = ?')
      .run(titel, fachId ?? null, faelligkeit ?? null, id)
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
  ipcMain.handle('backup:create', () => {
    const now = new Date()
    const ts = now.toISOString().replace(/:/g, '-').slice(0, 19)
    const backupPath = path.join(backupDir, `db_${ts}.sqlite`)
    try {
      fs.copyFileSync(dbPath, backupPath)
      return backupPath
    } catch (e) {
      return null
    }
  })

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
  ipcMain.handle('sitzplan:getTische', (_, klasseId) => {
    const rows = db.prepare(`
      SELECT t.id as tisch_id, t.typ, t.x, t.y,
             s.id as sitz_id, s.position, s.schueler_id,
             sch.vorname, sch.nachname
      FROM sitzplan_tische t
      LEFT JOIN sitzplan_sitzplaetze s ON s.tisch_id = t.id
      LEFT JOIN schueler sch ON sch.id = s.schueler_id
      WHERE t.klasse_id = ?
      ORDER BY t.id, s.position
    `).all(klasseId)
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

  ipcMain.handle('sitzplan:createTisch', (_, klasseId, typ, x, y) => {
    const tisch = db.prepare(
      'INSERT INTO sitzplan_tische (klasse_id, typ, x, y) VALUES (?, ?, ?, ?)'
    ).run(klasseId, typ, x, y)
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

  // ─── Jahresplanung ────────────────────────────────────────────────────────────
  ipcMain.handle('jahresplanung:getAll', (_, fachId) =>
    db.prepare('SELECT * FROM jahresplanung_abschnitte WHERE fach_id = ? ORDER BY datum_von').all(fachId)
  )
  ipcMain.handle('jahresplanung:create', (_, d) =>
    Number(db.prepare('INSERT INTO jahresplanung_abschnitte (fach_id, titel, inhalt, datum_von, datum_bis, farbe) VALUES (?,?,?,?,?,?)').run(d.fachId, d.titel, d.inhalt, d.datumVon, d.datumBis, d.farbe ?? null).lastInsertRowid)
  )
  ipcMain.handle('jahresplanung:update', (_, id, d) => {
    db.prepare('UPDATE jahresplanung_abschnitte SET titel=?, inhalt=?, datum_von=?, datum_bis=?, farbe=? WHERE id=?').run(d.titel, d.inhalt, d.datumVon, d.datumBis, d.farbe ?? null, id)
    return true
  })
  ipcMain.handle('jahresplanung:delete', (_, id) => {
    db.prepare('DELETE FROM jahresplanung_abschnitte WHERE id=?').run(id)
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
    icon: path.join(__dirname, 'logo.ico'),
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
