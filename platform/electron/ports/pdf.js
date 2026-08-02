// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron-Implementierung des PdfPort (siehe core/ports/index.js).
// Rendert HTML in einem unsichtbaren Fenster und druckt es via printToPDF nach A4.

const { BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

/** @returns {import('../../../core/ports').PdfPort} */
function createPdfPort() {
  return {
    async fromHtml(htmlContent, opts = {}) {
      const tmpFile = path.join(os.tmpdir(), `daskala_${Date.now()}.html`)
      fs.writeFileSync(tmpFile, htmlContent, 'utf8')
      const win = new BrowserWindow({
        show: false, width: 800, height: 1100,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      })
      await win.loadFile(tmpFile)
      const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: !!opts.landscape })
      win.destroy()
      try { fs.unlinkSync(tmpFile) } catch { /* ignore */ }
      return pdfBuffer
    },
  }
}

module.exports = { createPdfPort }
