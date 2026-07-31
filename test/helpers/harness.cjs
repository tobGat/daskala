// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Charakterisierungs-Harness (Phase 0).
//
// Lädt das unveränderte main.js außerhalb von Electron, fängt die per
// ipcMain.handle registrierten Handler ein und stellt callHandler() bereit,
// um sie gegen eine echte (temporäre) SQLite-DB aufzurufen.
//
// LAUFZEIT: nur unter Electron-as-Node lauffähig, weil better-sqlite3 gegen
// Electrons ABI gebaut ist:
//   ELECTRON_RUN_AS_NODE=1 electron --test test/characterization/*.cjs
//
// Ablauf:
//   1. Temporäres userData-Verzeichnis anlegen.
//   2. require('electron') / require('electron-updater') per Module._load stubben.
//   3. main.js laden → app.whenReady()-Callback läuft: initDB() legt das VOLLE
//      Schema in <tmp>/db.sqlite an, registerIPC() registriert die Handler.
//   4. Optional seed.sql (reine Daten-INSERTs) über eine zweite Verbindung
//      einspielen – so bleibt das Schema allein von main.js definiert (keine
//      Duplizierung, keine Drift).
//   5. callHandler(kanal, ...args) ruft den eingefangenen Handler auf.

const path = require('path')
const fs = require('fs')
const os = require('os')
const Module = require('module')
const { createElectronStub, makeNoop } = require('./electron-stub.cjs')

const MAIN_PATH = require.resolve('../../main.js')

// Reale better-sqlite3-Klasse einmalig holen und um Instanz-Tracking erweitern,
// damit der Harness die von main.js geöffnete Verbindung sauber schließen kann
// (nötig, um bei wiederholter Nutzung Temp-DBs unter Windows wieder zu löschen).
const RealDatabase = require('better-sqlite3')

async function createHarness({ seedSql = null } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daskala-char-'))
  const handlers = new Map()
  const electronStub = createElectronStub({ userDataPath: tmpDir, handlers })
  const updaterStub = { autoUpdater: makeNoop() }
  const openedDbs = []
  class TrackedDatabase extends RealDatabase {
    constructor(...args) { super(...args); openedDbs.push(this) }
  }

  // Post-registerIPC-Lifecycle (createWindow/Menu/AutoUpdate) darf mit den Stubs
  // scheitern, ohne den Test zu killen – die Handler sind da bereits eingefangen.
  const onUnhandled = () => {}
  process.on('unhandledRejection', onUnhandled)

  const origLoad = Module._load
  Module._load = function (request) {
    if (request === 'electron') return electronStub
    if (request === 'electron-updater') return updaterStub
    if (request === 'better-sqlite3') return TrackedDatabase
    return origLoad.apply(this, arguments)
  }

  delete require.cache[MAIN_PATH]
  try {
    require(MAIN_PATH)
    // app.whenReady().then(cb) als Microtask abarbeiten lassen (cb ist synchron).
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
  } finally {
    Module._load = origLoad
  }

  if (handlers.size === 0) {
    throw new Error('Harness: es wurden keine IPC-Handler eingefangen (registerIPC lief nicht?)')
  }

  const dbPath = path.join(tmpDir, 'db.sqlite')

  // Seed über eine eigene Verbindung (WAL → für main.js-Verbindung sichtbar).
  if (seedSql) {
    const seedDb = new RealDatabase(dbPath)
    seedDb.pragma('foreign_keys = ON')
    seedDb.exec(seedSql)
    seedDb.close()
  }

  async function callHandler(channel, ...args) {
    const fn = handlers.get(channel)
    if (!fn) throw new Error(`Harness: kein Handler für Kanal '${channel}'`)
    return await fn({}, ...args)
  }

  // Liest den Zustand der angegebenen Tabellen deterministisch (für Schreib-Kanal-
  // Snapshots). Zeitstempel-Spalten werden auf '<TS>' normalisiert, damit
  // datetime('now')-Defaults die Snapshots nicht unbestimmt machen.
  const TS_SPALTEN = /^(zeitstempel|aktualisiert|erstellt_am|reagiert_am|erledigt_am)$/
  function snapshotTables(namen) {
    const rdb = new RealDatabase(dbPath, { readonly: true })
    try {
      const out = {}
      for (const name of namen) {
        const rows = rdb.prepare(`SELECT * FROM ${name}`).all()
        // Nach rowid/erster Spalte stabil sortieren (SELECT * ist bereits rowid-Reihenfolge,
        // aber wir sichern es über die id-Spalte, falls vorhanden).
        rows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
        for (const row of rows) {
          for (const k of Object.keys(row)) {
            if (TS_SPALTEN.test(k) && row[k] != null) row[k] = '<TS>'
          }
        }
        out[name] = rows
      }
      return out
    } finally {
      rdb.close()
    }
  }

  function cleanup() {
    process.off('unhandledRejection', onUnhandled)
    for (const db of openedDbs) { try { db.close() } catch { /* egal */ } }
    delete require.cache[MAIN_PATH]
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* egal */ }
  }

  return { callHandler, handlers, dbPath, tmpDir, cleanup, snapshotTables }
}

// Liest das Seed-SQL aus test/fixtures/seed.sql (oder null, wenn nicht vorhanden).
function ladeSeed() {
  const p = path.join(__dirname, '..', 'fixtures', 'seed.sql')
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}

module.exports = { createHarness, ladeSeed, MAIN_PATH }
