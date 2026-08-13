// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Import von Schüler:innen aus CSV/Excel. `deps` = { fs } (FsPort).
// Die CSV-Variante liest über den FsPort; die Excel-Variante nutzt xlsx (liest
// selbst). `path` ist ein Node-Builtin und in core erlaubt.

const path = require('path')

function schuelerFromFile(deps, filePath) {
  const ext = path.extname(filePath).toLowerCase()
  let list = []

  if (ext === '.csv') {
    const content = deps.fs.read(filePath, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim())
    const header = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase())
    const vornameIdx = header.findIndex(h => h.includes('vorname'))
    // Zuerst „nachname" suchen; erst als Fallback eine „name"-Spalte, die NICHT die
    // Vorname-Spalte ist (sonst matcht „vorname" wegen „…name" fälschlich).
    let nachnameIdx = header.findIndex(h => h.includes('nachname'))
    if (nachnameIdx === -1) nachnameIdx = header.findIndex((h, i) => i !== vornameIdx && h.includes('name'))
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''))
      if (cols.length < 2) continue
      list.push({
        vorname: cols[vornameIdx !== -1 ? vornameIdx : 0],
        nachname: cols[nachnameIdx !== -1 ? nachnameIdx : 1],
      })
    }
  } else {
    const XLSX = require('xlsx')
    const wb = XLSX.readFile(filePath)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws)
    for (const row of data) {
      const vorname = row['Vorname'] ?? row['vorname'] ?? ''
      const nachname = row['Nachname'] ?? row['nachname'] ?? row['Name'] ?? ''
      if (vorname || nachname) list.push({ vorname, nachname })
    }
  }

  return list.filter(s => s.vorname || s.nachname)
}

module.exports = { schuelerFromFile }
