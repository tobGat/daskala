// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Noten-/Zeugnisnotenberechnung + KV-Trigger. Spricht den async
// DbPort an; DB-Funktionen sind async, reine Helfer (niveau/znAnzeige/maBewertung)
// bleiben synchron. Funktionen rufen einander mit durchgereichtem db/tx auf.

const { neueUuid } = require('../db/uuid')

// Niveau-Auflösung für ein Datum aus der Historie. niveauHist absteigend sortiert nach gueltig_ab.
// Fallback: aktuelles Niveau (jüngster Eintrag bzw. übergebener Default).
function niveauZurZeit(niveauHist, datum, fallback) {
  if (!niveauHist || niveauHist.length === 0) return fallback
  if (!datum) return niveauHist[0].niveau
  for (const h of niveauHist) {
    if (h.gueltig_ab <= datum) return h.niveau
  }
  // Datum vor erstem Historien-Eintrag → ältestes bekanntes Niveau
  return niveauHist[niveauHist.length - 1].niveau
}

// Offset für interne 1-7-Skala bei differenzierten Fächern. AHS → 0, ST → +2.
function niveauOffset(niveau) { return niveau === 'ST' ? 2 : 0 }

// Interner Notenwert (bei differenzierten Fächern 1-7) → angezeigte ganze Zeugnisnote (1-5).
function znInternZuAnzeige(intern, niveau, istDifferenziert) {
  if (intern === null || intern === undefined) return null
  const off = istDifferenziert ? niveauOffset(niveau) : 0
  return Math.max(1, Math.min(5, Math.round(intern - off)))
}

// Konfigurierbarer Einfluss je Mitarbeits-Stufe (in Notenpunkten). Aus den
// Einstellungen gelesen; Defaults = bisheriges Verhalten. Pfeile ↗/↘ speichern
// weiterhin '+'/'−' und nutzen daher dieselben Gewichte wie + / −.
async function ladeMaGewichte(db) {
  const keys = ['ma_w_plus', 'ma_w_minus', 'ma_w_smiley_vpos', 'ma_w_smiley_pos', 'ma_w_smiley_neg', 'ma_w_smiley_vneg']
  const rows = await db.select(`SELECT schluessel, wert FROM einstellungen WHERE schluessel IN (${keys.map(() => '?').join(',')})`, keys)
  const m = {}
  rows.forEach((r) => { m[r.schluessel] = r.wert })
  const num = (key, def) => { const v = parseFloat(m[key]); return isNaN(v) ? def : v }
  return {
    plus: num('ma_w_plus', 0.1), minus: num('ma_w_minus', 0.1),
    vpos: num('ma_w_smiley_vpos', 0.1), pos: num('ma_w_smiley_pos', 0.05),
    neg: num('ma_w_smiley_neg', 0.05), vneg: num('ma_w_smiley_vneg', 0.1),
  }
}

// Default-Symbole der 4-stufigen Mitarbeit (sehr positiv … sehr negativ).
const MA_SMILEYS_DEFAULT = ['😄', '🙂', '🙁', '😞']

// Symbolliste einer 4-stufigen MA-Spalte: eigene Symbole (spalten.ma_symbole als JSON)
// oder Default-Smileys. Reihenfolge = Stufen [sehr+, +, −, sehr−].
function maSymboleVon(spalte) {
  if (spalte.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === 4) return arr
    } catch { /* fällt auf Default zurück */ }
  }
  return MA_SMILEYS_DEFAULT
}

// Eigene 5 Symbole einer Mitarbeitsnote-Spalte (MAN) für die Noten 1…5, oder null
// (dann normale Zahleneingabe 1–5). ma_symbole als JSON-Array [Note1, …, Note5].
function manSymboleVon(spalte) {
  if (spalte.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === 5) return arr
    } catch { /* keine eigenen Symbole */ }
  }
  return null
}

// Note (1–5) eines MAN-Eintrags: eigenes Symbol → Position+1, sonst parseInt. NaN = ungültig.
function manNoteVon(spalte, wert) {
  const syms = manSymboleVon(spalte)
  if (syms) {
    const idx = syms.indexOf(wert)
    return idx >= 0 ? idx + 1 : NaN
  }
  return parseInt(wert)
}

// Bewertung eines MA-Eintrags: { w: vorzeichenbehaftetes Gewicht in Notenpunkten,
// dir: Richtung ±1 (für die grobe Fallback-Note) }. null = kein gültiger Eintrag.
function maBewertung(spalte, wert, g) {
  if (spalte.ma_stufen === 4) {
    // Positionsbasiert: Stufe 0/1 positiv, 2/3 negativ – unabhängig vom konkreten Symbol.
    const idx = maSymboleVon(spalte).indexOf(wert)
    if (idx === 0) return { w: g.vpos, dir: 1 }
    if (idx === 1) return { w: g.pos, dir: 1 }
    if (idx === 2) return { w: -g.neg, dir: -1 }
    if (idx === 3) return { w: -g.vneg, dir: -1 }
    return null
  }
  if (wert === '+') return { w: g.plus, dir: 1 }
  if (wert === '-') return { w: -g.minus, dir: -1 }
  return null
}

// Rezenz-gewichteter Durchschnitt einer Kategorie (§ 20 LBVO: zuletzt erreichter
// Leistungsstand zählt stärker). `werte` = [{ n, datum, semester, reihenfolge }],
// `faktor` = Gewicht der neuesten Leistung relativ zur ältesten (1 = kein Effekt =
// reiner Durchschnitt). Chronologisch über das ganze Jahr sortiert (undatiert gilt als
// am ältesten; Tie-Break Semester, dann reihenfolge); linear ansteigende Gewichte 1 … faktor.
function gewichteterSchnitt(werte, faktor) {
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
    const g = 1 + (f - 1) * (i / (m - 1))
    summe += w.n * g
    gew += g
  })
  return summe / gew
}

// Eine durchgehende Note (Zeugnisnote / laufender Jahresstand) aus ALLEN Aufzeichnungen
// beider Semester. Rezenz (§ 20) wirkt kontinuierlich über das ganze Jahr; es gibt keine
// getrennten Semesternoten und keine Semestergewichtung mehr.
async function berechneZeugnisnote(db, fachId, schuelerId) {
  const fach = await db.selectOne('SELECT * FROM faecher WHERE id = ?', [fachId])
  if (!fach) return { note: null }

  const istDifferenziert = fach.benotungssystem === 'differenziert'
  const maxNote = istDifferenziert ? 7 : 5

  // Niveau-Historie laden (nur bei differenzierten Fächern relevant)
  let niveauHist = []
  let niveauFallback = 'AHS'
  if (istDifferenziert) {
    niveauHist = await db.select(`
      SELECT niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ?
      ORDER BY gueltig_ab DESC, id DESC
    `, [fachId, schuelerId])
    niveauFallback = (await db.selectOne(
      'SELECT niveau FROM schueler_niveau WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId]
    ))?.niveau ?? 'AHS'
  }
  const offsetFor = (datum) => istDifferenziert
    ? niveauOffset(niveauZurZeit(niveauHist, datum, niveauFallback))
    : 0
  const aktuellerOffset = istDifferenziert ? niveauOffset(niveauFallback) : 0

  // Gewichte der NOTE-BILDENDEN Kategorien (SA, Test, Individuell, Mitarbeitsnote).
  const globaleGewichtung = {}
  ;(await db.select('SELECT * FROM gewichtung_global'))
    .forEach((r) => { globaleGewichtung[r.kategorie] = r.gewichtung })
  const gew = {
    SA: fach.gewichtung_sa ?? globaleGewichtung['SA'] ?? 0.4,
    T: fach.gewichtung_t ?? globaleGewichtung['T'] ?? 0.3,
    CUSTOM: fach.gewichtung_custom ?? globaleGewichtung['CUSTOM'] ?? 0.0,
    // Benotete Mitarbeit (MAN): Default > 0, damit reine MAN-Fächer eine Note bilden.
    MAN: fach.gewichtung_man ?? globaleGewichtung['MAN'] ?? 0.3,
  }

  // Maximaler Einfluss von Mitarbeit bzw. Hausübung (niveau-frei), getrennt steuerbar.
  const globalAltEinfluss = (await db.selectOne("SELECT wert FROM einstellungen WHERE schluessel = 'ma_hue_max_einfluss'"))?.wert
  const globalMaEinfluss = (await db.selectOne("SELECT wert FROM einstellungen WHERE schluessel = 'ma_max_einfluss'"))?.wert ?? globalAltEinfluss ?? '0.5'
  const globalHueEinfluss = (await db.selectOne("SELECT wert FROM einstellungen WHERE schluessel = 'hue_max_einfluss'"))?.wert ?? globalAltEinfluss ?? '0.5'
  const maxMaEinfluss = fach.ma_max_einfluss != null ? fach.ma_max_einfluss : parseFloat(globalMaEinfluss)
  const maxHueEinfluss = fach.hue_max_einfluss != null ? fach.hue_max_einfluss : parseFloat(globalHueEinfluss)
  // Einfluss pro einzelnem HÜ-Eintrag (jedes ✓/✗). Standard 0,1.
  const einflussSchritt = parseFloat(
    (await db.selectOne("SELECT wert FROM einstellungen WHERE schluessel = 'ma_hue_schritt'"))?.wert ?? '0.1'
  )
  // Rezenz-Gewichtung innerhalb einer Kategorie (§ 20 LBVO). 1 = reiner Durchschnitt.
  const rezenzFaktor = parseFloat(
    (await db.selectOne("SELECT wert FROM einstellungen WHERE schluessel = 'rezenz_faktor'"))?.wert ?? '1'
  )

  const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ?', [fachId])

  // Basisnote aus echten Noten (SA/T/Individuell/Mitarbeitsnote, intern inkl. Niveau-Offset).
  const basisWerte = { SA: [], T: [], CUSTOM: [], MAN: [] }
  // Mitarbeit: gewichtete Summe (maScore) + Richtungssumme (maDir). Hausübung: Zähler.
  const maGew = await ladeMaGewichte(db)
  let maScore = 0, maCount = 0, maDir = 0, huePos = 0, hueNeg = 0

  for (const spalte of spalten) {
    const wert = (await db.selectOne('SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?', [spalte.id, schuelerId]))?.wert ?? ''
    if (!wert) continue

    if (spalte.kategorie === 'MA') {
      const b = maBewertung(spalte, wert, maGew)
      if (b !== null) { maScore += b.w; maCount++; maDir += b.dir }
    } else if (spalte.kategorie === 'HÜ') {
      if (wert === '✓') huePos++
      else if (wert === '✗') hueNeg++
      // '—' = "nicht gewertet / entfällt": ohne Noteneinfluss.
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
      const n = parseInt(wert)
      if (n >= 1 && n <= 5) basisWerte[spalte.kategorie].push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge })
    } else if (spalte.kategorie === 'CUSTOM') {
      const n = parseInt(wert)
      if (!isNaN(n) && n <= 5 && n >= 1) basisWerte.CUSTOM.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge })
    } else if (spalte.kategorie === 'MAN') {
      // Benotete Mitarbeit: echte Note 1–5 (ggf. über eigene Symbole), niveau-fähig wie SA/T.
      const n = manNoteVon(spalte, wert)
      if (n >= 1 && n <= 5) basisWerte.MAN.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge })
    }
  }

  // Basisnote: gewichteter Durchschnitt; Gewichte der vorhandenen Kategorien werden neu normiert.
  let summe = 0, gesamtGewichtung = 0
  for (const [kat, werte] of Object.entries(basisWerte)) {
    if (werte.length === 0) continue
    const w = gew[kat] ?? 0
    if (w === 0) continue
    const avg = gewichteterSchnitt(werte, rezenzFaktor)
    summe += avg * w
    gesamtGewichtung += w
  }
  const hatBasis = gesamtGewichtung > 0
  const basisIntern = hatBasis ? summe / gesamtGewichtung : null

  const maGesamt = maCount
  const hueGesamt = huePos + hueNeg
  const hatMAHUE = maGesamt > 0 || hueGesamt > 0

  // maScore ist bereits die Roh-Summe in Notenpunkten; die Deckelung greift erst hier.
  let maEinfluss = maGesamt > 0 ? maScore : 0
  maEinfluss = Math.max(-maxMaEinfluss, Math.min(maxMaEinfluss, maEinfluss))
  let hueEinfluss = hueGesamt > 0 ? (huePos - hueNeg) * einflussSchritt : 0
  hueEinfluss = Math.max(-maxHueEinfluss, Math.min(maxHueEinfluss, hueEinfluss))
  const einfluss = maEinfluss + hueEinfluss

  // Verhältnis (−1…+1) nur für die grobe Fallback-Note, wenn es keine echten Noten gibt.
  const ratios = []
  if (maGesamt > 0) ratios.push(maDir / maGesamt)
  if (hueGesamt > 0) ratios.push((huePos - hueNeg) / hueGesamt)
  const verhaeltnis = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0

  let noteIntern
  if (hatBasis) {
    noteIntern = basisIntern - einfluss  // viele +/✓ verbessern → kleinerer Wert
  } else if (hatMAHUE) {
    noteIntern = (3 - verhaeltnis * 2) + aktuellerOffset
  } else {
    return { note: null }
  }

  noteIntern = Math.max(1, Math.min(maxNote, noteIntern))
  return { note: Math.round(noteIntern * 10) / 10 }
}

// Alle Fächer im angegebenen Schuljahr neu berechnen
async function berechneAlleFuerSchuljahr(db, schuljahrId) {
  if (!schuljahrId) return
  const faecher = await db.select(`
    SELECT f.id FROM faecher f
    JOIN klassen k ON f.klasse_id = k.id
    WHERE k.schuljahr_id = ?
  `, [schuljahrId])
  for (const f of faecher) await berechneAlleFuerFach(db, f.id)
}

// Roster eines Fachs: alle_schueler=1 → alle Klassen-Schüler:innen; sonst die
// in fach_schueler eingetragene Teilmenge. Standardmäßig nur aktive; opts.inklInaktiv
// nimmt auch inaktive mit (nötig für Archiv-Exporte, wo alle Schüler:innen inaktiv sind).
async function rosterFuerFach(db, fachId, opts = {}) {
  const fach = await db.selectOne('SELECT klasse_id, alle_schueler FROM faecher WHERE id = ?', [fachId])
  if (!fach) return []
  const inkl = opts.inklInaktiv === true
  if (fach.alle_schueler) {
    return db.select(`SELECT * FROM schueler WHERE klasse_id = ?${inkl ? '' : ' AND aktiv = 1'} ORDER BY reihenfolge, nachname, vorname`, [fach.klasse_id])
  }
  return db.select(`
    SELECT s.* FROM schueler s
    JOIN fach_schueler fs ON fs.schueler_id = s.id
    WHERE fs.fach_id = ?${inkl ? '' : ' AND s.aktiv = 1'}
    ORDER BY s.reihenfolge, s.nachname, s.vorname
  `, [fachId])
}
async function rosterIdsFuerFach(db, fachId, opts = {}) {
  return (await rosterFuerFach(db, fachId, opts)).map((s) => s.id)
}

// Die eine Note wird im Slot semester=3 gespeichert (Slots 1/2 werden nicht mehr genutzt).
const NOTE_SEMESTER = 3
const ZN_UPSERT = `
    INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet, uuid)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(fach_id, schueler_id, semester)
    DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
  `
const ZN_UPDATE_ONLY = 'UPDATE zeugnisnoten SET note_berechnet = ?, s1_eingerechnet = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?'

// Alle Zeugnisnoten für ein Fach neu berechnen: eine durchgehende Jahresnote je Schüler:in.
async function berechneAlleFuerFach(db, fachId) {
  const fach = await db.selectOne('SELECT klasse_id FROM faecher WHERE id = ?', [fachId])
  if (!fach) return
  const schueler = (await rosterIdsFuerFach(db, fachId)).map((id) => ({ id }))
  if (!schueler.length) return
  await db.transaction(async (tx) => {
    for (const s of schueler) {
      const { note } = await berechneZeugnisnote(tx, fachId, s.id)
      if (note !== null) await tx.execute(ZN_UPSERT, [fachId, s.id, NOTE_SEMESTER, note, 1, neueUuid()])
      else await tx.execute(ZN_UPDATE_ONLY, [null, 1, fachId, s.id, NOTE_SEMESTER])
    }
  })
}

// ─── KV-Trigger ───────────────────────────────────────────────────────────────
// Erzeugt einen Trigger, falls noch kein offener gleicher Art für die Person/Klasse existiert.
async function erzeugeTrigger(db, klasseId, schuelerId, typ, schweregrad, ausloeser, beschreibung) {
  const existing = await db.selectOne(`
    SELECT id FROM kv_trigger
    WHERE klasse_id = ?
      AND COALESCE(schueler_id, -1) = COALESCE(?, -1)
      AND typ = ?
      AND archiviert = 0
  `, [klasseId, schuelerId ?? null, typ])
  if (existing) return existing.id
  const info = await db.execute(`
    INSERT INTO kv_trigger (klasse_id, schueler_id, typ, schweregrad, ausloeser, beschreibung)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [klasseId, schuelerId ?? null, typ, schweregrad, ausloeser ?? null, beschreibung ?? null])
  return info.lastInsertRowid
}

// Prüft Fehlstunden-Schwellen für einen Schüler (≥15 warn, ≥30 critical).
async function pruefeFehlstundenSchwellen(db, schuelerId) {
  const schueler = await db.selectOne('SELECT id, klasse_id FROM schueler WHERE id = ?', [schuelerId])
  if (!schueler) return
  const klasse = await db.selectOne('SELECT ist_kv FROM klassen WHERE id = ?', [schueler.klasse_id])
  if (!klasse?.ist_kv) return  // Trigger nur bei KV-Klassen
  const summe = (await db.selectOne(`
    SELECT COALESCE(SUM(stunden), 0) AS s FROM kv_fehlstunden
    WHERE schueler_id = ? AND entschuldigt = 0
  `, [schuelerId])).s

  const setzeOderArchiviereTrigger = async (typ, schweregrad, schwelle, label) => {
    if (summe >= schwelle) {
      await erzeugeTrigger(db, schueler.klasse_id, schuelerId, typ, schweregrad,
        `${summe} unentschuldigte Fehlstunden (Schwelle ${schwelle})`, label)
    } else {
      await db.execute(`
        UPDATE kv_trigger SET archiviert = 1, reagiert_am = datetime('now','localtime'),
          reaktion = COALESCE(reaktion, 'Schwelle unterschritten')
        WHERE klasse_id = ? AND schueler_id = ? AND typ = ? AND archiviert = 0
      `, [schueler.klasse_id, schuelerId, typ])
    }
  }
  await setzeOderArchiviereTrigger('fehlstunden_30', 'critical', 30, '§ 45 SchUG — Schulpflichtverletzung')
  await setzeOderArchiviereTrigger('fehlstunden_15', 'warn', 15, '§ 45 SchUG — frühzeitige Warnung')
}

// Prüft, ob nach einem Note-Eintrag eine Frühwarnung erzeugt werden soll.
async function pruefeNotenTrigger(db, spalteId, schuelerId, wertNeu, wertAlt) {
  if (!wertNeu) return
  const n = parseInt(wertNeu)
  if (!(n >= 1 && n <= 5)) return
  const spalte = await db.selectOne('SELECT s.kategorie, s.fach_id, f.klasse_id, f.name AS fach_name FROM spalten s JOIN faecher f ON f.id = s.fach_id WHERE s.id = ?', [spalteId])
  if (!spalte) return
  if (!['SA', 'T', 'CUSTOM', 'MAN'].includes(spalte.kategorie)) return
  const klasse = await db.selectOne('SELECT ist_kv FROM klassen WHERE id = ?', [spalte.klasse_id])
  if (!klasse?.ist_kv) return

  let warnung = null
  if (n === 5) {
    warnung = { ausloeser: `Note 5 in ${spalte.fach_name}`, grund: 'Nicht Genügend eingetragen' }
  } else if (wertAlt) {
    const a = parseInt(wertAlt)
    if (a >= 1 && a <= 5 && (n - a) >= 2) {
      warnung = { ausloeser: `Note ${a} → ${n} in ${spalte.fach_name}`, grund: 'Verschlechterung um ≥ 2 Stufen' }
    }
  }
  if (warnung) {
    await erzeugeTrigger(db, spalte.klasse_id, schuelerId, 'fruehwarnung', 'warn', warnung.ausloeser, warnung.grund)
  }
}

module.exports = {
  niveauZurZeit, niveauOffset, znInternZuAnzeige, gewichteterSchnitt, NOTE_SEMESTER,
  berechneZeugnisnote, berechneAlleFuerSchuljahr,
  rosterFuerFach, rosterIdsFuerFach, berechneAlleFuerFach,
  erzeugeTrigger, pruefeFehlstundenSchwellen, pruefeNotenTrigger,
}
