// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Wettervorschau (Open-Meteo, kostenlos, ohne API-Key).
// `deps` = { http, bkGet, logError }: http ist der HttpPort (getJson),
// bkGet(schluessel) liest eine Einstellung, logError protokolliert.
// Der Stundencache lebt modul-lokal.

// Näherung: Koordinaten der Landeshauptstädte je Bundesland.
const WETTER_KOORD = {
  'Wien':             [48.2082, 16.3738],
  'Niederösterreich': [48.2047, 15.6256],
  'Burgenland':       [47.8457, 16.5231],
  'Oberösterreich':   [48.3069, 14.2858],
  'Steiermark':       [47.0707, 15.4395],
  'Kärnten':          [46.6247, 14.3050],
  'Salzburg':         [47.8095, 13.0550],
  'Tirol':            [47.2692, 11.4041],
  'Vorarlberg':       [47.5031,  9.7471],
}
const wetterCache = new Map()   // key -> { zeit, data }

// Tagesvorhersage (Mo–Fr) einer Woche für das eingestellte Bundesland.
async function getWoche(deps, bundesland, montagDatum) {
  try {
    // Genauer Ort (falls gesetzt) hat Vorrang vor der Bundesland-Hauptstadt.
    let koord = null
    const lat = parseFloat(deps.bkGet('wetter_lat'))
    const lon = parseFloat(deps.bkGet('wetter_lon'))
    if (!isNaN(lat) && !isNaN(lon)) koord = [lat, lon]
    else koord = WETTER_KOORD[bundesland]
    if (!koord || !montagDatum) return null
    const startD = new Date(montagDatum + 'T00:00:00')
    if (isNaN(startD)) return null
    const endD = new Date(startD); endD.setDate(endD.getDate() + 4)   // Mo..Fr
    const heute = new Date(); heute.setHours(0, 0, 0, 0)
    const tageBisStart = (startD - heute) / 86400000
    const tageBisEnde  = (endD - heute) / 86400000
    // Open-Meteo-Vorhersage sinnvoll etwa -3 … +15 Tage; sonst kein Wetter.
    if (tageBisEnde < -3 || tageBisStart > 15) return null
    // Lokale (nicht UTC-)Datums-Strings, sonst verschiebt sich der Tag.
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const start = iso(startD), ende = iso(endD)
    const key = `${koord[0]},${koord[1]},${start}`
    const cached = wetterCache.get(key)
    if (cached && (Date.now() - cached.zeit) < 3600000) return cached.data
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${koord[0]}&longitude=${koord[1]}`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min`
      + `&hourly=weather_code,temperature_2m&timezone=Europe%2FVienna`
      + `&start_date=${start}&end_date=${ende}`
    const json = await deps.http.getJson(url)
    const d = json.daily || {}
    // Alle Stundenwerte je Tag (für Zellen-Symbole und die Tageszeiten Vm/Mi/Ab).
    const h = json.hourly || {}
    const proTag = {}   // 'YYYY-MM-DD' -> { 'HH': { code, temp } }
    ;(h.time || []).forEach((t, i) => {
      const [datum, zeit] = t.split('T')
      const hh = (zeit || '').slice(0, 2)
      if (!datum || !hh) return
      if (!proTag[datum]) proTag[datum] = {}
      proTag[datum][hh] = { code: h.weather_code?.[i] ?? null, temp: h.temperature_2m?.[i] ?? null }
    })
    const out = {}
    ;(d.time || []).forEach((t, i) => {
      const st = proTag[t] || {}
      out[t] = {
        code: d.weather_code?.[i] ?? null,
        tmax: d.temperature_2m_max?.[i] ?? null,
        tmin: d.temperature_2m_min?.[i] ?? null,
        vm: st['09'] || null,
        mi: st['13'] || null,
        ab: st['18'] || null,
        stunden: st,
      }
    })
    wetterCache.set(key, { zeit: Date.now(), data: out })
    return out
  } catch (e) {
    deps.logError('wetter:getWoche', e)
    return null
  }
}

// Ortssuche (Geocoding) für eine genauere Wettervorschau.
async function sucheOrt(deps, query) {
  try {
    const q = (query || '').trim()
    if (q.length < 2) return []
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de&format=json`
    const json = await deps.http.getJson(url)
    return (json.results || []).map(r => ({
      name: r.name,
      admin1: r.admin1 || '',
      land: r.country_code || r.country || '',
      lat: r.latitude,
      lon: r.longitude,
    }))
  } catch (e) {
    deps.logError('wetter:sucheOrt', e)
    return []
  }
}

module.exports = { getWoche, sucheOrt, WETTER_KOORD }
