// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
// Zentraler Date-Helper für Daskala. Alle Funktionen nutzen lokale Zeitzone und
// erwarten Strings im Format YYYY-MM-DD (ISO) oder Date-Objekte.

// ─── ISO-Kalenderwoche ──────────────────────────────────────────────────────
// Gibt { kw, jahr } zurück (KW-Jahr kann vom Kalenderjahr abweichen am Jahreswechsel).
export function getKalenderwoche(dateOrStr) {
  const d = typeof dateOrStr === 'string'
    ? new Date(dateOrStr + 'T00:00:00')
    : new Date(dateOrStr)
  const dayNum = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dayNum)         // Donnerstag dieser KW
  const jahr = d.getFullYear()
  const yearStart = new Date(jahr, 0, 1)
  const kw = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return { kw, jahr }
}

// Datum als YYYY-MM-DD-String (lokale Zeit, kein UTC-Shift)
export function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Montag der KW
export function getMontag(jahr, kw) {
  // ISO 8601: erste KW enthält den 4. Januar
  const jan4 = new Date(jahr, 0, 4)
  const jan4Dow = jan4.getDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - jan4Dow + 1)
  const target = new Date(week1Monday)
  target.setDate(week1Monday.getDate() + (kw - 1) * 7)
  return target
}

// Heutige KW + Jahr
export function getCurrentKW() {
  return getKalenderwoche(new Date())
}

// Liste der letzten n KW + aktuelle + nächste m KW (z.B. {n:8, m:2} → 11 Wochen)
export function getKWBereich(n = 8, m = 2) {
  const heute = new Date()
  const ergebnis = []
  for (let i = -n; i <= m; i++) {
    const d = new Date(heute)
    d.setDate(heute.getDate() + i * 7)
    const { kw, jahr } = getKalenderwoche(d)
    const mo = getMontag(jahr, kw)
    ergebnis.push({ kw, jahr, montag: toLocalDateStr(mo), istAktuell: i === 0 })
  }
  return ergebnis
}

// ─── Schuljahr ──────────────────────────────────────────────────────────────
// Bezeichnung wie "2026/27" → Startjahr (2026)
export function getSchuljahrStartJahr(bezeichnung) {
  if (!bezeichnung) return new Date().getFullYear()
  const m = String(bezeichnung).match(/(\d{4})/)
  return m ? parseInt(m[1], 10) : new Date().getFullYear()
}

// Erster Schultag (1. Montag im September) als YYYY-MM-DD
export function getSchuljahrStart(bezeichnung) {
  const startYear = getSchuljahrStartJahr(bezeichnung)
  const sep1 = new Date(startYear, 8, 1)
  const dow = sep1.getDay() // 0=So, 1=Mo, ..., 6=Sa
  const daysToMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow)
  return toLocalDateStr(new Date(startYear, 8, 1 + daysToMonday))
}

// Letzter Schultag (30. Juni des Folgejahres) — Default-Fallback
export function getSchuljahrEnde(bezeichnung) {
  const startYear = getSchuljahrStartJahr(bezeichnung)
  return toLocalDateStr(new Date(startYear + 1, 5, 30))
}

// Monatsname (Locale de-AT)
const MONATSNAMEN = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
                     'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export function monatsName(monat /* 1-12 */) {
  return MONATSNAMEN[monat - 1] ?? '—'
}

// Reihenfolge der Monate im Schuljahr (Sep, Okt, …, Aug)
export const SCHULJAHR_MONATE = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]

// ─── Kalender-Raster ──────────────────────────────────────────────────────────
// n Tage ab einem Startdatum als YYYY-MM-DD-Strings.
export function addDaysStr(datumStr, n) {
  const d = new Date(datumStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return toLocalDateStr(d)
}

// Montag der Woche, in der `datumStr` liegt.
export function montagDerWoche(datumStr) {
  const d = new Date(datumStr + 'T00:00:00')
  const dow = d.getDay() || 7            // So=7
  d.setDate(d.getDate() - (dow - 1))
  return toLocalDateStr(d)
}

// Die 7 Tage (Mo–So) der Woche von `datumStr` als YYYY-MM-DD-Strings.
export function getWochenTage(datumStr) {
  const mo = montagDerWoche(datumStr)
  return Array.from({ length: 7 }, (_, i) => addDaysStr(mo, i))
}

// Monatsraster (Montag-first) für (jahr, monat 1-12): Array von Wochen à 7 Tagen.
// Auffüllung mit Tagen aus Vor-/Folgemonat, damit ganze Wochenzeilen entstehen.
// Jeder Tag: { datum: 'YYYY-MM-DD', imMonat: boolean }.
export function getMonatsWochen(jahr, monat /* 1-12 */) {
  const startDow = (new Date(jahr, monat - 1, 1).getDay() + 6) % 7   // 0=Mo … 6=So
  const letzterDatum = toLocalDateStr(new Date(jahr, monat, 0))      // letzter Tag des Monats
  const wochen = []
  let cursor = toLocalDateStr(new Date(jahr, monat - 1, 1 - startDow))
  let guard = 0
  while (guard++ < 6) {
    const woche = Array.from({ length: 7 }, (_, i) => {
      const datum = addDaysStr(cursor, i)
      return { datum, imMonat: new Date(datum + 'T00:00:00').getMonth() === monat - 1 }
    })
    wochen.push(woche)
    const letzterDerWoche = woche[6].datum
    cursor = addDaysStr(cursor, 7)
    if (letzterDerWoche >= letzterDatum) break   // Monat vollständig abgedeckt
  }
  return wochen
}
