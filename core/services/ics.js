// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: iCalendar-(ICS-)Parser (RFC 5545), abhängigkeitsfrei.
// parseIcs(text, opts) -> Array von Terminen:
//   { uid, titel, datum, bisDatum, uhrzeit, bisUhrzeit, ganztags, ort, beschreibung }
// - Zeiten werden als lokale Wandzeit interpretiert; UTC-Werte (…Z) werden nach
//   Europe/Vienna umgerechnet (EU-Sommerzeit-Regel). TZID wird als lokal angenommen.
// - Einfache Serien (RRULE FREQ=DAILY|WEEKLY, INTERVAL/COUNT/UNTIL/BYDAY, EXDATE)
//   werden innerhalb des Horizont-Fensters in Einzeltermine aufgelöst; komplexere
//   Regeln fallen auf den Basistermin zurück.

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

// ── Datums-Arithmetik über ganzzahlige Tages-Indizes (UTC, keine TZ-Drift) ──
const toDays = (datum) => { const [y, m, d] = datum.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const fromDays = (n) => isoDate(new Date(n * 86400000))
const addDays = (datum, n) => fromDays(toDays(datum) + n)
const weekdayOf = (datum) => new Date(toDays(datum) * 86400000).getUTCDay() // 0=So … 6=Sa

// Letzter Sonntag eines Monats um 01:00 UTC (EU-Sommerzeit-Umschaltpunkt).
function lastSundayUtc(year, monthIdx) {
  const d = new Date(Date.UTC(year, monthIdx + 1, 0, 1, 0, 0)) // letzter Tag des Monats
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.getTime()
}
function euSommerzeit(ms) {
  const year = new Date(ms).getUTCFullYear()
  return ms >= lastSundayUtc(year, 2) && ms < lastSundayUtc(year, 9) // März … Oktober
}
const wienOffsetStunden = (ms) => (euSommerzeit(ms) ? 2 : 1)

// RFC-5545-Text-Escapes zurückübersetzen.
function unescapeText(s) {
  return (s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

// Gefaltete Zeilen (Fortsetzung mit führendem Space/Tab) wieder zusammenführen.
function unfold(text) {
  const zeilen = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out = []
  for (const z of zeilen) {
    if ((z.startsWith(' ') || z.startsWith('\t')) && out.length) out[out.length - 1] += z.slice(1)
    else out.push(z)
  }
  return out
}

// Eine Property-Zeile „NAME;PARAM=VAL:VALUE" zerlegen.
function parseLine(line) {
  const idx = line.indexOf(':')
  if (idx === -1) return null
  const links = line.slice(0, idx)
  const value = line.slice(idx + 1)
  const teile = links.split(';')
  const name = teile[0].toUpperCase()
  const params = {}
  for (let i = 1; i < teile.length; i++) {
    const eq = teile[i].indexOf('=')
    if (eq === -1) continue
    params[teile[i].slice(0, eq).toUpperCase()] = teile[i].slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

// DTSTART/DTEND-Wert -> { datum, uhrzeit|null, ganztags }.
function parseDatumZeit(value, params) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/)
  if (!m) return null
  const [, y, mo, d, hh, mi, ss, z] = m
  const nurDatum = params.VALUE === 'DATE' || hh === undefined
  if (nurDatum) return { datum: `${y}-${mo}-${d}`, uhrzeit: null, ganztags: true }
  if (z === 'Z') {
    const ms = Date.UTC(+y, +mo - 1, +d, +hh, +mi, ss ? +ss : 0)
    const lokal = new Date(ms + wienOffsetStunden(ms) * 3600000)
    return { datum: isoDate(lokal), uhrzeit: `${pad(lokal.getUTCHours())}:${pad(lokal.getUTCMinutes())}`, ganztags: false }
  }
  return { datum: `${y}-${mo}-${d}`, uhrzeit: `${hh}:${mi}`, ganztags: false }
}

// Alle Datums-Anteile eines (ggf. mehrwertigen) EXDATE einsammeln.
function exdateSammeln(value) {
  return String(value).split(',').map(v => {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null
  }).filter(Boolean)
}

const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const montagOffset = (wd) => (wd + 6) % 7 // So=6, Mo=0 … (Woche beginnt Montag)

function parseRrule(value) {
  const r = {}
  for (const teil of String(value).split(';')) {
    const eq = teil.indexOf('=')
    if (eq === -1) continue
    r[teil.slice(0, eq).toUpperCase()] = teil.slice(eq + 1)
  }
  return r
}

// Serie in eine Liste von Start-Datums-Strings auflösen (chronologisch, dedupliziert).
function serieAufloesen(baseDatum, rrule, exdates, horizonVon, horizonBis, maxOcc) {
  const freq = (rrule.FREQ || '').toUpperCase()
  const interval = Math.max(1, parseInt(rrule.INTERVAL) || 1)
  const count = rrule.COUNT ? Math.max(1, parseInt(rrule.COUNT) || 1) : null
  const untilM = rrule.UNTIL ? String(rrule.UNTIL).match(/^(\d{4})(\d{2})(\d{2})/) : null
  const until = untilM ? `${untilM[1]}-${untilM[2]}-${untilM[3]}` : null
  const byday = rrule.BYDAY ? rrule.BYDAY.split(',').map(s => WD[s.trim().slice(-2).toUpperCase()]).filter(v => v != null) : null
  const exset = new Set(exdates)

  // Nicht unterstützte Frequenz -> nur der Basistermin.
  if (freq !== 'DAILY' && freq !== 'WEEKLY') {
    return (baseDatum >= horizonVon && baseDatum <= horizonBis && !exset.has(baseDatum)) ? [baseDatum] : []
  }

  const result = []
  let erzeugt = 0
  let stop = false
  const consider = (dt) => {
    if (until && dt > until) { stop = true; return }
    erzeugt++
    if (dt >= horizonVon && dt <= horizonBis && !exset.has(dt)) result.push(dt)
    if (count && erzeugt >= count) stop = true
    if (!count && !until && dt > horizonBis) stop = true
    if (result.length >= maxOcc || erzeugt > 4000) stop = true
  }

  if (freq === 'WEEKLY' && byday && byday.length) {
    const sortiert = [...new Set(byday)].sort((a, b) => montagOffset(a) - montagOffset(b))
    let wochenStart = addDays(baseDatum, -montagOffset(weekdayOf(baseDatum))) // Montag der Startwoche
    while (!stop) {
      for (const wd of sortiert) {
        const dt = addDays(wochenStart, montagOffset(wd))
        if (dt < baseDatum) continue
        consider(dt)
        if (stop) break
      }
      wochenStart = addDays(wochenStart, 7 * interval)
    }
  } else {
    const step = freq === 'WEEKLY' ? 7 * interval : interval
    let cur = baseDatum
    while (!stop) { consider(cur); cur = addDays(cur, step) }
  }
  return result
}

// Horizont-Standard: großzügiges Fenster um „heute" (nur relevant für endlose Serien).
function standardHorizont() {
  const j = new Date().getFullYear()
  return { von: `${j - 1}-08-01`, bis: `${j + 2}-08-31` }
}

function parseIcs(text, opts = {}) {
  const std = standardHorizont()
  const horizonVon = opts.horizonVon || std.von
  const horizonBis = opts.horizonBis || std.bis
  const maxOcc = opts.maxOccurrences || 750

  const zeilen = unfold(text)
  const events = []
  let cur = null
  for (const line of zeilen) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) fertigstellen(cur, events, horizonVon, horizonBis, maxOcc)
      cur = null
      continue
    }
    if (!cur) continue
    const p = parseLine(line)
    if (!p) continue
    switch (p.name) {
      case 'UID': cur.uid = p.value.trim(); break
      case 'SUMMARY': cur.titel = unescapeText(p.value); break
      case 'LOCATION': cur.ort = unescapeText(p.value); break
      case 'DESCRIPTION': cur.beschreibung = unescapeText(p.value); break
      case 'DTSTART': cur.start = parseDatumZeit(p.value, p.params); break
      case 'DTEND': cur.end = parseDatumZeit(p.value, p.params); break
      case 'RRULE': cur.rrule = parseRrule(p.value); break
      case 'EXDATE': cur.exdates.push(...exdateSammeln(p.value)); break
      default: break
    }
  }
  return events
}

// Ein geparstes VEVENT in ein oder mehrere Termin-Objekte übersetzen.
function fertigstellen(cur, events, horizonVon, horizonBis, maxOcc) {
  const start = cur.start
  const titel = (cur.titel || '').trim() || '(Termin)'
  // Zeit-/Datums-Spanne aus DTEND ableiten.
  let bisUhrzeit = null
  let spanTage = 0
  if (cur.end) {
    if (start.ganztags) {
      // DTEND ist bei Ganztags exklusiv -> letzter Tag = DTEND − 1 Tag.
      spanTage = Math.max(0, toDays(cur.end.datum) - toDays(start.datum) - 1)
    } else {
      bisUhrzeit = cur.end.uhrzeit
      spanTage = Math.max(0, toDays(cur.end.datum) - toDays(start.datum))
    }
  }

  const startDaten = cur.rrule
    ? serieAufloesen(start.datum, cur.rrule, cur.exdates, horizonVon, horizonBis, maxOcc)
    : [start.datum]

  for (const datum of startDaten) {
    const bisDatum = spanTage > 0 ? addDays(datum, spanTage) : null
    events.push({
      uid: cur.uid || null,
      titel,
      datum,
      bisDatum,
      uhrzeit: start.uhrzeit,
      bisUhrzeit,
      ganztags: start.ganztags ? 1 : 0,
      ort: cur.ort || null,
      beschreibung: cur.beschreibung || null,
    })
  }
}

module.exports = { parseIcs }
