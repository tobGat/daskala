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

// Mobile Plattform-Markierung: <html class="cap"> + viewport-fit für Safe-Areas
// (Notch/Gestenleiste). Nur hier gesetzt → Desktop bleibt unberührt. Alle mobilen
// UI-Anpassungen hängen an `.cap` (CSS) bzw. useIsMobile() (JS).
function markiereMobil() {
  document.documentElement.classList.add('cap')
  const vp = document.querySelector('meta[name="viewport"]')
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover')
}

// Ergänzt eine Spalte nur, wenn sie in einer Bestands-DB noch fehlt. ALTER TABLE ADD COLUMN
// ist nicht per IF NOT EXISTS idempotent (würde bei jedem Start werfen), daher der PRAGMA-Guard –
// analog zu spalteErgaenzen() im Desktop-Schema. Frische Installationen haben die Spalte bereits
// aus MIGRATIONS[0] (aus TABLE_DDL erzeugt), hier passiert dann nichts.
async function spalteErgaenzenWennFehlt(dbPort, tabelle, spalte, definition) {
  try {
    const cols = await dbPort.select(`PRAGMA table_info(${tabelle})`)
    if (cols.some((c) => c.name === spalte)) return
    await dbPort.execute(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${definition}`)
  } catch (e) {
    console.error('[daskala:mobile] migration:spalte', `${tabelle}.${spalte}`, e)
  }
}

// Einmaliger Backfill der Klassen-Mitgliedschaft (n:m) aus der alten schueler.klasse_id-Bindung.
// MUSS flag-geschützt sein: die MIGRATIONS laufen bei JEDEM Start, ein unbedingtes INSERT würde
// später gelöschte Mitgliedschaften bei jedem Start wieder auferstehen lassen.
async function backfillKlassenSchuelerEinmalig(dbPort) {
  try {
    const flag = await dbPort.select("SELECT wert FROM einstellungen WHERE schluessel = 'migr_v5_klassen_schueler'")
    if (flag.length) return
    await dbPort.execute(`
      INSERT OR IGNORE INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse)
      SELECT klasse_id, id, reihenfolge, aktiv, 1 FROM schueler
    `)
    await dbPort.execute("INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES ('migr_v5_klassen_schueler', '1')")
  } catch (e) {
    console.error('[daskala:mobile] migration:klassen_schueler', e)
  }
}

export async function bootstrapMobile() {
  markiereMobil()
  const conn = await oeffneVerbindung()
  // Schema anwenden – die MIGRATIONS-Statements sind idempotent (CREATE … IF NOT EXISTS,
  // INSERT OR IGNORE, DELETE), daher bei jedem Start unbedenklich; ein separates
  // Versions-Tracking spart sich der Spike.
  for (const m of MIGRATIONS) {
    await conn.execute(m.sql, false)
  }
  const dbPort = createCapacitorDbAdapter(conn)
  // Bestands-DBs (vor v1.3) nachrüsten: die per CREATE-IF-NOT-EXISTS nicht nachziehbaren
  // Spalten der LBVO-Features idempotent ergänzen (siehe MIGRATIONS v2 für die Daten-Seite).
  await spalteErgaenzenWennFehlt(dbPort, 'faecher', 'gewichtung_man', 'REAL')
  await spalteErgaenzenWennFehlt(dbPort, 'spalten', 'ma_symbole', 'TEXT')
  await seedDemoWennLeer(dbPort)
  // Nach dem Seed: Junction einmalig aus schueler.klasse_id backfillen (erfasst auch Demo-Daten).
  await backfillKlassenSchuelerEinmalig(dbPort)
  window.api = createMobileApi(dbPort)
}
