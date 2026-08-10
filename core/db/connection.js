// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// DbPort – austauschbare, asynchrone Datenbank-Schnittstelle (Phase 2 des
// Portierungsplans). Die Kern-Domänen sprechen NUR noch diese Schnittstelle an,
// nie mehr better-sqlite3 direkt. So lässt sich derselbe Kern später gegen ein
// mobiles SQLite (Capacitor/Tauri) betreiben, das grundsätzlich asynchron ist.
//
// Bewusst OHNE prepare()-Objekt: Statement-Caching ist ein Implementierungs-
// detail des Desktop-Adapters (platform/electron/db-better-sqlite3.js) und
// existiert mobil so nicht. Alle Methoden sind async – auch im Electron-Adapter,
// der die Promises sofort auflöst (gleiche Performance wie heute).
//
// Dieses Modul definiert nur den Vertrag (JSDoc); die Implementierung liegt in
// der Plattform-Schicht.

/**
 * @typedef {Object} DbPort
 * @property {(sql: string, params?: Array) => Promise<Object[]>} select
 *   Mehrere Zeilen lesen (entspricht dem bisherigen prepare(sql).all(...params)).
 * @property {(sql: string, params?: Array) => Promise<Object|null>} selectOne
 *   Eine Zeile lesen oder null (entspricht prepare(sql).get(...params) ?? null).
 * @property {(sql: string, params?: Array) => Promise<{changes: number, lastInsertRowid: number|bigint}>} execute
 *   Schreiben (INSERT/UPDATE/DELETE); liefert changes + lastInsertRowid.
 * @property {(fn: (tx: DbPort) => Promise<any>) => Promise<any>} transaction
 *   Transaktion; fn erhält dieselbe Schnittstelle. Verschachtelung via SAVEPOINT.
 * @property {() => void} close
 */

module.exports = {}
