// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Parst eine CSV/Excel-Datei (File-Objekt aus dem mobilen Datei-Picker) zu
// [{ vorname, nachname }]. Spiegelt core/services/import.js (schuelerFromFile),
// liest aber aus einem File statt aus einem Node-Dateipfad. xlsx wird nur bei
// Excel-Dateien dynamisch geladen (kein Ballast im Desktop-Renderer-Bundle).

function parseCsvText(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const header = lines[0].split(/[,;]/).map(h => h.trim().toLowerCase())
  const vornameIdx = header.findIndex(h => h.includes('vorname'))
  // Zuerst „nachname" suchen; erst als Fallback eine „name"-Spalte, die NICHT die
  // Vorname-Spalte ist (sonst matcht „vorname" wegen „…name" fälschlich).
  let nachnameIdx = header.findIndex(h => h.includes('nachname'))
  if (nachnameIdx === -1) nachnameIdx = header.findIndex((h, i) => i !== vornameIdx && h.includes('name'))
  const list = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/).map(c => c.trim().replace(/^["']|["']$/g, ''))
    if (cols.length < 2) continue
    list.push({
      vorname: cols[vornameIdx !== -1 ? vornameIdx : 0] ?? '',
      nachname: cols[nachnameIdx !== -1 ? nachnameIdx : 1] ?? '',
    })
  }
  return list
}

export async function parseSchuelerDatei(file) {
  const name = (file?.name || '').toLowerCase()
  let list = []
  if (name.endsWith('.csv')) {
    const content = await file.text()
    list = parseCsvText(content)
  } else {
    const buf = await file.arrayBuffer()
    const mod = await import('xlsx')
    const XLSX = mod.read ? mod : (mod.default ?? mod)
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws)
    for (const row of data) {
      const vorname = row['Vorname'] ?? row['vorname'] ?? ''
      const nachname = row['Nachname'] ?? row['nachname'] ?? row['Name'] ?? ''
      if (vorname || nachname) list.push({ vorname: String(vorname).trim(), nachname: String(nachname).trim() })
    }
  }
  return list.filter(s => s.vorname || s.nachname)
}
