// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Browser/WebView-Shim für Node 'crypto' (Capacitor-Build). Der Kern nutzt nur
// randomUUID(); zur Laufzeit greift core/db/uuid.js ohnehin zuerst auf
// globalThis.crypto zu – dieser Shim befriedigt nur den Bundler.
module.exports = {
  randomUUID: () => globalThis.crypto.randomUUID(),
}
