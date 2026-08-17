// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Datenexporte (JSON, ODS via xlsx, PDF via PdfPort, ODT via jszip,
// DOCX via docx). `db` ist der async DbPort. `deps` bündelt Ports + Helfer:
//   { dialog, fs, pdf, dateiTeil, exportDatum, rosterFuerFach (async),
//     znInternZuAnzeige, abschnittHierarchie (async), sammleMaterialien (async), sanitizeSegment }
// xlsx/jszip/docx sind plattformunabhängig und werden lazy geladen.

async function toJson(db, deps) {
  const filePath = await deps.dialog.saveFile({
    defaultName: `daskala_export_${deps.exportDatum()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!filePath) return false

  const data = {
    schuljahre: await db.select('SELECT * FROM schuljahre'),
    klassen: await db.select('SELECT * FROM klassen'),
    faecher: await db.select('SELECT * FROM faecher'),
    schueler: await db.select('SELECT * FROM schueler'),
    spalten: await db.select('SELECT * FROM spalten'),
    eintraege: await db.select('SELECT * FROM eintraege'),
    zeugnisnoten: await db.select('SELECT * FROM zeugnisnoten'),
    notizen: await db.select('SELECT * FROM notizen'),
    gewichtung_global: await db.select('SELECT * FROM gewichtung_global'),
    einstellungen: await db.select('SELECT * FROM einstellungen'),
  }
  deps.fs.write(filePath, JSON.stringify(data, null, 2), 'utf-8')
  return true
}

// Noten eines Fachs als ODS-Tabelle
async function fachOds(db, deps, fachId) {
  const XLSX = require('xlsx')
  const fach = await db.selectOne('SELECT f.*, k.name AS klasse_name FROM faecher f JOIN klassen k ON f.klasse_id = k.id WHERE f.id = ?', [fachId])
  if (!fach) return false

  const filePath = await deps.dialog.saveFile({
    defaultName: `export_noten_${deps.dateiTeil(fach.klasse_name)}_${deps.dateiTeil(fach.name)}_${deps.exportDatum()}.ods`,
    filters: [{ name: 'OpenDocument-Tabelle', extensions: ['ods'] }],
  })
  if (!filePath) return false

  const schueler = await deps.rosterFuerFach(fachId)
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
      deps.znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
  })

  const header = ['Name', ...spalten.map(s => `${s.kuerzel} ${s.datum ?? ''}`), 'ZN']
  const rows = [header]

  for (const s of schueler) {
    const row = [`${s.nachname} ${s.vorname}`]
    for (const sp of spalten) {
      row.push(entryMap[`${sp.id}_${s.id}`] ?? '')
    }
    row.push(znMap[`${s.id}_3`] ?? '')
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, `${fach.klasse_name} ${fach.name}`.slice(0, 31))
  XLSX.writeFile(wb, filePath, { bookType: 'ods' })
  return true
}

// Planungs-PDF (eine Datei oder eine Datei pro Woche)
async function planungPdf(db, deps, wochen, einzeln) {
  const WOCHENTAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr']

  function getKW(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const dayNum = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
  }

  function wocheLabel(datum) {
    const d = new Date(datum)
    const fr = new Date(d); fr.setDate(d.getDate() + 4)
    return `KW ${getKW(d)} · ${d.getDate()}.${d.getMonth() + 1}. – ${fr.getDate()}.${fr.getMonth() + 1}.${fr.getFullYear()}`
  }

  function escHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function formatInhalt(text) {
    return escHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)/gm, '• $1')
      .replace(/---/g, '<hr/>')
  }

  const css = `
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:11px;color:#1a1a1a}
      @page{size:A4;margin:1.5cm}
      h1{font-size:20px;font-weight:300;margin-bottom:4px}
      .meta{font-size:10px;color:#666;margin-bottom:24px}
      .woche{margin-bottom:28px;page-break-inside:avoid}
      .woche-titel{font-size:13px;font-weight:700;color:#4f46e5;border-bottom:2px solid #6366f1;padding-bottom:4px;margin-bottom:10px}
      .stunde{margin-bottom:8px;padding:8px 10px;border-left:3px solid #e0e0e0}
      .stunde-meta{font-size:9px;color:#888;margin-bottom:3px}
      .stunde-titel{font-size:12px;font-weight:600;margin-bottom:4px}
      .stunde-inhalt{font-size:10px;white-space:pre-wrap;line-height:1.5;color:#374151}
      hr{border:none;border-top:1px solid #ddd;margin:4px 0}
    `

  async function generiereWocheHtml(wocheDatum) {
    const planungen = await db.select(`
        SELECT sp.*, st.wochentag, sz.stunde, sz.beginn, sz.ende,
               f.name AS fach_name, k.name AS klasse_name
        FROM stunden_planung sp
        JOIN stundenplan st ON st.id = sp.stundenplan_id
        JOIN stundenzeiten sz ON sz.id = st.stunde_id
        JOIN faecher f ON f.id = st.fach_id
        JOIN klassen k ON k.id = f.klasse_id
        WHERE sp.woche_datum = ?
        ORDER BY st.wochentag, sz.stunde
      `, [wocheDatum])
    if (!planungen.length) return ''
    const stunden = planungen.map(p => `
        <div class="stunde">
          <div class="stunde-meta">${WOCHENTAGE[p.wochentag] || ''} · ${p.stunde}. Stunde (${p.beginn}–${p.ende}) · ${escHtml(p.fach_name)} · ${escHtml(p.klasse_name)}</div>
          ${p.titel ? `<div class="stunde-titel">${escHtml(p.titel)}</div>` : ''}
          ${p.inhalt ? `<div class="stunde-inhalt">${formatInhalt(p.inhalt)}</div>` : ''}
        </div>`).join('')
    return `<div class="woche"><div class="woche-titel">${wocheLabel(wocheDatum)}</div>${stunden}</div>`
  }

  const generiereHtml = async (wochenArg) => {
    let body = ''
    for (const w of wochenArg) body += await generiereWocheHtml(w)
    return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>${css}</style></head>
      <body><h1>Stundenplanung – Daskala</h1><div class="meta">Exportiert am ${new Date().toLocaleDateString('de-AT')}</div>${body}</body></html>`
  }

  if (einzeln) {
    for (const wocheDatum of wochen) {
      const filePath = await deps.dialog.saveFile({
        defaultName: `planung_${wocheDatum}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (filePath) {
        const buf = await deps.pdf.fromHtml(await generiereHtml([wocheDatum]))
        deps.fs.write(filePath, buf)
      }
    }
    return true
  } else {
    const filePath = await deps.dialog.saveFile({
      defaultName: `planung_export_${deps.exportDatum()}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (!filePath) return false
    const buf = await deps.pdf.fromHtml(await generiereHtml(wochen))
    deps.fs.write(filePath, buf)
    return true
  }
}

// Stundenplan als ansprechendes PDF (Querformat, zum Aufhängen)
async function stundenplanPdf(db, deps, titelZusatz) {
  const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

  // Farbpalette analog zur App (getKlasseFarbe: klasse_id % 7).
  const FARBEN = [
    { bg: '#ffe6e2', bar: '#f97362', text: '#7f2418' }, // coral
    { bg: '#d1fae5', bar: '#34d399', text: '#065f46' }, // emerald
    { bg: '#ede9fe', bar: '#a78bfa', text: '#5b21b6' }, // violet
    { bg: '#fef3c7', bar: '#fbbf24', text: '#92400e' }, // amber
    { bg: '#ffe4e6', bar: '#fb7185', text: '#9f1239' }, // rose
    { bg: '#cffafe', bar: '#22d3ee', text: '#155e75' }, // cyan
    { bg: '#ffedd5', bar: '#fb923c', text: '#9a3412' }, // orange
  ]
  const farbeFuer = (klasseId) => FARBEN[((klasseId % FARBEN.length) + FARBEN.length) % FARBEN.length]
  const escHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const ivLabel = (iv) => iv === 2 ? '14-tg.' : `alle ${iv} Wo.`

  const stundenzeiten = await db.select('SELECT * FROM stundenzeiten ORDER BY stunde')
  const eintraege = await db.select(`
      SELECT sp.*, sz.stunde, sz.beginn, sz.ende,
             f.name AS fach_name, k.name AS klasse_name, k.id AS klasse_id
      FROM stundenplan sp
      JOIN stundenzeiten sz ON sz.id = sp.stunde_id
      JOIN faecher f ON f.id = sp.fach_id
      JOIN klassen k ON k.id = f.klasse_id
      ORDER BY sp.wochentag, sz.stunde
    `)

  // Einträge nach Slot gruppieren (mehrere möglich, z. B. bei 14-tägigem Wechsel).
  const slotMap = {}
  for (const e of eintraege) {
    const key = `${e.wochentag}_${e.stunde_id}`
    ;(slotMap[key] ??= []).push(e)
  }

  // Legende: vorhandene Klassen mit ihrer Farbe.
  const klassenGesehen = new Map()
  for (const e of eintraege) if (!klassenGesehen.has(e.klasse_id)) klassenGesehen.set(e.klasse_id, e.klasse_name)

  const zelleHtml = (wochentag, stunde) => {
    const list = slotMap[`${wochentag}_${stunde.id}`] || []
    if (!list.length) return '<td class="leer"></td>'
    const inner = list.map(e => {
      const f = farbeFuer(e.klasse_id)
      const iv = e.wochen_intervall || 1
      return `<div class="fach" style="background:${f.bg};border-left:5px solid ${f.bar};color:${f.text}">
          <div class="fach-name">${escHtml(e.fach_name)}</div>
          <div class="fach-klasse">${escHtml(e.klasse_name)}${iv > 1 ? ` · <span class="iv">${ivLabel(iv)}</span>` : ''}</div>
        </div>`
    }).join('')
    return `<td>${inner}</td>`
  }

  const kopf = `<tr>
      <th class="zeit-kopf">Zeit</th>
      ${WOCHENTAGE.map(t => `<th>${t}</th>`).join('')}
    </tr>`

  const zeilen = stundenzeiten.map(stunde => `
      <tr>
        <td class="zeit">
          <div class="zeit-nr">${stunde.stunde}.</div>
          <div class="zeit-span">${stunde.beginn}<br>${stunde.ende}</div>
        </td>
        ${WOCHENTAGE.map((_, i) => zelleHtml(i + 1, stunde)).join('')}
      </tr>`).join('')

  const legende = klassenGesehen.size ? `<div class="legende">
      ${[...klassenGesehen.entries()].map(([id, name]) => {
    const f = farbeFuer(id)
    return `<span class="leg-item"><span class="leg-dot" style="background:${f.bar}"></span>${escHtml(name)}</span>`
  }).join('')}
    </div>` : ''

  const css = `
      *{box-sizing:border-box;margin:0;padding:0}
      @page{size:A4 landscape;margin:1cm}
      body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937}
      h1{font-size:26px;font-weight:300;letter-spacing:.5px}
      .meta{font-size:12px;color:#6b7280;margin-bottom:14px}
      table{width:100%;border-collapse:separate;border-spacing:4px;table-layout:fixed}
      th{font-size:14px;font-weight:600;color:#374151;padding:6px 0;text-align:center}
      th.zeit-kopf{width:70px}
      td{vertical-align:top;height:80px;border-radius:8px;background:#f9fafb;padding:4px}
      td.leer{background:#fcfcfd;border:1px dashed #e5e7eb}
      td.zeit{background:transparent;text-align:center;padding-top:8px}
      .zeit-nr{font-size:18px;font-weight:700;color:#111827}
      .zeit-span{font-size:10px;color:#9ca3af;margin-top:2px;line-height:1.3}
      .fach{border-radius:6px;padding:6px 8px;margin-bottom:4px;min-height:66px;display:flex;flex-direction:column;justify-content:center}
      .fach:last-child{margin-bottom:0}
      .fach-name{font-size:15px;font-weight:700;line-height:1.15}
      .fach-klasse{font-size:11px;opacity:.8;margin-top:2px}
      .iv{font-weight:700;text-transform:uppercase;font-size:9px;letter-spacing:.3px}
      .legende{margin-top:16px;display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#4b5563}
      .leg-item{display:flex;align-items:center;gap:5px}
      .leg-dot{width:11px;height:11px;border-radius:3px;display:inline-block}
    `

  const titel = titelZusatz ? `Stundenplan · ${escHtml(titelZusatz)}` : 'Stundenplan'
  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>${css}</style></head>
      <body>
        <h1>${titel}</h1>
        <div class="meta">Erstellt am ${new Date().toLocaleDateString('de-AT')} · Daskala</div>
        <table><thead>${kopf}</thead><tbody>${zeilen}</tbody></table>
        ${legende}
      </body></html>`

  const filePath = await deps.dialog.saveFile({
    defaultName: `stundenplan_${titelZusatz ? deps.dateiTeil(titelZusatz) + '_' : ''}${deps.exportDatum()}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return false
  const buf = await deps.pdf.fromHtml(html, { landscape: true })
  deps.fs.write(filePath, buf)
  return true
}

// Jahresplanung als ODT (tabellarisch, Querformat)
async function jahresplanungOdt(db, deps, fachId) {
  const JSZip = require('jszip')
  const h = await deps.abschnittHierarchie(fachId)
  if (!h) return false
  const abschnitte = await db.select('SELECT * FROM jahresplanung_abschnitte WHERE fach_id=? ORDER BY reihenfolge, id', [fachId])
  if (abschnitte.length === 0) {
    deps.dialog.message({ type: 'info', message: 'Keine Abschnitte in der Jahresplanung vorhanden.' })
    return false
  }
  const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const fdat = (d) => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${parseInt(dd)}.${parseInt(m)}.${y}` }
  // Mehrzeiliger Text → ODT-Absätze (grobe Markdown-Bereinigung, "- " → "• ").
  const absaetze = (raw, style) => {
    const zeilen = String(raw || '').split('\n')
      .map(l => l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^\s*[-*]\s+/, '• ').trimEnd())
      .filter(l => l.trim() !== '')
    if (zeilen.length === 0) return `<text:p text:style-name="${style}"/>`
    return zeilen.map(l => `<text:p text:style-name="${style}">${esc(l)}</text:p>`).join('')
  }
  const matZelle = async (a) => {
    const { dateien, links } = await deps.sammleMaterialien(a.id)
    const items = []
    for (const d of dateien) items.push(`• ${d.anzeigename || d.ref}${d.fehlt ? ' (fehlt)' : ''}`)
    for (const l of links) items.push(`• ${l.anzeigename || l.ref}`)
    if (items.length === 0) return `<text:p text:style-name="PStd"/>`
    return items.map(t => `<text:p text:style-name="PStd">${esc(t)}</text:p>`).join('')
  }
  const zeile = async (a) => {
    const zeitraum = a.datum_von ? `${fdat(a.datum_von)} – ${fdat(a.datum_bis)}` : 'Nicht eingeplant'
    const inhalt = `<text:p text:style-name="PTitel">${esc(a.titel || 'Ohne Titel')}</text:p>` + absaetze(a.inhalt, 'PStd')
    const ziele = (a.lernziele && a.lernziele.trim()) ? absaetze(a.lernziele, 'PStd') : '<text:p text:style-name="PStd">–</text:p>'
    const komp = (a.kompetenzen && a.kompetenzen.trim()) ? absaetze(a.kompetenzen, 'PStd') : '<text:p text:style-name="PStd">–</text:p>'
    return '<table:table-row>'
      + `<table:table-cell table:style-name="Zelle"><text:p text:style-name="${a.datum_von ? 'PZeit' : 'PZeitLeer'}">${esc(zeitraum)}</text:p></table:table-cell>`
      + `<table:table-cell table:style-name="Zelle">${inhalt}</table:table-cell>`
      + `<table:table-cell table:style-name="Zelle">${ziele}</table:table-cell>`
      + `<table:table-cell table:style-name="Zelle">${komp}</table:table-cell>`
      + `<table:table-cell table:style-name="Zelle">${await matZelle(a)}</table:table-cell>`
      + '</table:table-row>'
  }

  let zeilenHtml = ''
  for (const a of abschnitte) zeilenHtml += await zeile(a)

  const content = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">`
    + `<office:automatic-styles>`
    + `<style:style style:name="Tabelle1" style:family="table"><style:table-properties style:width="26.7cm" table:align="margins"/></style:style>`
    + `<style:style style:name="Tabelle1.A" style:family="table-column"><style:table-column-properties style:column-width="3.2cm"/></style:style>`
    + `<style:style style:name="Tabelle1.B" style:family="table-column"><style:table-column-properties style:column-width="8.3cm"/></style:style>`
    + `<style:style style:name="Tabelle1.C" style:family="table-column"><style:table-column-properties style:column-width="5.3cm"/></style:style>`
    + `<style:style style:name="Tabelle1.D" style:family="table-column"><style:table-column-properties style:column-width="5.3cm"/></style:style>`
    + `<style:style style:name="Tabelle1.E" style:family="table-column"><style:table-column-properties style:column-width="4.6cm"/></style:style>`
    + `<style:style style:name="Zelle" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #99a0ad" fo:padding="0.12cm"/></style:style>`
    + `<style:style style:name="Kopf" style:family="table-cell"><style:table-cell-properties fo:border="0.5pt solid #99a0ad" fo:padding="0.14cm" fo:background-color="#4f46e5"/></style:style>`
    + `<style:style style:name="PStd" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.05cm"/><style:text-properties fo:font-size="10pt"/></style:style>`
    + `<style:style style:name="PTitel" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.1cm"/><style:text-properties fo:font-size="11pt" fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="PZeit" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:font-weight="bold" fo:color="#374151"/></style:style>`
    + `<style:style style:name="PZeitLeer" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:font-style="italic" fo:color="#9aa0ac"/></style:style>`
    + `<style:style style:name="PKopf" style:family="paragraph"><style:text-properties fo:font-size="10pt" fo:font-weight="bold" fo:color="#ffffff"/></style:style>`
    + `<style:style style:name="PTitelDoc" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.05cm"/><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>`
    + `<style:style style:name="PMeta" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="9pt" fo:color="#888888"/></style:style>`
    + `</office:automatic-styles>`
    + `<office:body><office:text>`
    + `<text:p text:style-name="PTitelDoc">Jahresplanung – ${esc(h.fach_name)}</text:p>`
    + `<text:p text:style-name="PMeta">${esc(h.klasse_name)} · ${esc(h.schuljahr_bez)} · Exportiert am ${new Date().toLocaleDateString('de-AT')}</text:p>`
    + `<table:table table:name="Jahresplanung" table:style-name="Tabelle1">`
    + `<table:table-column table:style-name="Tabelle1.A"/><table:table-column table:style-name="Tabelle1.B"/><table:table-column table:style-name="Tabelle1.C"/><table:table-column table:style-name="Tabelle1.D"/><table:table-column table:style-name="Tabelle1.E"/>`
    + `<table:table-header-rows><table:table-row>`
    + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Zeitraum</text:p></table:table-cell>`
    + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Inhalt</text:p></table:table-cell>`
    + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Zielsetzungen</text:p></table:table-cell>`
    + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Kompetenzen</text:p></table:table-cell>`
    + `<table:table-cell table:style-name="Kopf"><text:p text:style-name="PKopf">Materialien</text:p></table:table-cell>`
    + `</table:table-row></table:table-header-rows>`
    + zeilenHtml
    + `</table:table></office:text></office:body></office:document-content>`

  const styles = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.2">`
    + `<office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="29.7cm" fo:page-height="21cm" style:print-orientation="landscape" fo:margin-top="1.5cm" fo:margin-bottom="1.5cm" fo:margin-left="1.5cm" fo:margin-right="1.5cm"/></style:page-layout></office:automatic-styles>`
    + `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>`
    + `</office:document-styles>`

  const manifest = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">`
    + `<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>`
    + `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>`
    + `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>`
    + `</manifest:manifest>`

  const filePath = await deps.dialog.saveFile({
    defaultName: `Jahresplanung_${deps.sanitizeSegment(h.fach_name)}_${deps.sanitizeSegment(h.klasse_name)}_${deps.exportDatum()}.odt`,
    filters: [{ name: 'OpenDocument-Text', extensions: ['odt'] }],
  })
  if (!filePath) return false
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('META-INF/manifest.xml', manifest)
  zip.file('styles.xml', styles)
  zip.file('content.xml', content)
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  deps.fs.write(filePath, buf)
  return true
}

// Fach-Planung als DOCX
async function fachPlanungDocx(db, deps, fachId, fachName, klasseName, wochenDaten) {
  const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, BorderStyle, HeadingLevel } = require('docx')

  const WOCHENTAGE = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr']

  // Alle Stundenplan-Slots für dieses Fach
  const fachSlots = await db.select(`
      SELECT st.id, st.wochentag, sz.stunde, sz.beginn, sz.ende
      FROM stundenplan st
      JOIN stundenzeiten sz ON sz.id = st.stunde_id
      WHERE st.fach_id = ?
      ORDER BY st.wochentag, sz.stunde
    `, [fachId])

  if (fachSlots.length === 0) return false

  const slotIds = fachSlots.map(s => s.id)
  const planSql = `
      SELECT sp.*, sp.stundenplan_id
      FROM stunden_planung sp
      WHERE sp.stundenplan_id IN (${slotIds.map(() => '?').join(',')})
        AND sp.woche_datum = ?
    `

  const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
  const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }

  const sections = []
  const exportierteKWs = []

  for (let wi = 0; wi < wochenDaten.length; wi++) {
    const wd = wochenDaten[wi]
    const planungen = await db.select(planSql, [...slotIds, wd.wocheDatum])
    const planMap = {}
    for (const p of planungen) planMap[p.stundenplan_id] = p

    // Nur Wochen mit mindestens einer Planung
    const hatPlanung = fachSlots.some(s => planMap[s.id]?.titel || planMap[s.id]?.inhalt)
    if (!hatPlanung) continue

    // Tabellenzeilen: Header + je eine Zeile pro Slot
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ width: { size: 1800, type: WidthType.DXA }, borders: cellBorders, shading: { fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Stunde', bold: true, size: 18, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, shading: { fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Thema', bold: true, size: 18, font: 'Arial' })] })] }),
        new TableCell({ borders: cellBorders, shading: { fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Inhalt', bold: true, size: 18, font: 'Arial' })] })] }),
        new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, shading: { fill: 'F3F4F6' },
          children: [new Paragraph({ children: [new TextRun({ text: 'HÜ', bold: true, size: 18, font: 'Arial' })] })] }),
      ],
    })

    const dataRows = fachSlots.map(slot => {
      const plan = planMap[slot.id]
      const stundeText = `${WOCHENTAGE[slot.wochentag]} ${slot.stunde}. (${slot.beginn}–${slot.ende})`

      const inhaltParas = (plan?.inhalt || '').split('\n').filter(l => l.trim()).map(line =>
        new Paragraph({ children: [new TextRun({ text: line, size: 18, font: 'Arial' })] })
      )
      if (inhaltParas.length === 0) inhaltParas.push(new Paragraph({ children: [] }))

      return new TableRow({
        children: [
          new TableCell({ width: { size: 1800, type: WidthType.DXA }, borders: cellBorders, verticalAlign: 'top',
            children: [new Paragraph({ children: [new TextRun({ text: stundeText, size: 18, font: 'Arial', color: '666666' })] })] }),
          new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, verticalAlign: 'top',
            children: [new Paragraph({ children: [new TextRun({ text: plan?.titel || '', size: 18, font: 'Arial', bold: !!plan?.titel })] })] }),
          new TableCell({ borders: cellBorders, verticalAlign: 'top', children: inhaltParas }),
          new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: cellBorders, verticalAlign: 'top',
            children: [new Paragraph({ children: [new TextRun({ text: plan?.hue_text || '', size: 18, font: 'Arial', italics: true })] })] }),
        ],
      })
    })

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    })

    exportierteKWs.push(wd.kw)
    sections.push({
      properties: wi > 0 ? { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } } : { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        ...(wi === 0 ? [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${fachName} – ${klasseName}`, font: 'Arial' })] }),
          new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: `Exportiert am ${new Date().toLocaleDateString('de-AT')}`, size: 18, font: 'Arial', color: '999999' })] }),
        ] : []),
        new Paragraph({ spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: `KW ${wd.kw} · ${wd.montagStr} – ${wd.freitagStr}${wd.jahr}`, bold: true, size: 22, font: 'Arial', color: '4F46E5' })] }),
        table,
      ],
    })
  }

  if (sections.length === 0) {
    deps.dialog.message({ type: 'info', message: 'Keine Planungsdaten zum Exportieren vorhanden.' })
    return false
  }

  const doc = new Document({ sections })
  const buf = await Packer.toBuffer(doc)

  const kwMin = Math.min(...exportierteKWs)
  const kwMax = Math.max(...exportierteKWs)
  const kwLabel = kwMin === kwMax ? `KW${kwMin}` : `KW${kwMin}-${kwMax}`

  const filePath = await deps.dialog.saveFile({
    defaultName: `planung_${fachName}_${klasseName}_${kwLabel}.docx`,
    filters: [{ name: 'Word-Dokument', extensions: ['docx'] }],
  })
  if (!filePath) return false
  deps.fs.write(filePath, buf)
  return true
}

// Alle Schüler:innen als ODS (je Klasse+Fach ein Tabellenblatt)
async function allSchuelerOds(db, deps) {
  const XLSX = require('xlsx')
  const aktuellesSchuljahr = await db.selectOne('SELECT * FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1')
  if (!aktuellesSchuljahr) return false
  const filePath = await deps.dialog.saveFile({
    defaultName: `daskala_noten_${deps.dateiTeil(aktuellesSchuljahr.bezeichnung)}_${deps.exportDatum()}.ods`,
    filters: [{ name: 'OpenDocument-Tabelle', extensions: ['ods'] }],
  })
  if (!filePath) return false

  const wb = XLSX.utils.book_new()
  const klassen = await db.select('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY name', [aktuellesSchuljahr.id])

  for (const klasse of klassen) {
    const faecher = await db.select('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name', [klasse.id])
    for (const fach of faecher) {
      const roster = await deps.rosterFuerFach(fach.id)
      if (!roster.length) continue // Fach ohne Roster (auch klassenübergreifende Gruppen) überspringen
      const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge', [fach.id])
      const eintraege = await db.select('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)', [fach.id])
      const zeugnisnoten = await db.select('SELECT * FROM zeugnisnoten WHERE fach_id = ?', [fach.id])
      const entryMap = {}
      eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
      const istDiff = fach.benotungssystem === 'differenziert'
      const niveauMap = {}
      if (istDiff) {
        (await db.select('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?', [fach.id]))
          .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
      }
      const znMap = {}
      zeugnisnoten.forEach(z => {
        znMap[`${z.schueler_id}_${z.semester}`] =
          deps.znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
      })

      const header = ['Name', ...spalten.map(s => `${s.kuerzel}${s.datum ? ' ' + s.datum.slice(5).replace('-', '.') : ''}`), 'ZN']
      const rows = [header]
      for (const s of roster) {
        const badges = [s.lernschwaeche ? 'LS' : null, s.legasthenie ? 'LEG' : null].filter(Boolean)
        const name = `${s.nachname} ${s.vorname}${badges.length ? ' [' + badges.join(' ') + ']' : ''}`
        const row = [name, ...spalten.map(sp => entryMap[`${sp.id}_${s.id}`] ?? ''), znMap[`${s.id}_3`] ?? '']
        rows.push(row)
      }

      const sheetName = `${klasse.name} ${fach.name}`.slice(0, 31)
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName)
    }
  }

  if (wb.SheetNames.length === 0) return false // kein Fach mit Roster → leeres Workbook würde werfen
  XLSX.writeFile(wb, filePath, { bookType: 'ods' })
  return true
}

// Vollständige Notenübersicht (alle Klassen/Fächer eines Schuljahres) als HTML für den PDF-Export.
async function baueNotenUebersichtHtml(db, deps, schuljahr, titelPrefix = '', inklInaktiv = false) {
  const klassen = await db.select('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY name', [schuljahr.id])
  const css = `
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;font-size:10px;color:#1a1a1a}
      @page{size:A4 landscape;margin:1.5cm}
      h1{font-size:18px;font-weight:300;margin-bottom:2px}
      .schuljahr{font-size:10px;color:#666;margin-bottom:20px}
      .klasse-fach{margin-bottom:28px;page-break-inside:avoid}
      .klasse-fach-titel{font-size:13px;font-weight:700;color:#4f46e5;border-bottom:2px solid #6366f1;padding-bottom:3px;margin-bottom:8px}
      table{width:100%;border-collapse:collapse;font-size:9px}
      th{background:#f4f4f5;text-align:center;padding:4px 6px;border:1px solid #e0e0e0;font-weight:600;white-space:nowrap}
      th.name{text-align:left;min-width:120px}
      td{padding:3px 6px;border:1px solid #e0e0e0;text-align:center}
      td.name{text-align:left;font-weight:500}
      td.zn{font-weight:700}
      .badge{font-size:8px;background:#fef3c7;color:#92400e;border-radius:2px;padding:0 2px;margin-left:2px}
      .badge.leg{background:#ede9fe;color:#5b21b6}
      tr:nth-child(even) td{background:#fafafa}
    `
  const escHtml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  let bodyHtml = `<h1>Notenübersicht – Daskala</h1><div class="schuljahr">${titelPrefix}${escHtml(schuljahr.bezeichnung)}</div>`

  for (const klasse of klassen) {
    const faecher = await db.select('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name', [klasse.id])
    for (const fach of faecher) {
      const roster = await deps.rosterFuerFach(fach.id, { inklInaktiv })
      if (!roster.length) continue // Fach ohne Roster überspringen (statt Skip über die Stammklasse)
      const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge', [fach.id])
      const eintraege = await db.select('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)', [fach.id])
      const zeugnisnoten = await db.select('SELECT * FROM zeugnisnoten WHERE fach_id = ?', [fach.id])
      const entryMap = {}
      eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
      const istDiff = fach.benotungssystem === 'differenziert'
      const niveauMap = {}
      if (istDiff) {
        (await db.select('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?', [fach.id]))
          .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
      }
      const znMap = {}
      zeugnisnoten.forEach(z => {
        znMap[`${z.schueler_id}_${z.semester}`] =
          deps.znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
      })

      const thead = `<tr><th class="name">Name</th>${spalten.map(sp =>
        `<th>${escHtml(sp.kuerzel)}${sp.datum ? '<br>' + sp.datum.slice(5).replace('-', '.') : ''}</th>`
      ).join('')}<th>ZN</th></tr>`

      let tbody = ''
      for (const s of roster) {
        const lsBadge = s.lernschwaeche ? '<span class="badge">LS</span>' : ''
        const legBadge = s.legasthenie ? '<span class="badge leg">LEG</span>' : ''
        const cells = spalten.map(sp => `<td>${escHtml(entryMap[`${sp.id}_${s.id}`] ?? '')}</td>`).join('')
        tbody += `<tr><td class="name">${escHtml(s.nachname)} ${escHtml(s.vorname)}${lsBadge}${legBadge}</td>${cells}<td class="zn">${znMap[`${s.id}_3`] ?? ''}</td></tr>`
      }

      bodyHtml += `<div class="klasse-fach"><div class="klasse-fach-titel">${escHtml(klasse.name)} · ${escHtml(fach.name)}</div><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`
    }
  }
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><style>${css}</style></head><body>${bodyHtml}</body></html>`
}

async function allSchuelerPdf(db, deps) {
  const aktuellesSchuljahr = await db.selectOne('SELECT * FROM schuljahre WHERE archiviert = 0 ORDER BY id DESC LIMIT 1')
  if (!aktuellesSchuljahr) return false
  const filePath = await deps.dialog.saveFile({
    defaultName: `daskala_noten_${deps.dateiTeil(aktuellesSchuljahr.bezeichnung)}_${deps.exportDatum()}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return false
  const buf = await deps.pdf.fromHtml(await baueNotenUebersichtHtml(db, deps, aktuellesSchuljahr))
  deps.fs.write(filePath, buf)
  return true
}

// Archiviertes Schuljahr vollständig als PDF exportieren (Notenübersicht aller Klassen/Fächer).
async function archivPdf(db, deps, schuljahrId) {
  const schuljahr = await db.selectOne('SELECT * FROM schuljahre WHERE id = ?', [schuljahrId])
  if (!schuljahr) return false
  const filePath = await deps.dialog.saveFile({
    defaultName: `Daskala_Archiv_${deps.dateiTeil(schuljahr.bezeichnung)}_${deps.exportDatum()}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!filePath) return false
  const buf = await deps.pdf.fromHtml(await baueNotenUebersichtHtml(db, deps, schuljahr, 'Archiv · ', true))
  deps.fs.write(filePath, buf)
  return true
}

// Archiviertes Schuljahr vollständig als ODS exportieren (je Klasse+Fach ein Tabellenblatt).
async function archivOds(db, deps, schuljahrId) {
  const schuljahr = await db.selectOne('SELECT * FROM schuljahre WHERE id = ?', [schuljahrId])
  if (!schuljahr) return false
  const XLSX = require('xlsx')
  const filePath = await deps.dialog.saveFile({
    defaultName: `Daskala_Archiv_${deps.dateiTeil(schuljahr.bezeichnung)}_${deps.exportDatum()}.ods`,
    filters: [{ name: 'OpenDocument-Tabelle', extensions: ['ods'] }],
  })
  if (!filePath) return false

  const klassen = await db.select('SELECT * FROM klassen WHERE schuljahr_id = ? AND ist_vorlage = 0 ORDER BY name', [schuljahrId])
  const wb = XLSX.utils.book_new()
  const usedNames = new Set()
  for (const klasse of klassen) {
    const faecher = await db.select('SELECT * FROM faecher WHERE klasse_id = ? ORDER BY reihenfolge, name', [klasse.id])
    for (const fach of faecher) {
      const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ? ORDER BY semester, reihenfolge', [fach.id])
      const eintraege = await db.select('SELECT * FROM eintraege WHERE spalte_id IN (SELECT id FROM spalten WHERE fach_id = ?)', [fach.id])
      const zeugnisnoten = await db.select('SELECT * FROM zeugnisnoten WHERE fach_id = ?', [fach.id])
      const entryMap = {}
      eintraege.forEach(e => { entryMap[`${e.spalte_id}_${e.schueler_id}`] = e.wert })
      const istDiff = fach.benotungssystem === 'differenziert'
      const niveauMap = {}
      if (istDiff) {
        (await db.select('SELECT schueler_id, niveau FROM schueler_niveau WHERE fach_id = ?', [fach.id]))
          .forEach(r => { niveauMap[r.schueler_id] = r.niveau })
      }
      const znMap = {}
      zeugnisnoten.forEach(z => {
        znMap[`${z.schueler_id}_${z.semester}`] =
          deps.znInternZuAnzeige(z.note_manuell ?? z.note_berechnet, niveauMap[z.schueler_id] ?? 'AHS', istDiff)
      })

      const header = ['Name', ...spalten.map(s => `${s.kuerzel}${s.datum ? ' ' + s.datum : ''}`), 'ZN']
      const rows = [header]
      for (const s of await deps.rosterFuerFach(fach.id, { inklInaktiv: true })) {
        const row = [`${s.nachname} ${s.vorname}`]
        for (const sp of spalten) row.push(entryMap[`${sp.id}_${s.id}`] ?? '')
        row.push(znMap[`${s.id}_3`] ?? '')
        rows.push(row)
      }

      const ws = XLSX.utils.aoa_to_sheet(rows)
      // Blattname: max. 31 Zeichen, ohne Sonderzeichen, eindeutig
      let basis = `${klasse.name} ${fach.name}`.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Blatt'
      let name = basis, i = 2
      while (usedNames.has(name)) { name = basis.slice(0, 28) + '~' + i; i++ }
      usedNames.add(name)
      XLSX.utils.book_append_sheet(wb, ws, name)
    }
  }
  if (wb.SheetNames.length === 0) return false
  XLSX.writeFile(wb, filePath, { bookType: 'ods' })
  return true
}

module.exports = {
  toJson, fachOds, planungPdf, stundenplanPdf, jahresplanungOdt, fachPlanungDocx,
  allSchuelerOds, allSchuelerPdf, archivPdf, archivOds, baueNotenUebersichtHtml,
}
