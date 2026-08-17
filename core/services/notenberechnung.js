// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Noten-/Zeugnisnotenberechnung + KV-Trigger. Spricht den async
// DbPort an; DB-Funktionen sind async, reine Helfer (niveau/znAnzeige/maTeilnote)
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

// Default-Symbole der mehrstufigen Mitarbeit. 4-stufig [sehr+, +, −, sehr−] → Teilnoten
// [1, 2, 4, 5]; 3-stufig [positiv, neutral, negativ] → [1, 3, 5]; 2-stufig [positiv, negativ] → [1, 5].
const MA_SMILEYS_DEFAULT = ['😄', '🙂', '🙁', '😞']
const MA_DREI_DEFAULT = ['+', '~', '-']
const MA_ZWEI_DEFAULT = ['+', '-']

// Symbolliste einer MA-Spalte (Position = Stufe): eigene Symbole (spalten.ma_symbole als JSON)
// oder Default. Länge richtet sich nach ma_stufen (2/3/4).
function maSymboleVon(spalte) {
  const len = spalte.ma_stufen === 3 ? 3 : spalte.ma_stufen === 4 ? 4 : 2
  if (spalte.ma_symbole) {
    try {
      const arr = JSON.parse(spalte.ma_symbole)
      if (Array.isArray(arr) && arr.length === len) return arr
    } catch { /* fällt auf Default zurück */ }
  }
  return len === 3 ? MA_DREI_DEFAULT : len === 4 ? MA_SMILEYS_DEFAULT : MA_ZWEI_DEFAULT
}

// Teilnote (1–5) einer einzelnen Mitarbeits-Aufzeichnung (§ 4 Abs. 2 LBVO: jede
// Aufzeichnung ist eine Teil-Einschätzung, keine Einzelnote). Positionsbasiert über die
// (eigenen oder Default-)Symbole – auch 2-stufig (Default + → 1, − → 5; Pfeile ↗/↘ speichern +/−).
// null = kein gültiger Eintrag.
function maTeilnote(spalte, wert) {
  const idx = maSymboleVon(spalte).indexOf(wert)
  if (spalte.ma_stufen === 3) return [1, 3, 5][idx] ?? null       // positiv / neutral / negativ
  if (spalte.ma_stufen === 4) return [1, 2, 4, 5][idx] ?? null    // sehr+ / + / − / sehr−
  return [1, 5][idx] ?? null                                       // 2-stufig: positiv / negativ
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
  // Undatierte note-bildende Spalten werden konsistent als "aelteste" behandelt (wie in der
  // Rezenz-Sortierung): ohne Datum gilt das aelteste bekannte Niveau, nicht das aktuelle.
  const aeltestesNiveau = niveauHist.length ? niveauHist[niveauHist.length - 1].niveau : niveauFallback
  const offsetFor = (datum) => istDifferenziert
    ? niveauOffset(datum ? niveauZurZeit(niveauHist, datum, niveauFallback) : aeltestesNiveau)
    : 0
  const aktuellerOffset = istDifferenziert ? niveauOffset(niveauFallback) : 0

  // Gewichte der NOTE-BILDENDEN Kategorien (SA, Test, Individuell, Mitarbeitsnote).
  const globaleGewichtung = {}
  ;(await db.select('SELECT * FROM gewichtung_global'))
    .forEach((r) => { globaleGewichtung[r.kategorie] = r.gewichtung })
  // Individuelle Gewichtung pro (Fach, Schüler:in) hat Vorrang vor Fach- und globaler Gewichtung.
  const perStudentGew = await db.selectOne('SELECT gewichtung_sa, gewichtung_t, gewichtung_custom, gewichtung_ma FROM schueler_gewichtung WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId])
  const gew = {
    SA: perStudentGew?.gewichtung_sa ?? fach.gewichtung_sa ?? globaleGewichtung['SA'] ?? 0.4,
    T: perStudentGew?.gewichtung_t ?? fach.gewichtung_t ?? globaleGewichtung['T'] ?? 0.3,
    CUSTOM: perStudentGew?.gewichtung_custom ?? fach.gewichtung_custom ?? globaleGewichtung['CUSTOM'] ?? 0.1,
    // Mitarbeit (MA): aus Bonus/Malus + Hausübung berechnete Note, note-bildend wie SA/T.
    MA: perStudentGew?.gewichtung_ma ?? fach.gewichtung_ma ?? globaleGewichtung['MA'] ?? 0.2,
  }

  // Rezenz-Gewichtung (§ 20 LBVO): individueller Faktor pro (Fach, Schüler:in), sonst globaler
  // Standard aus den Einstellungen. 1 = reiner Durchschnitt.
  const perStudentRezenz = (await db.selectOne('SELECT faktor FROM schueler_rezenz WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId]))?.faktor
  const rezenzFaktor = perStudentRezenz != null
    ? perStudentRezenz
    : parseFloat((await db.selectOne("SELECT wert FROM einstellungen WHERE schluessel = 'rezenz_faktor'"))?.wert ?? '1')

  const spalten = await db.select('SELECT * FROM spalten WHERE fach_id = ?', [fachId])

  // Basisnote aus Noten (SA/T/Individuell/Mitarbeit, intern inkl. Niveau-Offset).
  const basisWerte = { SA: [], T: [], CUSTOM: [], MA: [] }
  // Mitarbeit (§ 4 Abs. 2 LBVO): jede Bonus/Malus- UND Hausübungs-Aufzeichnung ist eine
  // Teil-Einschätzung 1–5; die Mitarbeitsnote ist ihr Durchschnitt (Gesamtbeurteilung),
  // nicht mehr ein gedeckelter Einfluss.
  const maTeilnoten = []

  for (const spalte of spalten) {
    const wert = (await db.selectOne('SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?', [spalte.id, schuelerId]))?.wert ?? ''
    if (!wert) continue

    if (spalte.kategorie === 'MA') {
      const t = maTeilnote(spalte, wert)
      if (t !== null) maTeilnoten.push(t + offsetFor(spalte.datum))
    } else if (spalte.kategorie === 'HÜ') {
      if (wert === '✓') maTeilnoten.push(1 + offsetFor(spalte.datum))
      else if (wert === '✗') maTeilnoten.push(5 + offsetFor(spalte.datum))
      // '—' = "nicht gewertet / entfällt": zählt nicht in die Mitarbeitsnote.
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
      const n = parseInt(wert)
      if (n >= 1 && n <= 5) basisWerte[spalte.kategorie].push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge })
    } else if (spalte.kategorie === 'CUSTOM') {
      const n = parseInt(wert)
      if (!isNaN(n) && n <= 5 && n >= 1) basisWerte.CUSTOM.push({ n: n + offsetFor(spalte.datum), datum: spalte.datum, semester: spalte.semester, reihenfolge: spalte.reihenfolge })
    }
  }

  // Die eine Mitarbeitsnote = Durchschnitt aller Teilnoten (Bonus/Malus + Hausübung).
  // Ein Aggregatwert, der wie eine echte Note mit gewichtung_ma in den Schnitt eingeht.
  // Eine manuell gesetzte Mitarbeitsnote (§ 4 Abs. 2 – Gesamtbeurteilung) überschreibt den
  // berechneten Schnitt (intern gespeichert, inkl. Niveau-Offset).
  const maManuell = (await db.selectOne('SELECT note FROM schueler_ma_note WHERE fach_id = ? AND schueler_id = ?', [fachId, schuelerId]))?.note
  if (maManuell != null) {
    basisWerte.MA.push({ n: maManuell, datum: null, semester: 0, reihenfolge: 0 })
  } else if (maTeilnoten.length > 0) {
    const maSchnitt = maTeilnoten.reduce((a, n) => a + n, 0) / maTeilnoten.length
    basisWerte.MA.push({ n: maSchnitt, datum: null, semester: 0, reihenfolge: 0 })
  }

  // Basisnote: gewichteter Durchschnitt; Gewichte der vorhandenen Kategorien werden neu normiert.
  let summe = 0, gesamtGewichtung = 0
  for (const [kat, werte] of Object.entries(basisWerte)) {
    if (werte.length === 0) continue
    const w = gew[kat] ?? 0
    if (w <= 0) continue
    const avg = gewichteterSchnitt(werte, rezenzFaktor)
    summe += avg * w
    gesamtGewichtung += w
  }

  // Ohne jede note-bildende Kategorie (SA/T/Individuell/Mitarbeit) gibt es keine Note.
  if (gesamtGewichtung === 0) return { note: null }
  let noteIntern = summe / gesamtGewichtung

  // Niveau-abhängiger Clamp: interner Wert bleibt im Fenster [1+Offset, 5+Offset], damit die
  // Anzeige (intern − aktuellerOffset) und der Klassenschnitt stets in 1–5 liegen.
  noteIntern = Math.max(1 + aktuellerOffset, Math.min(5 + aktuellerOffset, noteIntern))
  // Auf zwei Dezimalen runden – so entstehen keine falschen „Zwischennoten" durch Vorrundung auf x,5.
  return { note: Math.round(noteIntern * 100) / 100 }
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
    // Alle Mitglieder der Fach-Klasse (n:m über klassen_schueler). aktiv = Mitgliedschafts-Status
    // PRO Klasse; reihenfolge kommt aus der Junction. So erscheinen auch klassenübergreifend
    // zugeordnete Schüler:innen im Roster genau der Klassen, denen sie angehören.
    return db.select(`
      SELECT s.*, ks.reihenfolge AS reihenfolge
      FROM schueler s
      JOIN klassen_schueler ks ON ks.schueler_id = s.id
      WHERE ks.klasse_id = ?${inkl ? '' : ' AND ks.aktiv = 1 AND s.aktiv = 1'}
      ORDER BY ks.reihenfolge, s.nachname, s.vorname
    `, [fach.klasse_id])
  }
  // Gruppen-Fach (alle_schueler=0): Roster = fach_schueler (bereits klassenneutral → Mitglieder aus
  // beliebigen Klassen möglich). aktiv-Filter auf die Person.
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
  if (!['SA', 'T', 'CUSTOM'].includes(spalte.kategorie)) return
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
