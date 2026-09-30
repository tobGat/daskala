// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Abgleich abonnierter webcal-/ICS-Kalender (z. B. EduPage).
// `deps` = { http, logError }: http ist der HttpPort (getText), logError protokolliert.
// Netzwerk + Parse leben hier; die DB-Schreibvorgänge übernimmt core/domain/kalender.js
// (vom Aufrufer orchestriert). Reine, DB-freie Logik → gut testbar.

const { parseIcs } = require('./ics')

// webcal:// → https:// (nur HTTPS, da der HttpPort auf node:https basiert).
function webcalZuHttps(url) {
  const u = String(url || '').trim()
  if (!u) return null
  if (/^webcal:\/\//i.test(u)) return u.replace(/^webcal:\/\//i, 'https://')
  if (/^http:\/\//i.test(u)) return u.replace(/^http:\/\//i, 'https://')
  if (/^https:\/\//i.test(u)) return u
  return null
}

// Datums-Fenster eines Schuljahres: start_/end_datum, sonst aus „2025/26" abgeleitet.
function schuljahrFenster(sj) {
  if (sj?.start_datum && sj?.end_datum) return { von: sj.start_datum, bis: sj.end_datum }
  const m = String(sj?.bezeichnung || '').match(/(\d{4})\s*\/\s*\d{2,4}/)
  if (m) { const y1 = parseInt(m[1]); return { von: `${y1}-09-01`, bis: `${y1 + 1}-08-31` } }
  return null
}

// Das Schuljahr finden, in dessen Fenster ein Datum fällt.
function schuljahrFuerDatum(schuljahre, datum) {
  for (const sj of schuljahre || []) {
    const f = schuljahrFenster(sj)
    if (f && datum >= f.von && datum <= f.bis) return sj
  }
  return null
}

// Gesamt-Horizont über alle Schuljahre (Grenze für endlose Serien).
function horizontAusSchuljahren(schuljahre) {
  let von = null; let bis = null
  for (const sj of schuljahre || []) {
    const f = schuljahrFenster(sj)
    if (!f) continue
    if (!von || f.von < von) von = f.von
    if (!bis || f.bis > bis) bis = f.bis
  }
  if (!von || !bis) { const j = new Date().getFullYear(); return { von: `${j - 1}-08-01`, bis: `${j + 2}-08-31` } }
  return { von, bis }
}

// Ein Abo abrufen und parsen. Liefert { events, fehler } – events tragen ein schuljahrId.
async function syncAbo(deps, abo, schuljahre) {
  try {
    const url = webcalZuHttps(abo?.url)
    if (!url) return { events: [], fehler: 'Ungültige URL' }
    const text = await deps.http.getText(url)
    const { von, bis } = horizontAusSchuljahren(schuljahre)
    const roh = parseIcs(text, { horizonVon: von, horizonBis: bis })
    const events = []
    for (const e of roh) {
      const sj = schuljahrFuerDatum(schuljahre, e.datum)
      if (!sj) continue // außerhalb aller bekannten Schuljahre
      events.push({ ...e, schuljahrId: sj.id })
    }
    return { events, fehler: null }
  } catch (err) {
    deps.logError?.('kalender:syncAbo', err)
    return { events: [], fehler: (err && err.message) ? err.message : 'Fehler beim Abruf' }
  }
}

module.exports = { syncAbo, webcalZuHttps, schuljahrFenster, schuljahrFuerDatum, horizontAusSchuljahren }
