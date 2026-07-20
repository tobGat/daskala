// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
// Österreichische Schulferien – berechnet aus festen Regeln (kein Netzwerk/KI nötig)
// Quellen: SchZG (Schulzeitgesetz), BMBWF Ferienverordnungen

// ─── Osterdatum (Gauss-Algorithmus / Anonymous Gregorian) ─────────────────────
function ostersonntag(jahr) {
  const a = jahr % 19
  const b = Math.floor(jahr / 100)
  const c = jahr % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const monat = Math.floor((h + l - 7 * m + 114) / 31)
  const tag = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(jahr, monat - 1, tag)
}

function addTage(date, tage) {
  const d = new Date(date)
  d.setDate(d.getDate() + tage)
  return d
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Semesterferien-Gruppen ──────────────────────────────────────────────────
// Ost (Gruppe 1): Wien, Niederösterreich, Burgenland → 1. Woche im Februar
// West (Gruppe 2): OÖ, Stmk, Ktn, Sbg, Tirol, Vbg → 2. Woche im Februar
const BUNDESLAND_GRUPPE = {
  'Wien': 'ost',
  'Niederösterreich': 'ost',
  'Burgenland': 'ost',
  'Oberösterreich': 'west',
  'Steiermark': 'west',
  'Kärnten': 'west',
  'Salzburg': 'west',
  'Tirol': 'west',
  'Vorarlberg': 'west',
}

// ─── Ferien berechnen ────────────────────────────────────────────────────────
// schuljahr: z.B. "2025/26" → startJahr = 2025
export function berechneSchulferien(schuljahr, bundesland) {
  if (!schuljahr || !bundesland) return null
  const startJahr = parseInt(schuljahr.split('/')[0])
  if (isNaN(startJahr)) return null

  const jahr1 = startJahr      // Herbst des Schuljahres (Sep-Dez)
  const jahr2 = startJahr + 1  // Frühling des Schuljahres (Jän-Jul)
  const gruppe = BUNDESLAND_GRUPPE[bundesland]
  if (!gruppe) return null

  const ostern = ostersonntag(jahr2)
  const ferien = []

  // 1. Herbstferien: 26.10. – 2.11. (Nationalfeiertag + Allerheiligen)
  ferien.push({
    name: 'Herbstferien',
    von: `${jahr1}-10-26`,
    bis: `${jahr1}-11-02`,
  })

  // 2. Weihnachtsferien: 24.12. – 6.1.
  ferien.push({
    name: 'Weihnachtsferien',
    von: `${jahr1}-12-24`,
    bis: `${jahr2}-01-06`,
  })

  // 3. Semesterferien (1 Woche im Februar)
  // Ost: 1. Montag im Februar (Woche mit dem 1. Montag)
  // West: 2. Montag im Februar
  const feb1 = new Date(jahr2, 1, 1) // 1. Februar
  let ersterMontag = new Date(feb1)
  const dow = ersterMontag.getDay()
  if (dow === 0) ersterMontag.setDate(ersterMontag.getDate() + 1)
  else if (dow > 1) ersterMontag.setDate(ersterMontag.getDate() + (8 - dow))
  // ersterMontag ist jetzt der 1. Montag im Februar

  const semesterMontag = gruppe === 'ost'
    ? ersterMontag
    : addTage(ersterMontag, 7)
  const semesterSamstag = addTage(semesterMontag, 5)

  ferien.push({
    name: 'Semesterferien',
    von: toDateStr(semesterMontag),
    bis: toDateStr(semesterSamstag),
  })

  // 4. Osterferien: Samstag vor Palmsonntag bis Ostermontag
  // (Osterdienstag ist seit der SchZG-Novelle 2019 KEIN schulfreier Tag mehr)
  // Palmsonntag = Ostern - 7, Samstag davor = Ostern - 8
  const osterferienVon = addTage(ostern, -8)
  const osterferienBis = addTage(ostern, 1)  // Ostermontag
  ferien.push({
    name: 'Osterferien',
    von: toDateStr(osterferienVon),
    bis: toDateStr(osterferienBis),
  })

  // 5. Pfingstferien: Samstag vor Pfingsten bis Pfingstmontag
  // (Pfingstdienstag ist seit der SchZG-Novelle 2019 KEIN schulfreier Tag mehr)
  // Pfingsten = Ostern + 49
  const pfingsten = addTage(ostern, 49)
  const pfingstferienVon = addTage(pfingsten, -1) // Samstag
  const pfingstferienBis = addTage(pfingsten, 1)  // Pfingstmontag
  ferien.push({
    name: 'Pfingstferien',
    von: toDateStr(pfingstferienVon),
    bis: toDateStr(pfingstferienBis),
  })

  // 6. Sommerferien:
  // Ost (Wien, NÖ, Burgenland): erster Samstag im Juli
  // West (OÖ, Stmk, Ktn, Sbg, Tirol, Vbg): zweiter Samstag im Juli
  // Ende: erster Sonntag im September (für alle gleich)
  let ersterSamstagJuli = new Date(jahr2, 6, 1) // 1. Juli
  while (ersterSamstagJuli.getDay() !== 6) ersterSamstagJuli.setDate(ersterSamstagJuli.getDate() + 1)
  const sommerVon = gruppe === 'ost' ? ersterSamstagJuli : addTage(ersterSamstagJuli, 7)
  let sommerBis = new Date(jahr2, 8, 1) // 1. September
  while (sommerBis.getDay() !== 0) sommerBis.setDate(sommerBis.getDate() + 1)

  ferien.push({
    name: 'Sommerferien',
    von: toDateStr(sommerVon),
    bis: toDateStr(sommerBis),
  })

  // 7. Alle gesetzlichen Feiertage Österreichs
  const alleFeiertage = [
    // Herbst/Winter (jahr1)
    { name: 'Nationalfeiertag', datum: `${jahr1}-10-26` },
    { name: 'Allerheiligen', datum: `${jahr1}-11-01` },
    { name: 'Mariä Empfängnis', datum: `${jahr1}-12-08` },
    { name: 'Christtag', datum: `${jahr1}-12-25` },
    { name: 'Stefanitag', datum: `${jahr1}-12-26` },
    // Frühling/Sommer (jahr2)
    { name: 'Neujahr', datum: `${jahr2}-01-01` },
    { name: 'Heilige Drei Könige', datum: `${jahr2}-01-06` },
    { name: 'Ostermontag', datum: toDateStr(addTage(ostern, 1)) },
    { name: 'Staatsfeiertag', datum: `${jahr2}-05-01` },
    { name: 'Christi Himmelfahrt', datum: toDateStr(addTage(ostern, 39)) },
    { name: 'Pfingstmontag', datum: toDateStr(addTage(ostern, 50)) },
    { name: 'Fronleichnam', datum: toDateStr(addTage(ostern, 60)) },
    { name: 'Mariä Himmelfahrt', datum: `${jahr2}-08-15` },
  ]

  // Feiertage filtern: nur jene anzeigen, die NICHT in einem Ferienzeitraum liegen
  const feiertage = alleFeiertage.filter(ft =>
    !ferien.some(f => ft.datum >= f.von && ft.datum <= f.bis)
  )

  return { ferien, feiertage }
}

// Berechnete Ferien mit benutzerdefinierten zusammenführen
// customFerien = [{ name, von, bis }] aus der DB
export function mergeFerien(berechneteFerien, customFerien) {
  if (!berechneteFerien) return null
  if (!customFerien || customFerien.length === 0) return berechneteFerien

  // Custom-Ferien ersetzen komplett die berechneten Ferien + Feiertage
  // (Der User hat volle Kontrolle)
  const ferien = customFerien.map(f => ({ name: f.name, von: f.von, bis: f.bis }))
  return { ferien, feiertage: [] }
}

// Prüft ob ein Datum (YYYY-MM-DD) in einer Ferienzeit liegt
export function ferienFuerTag(dateStr, schulferien) {
  if (!schulferien) return null
  const { ferien, feiertage } = schulferien
  for (const f of ferien) {
    if (dateStr >= f.von && dateStr <= f.bis) return f
  }
  for (const ft of feiertage) {
    if (dateStr === ft.datum) return { name: ft.name, von: ft.datum, bis: ft.datum }
  }
  return null
}

// Prüft ob ein bestimmter Wochentag (1=Mo..5=Fr) in einer bestimmten Woche (wocheDatum = Montag YYYY-MM-DD) in den Ferien liegt
export function istFerientag(wocheDatum, wochentag, schulferien) {
  if (!schulferien) return false
  const d = new Date(wocheDatum + 'T00:00:00')
  d.setDate(d.getDate() + (wochentag - 1)) // 1=Mo → +0, 5=Fr → +4
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return !!ferienFuerTag(dateStr, schulferien)
}
