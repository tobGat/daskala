// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Electron/Node-Implementierung des FsPort (siehe core/ports/index.js).

const fs = require('fs')

/** @returns {import('../../../core/ports').FsPort} */
function createFsPort() {
  return {
    exists: (p) => fs.existsSync(p),
    read: (p, encoding) => (encoding ? fs.readFileSync(p, encoding) : fs.readFileSync(p)),
    readBytes: (p, length) => {
      const buf = Buffer.alloc(length)
      const fd = fs.openSync(p, 'r')
      try { fs.readSync(fd, buf, 0, length, 0) } finally { fs.closeSync(fd) }
      return buf
    },
    write: (p, data, encoding) => fs.writeFileSync(p, data, encoding),
    mkdir: (p) => fs.mkdirSync(p, { recursive: true }),
    list: (p, opts) => fs.readdirSync(p, opts),
    remove: (p) => { try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ } },
    copy: (quelle, ziel) => fs.copyFileSync(quelle, ziel),
    move: (quelle, ziel) => fs.renameSync(quelle, ziel),
    stat: (p) => { const s = fs.statSync(p); return { size: s.size, mtimeMs: s.mtimeMs, isFile: s.isFile() } },
  }
}

module.exports = { createFsPort }
