// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron-Implementierung des ShellPort (siehe core/ports/index.js).

const { shell } = require('electron')

/** @returns {import('../../../core/ports').ShellPort} */
function createShellPort() {
  return {
    openPath: (pfad) => shell.openPath(pfad),
    openExternal: (url) => shell.openExternal(url),
  }
}

module.exports = { createShellPort }
