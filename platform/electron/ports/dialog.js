// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron-Implementierung des DialogPort (siehe core/ports/index.js).

const { dialog, BrowserWindow } = require('electron')

// Native Dialoge immer modal zum App-Fenster öffnen und danach den Tastaturfokus an den
// Seiteninhalt zurückgeben. Ohne Elternfenster/Refokus kehrt der Fokus unter Windows nach
// dem Schließen nicht zuverlässig in die Seite zurück → Eingabefelder (z. B. im
// Planungsmodal nach „Datei hinzufügen") reagieren nicht, bis das Fenster einmal den
// Fokus wechselt.
function appFenster() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

function fokusZurueck(win) {
  if (!win || win.isDestroyed()) return
  win.focus()
  win.webContents.focus()
}

// Gleiche Signatur wie Electron: ([win,] opts). Ohne win wird das App-Fenster verwendet.
function mitFenster(fn) {
  return async (winOderOpts, opts) => {
    const mitWin = opts !== undefined
    const win = (mitWin && winOderOpts) || appFenster()
    const optionen = mitWin ? opts : winOderOpts
    try {
      return win ? await fn(win, optionen) : await fn(optionen)
    } finally {
      fokusZurueck(win)
    }
  }
}

const nativDialog = {
  showOpenDialog: mitFenster((...a) => dialog.showOpenDialog(...a)),
  showSaveDialog: mitFenster((...a) => dialog.showSaveDialog(...a)),
  showMessageBox: mitFenster((...a) => dialog.showMessageBox(...a)),
}

/** @returns {import('../../../core/ports').DialogPort} */
function createDialogPort() {
  return {
    async openFile(opts = {}) {
      const r = await nativDialog.showOpenDialog({ properties: ['openFile'], filters: opts.filters })
      return r.canceled ? null : r.filePaths[0]
    },
    async openFiles(opts = {}) {
      const properties = ['openFile']
      if (opts.multiSelections) properties.push('multiSelections')
      const r = await nativDialog.showOpenDialog({ properties, filters: opts.filters })
      return r.canceled ? null : r.filePaths
    },
    async openDirectory(opts = {}) {
      const properties = ['openDirectory']
      if (opts.createDirectory) properties.push('createDirectory')
      const r = await nativDialog.showOpenDialog({ properties, title: opts.title })
      return (r.canceled || !r.filePaths[0]) ? null : r.filePaths[0]
    },
    async saveFile(opts = {}) {
      const r = await nativDialog.showSaveDialog({ filters: opts.filters, defaultPath: opts.defaultName })
      return r.canceled ? null : r.filePath
    },
    async message(opts) {
      const r = await nativDialog.showMessageBox(opts)
      return r.response
    },
  }
}

module.exports = { createDialogPort, nativDialog }
