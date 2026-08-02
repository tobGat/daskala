// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Service: Noten-/Zeugnisnotenberechnung + KV-Trigger. Reine DB-Logik,
// `db` pro Aufruf. Alle Funktionen sind electron-frei; sie rufen einander mit
// durchgereichtem `db` auf.

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
// Bei Standardfächern (istDifferenziert = false) ist der Offset 0 → reine Rundung/Deckelung.
// Spiegelt die Bildschirm-Logik aus ZeugnisnoteZelle.jsx für konsistente Werte im Export.
function znInternZuAnzeige(intern, niveau, istDifferenziert) {
  if (intern === null || intern === undefined) return null
  const off = istDifferenziert ? niveauOffset(niveau) : 0
  return Math.max(1, Math.min(5, Math.round(intern - off)))
}

// Mitarbeits-Einheit eines Eintrags in Schritt-Vielfachen (±1 = ganzer Schritt).
// 2-stufig (ma_stufen != 4): + → +1, − → −1.
// 4-stufig (ma_stufen === 4): 😄 +1, 🙂 +0,5, 🙁 −0,5, 😞 −1.
// Rückgabe null = kein gültiger MA-Eintrag (zählt nicht mit).
function maEinheit(spalte, wert) {
  if (spalte.ma_stufen === 4) {
    if (wert === '😄') return 1
    if (wert === '🙂') return 0.5
    if (wert === '🙁') return -0.5
    if (wert === '😞') return -1
    return null
  }
  if (wert === '+') return 1
  if (wert === '-') return -1
  return null
}

function berechneZeugnisnote(db, fachId, schuelerId, semester) {
  const fach = db.prepare('SELECT * FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return { note: null }

  const istDifferenziert = fach.benotungssystem === 'differenziert'
  const maxNote = istDifferenziert ? 7 : 5

  // Niveau-Historie laden (nur bei differenzierten Fächern relevant)
  let niveauHist = []
  let niveauFallback = 'AHS'
  if (istDifferenziert) {
    niveauHist = db.prepare(`
      SELECT niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE fach_id = ? AND schueler_id = ?
      ORDER BY gueltig_ab DESC, id DESC
    `).all(fachId, schuelerId)
    niveauFallback = db.prepare(
      'SELECT niveau FROM schueler_niveau WHERE fach_id = ? AND schueler_id = ?'
    ).get(fachId, schuelerId)?.niveau ?? 'AHS'
  }
  const offsetFor = (datum) => istDifferenziert
    ? niveauOffset(niveauZurZeit(niveauHist, datum, niveauFallback))
    : 0
  const aktuellerOffset = istDifferenziert ? niveauOffset(niveauFallback) : 0

  // Gewichte der NOTE-BILDENDEN Kategorien (nur SA, Test, Individuell).
  // Mitarbeit & Hausübung bilden KEINE Note mehr, sondern verschieben sie nur leicht (siehe unten).
  const globaleGewichtung = {}
  db.prepare('SELECT * FROM gewichtung_global').all()
    .forEach(r => { globaleGewichtung[r.kategorie] = r.gewichtung })
  const gew = {
    SA: fach.gewichtung_sa ?? globaleGewichtung['SA'] ?? 0.4,
    T: fach.gewichtung_t ?? globaleGewichtung['T'] ?? 0.3,
    CUSTOM: fach.gewichtung_custom ?? globaleGewichtung['CUSTOM'] ?? 0.0,
  }

  // Maximaler Einfluss von Mitarbeit bzw. Hausübung in Notenstufen (niveau-frei), getrennt steuerbar.
  // Fach-Deckelung (faecher.ma_max_einfluss / hue_max_einfluss) hat Vorrang vor dem globalen Wert;
  // ältere Installationen fallen auf den gemeinsamen Alt-Wert 'ma_hue_max_einfluss' (Standard 0,5) zurück.
  const globalAltEinfluss = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_hue_max_einfluss'").get()?.wert
  const globalMaEinfluss = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_max_einfluss'").get()?.wert ?? globalAltEinfluss ?? '0.5'
  const globalHueEinfluss = db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'hue_max_einfluss'").get()?.wert ?? globalAltEinfluss ?? '0.5'
  const maxMaEinfluss = fach.ma_max_einfluss != null ? fach.ma_max_einfluss : parseFloat(globalMaEinfluss)
  const maxHueEinfluss = fach.hue_max_einfluss != null ? fach.hue_max_einfluss : parseFloat(globalHueEinfluss)
  // Einfluss pro einzelnem Eintrag (jedes +/✓ bzw. −/✗). Standard 0,1.
  const einflussSchritt = parseFloat(
    db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 'ma_hue_schritt'").get()?.wert ?? '0.1'
  )

  const spalten = db.prepare(
    'SELECT * FROM spalten WHERE fach_id = ? AND semester = ?'
  ).all(fachId, semester)

  // Basisnote aus echten Noten (SA/T/Individuell, intern inkl. Niveau-Offset).
  const basisWerte = { SA: [], T: [], CUSTOM: [] }
  // Mitarbeit (gewichtete Summe in Schritt-Vielfachen) & Hausübung (Zähler); niveau-frei, keine Noten.
  let maScore = 0, maCount = 0, huePos = 0, hueNeg = 0

  for (const spalte of spalten) {
    const wert = db.prepare(
      'SELECT wert FROM eintraege WHERE spalte_id = ? AND schueler_id = ?'
    ).get(spalte.id, schuelerId)?.wert ?? ''
    if (!wert) continue

    if (spalte.kategorie === 'MA') {
      const e = maEinheit(spalte, wert)
      if (e !== null) { maScore += e; maCount++ }
    } else if (spalte.kategorie === 'HÜ') {
      if (wert === '✓') huePos++
      else if (wert === '✗') hueNeg++
      // '—' = "nicht gewertet / entfällt": bewusst ohne Noteneinfluss, zählt nicht mit.
    } else if (spalte.kategorie === 'SA' || spalte.kategorie === 'T') {
      const n = parseInt(wert)
      if (n >= 1 && n <= 5) basisWerte[spalte.kategorie].push(n + offsetFor(spalte.datum))
    } else if (spalte.kategorie === 'CUSTOM') {
      const n = parseInt(wert)
      if (!isNaN(n) && n >= 1 && n <= 5) basisWerte.CUSTOM.push(n + offsetFor(spalte.datum))
    }
  }

  // Basisnote: gewichteter Durchschnitt; Gewichte der vorhandenen Kategorien werden neu normiert.
  let summe = 0, gesamtGewichtung = 0
  for (const [kat, werte] of Object.entries(basisWerte)) {
    if (werte.length === 0) continue
    const w = gew[kat] ?? 0
    if (w === 0) continue
    const avg = werte.reduce((a, b) => a + b, 0) / werte.length
    summe += avg * w
    gesamtGewichtung += w
  }
  const hatBasis = gesamtGewichtung > 0
  const basisIntern = hatBasis ? summe / gesamtGewichtung : null

  // MA-/HÜ-Einfluss "pro Eintrag": jeder Eintrag ein kleiner Schritt. MA und HÜ wirken UNABHÄNGIG
  // voneinander – jeweils eigene Deckelung, danach summiert. Positiv = verbessert.
  const maGesamt = maCount
  const hueGesamt = huePos + hueNeg
  const hatMAHUE = maGesamt > 0 || hueGesamt > 0

  // Rohsumme × Schritt; Deckelung greift erst hier (viele Minus bleiben "im Minus", bis
  // genug Plus die Rohsumme wieder über die Grenze hebt).
  let maEinfluss = maGesamt > 0 ? maScore * einflussSchritt : 0
  maEinfluss = Math.max(-maxMaEinfluss, Math.min(maxMaEinfluss, maEinfluss))
  let hueEinfluss = hueGesamt > 0 ? (huePos - hueNeg) * einflussSchritt : 0
  hueEinfluss = Math.max(-maxHueEinfluss, Math.min(maxHueEinfluss, hueEinfluss))
  const einfluss = maEinfluss + hueEinfluss

  // Verhältnis (−1…+1) nur für die grobe Fallback-Note, wenn es keine echten Noten gibt.
  const ratios = []
  if (maGesamt > 0) ratios.push(maScore / maGesamt)
  if (hueGesamt > 0) ratios.push((huePos - hueNeg) / hueGesamt)
  const verhaeltnis = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0

  let noteIntern
  if (hatBasis) {
    noteIntern = basisIntern - einfluss  // viele +/✓ verbessern → kleinerer Wert
  } else if (hatMAHUE) {
    // Keine echten Noten → grobe, niveau-freie Orientierungsnote aus MA/HÜ:
    // +1 → 1, 0 → 3, −1 → 5. + aktuellerOffset, damit die Anzeige (− Offset) sie niveau-frei zeigt.
    noteIntern = (3 - verhaeltnis * 2) + aktuellerOffset
  } else {
    return { note: null }
  }

  noteIntern = Math.max(1, Math.min(maxNote, noteIntern))
  return { note: Math.round(noteIntern * 10) / 10 }
}

function berechneEndnote(db, fachId, schuelerId) {
  const s1Zn = db.prepare('SELECT note_manuell, note_berechnet FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = 1').get(fachId, schuelerId)
  const s2Zn = db.prepare('SELECT note_manuell, note_berechnet FROM zeugnisnoten WHERE fach_id = ? AND schueler_id = ? AND semester = 2').get(fachId, schuelerId)
  const s1Note = s1Zn?.note_manuell ?? s1Zn?.note_berechnet ?? null
  const s2Note = s2Zn?.note_manuell ?? s2Zn?.note_berechnet ?? null
  if (s1Note !== null && s2Note !== null) {
    const s1Gewicht = parseFloat(db.prepare("SELECT wert FROM einstellungen WHERE schluessel = 's1_gewichtung'").get()?.wert ?? '0.5')
    return Math.round((s1Note * s1Gewicht + s2Note * (1 - s1Gewicht)) * 10) / 10
  }
  if (s1Note !== null) return s1Note
  if (s2Note !== null) return s2Note
  return null
}

// Alle Fächer im angegebenen Schuljahr neu berechnen
function berechneAlleFuerSchuljahr(db, schuljahrId) {
  if (!schuljahrId) return
  const faecher = db.prepare(`
    SELECT f.id FROM faecher f
    JOIN klassen k ON f.klasse_id = k.id
    WHERE k.schuljahr_id = ?
  `).all(schuljahrId)
  for (const f of faecher) berechneAlleFuerFach(db, f.id)
}

// Roster eines Fachs: alle_schueler=1 → alle aktiven Klassen-Schüler:innen (live, kein Junction);
// alle_schueler=0 → nur die in fach_schueler eingetragene Teilmenge. Der "alle"-Zweig fragt
// fach_schueler NIE ab → Altbestand (Default 1, keine Junction-Zeilen) liefert korrekt alle.
function rosterFuerFach(db, fachId) {
  const fach = db.prepare('SELECT klasse_id, alle_schueler FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return []
  if (fach.alle_schueler) {
    return db.prepare('SELECT * FROM schueler WHERE klasse_id = ? AND aktiv = 1 ORDER BY reihenfolge, nachname, vorname').all(fach.klasse_id)
  }
  return db.prepare(`
    SELECT s.* FROM schueler s
    JOIN fach_schueler fs ON fs.schueler_id = s.id
    WHERE fs.fach_id = ? AND s.aktiv = 1
    ORDER BY s.reihenfolge, s.nachname, s.vorname
  `).all(fachId)
}
function rosterIdsFuerFach(db, fachId) {
  return rosterFuerFach(db, fachId).map(s => s.id)
}

// Alle Zeugnisnoten für ein Fach neu berechnen (Roster-Schüler:innen, S1+S2+Endnote)
function berechneAlleFuerFach(db, fachId) {
  const fach = db.prepare('SELECT klasse_id FROM faecher WHERE id = ?').get(fachId)
  if (!fach) return
  const schueler = rosterIdsFuerFach(db, fachId).map(id => ({ id }))
  if (!schueler.length) return
  // Immer aktualisieren (auch wenn note=null), damit veraltete Werte überschrieben werden
  const upsert = db.prepare(`
    INSERT INTO zeugnisnoten (fach_id, schueler_id, semester, note_berechnet, s1_eingerechnet)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(fach_id, schueler_id, semester)
    DO UPDATE SET note_berechnet = excluded.note_berechnet, s1_eingerechnet = excluded.s1_eingerechnet
  `)
  const updateOnly = db.prepare(`
    UPDATE zeugnisnoten SET note_berechnet = ?, s1_eingerechnet = ? WHERE fach_id = ? AND schueler_id = ? AND semester = ?
  `)
  db.transaction(() => {
    // Erst S1 und S2 berechnen
    for (const s of schueler) {
      for (const sem of [1, 2]) {
        const { note } = berechneZeugnisnote(db, fachId, s.id, sem)
        if (note !== null) {
          upsert.run(fachId, s.id, sem, note, 0)
        } else {
          // Veralteten Wert löschen (falls Zeile existiert)
          updateOnly.run(null, 0, fachId, s.id, sem)
        }
      }
    }
    // Dann Endnote (liest die eben gespeicherten S1/S2-Noten)
    for (const s of schueler) {
      const endnote = berechneEndnote(db, fachId, s.id)
      if (endnote !== null) {
        upsert.run(fachId, s.id, 3, endnote, 1)
      } else {
        updateOnly.run(null, 1, fachId, s.id, 3)
      }
    }
  })()
}

// ─── KV-Trigger ───────────────────────────────────────────────────────────────
// Erzeugt einen Trigger, falls noch kein offener gleicher Art für die Person/Klasse existiert.
function erzeugeTrigger(db, klasseId, schuelerId, typ, schweregrad, ausloeser, beschreibung) {
  const existing = db.prepare(`
    SELECT id FROM kv_trigger
    WHERE klasse_id = ?
      AND COALESCE(schueler_id, -1) = COALESCE(?, -1)
      AND typ = ?
      AND archiviert = 0
  `).get(klasseId, schuelerId ?? null, typ)
  if (existing) return existing.id
  const info = db.prepare(`
    INSERT INTO kv_trigger (klasse_id, schueler_id, typ, schweregrad, ausloeser, beschreibung)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(klasseId, schuelerId ?? null, typ, schweregrad, ausloeser ?? null, beschreibung ?? null)
  return info.lastInsertRowid
}

// Prüft Fehlstunden-Schwellen für einen Schüler (≥15 warn, ≥30 critical).
// Archiviert auch wieder, wenn unter Schwelle gefallen.
function pruefeFehlstundenSchwellen(db, schuelerId) {
  const schueler = db.prepare('SELECT id, klasse_id FROM schueler WHERE id = ?').get(schuelerId)
  if (!schueler) return
  const klasse = db.prepare('SELECT ist_kv FROM klassen WHERE id = ?').get(schueler.klasse_id)
  if (!klasse?.ist_kv) return  // Trigger nur bei KV-Klassen
  const summe = db.prepare(`
    SELECT COALESCE(SUM(stunden), 0) AS s FROM kv_fehlstunden
    WHERE schueler_id = ? AND entschuldigt = 0
  `).get(schuelerId).s

  const setzeOderArchiviereTrigger = (typ, schweregrad, schwelle, label) => {
    if (summe >= schwelle) {
      erzeugeTrigger(db, schueler.klasse_id, schuelerId, typ, schweregrad,
        `${summe} unentschuldigte Fehlstunden (Schwelle ${schwelle})`, label)
    } else {
      // Archivieren wenn unter Schwelle und offen
      db.prepare(`
        UPDATE kv_trigger SET archiviert = 1, reagiert_am = datetime('now','localtime'),
          reaktion = COALESCE(reaktion, 'Schwelle unterschritten')
        WHERE klasse_id = ? AND schueler_id = ? AND typ = ? AND archiviert = 0
      `).run(schueler.klasse_id, schuelerId, typ)
    }
  }
  setzeOderArchiviereTrigger('fehlstunden_30', 'critical', 30, '§ 45 SchUG — Schulpflichtverletzung')
  setzeOderArchiviereTrigger('fehlstunden_15', 'warn',     15, '§ 45 SchUG — frühzeitige Warnung')
}

// Prüft, ob nach einem Note-Eintrag eine Frühwarnung erzeugt werden soll.
function pruefeNotenTrigger(db, spalteId, schuelerId, wertNeu, wertAlt) {
  if (!wertNeu) return
  // Nur SA/T/CUSTOM-Noten (1..5) sind relevant
  const n = parseInt(wertNeu)
  if (!(n >= 1 && n <= 5)) return
  const spalte = db.prepare('SELECT s.kategorie, s.fach_id, f.klasse_id, f.name AS fach_name FROM spalten s JOIN faecher f ON f.id = s.fach_id WHERE s.id = ?').get(spalteId)
  if (!spalte) return
  if (!['SA', 'T', 'CUSTOM'].includes(spalte.kategorie)) return
  const klasse = db.prepare('SELECT ist_kv FROM klassen WHERE id = ?').get(spalte.klasse_id)
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
    erzeugeTrigger(db, spalte.klasse_id, schuelerId, 'fruehwarnung', 'warn', warnung.ausloeser, warnung.grund)
  }
}

module.exports = {
  niveauZurZeit, niveauOffset, znInternZuAnzeige,
  berechneZeugnisnote, berechneEndnote, berechneAlleFuerSchuljahr,
  rosterFuerFach, rosterIdsFuerFach, berechneAlleFuerFach,
  erzeugeTrigger, pruefeFehlstundenSchwellen, pruefeNotenTrigger,
}
