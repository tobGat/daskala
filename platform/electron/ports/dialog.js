// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron-Implementierung des DialogPort (siehe core/ports/index.js).

const { dialog } = require('electron')

/** @returns {import('../../../core/ports').DialogPort} */
function createDialogPort() {
  return {
    async openFile(opts = {}) {
      const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: opts.filters })
      return r.canceled ? null : r.filePaths[0]
    },
    async openFiles(opts = {}) {
      const properties = ['openFile']
      if (opts.multiSelections) properties.push('multiSelections')
      const r = await dialog.showOpenDialog({ properties, filters: opts.filters })
      return r.canceled ? null : r.filePaths
    },
    async openDirectory(opts = {}) {
      const properties = ['openDirectory']
      if (opts.createDirectory) properties.push('createDirectory')
      const r = await dialog.showOpenDialog({ properties, title: opts.title })
      return (r.canceled || !r.filePaths[0]) ? null : r.filePaths[0]
    },
    async saveFile(opts = {}) {
      const r = await dialog.showSaveDialog({ filters: opts.filters, defaultPath: opts.defaultName })
      return r.canceled ? null : r.filePath
    },
    async message(opts) {
      const r = await dialog.showMessageBox(opts)
      return r.response
    },
  }
}

module.exports = { createDialogPort }
