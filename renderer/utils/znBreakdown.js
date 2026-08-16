// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Reine (Renderer-seitige) Nachbildung der Zeugnisnoten-Berechnung aus
// core/services/notenberechnung.js. Wird für Live-Vorschauen genutzt (Tooltip in der
// ZN-Zelle, Entwurfs-Vorschau im Zeugnisnote-Modal), damit die Anzeige EXAKT der später
// im Kern gespeicherten Note entspricht. Muss inhaltlich mit dem Kern übereinstimmen.
import { niveauOffset, niveauZurZeit } from './niveau.js'

// Spiegelt core: mehrstufige MA-Symbolliste (eigene oder Default). Länge nach ma_stufen (3/4).
export const MA_SMILEYS_DEFAULT = ['😄', '🙂', '🙁', '😞']
export const MA_DREI_DEFAULT = ['+', '~', '-']

export function maSymboleVon(spalte) {
  const len = spalte.ma_stufen === 3 ? 3 : 4
  if (spalte.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === len) return arr
    } catch { /* Default */ }
  }
  return len === 3 ? MA_DREI_DEFAULT : MA_SMILEYS_DEFAULT
}

// Spiegelt core maTeilnote: Teilnote 1–5 einer MA-Aufzeichnung (positionsbasiert bei 3-/4-stufig,
// direkt bei 2-stufig). null = kein gültiger Eintrag.
export function maTeilnote(spalte, wert) {
  if (spalte.ma_stufen === 3) { const i = maSymboleVon(spalte).indexOf(wert); return [1, 3, 5][i] ?? null }
  if (spalte.ma_stufen === 4) { const i = maSymboleVon(spalte).indexOf(wert); return [1, 2, 4, 5][i] ?? null }
  if (wert === '+') return 1
  if (wert === '-') return 5
  return null
}

// Lineares Rang-Gewicht (§ 20 LBVO): ältester Eintrag i=0 → 1, neuester i=m-1 → faktor.
// m<2 oder faktor<=1 → 1 (kein Rezenz-Effekt). Eine Quelle für gewichteterSchnitt + Modal-Graph.
export function rangGewicht(i, m, faktor) {
  const f = Number(faktor)
  if (!(f > 1) || m < 2) return 1
  return 1 + (f - 1) * (i / (m - 1))
}

// Spiegelt core/services/notenberechnung.js:gewichteterSchnitt (§ 20 LBVO), damit die
// Vorschau exakt der berechneten Note entspricht. werte = [{ n, datum, semester, reihenfolge }].
export function gewichteterSchnitt(werte, faktor) {
  const m = werte.length
  if (m === 0) return 0
  const f = Number(faktor)
  if (!(f > 1) || m < 2) return werte.reduce((a, w) => a + w.n, 0) / m
  const sortiert = [...werte].sort((a, b) => {
    const da = a.datum || '', db2 = b.datum || ''
    if (da !== db2) return da < db2 ? -1 : 1
    if ((a.semester ?? 0) !== (b.semester ?? 0)) return (a.semester ?? 0) - (b.semester ?? 0)
    return (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0)
  })
  let summe = 0, gew = 0
  sortiert.forEach((w, i) => {
    const g = rangGewicht(i, m, f)
    summe += w.n * g
    gew += g
  })
  return summe / gew
}

const KAT_LABEL = { SA: 'SA', T: 'T', CUSTOM: 'Ind.', MA: 'Mitarb.' }

// Kettet die note-bildenden Einträge (SA/Test/Individuell/Mitarbeit) eines Schülers zu einer
// durchgehenden Note zusammen. Rein: nimmt Entwurfs-Einträge + beliebigen Rezenzfaktor entgegen.
//   eintraege: Map `${spalteId}_${schuelerId}` → Wert (String)
//   gewichtung: aufgelöstes { SA, T, CUSTOM, MA }
//   maNoteManuell: interner Wert (1–7) einer manuell gesetzten Mitarbeitsnote oder null/undefined
// → { beitraege, gesamtGewichtung, maxNote, basisIntern, hatBasis, hatMitarbeit, hatBasisNoten,
//     ma, hue, maBerechnet }
export function computeZN({ spalten, eintraege, gewichtung, rezenzFaktor, istDifferenziert, niveauHistorie, niveauFallback, schuelerId, maNoteManuell = null }) {
  const fachSpalten = spalten || []
  if (!fachSpalten.length) return null

  const maxNote = istDifferenziert ? 7 : 5
  // Wie im Kern (notenberechnung.js): undatierte note-bildende Spalten gelten als "älteste" →
  // ohne Datum das älteste bekannte Niveau, nicht das aktuelle (niveauZurZeit(...,'') gäbe sonst
  // das NEUESTE). niveauHistorie ist absteigend nach gueltig_ab → letztes Element = ältestes.
  const aeltestesNiveau = (Array.isArray(niveauHistorie) && niveauHistorie.length)
    ? niveauHistorie[niveauHistorie.length - 1].niveau
    : (niveauFallback ?? 'AHS')
  const offsetFor = (datum) => istDifferenziert
    ? niveauOffset(datum ? niveauZurZeit(niveauHistorie, datum, niveauFallback ?? 'AHS') : aeltestesNiveau)
    : 0
  const faktor = parseFloat(rezenzFaktor ?? '1')

  const gew = {
    SA:     gewichtung?.SA     ?? 0.4,
    T:      gewichtung?.T      ?? 0.3,
    CUSTOM: gewichtung?.CUSTOM ?? 0.1,
    MA:     gewichtung?.MA     ?? 0.2,
  }

  const basis = { SA: { werte: [], eingaben: [] }, T: { werte: [], eingaben: [] }, CUSTOM: { werte: [], eingaben: [] } }
  // Mitarbeit: alle Teilnoten (Bonus/Malus + Hausübung, intern inkl. Niveau-Offset) sammeln.
  const maTeilnoten = []
  let maPlusCount = 0, maMinusCount = 0, huePos = 0, hueNeg = 0

  for (const spalte of fachSpalten) {
    const wert = eintraege[`${spalte.id}_${schuelerId}`] ?? ''
    if (!wert) continue
    if (spalte.kategorie === 'MA') {
      const t = maTeilnote(spalte, wert)
      if (t !== null) { maTeilnoten.push(t + offsetFor(spalte.datum)); if (t < 3) maPlusCount++; else if (t > 3) maMinusCount++ }
    } else if (spalte.kategorie === 'HÜ') {
      if      (wert === '✓') { huePos++; maTeilnoten.push(1 + offsetFor(spalte.datum)) }
      else if (wert === '✗') { hueNeg++; maTeilnoten.push(5 + offsetFor(spalte.datum)) }
      // '—' = "nicht gewertet / entfällt": zählt nicht mit.
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
      const n = parseInt(wert)
      if (n >= 1 && n <= 5) { basis[spalte.kategorie].werte.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge }); basis[spalte.kategorie].eingaben.push(n) }
    } else if (spalte.kategorie === 'CUSTOM') {
      const n = parseInt(wert)
      if (!isNaN(n) && n >= 1 && n <= 5) { basis.CUSTOM.werte.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge }); basis.CUSTOM.eingaben.push(n) }
    }
  }

  // Berechnete Mitarbeitsnote (Teilnoten-Schnitt); eine manuelle Mitarbeitsnote (§ 4 Abs. 2 –
  // Gesamtbeurteilung) überschreibt sie. Mitarbeit gilt als vorhanden, sobald Teilnoten ODER
  // eine manuelle Note existieren (relevant für § 3 und die MA-Beitragszeile).
  const maBerechnet = maTeilnoten.length > 0 ? maTeilnoten.reduce((a, n) => a + n, 0) / maTeilnoten.length : null
  const maEffektiv = maNoteManuell != null ? maNoteManuell : maBerechnet
  const hatMitarbeit = maEffektiv != null

  // Basisnote (gewichtet, nur vorhandene Kategorien). SA/Test/Individuell zuerst.
  const beitraege = []
  let gesamtGewichtung = 0, summe = 0
  let hatBasisNoten = false  // SA/T/CUSTOM vorhanden (für § 3-Warnung)
  for (const kat of ['SA', 'T', 'CUSTOM']) {
    const werte = basis[kat].werte
    if (!werte.length || gew[kat] <= 0) continue
    hatBasisNoten = true
    const avg = gewichteterSchnitt(werte, faktor)
    beitraege.push({ kat: KAT_LABEL[kat], detail: basis[kat].eingaben.join(', '), avg, w: gew[kat] })
    summe += avg * gew[kat]
    gesamtGewichtung += gew[kat]
  }
  // Mitarbeit als eigene note-bildende Zeile (manuelle Note oder Teilnoten-Schnitt).
  if (hatMitarbeit && gew.MA > 0) {
    let detail
    if (maNoteManuell != null) {
      detail = 'manuell'
    } else {
      const teile = []
      if (maPlusCount) teile.push(`+${maPlusCount}`)
      if (maMinusCount) teile.push(`−${maMinusCount}`)
      if (huePos) teile.push(`✓${huePos}`)
      if (hueNeg) teile.push(`✗${hueNeg}`)
      detail = teile.join(' ')
    }
    beitraege.push({ kat: KAT_LABEL.MA, detail, avg: maEffektiv, w: gew.MA })
    summe += maEffektiv * gew.MA
    gesamtGewichtung += gew.MA
  }
  const hatBasis = gesamtGewichtung > 0
  const basisIntern = hatBasis ? summe / gesamtGewichtung : null

  return {
    beitraege, gesamtGewichtung, maxNote, basisIntern, hatBasis,
    hatMitarbeit, hatBasisNoten, maBerechnet,
    ma: { plus: maPlusCount, minus: maMinusCount }, hue: { pos: huePos, neg: hueNeg },
  }
}
