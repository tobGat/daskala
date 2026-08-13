// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Mobiler Noten-Export (Capacitor). Der Desktop-Export (core/services/export.js)
// schreibt über einen Datei-Dialog + Node-FS – am Gerät nicht verfügbar. Hier wird
// die ODS-Datei im WebView mit xlsx erzeugt und per Web-Share-API geteilt
// (Fallback: Download über eine Blob-URL). Zeilenaufbau identisch zum Desktop.

import * as XLSX from 'xlsx'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import noten from '../../core/services/notenberechnung'

function dateiTeil(s) {
  return String(s ?? '').trim()
    .replace(/[/\\]+/g, '-')
    .replace(/[:*?"<>|]+/g, '')
    .replace(/\s+/g, '_') || 'export'
}

function exportDatum() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
}

// Datei in den App-Cache schreiben und die System-Teilen-Ansicht öffnen.
// (Web-Share mit Datei ist im Android-WebView unzuverlässig; der Share-Plugin
// teilt die Datei nativ über ihre URI.)
async function teileDatei(base64, filename) {
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  })
  try {
    await Share.share({
      title: filename,
      dialogTitle: 'Noten exportieren',
      files: [written.uri],
    })
  } catch (e) {
    if (e && (e.message?.includes('cancel') || e.message?.includes('Abort'))) return false
    throw e
  }
  return true
}

export async function fachOdsMobil(db, fachId) {
  const fach = await db.selectOne(
    'SELECT f.*, k.name AS klasse_name FROM faecher f JOIN klassen k ON f.klasse_id = k.id WHERE f.id = ?',
    [fachId]
  )
  if (!fach) return false

  // Zeugnisnoten aktuell halten (Desktop liest bereits berechnete Werte).
  await noten.berechneAlleFuerFach(db, fachId)

  const schueler = await noten.rosterFuerFach(db, fachId)
  const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge', [fachId])
  const eintraege = await db.select('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)', [fachId])
  const zeugnisnoten = await db.select('SELECT * FROM zeugnisnoten WHERE fach_id = ?', [fachId])

  const entryMap = {}
  eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
  const istDiff = fach.benotungssystem === 'differenziert'
  const niveauMap = {}
  if (istDiff) {
    (await db.select('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?', [fachId]))
      .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
  }
  const znMap = {}
  zeugnisnoten.forEach(z => {
    znMap[`${z.schueler_id}_${z.semester}`] =
      noten.znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
  })

  const header = ['Name', ...spalten.map(s => `${s.kuerzel} ${s.datum ?? ''}`), 'SN 1', 'SN 2', 'ZN']
  const rows = [header]
  for (const s of schueler) {
    const row = [`${s.nachname} ${s.vorname}`]
    for (const sp of spalten) row.push(entryMap[`${sp.id}_${s.id}`] ?? '')
    row.push(znMap[`${s.id}_1`] ?? '')
    row.push(znMap[`${s.id}_2`] ?? '')
    row.push(znMap[`${s.id}_3`] ?? '')
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `${fach.klasse_name} ${fach.name}`.slice(0, 31))
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'ods' })

  const filename = `export_noten_${dateiTeil(fach.klasse_name)}_${dateiTeil(fach.name)}_${exportDatum()}.ods`
  return teileDatei(base64, filename)
}
