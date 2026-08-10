// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Capacitor-Implementierung des DbPort (Portierung Phase 3, Spike A).
// Erfüllt denselben Vertrag wie der Electron-Adapter
// (platform/electron/db-better-sqlite3.js): select/selectOne/execute/transaction/close,
// alles async. Läuft im WebView und spricht @capacitor-community/sqlite an.
//
// `conn` ist eine offene SQLiteDBConnection.
// Verschachtelte Transaktionen werden – wie im Electron-Adapter – über SAVEPOINTs
// abgebildet. Innerhalb einer Transaktion laufen run()-Aufrufe mit transaction=false
// (kein Auto-Commit); auf oberster Ebene committen sie selbst.

export function createCapacitorDbAdapter(conn) {
  let depth = 0
  const raw = (sql) => conn.execute(sql, false) // ohne eigenen Transaktions-Wrapper

  const port = {
    async select(sql, params = []) {
      const res = await conn.query(sql, params)
      return res.values ?? []
    },
    async selectOne(sql, params = []) {
      const res = await conn.query(sql, params)
      return (res.values && res.values[0]) ?? null
    },
    async execute(sql, params = []) {
      // depth === 0 → eigenständiges Statement (auto-commit); sonst Teil einer Transaktion.
      const res = await conn.run(sql, params, depth === 0)
      const ch = (res && res.changes) || {}
      return { changes: ch.changes ?? 0, lastInsertRowid: ch.lastId ?? 0 }
    },
    async transaction(fn) {
      const name = `sp${depth}`
      if (depth === 0) await raw('BEGIN TRANSACTION')
      else await raw(`SAVEPOINT ${name}`)
      depth++
      try {
        const r = await fn(port)
        depth--
        if (depth === 0) await raw('COMMIT')
        else await raw(`RELEASE SAVEPOINT ${name}`)
        return r
      } catch (e) {
        depth--
        try {
          if (depth === 0) await raw('ROLLBACK')
          else { await raw(`ROLLBACK TO SAVEPOINT ${name}`); await raw(`RELEASE SAVEPOINT ${name}`) }
        } catch { /* Rollback-Fehler nicht überdecken */ }
        throw e
      }
    },
    async close() { try { await conn.close() } catch { /* egal */ } },
  }
  return port
}
