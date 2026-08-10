// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Mobiler Bootstrap (Capacitor-Spike): öffnet die SQLite-DB, wendet das Schema
// aus der Phase-2.3-Baseline (MIGRATIONS) an, seedt bei leerer DB einen
// Demo-Datensatz und hängt das mobile `window.api` ein. Wird von renderer/main.jsx
// nur aufgerufen, wenn kein `window.api` existiert (also nicht unter Electron).

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { MIGRATIONS } from '../../core/db/schema'
import { createCapacitorDbAdapter } from './db-sqlite'
import { seedDemoWennLeer } from './demo-seed'
import { createMobileApi } from './api'

const DB_NAME = 'daskala'

async function oeffneVerbindung() {
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  // Bestehende Verbindung wiederverwenden (Hot-Reload/Neustart-sicher).
  try {
    await sqlite.checkConnectionsConsistency()
  } catch { /* erste Ausführung: noch keine Konsistenzdaten */ }
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result
  const conn = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false)
  await conn.open()
  return conn
}

export async function bootstrapMobile() {
  const conn = await oeffneVerbindung()
  // Schema anwenden – alle Statements sind idempotent (IF NOT EXISTS), daher bei
  // jedem Start unbedenklich; ein separates Versions-Tracking spart sich der Spike.
  for (const m of MIGRATIONS) {
    await conn.execute(m.sql, false)
  }
  const dbPort = createCapacitorDbAdapter(conn)
  await seedDemoWennLeer(dbPort)
  window.api = createMobileApi(dbPort)
}
