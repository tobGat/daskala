// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron-Adapter für den DbPort (siehe core/db/connection.js), umgesetzt über
// better-sqlite3. Alle Methoden sind async, lösen aber sofort auf – die
// zugrunde liegende Engine ist synchron, daher keine echte Wartezeit und gleiche
// Performance wie zuvor.
//
// `getDb` liefert die aktuelle better-sqlite3-Verbindung. Über einen Getter (statt
// einer festen Referenz) übersteht der Adapter ein Neu-Öffnen der DB (Import/
// Wiederherstellung): Wechselt die Verbindung, wird der Statement-Cache verworfen.

function createDbAdapter(getDb) {
  let lastDb = null
  let cache = new Map()

  // Prepared Statements je SQL cachen; bei DB-Wechsel (reopen) Cache leeren,
  // da Statements an ihre Verbindung gebunden sind.
  const stmt = (sql) => {
    const db = getDb()
    if (db !== lastDb) { cache = new Map(); lastDb = db }
    let s = cache.get(sql)
    if (!s) { s = db.prepare(sql); cache.set(sql, s) }
    return s
  }

  let depth = 0

  const port = {
    async select(sql, params = []) {
      return stmt(sql).all(...params)
    },
    async selectOne(sql, params = []) {
      return stmt(sql).get(...params) ?? null
    },
    async execute(sql, params = []) {
      const info = stmt(sql).run(...params)
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid }
    },
    // Transaktion über manuelles BEGIN/COMMIT bzw. SAVEPOINT (verschachtelbar).
    // Kein db.transaction() von better-sqlite3, weil das keine async-Funktionen
    // erlaubt – die Kern-Aufrufe sind async, lösen hier aber synchron auf.
    async transaction(fn) {
      const db = getDb()
      const name = `sp${depth}`
      if (depth === 0) db.exec('BEGIN'); else db.exec(`SAVEPOINT ${name}`)
      depth++
      try {
        const result = await fn(port)
        depth--
        if (depth === 0) db.exec('COMMIT'); else db.exec(`RELEASE ${name}`)
        return result
      } catch (e) {
        depth--
        try {
          if (depth === 0) db.exec('ROLLBACK')
          else { db.exec(`ROLLBACK TO ${name}`); db.exec(`RELEASE ${name}`) }
        } catch { /* Rollback-Fehler nicht überdecken */ }
        throw e
      }
    },
    close() {
      try { getDb().close() } catch { /* ignore */ }
    },
  }

  return port
}

module.exports = { createDbAdapter }
