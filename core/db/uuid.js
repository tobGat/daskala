// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// UUID-Generator für neue Entitäts-Zeilen (Portierung Phase 2.4, UUID-Weiche).
// Bevorzugt die Web-Standard-Crypto-API (in Browsern/WebViews mobil verfügbar),
// fällt auf das Node-crypto-Modul zurück (Electron-Main). So funktioniert derselbe
// Kern-Code in jedem Zielrahmen (Electron, Capacitor, Tauri).

function neueUuid() {
  const g = (typeof globalThis !== 'undefined') ? globalThis : {}
  if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID()
  return require('crypto').randomUUID()
}

module.exports = { neueUuid }
