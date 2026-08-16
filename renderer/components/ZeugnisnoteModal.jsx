// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Detail-Modal der Zeugnisnote (Klick auf die ZN-Zelle). Erlaubt:
//  • die einzelnen Teilnoten (alle Aufzeichnungen dieses Fachs/Schüler:in) ansehen & ändern,
//    mit sofortiger Vorschau der Zeugnisnote (§ 4 Abs. 2 LBVO – Mitarbeit als eigene Note),
//  • die Zeugnisnote manuell überschreiben (bzw. zurücksetzen),
//  • den Rezenzfaktor (§ 20 LBVO) pro (Fach, Schüler:in) einstellen, grafisch dargestellt.
// Alles ist ein Entwurf – Commit erst bei „Speichern". Bei geändertem Rezenzfaktor wird gefragt,
// ob er nur für diese:n Schüler:in oder die ganze Klasse gelten soll.
//
// Layout: 3-Zonen-Flex (fixer Kopf mit Ergebnis + Aufschlüsselung, scrollender Mittelteil,
// fixe Fußzeile). Via Portal an document.body gerendert, sonst bliebe das Overlay im
// Stacking-Context der sticky ZN-<td> gefangen und die Notentabelle schiene durch.
import React, { useState, useMemo, useEffect } from 'react'
import ReactDOM from 'react-dom'
import useStore from '../store/useStore'
import { computeZN, gewichteterSchnitt, rangGewicht } from '../utils/znBreakdown'
import { niveauOffset } from '../utils/niveau'

function noteKlasse(n) {
  const num = Math.round(n)
  if (num === 1) return 'note-1'
  if (num === 2) return 'note-2'
  if (num === 3) return 'note-3'
  if (num === 4) return 'note-4'
  if (num === 5) return 'note-5'
  return ''
}
const clamp15 = (x) => Math.max(1, Math.min(5, x))
const komma = (x, dez = 2) => x.toFixed(dez).replace('.', ',')

function fmtDatum(d) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('de-AT')
}

const AKTIV_NOTE = 'bg-coral-600 text-white'
const INAKTIV_KLASSE = 'bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-700'

// Chronologische Sortierung wie im Kern (gewichteterSchnitt): Datum (leer = ältest) → Semester → Reihenfolge.
function chronologisch(a, b) {
  const da = a.datum || '', db = b.datum || ''
  if (da !== db) return da < db ? -1 : 1
  if ((a.semester ?? 0) !== (b.semester ?? 0)) return (a.semester ?? 0) - (b.semester ?? 0)
  return (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0)
}

// Editierbare, note-bildende Kategorien (SA/Test/Individuell). Mitarbeit & Hausübungen werden
// NICHT einzeln bearbeitet – dort wird nur die (berechnete) Mitarbeitsnote überschrieben.
const KAT_GRUPPEN = [
  { key: 'SA', label: 'Schularbeiten', kats: ['SA'] },
  { key: 'T', label: 'Tests', kats: ['T'] },
  { key: 'CUSTOM', label: 'Individuell', kats: ['CUSTOM'] },
]
const REZENZ_LABEL = { SA: 'Schularbeiten', T: 'Tests', CUSTOM: 'Individuell' }

// Liniendiagramm der Rezenz-Gewichtung einer Kategorie: x = Zeit (alt → neu), y = Einfluss (Gewicht)
// auf FESTER Skala 1×…3× (Slider-Maximum). Der WINKEL der Linie zeigt damit den Einfluss neuerer
// Leistungen: flach auf der 1×-Grundlinie = alle gleich, steil = neuere zählen stark. Die Linie bildet
// NICHT die Noten ab; die Punkte tragen den Kommawert des Gewichts. viewBox 0..100 (preserveAspectRatio
// none) füllt die Breite; Strich + Punkte bleiben über vector-effect / HTML-Overlay unverzerrt.
const WEIGHT_MAX = 3 // Slider-Maximum → feste y-Skala, damit der Winkel den Faktor widerspiegelt
function RezenzLinie({ bars }) {
  const m = bars.length
  const xOf = (i) => (m === 1 ? 50 : 8 + (i / (m - 1)) * 84)
  const yOf = (g) => {
    const y = 10 + (1 - (g - 1) / (WEIGHT_MAX - 1)) * 64 // g=1 → 74 (unten), g=3 → 10 (oben)
    return Math.max(4, Math.min(78, y))
  }
  const pts = bars.map((b, i) => `${xOf(i)},${yOf(b.g)}`).join(' ')
  return (
    <div className="relative h-20 text-coral-400 dark:text-coral-500">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
        {/* 1×-Grundlinie (kein Einfluss) als Bezug für den Winkel */}
        <line x1="0" y1={yOf(1)} x2="100" y2={yOf(1)} className="stroke-paper-300 dark:stroke-ink-700"
          strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        {m > 1 && (
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2"
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        )}
      </svg>
      {bars.map((b, i) => (
        <React.Fragment key={i}>
          <div className="absolute w-2 h-2 rounded-full bg-coral-500 dark:bg-coral-400 ring-2 ring-white dark:ring-ink-900"
            style={{ left: `${xOf(i)}%`, top: `${yOf(b.g)}%`, transform: 'translate(-50%, -50%)' }}
            title={`Note ${b.n} · Gewicht ${komma(b.g)}×`} />
          <div className="absolute text-[9px] text-ink-500 dark:text-ink-400 tabular-nums"
            style={{ left: `${xOf(i)}%`, bottom: 0, transform: 'translateX(-50%)' }}>{komma(b.g, 1)}×</div>
        </React.Fragment>
      ))}
    </div>
  )
}

export default function ZeugnisnoteModal({ schueler, onClose }) {
  const {
    aktivesFach, spalten, eintraege, gewichtungGlobal,
    niveaus, niveauHistorie, einstellungen, zeugnisnoten, rezenzFaktoren, maNoten, gewichtungSchueler,
    ladeFachDaten, refreshAktivesFach,
  } = useStore()

  const fachSpalten = spalten || []
  const isDifferenziert = aktivesFach?.benotungssystem === 'differenziert'
  const niveau = isDifferenziert ? (niveaus[schueler.id] ?? 'AHS') : null
  const offset = niveauOffset(niveau)

  const globalRezenz = parseFloat(einstellungen?.rezenz_faktor ?? '1')
  const hatOverride = rezenzFaktoren?.[schueler.id] != null
  const rezenzInit = hatOverride ? rezenzFaktoren[schueler.id] : globalRezenz

  const znInit = zeugnisnoten[`${schueler.id}_3`]
  const manuellInternInit = (znInit?.note_manuell ?? null)
  const maInternInit = (maNoten?.[schueler.id] ?? null) // manuelle Mitarbeitsnote (intern) oder null

  // ── Entwurfs-Zustand ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState(() => {
    const d = {}
    for (const sp of fachSpalten) {
      const key = `${sp.id}_${schueler.id}`
      d[key] = eintraege[key] ?? ''
    }
    return d
  })
  // Gewichtung (Anteile 0..1): effektiv = per-Schüler:in ?? Fach ?? global ?? Default.
  const fachGewichtung = {
    SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
    T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
    CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.1,
    MA:     aktivesFach?.gewichtung_ma     ?? gewichtungGlobal?.MA     ?? 0.2,
  }
  const gewichtOverride = gewichtungSchueler?.[schueler.id]
  const gewichtHatOverride = gewichtOverride != null
  const gewichtInit = gewichtOverride
    ? {
        SA: gewichtOverride.sa ?? fachGewichtung.SA, T: gewichtOverride.t ?? fachGewichtung.T,
        CUSTOM: gewichtOverride.custom ?? fachGewichtung.CUSTOM, MA: gewichtOverride.ma ?? fachGewichtung.MA,
      }
    : fachGewichtung

  const [manuellIntern, setManuellIntern] = useState(manuellInternInit)
  const [maIntern, setMaIntern] = useState(maInternInit)
  const [faktor, setFaktor] = useState(rezenzInit)
  const [resetGewuenscht, setResetGewuenscht] = useState(false)
  const [gewichtDraft, setGewichtDraft] = useState(gewichtInit)
  const [gewichtEdit, setGewichtEdit] = useState(false)
  const [gewichtEditKat, setGewichtEditKat] = useState(null) // Kategorie, deren % gerade getippt wird
  const [gewichtResetGewuenscht, setGewichtResetGewuenscht] = useState(false)
  const [offeneGruppen, setOffeneGruppen] = useState({}) // Leistungskategorien standardmäßig eingeklappt
  const [scopeFrage, setScopeFrage] = useState(false)
  const [speichert, setSpeichert] = useState(false)

  const setGewicht = (kat, prozent) => {
    setGewichtResetGewuenscht(false)
    setGewichtDraft(g => ({ ...g, [kat]: Math.max(0, Math.min(100, prozent || 0)) / 100 }))
  }
  const gewichtAufFach = () => { setGewichtResetGewuenscht(true); setGewichtDraft(fachGewichtung) }
  const gewichtGleich = (a, b) => ['SA', 'T', 'CUSTOM', 'MA'].every(k => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 0.0001)
  const gewichtWertGeaendert = !gewichtResetGewuenscht && !gewichtGleich(gewichtDraft, gewichtInit)
  const gewichtResetAktiv = gewichtResetGewuenscht && gewichtHatOverride
  const gewichtSummeProzent = Math.round(['SA', 'T', 'CUSTOM', 'MA'].reduce((a, k) => a + (gewichtDraft[k] ?? 0), 0) * 100)

  const setWert = (spalteId, wert) => {
    const key = `${spalteId}_${schueler.id}`
    setDraft(d => ({ ...d, [key]: d[key] === wert ? '' : wert }))
  }
  const toggleGruppe = (key) => setOffeneGruppen(o => ({ ...o, [key]: !o[key] }))
  const gruppeSummary = (cols) => {
    const vals = cols.map(sp => draft[`${sp.id}_${schueler.id}`] ?? '').filter(Boolean)
    return vals.length ? vals.join(' · ') : '—'
  }

  // ── Vorschau (reine computeZN mit Entwurf + Slider-Faktor + Gewichtungs-Entwurf) ──
  const bd = useMemo(() => computeZN({
    spalten: fachSpalten, eintraege: draft, gewichtung: gewichtDraft, rezenzFaktor: faktor,
    istDifferenziert: isDifferenziert,
    niveauHistorie: niveauHistorie?.[schueler.id],
    niveauFallback: niveau ?? 'AHS',
    schuelerId: schueler.id,
    maNoteManuell: maIntern,
  }), [fachSpalten, draft, gewichtDraft, faktor, isDifferenziert, niveauHistorie, niveau, schueler.id, maIntern])

  // Kernkette exakt nachbilden: intern auf Niveau-Fenster deckeln, DANN auf 2 Dezimalen runden,
  // erst danach auf die Anzeige (intern − Offset) umrechnen. So == gespeicherte Note.
  const noteIntern2 = bd?.basisIntern != null
    ? Math.round(Math.max(1 + offset, Math.min(5 + offset, bd.basisIntern)) * 100) / 100
    : null
  const berAnzeige = noteIntern2 != null ? noteIntern2 - offset : null

  const istManuell = manuellIntern != null
  const manuellAnzeige = istManuell ? clamp15(manuellIntern - offset) : null
  const previewNote = istManuell
    ? manuellAnzeige
    : (berAnzeige != null ? clamp15(Math.round(berAnzeige)) : null)

  // Mitarbeitsnote (§ 4 Abs. 2): berechneter Vorschlag (aus MA/HÜ) vs. manuelle Überschreibung.
  const istMaManuell = maIntern != null
  const maBerechnetAnzeige = bd?.maBerechnet != null ? bd.maBerechnet - offset : null
  const maManuellAnzeige = istMaManuell ? clamp15(maIntern - offset) : null

  // Zwischennote (x,5) – aus dem gerundeten Wert (wie Zelle/Kern), nur ohne manuelle Note.
  const istTie = !istManuell && berAnzeige != null && berAnzeige >= 1 && berAnzeige <= 5
    && Math.abs((berAnzeige % 1) - 0.5) < 0.01
  const tieLabel = istTie ? komma(berAnzeige, 1) : null
  const tieBesser = istTie ? Math.max(1, Math.floor(berAnzeige)) : null
  const tieSchlechter = istTie ? Math.min(5, Math.ceil(berAnzeige)) : null

  const maWarnung = einstellungen?.ma_pflicht_warnung !== '0'
    && !!bd && bd.hatBasisNoten && !bd.hatMitarbeit && !istManuell

  // ── Rezenz-Graph + Klartext je Kategorie (SA/T/CUSTOM) ────────────────────
  const rezenzRows = useMemo(() => {
    const rows = []
    for (const kat of ['SA', 'T', 'CUSTOM']) {
      const arr = []
      for (const sp of fachSpalten) {
        if (sp.kategorie !== kat) continue
        const n = parseInt(draft[`${sp.id}_${schueler.id}`] ?? '')
        if (!(n >= 1 && n <= 5)) continue
        arr.push({ n, datum: sp.datum || '', semester: sp.semester ?? 0, reihenfolge: sp.reihenfolge ?? 0 })
      }
      if (!arr.length) continue
      arr.sort(chronologisch)
      const m = arr.length
      const bars = arr.map((e, i) => ({ n: e.n, g: rangGewicht(i, m, faktor) }))
      const schnittMit = gewichteterSchnitt(arr.map(e => ({ n: e.n, datum: e.datum, semester: e.semester, reihenfolge: e.reihenfolge })), faktor)
      const schnittOhne = arr.reduce((a, e) => a + e.n, 0) / m
      rows.push({ kat, bars, m, schnittMit, schnittOhne })
    }
    return rows
  }, [fachSpalten, draft, faktor, schueler.id])

  const rezenzWirkt = faktor > 1 && rezenzRows.some(r => r.m >= 2)

  const rezenzChanged = resetGewuenscht
    ? hatOverride
    : Math.abs(faktor - rezenzInit) > 0.001

  // ── Escape schließt (erst die Scope-Frage, sonst das Modal) ───────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || speichert) return
      if (scopeFrage) setScopeFrage(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scopeFrage, speichert, onClose])

  // ── Speichern ─────────────────────────────────────────────────────────────
  const commit = async (scope /* 'einzeln' | 'klasse' | null */) => {
    if (speichert || !aktivesFach) return
    setSpeichert(true)
    const fachId = aktivesFach.id
    // 1. Teilnoten-Diffs
    for (const sp of fachSpalten) {
      const key = `${sp.id}_${schueler.id}`
      const neu = draft[key] ?? ''
      if ((eintraege[key] ?? '') !== neu) {
        await window.api.eintraege.set(sp.id, schueler.id, neu)
      }
    }
    let recomputed = false
    // 2. Manuelle Mitarbeitsnote (§ 4 Abs. 2). maNote.set rechnet das ganze Fach bereits neu.
    if (maIntern !== maInternInit) {
      await window.api.maNote.set(fachId, schueler.id, maIntern) // null → entfernen
      recomputed = true
    }
    // 3. Manuelle Zeugnisnote
    if (manuellIntern !== manuellInternInit) {
      if (manuellIntern == null) await window.api.zeugnisnoten.clearManuell(fachId, schueler.id)
      else await window.api.zeugnisnoten.setManuell(fachId, schueler.id, manuellIntern)
    }
    // 4. Rezenzfaktor (per-Schüler:in oder Klasse; resetGewuenscht → null = auf global zurück).
    //    rezenz.set/setKlasse rechnen das ganze Fach bereits neu.
    if (rezenzChanged) {
      const val = resetGewuenscht ? null : faktor
      if (scope === 'klasse') await window.api.rezenz.setKlasse(fachId, val)
      else await window.api.rezenz.set(fachId, schueler.id, val)
      recomputed = true
    }
    // 5. Gewichtung. Zurücksetzen = immer per-Schüler:in (Override entfernen). Wertänderung folgt
    //    dem Scope: „ganze Klasse" schreibt die Fach-Gewichtung (und entfernt diesen Override),
    //    „einzeln" schreibt einen per-Schüler:in-Override.
    let fachAktualisiert = false
    if (gewichtResetAktiv) {
      await window.api.gewichtungSchueler.set(fachId, schueler.id, null)
      recomputed = true
    } else if (gewichtWertGeaendert) {
      const data = { sa: gewichtDraft.SA, t: gewichtDraft.T, custom: gewichtDraft.CUSTOM, ma: gewichtDraft.MA }
      if (scope === 'klasse') {
        await window.api.faecher.updateGewichtung(fachId, data)
        await window.api.gewichtungSchueler.set(fachId, schueler.id, null)
        fachAktualisiert = true
      } else {
        await window.api.gewichtungSchueler.set(fachId, schueler.id, data)
      }
      recomputed = true
    }
    // 6. Falls noch nicht neu gerechnet (nur Teilnoten/Manuell-ZN geändert): jetzt nachholen.
    if (!recomputed) await window.api.zeugnisnoten.berechneFach(fachId)
    await ladeFachDaten(fachId)
    if (fachAktualisiert) await refreshAktivesFach()
    setSpeichert(false)
    onClose()
  }

  // Scope-Frage nur bei Wertänderungen, die auch klassenweit gelten können (Rezenz / Gewichtung).
  const brauchtScope = rezenzChanged || gewichtWertGeaendert
  const scopeItems = []
  if (gewichtWertGeaendert) scopeItems.push('Gewichtung')
  if (rezenzChanged) scopeItems.push('Rezenzfaktor')
  const scopeLabel = scopeItems.join(' & ') || 'Änderungen'
  const handleSpeichern = () => {
    if (brauchtScope) { setScopeFrage(true); return }
    commit(null)
  }

  const aufBerechnet = () => setManuellIntern(null)
  const aufManuell = () => setManuellIntern((berAnzeige != null ? clamp15(Math.round(berAnzeige)) : 3) + offset)
  const setManuellDisplay = (n) => setManuellIntern(n + offset)

  const maAufBerechnet = () => setMaIntern(null)
  const maAufManuell = () => setMaIntern((maBerechnetAnzeige != null ? clamp15(Math.round(maBerechnetAnzeige)) : 3) + offset)
  const setMaDisplay = (n) => setMaIntern(n + offset)

  // ── Render ────────────────────────────────────────────────────────────────
  const modal = (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && !speichert && onClose()}>
      <div className="modal-box zn-detail-box max-w-lg max-h-[88vh] p-0 flex flex-col overflow-hidden">

        {/* ── Kopf (fix): Ergebnis + Aufschlüsselung ── */}
        <header className="shrink-0 px-6 pt-5 pb-4 border-b border-paper-200 dark:border-ink-800">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink-900 dark:text-white leading-tight">Zeugnisnote</h2>
              <p className="text-sm text-ink-500 dark:text-ink-400 truncate">
                {schueler.vorname} {schueler.nachname}
                {aktivesFach?.name ? <> · {aktivesFach.name}</> : null}
                {isDifferenziert ? <span className="ml-1">({niveau})</span> : null}
              </p>
            </div>
            <div className="flex items-start gap-2 shrink-0">
              <div className="text-right">
                <div className={`text-5xl font-bold leading-none ${previewNote ? noteKlasse(previewNote) : 'text-ink-300 dark:text-ink-600'}`}>
                  {previewNote ?? '–'}
                </div>
                <div className="mt-1.5 flex justify-end">
                  {istManuell ? (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">manuell</span>
                  ) : berAnzeige != null ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-paper-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400 tabular-nums">berechnet {komma(berAnzeige)}</span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => !speichert && onClose()}
                className="text-ink-400 hover:text-ink-700 dark:hover:text-paper-200 text-lg leading-none -mr-1 -mt-0.5"
                title="Schließen"
              >✕</button>
            </div>
          </div>

          {/* Aufschlüsselung (bd.beitraege) – Klick auf die %-Werte öffnet den Gewichtungs-Editor */}
          {gewichtEdit ? (
            <div className="mt-3 rounded-lg bg-paper-50 dark:bg-ink-800/60 border border-paper-200 dark:border-ink-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Gewichtung</span>
                <button type="button" onClick={() => { setGewichtEditKat(null); setGewichtEdit(false) }} className="text-[11px] text-coral-600 hover:text-coral-700 dark:text-coral-300">Fertig</button>
              </div>
              <div className="space-y-2">
                {[['SA', 'Schularbeiten'], ['T', 'Tests'], ['CUSTOM', 'Individuell'], ['MA', 'Mitarbeit']].map(([k, label]) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-600 dark:text-ink-400 w-24 shrink-0 truncate">{label}</span>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={Math.round((gewichtDraft[k] ?? 0) * 100)}
                      onChange={e => setGewicht(k, parseFloat(e.target.value))}
                      className="flex-1 accent-coral-500"
                    />
                    {gewichtEditKat === k ? (
                      <input
                        type="number" min="0" max="100"
                        autoFocus
                        value={Math.round((gewichtDraft[k] ?? 0) * 100)}
                        onChange={e => setGewicht(k, parseFloat(e.target.value))}
                        onFocus={e => e.target.select()}
                        onBlur={() => setGewichtEditKat(null)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setGewichtEditKat(null) }}
                        className="input w-12 text-right px-1 py-0.5 text-[11px] tabular-nums"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setGewichtEditKat(k)}
                        title="Wert eingeben"
                        className="text-[11px] font-medium w-9 text-right tabular-nums text-ink-900 dark:text-white hover:text-coral-600 dark:hover:text-coral-300 cursor-text"
                      >
                        {Math.round((gewichtDraft[k] ?? 0) * 100)}%
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                <span className={gewichtSummeProzent === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-400'}>Summe {gewichtSummeProzent}%</span>
                {gewichtHatOverride && !gewichtResetGewuenscht ? (
                  <button type="button" onClick={gewichtAufFach} className="text-ink-500 hover:text-coral-600 dark:text-ink-400 dark:hover:text-coral-300">Auf Fach-Gewichtung zurücksetzen</button>
                ) : gewichtResetGewuenscht ? (
                  <span className="text-coral-600 dark:text-coral-300">Überschreibung wird entfernt</span>
                ) : null}
              </div>
            </div>
          ) : bd && bd.hatBasis ? (
            <div className="mt-3 space-y-1">
              {bd.beitraege.map(({ kat, detail, avg, w }) => {
                const avgAnzeige = avg - offset
                return (
                  <div key={kat} className="grid gap-2 text-[11px] items-baseline" style={{ gridTemplateColumns: '5rem 1fr auto auto' }}>
                    <span className="font-semibold text-ink-600 dark:text-ink-300">{kat}</span>
                    <span className="text-ink-400 dark:text-ink-500 truncate">{detail}</span>
                    <span className={`font-medium tabular-nums text-right ${noteKlasse(clamp15(Math.round(avgAnzeige)))}`}>{komma(avgAnzeige)}</span>
                    <button type="button" onClick={() => setGewichtEdit(true)} title="Gewichtung bearbeiten"
                      className="tabular-nums text-right text-ink-400 w-9 hover:text-coral-600 dark:hover:text-coral-300 underline decoration-dotted underline-offset-2 cursor-pointer">{Math.round(w * 100)}%</button>
                  </div>
                )
              })}
              <div className="grid gap-2 text-[11px] items-baseline border-t border-paper-100 dark:border-ink-800 pt-1 mt-1" style={{ gridTemplateColumns: '5rem 1fr auto auto' }}>
                <span className="font-semibold text-ink-700 dark:text-paper-200">gewichtet{gewichtHatOverride && <span className="ml-1 font-normal text-coral-500" title="Individuelle Gewichtung">•</span>}</span>
                <span />
                <span className="font-bold tabular-nums text-right text-ink-700 dark:text-paper-200">{berAnzeige != null ? komma(berAnzeige) : '–'}</span>
                <span className="w-9" />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-400 dark:text-ink-500">Noch keine Einträge vorhanden.</p>
          )}

          {maWarnung && (
            <div className="mt-3 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
              <span className="shrink-0">⚠</span>
              <span>Keine Mitarbeit erfasst – laut § 3 LBVO dürfen schriftliche Leistungen nicht alleinige Beurteilungsgrundlage sein.</span>
            </div>
          )}

          {istTie && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
              <span>◐ Zwischennote {tieLabel} – bitte wählen:</span>
              <button type="button" onClick={() => setManuellDisplay(tieBesser)}
                className="px-2 py-0.5 rounded-md font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300">{tieBesser} (besser)</button>
              <button type="button" onClick={() => setManuellDisplay(tieSchlechter)}
                className="px-2 py-0.5 rounded-md font-bold bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300">{tieSchlechter} (schlechter)</button>
            </div>
          )}
        </header>

        {/* ── Mittelteil (scrollt) ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">

          {/* Rezenz – Liniendiagramm der Gewichtung, OBERHALB der Aufzeichnungen */}
          <section className="rounded-2xl bg-paper-50 dark:bg-ink-800/50 border border-paper-200 dark:border-ink-700 p-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-ink-700 dark:text-paper-200">⚖ Gewichtung neuerer Leistungen <span className="text-ink-400 font-normal">(§ 20)</span></span>
              <span className="text-sm font-bold tabular-nums text-coral-600 dark:text-coral-300">{komma(faktor, 1)}×</span>
            </div>
            <input
              type="range"
              min="1" max="3" step="0.1"
              value={faktor}
              onChange={e => { setFaktor(parseFloat(e.target.value)); setResetGewuenscht(false) }}
              className="w-full accent-coral-500"
            />
            <div className="flex justify-between text-[10px] text-ink-400 mt-0.5 mb-2">
              <span>1,0 – gleich</span>
              <span>3,0 – stark</span>
            </div>
            <p className="text-[10px] text-ink-500 dark:text-ink-400 mb-3 leading-snug">
              Der Winkel der Linie zeigt den Einfluss (§ 20): je steiler, desto stärker zählen neuere
              Leistungen; flach auf der Grundlinie = alle gleich. Die Zahlen sind das Gewicht je Leistung
              (1,0× = wie alle anderen). Wirkt je Kategorie (SA/Test/Individuell), nicht auf Mitarbeit &amp; Hausübungen.
            </p>

            {rezenzRows.length > 0 ? (
              <div className="space-y-2">
                {rezenzRows.map(({ kat, bars, m, schnittMit, schnittOhne }) => (
                  <div key={kat}>
                    <div className="flex items-baseline justify-between text-[10px] mb-0.5">
                      <span className="text-ink-500 dark:text-ink-400">{REZENZ_LABEL[kat]} <span className="text-ink-400">(alt → neu)</span></span>
                      {m >= 2 && faktor > 1 && (
                        <span className="text-ink-500 dark:text-ink-400 tabular-nums">Schnitt {komma(schnittMit - offset)} <span className="text-ink-400">statt {komma(schnittOhne - offset)}</span></span>
                      )}
                    </div>
                    <RezenzLinie bars={bars} />
                  </div>
                ))}
                {!rezenzWirkt && (
                  <p className="text-[10px] text-ink-400">Bei Faktor 1,0 oder weniger als 2 Leistungen je Kategorie zählen alle gleich.</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-ink-400">Rezenz wirkt erst ab 2 Leistungen je Kategorie (SA/Test/Individuell).</p>
            )}

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-paper-200 dark:border-ink-700 pt-2">
              <span className="text-[11px] text-ink-500 dark:text-ink-400">
                Standard (Fach): <span className="tabular-nums">{komma(globalRezenz, 1)}×</span>
              </span>
              {hatOverride && !resetGewuenscht && (
                <button
                  type="button"
                  onClick={() => { setResetGewuenscht(true); setFaktor(globalRezenz) }}
                  className="text-[11px] text-ink-500 hover:text-coral-600 dark:text-ink-400 dark:hover:text-coral-300"
                >
                  Auf Standard zurücksetzen
                </button>
              )}
              {resetGewuenscht && <span className="text-[11px] text-coral-600 dark:text-coral-300">Überschreibung wird entfernt</span>}
            </div>
          </section>

          {/* Einzelne Leistungen (SA/Test/Individuell) – Kategorien standardmäßig eingeklappt.
              Mitarbeit & Hausübungen werden hier NICHT einzeln bearbeitet (eigene Sektion darunter). */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400 mb-2">Einzelne Leistungen</h3>
            {(() => {
              const gruppen = KAT_GRUPPEN
                .map(g => ({ g, cols: fachSpalten.filter(sp => g.kats.includes(sp.kategorie)) }))
                .filter(x => x.cols.length)
              if (!gruppen.length) {
                return <p className="text-sm text-ink-400">Keine Schularbeiten, Tests oder individuellen Leistungen erfasst.</p>
              }
              return (
                <div className="rounded-2xl border border-paper-200 dark:border-ink-700 divide-y divide-paper-200 dark:divide-ink-700 overflow-hidden">
                  {gruppen.map(({ g: gruppe, cols }) => {
                    const offen = !!offeneGruppen[gruppe.key]
                    return (
                      <div key={gruppe.key}>
                        <button
                          type="button"
                          onClick={() => toggleGruppe(gruppe.key)}
                          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-paper-50 dark:hover:bg-ink-800/60 transition-colors"
                        >
                          <span className="text-xs font-semibold text-ink-700 dark:text-paper-200 shrink-0">{gruppe.label}</span>
                          <span className="flex items-center gap-2 min-w-0">
                            {!offen && <span className="text-[11px] text-ink-400 dark:text-ink-500 truncate">{gruppeSummary(cols)}</span>}
                            <span className={`text-ink-400 transition-transform ${offen ? 'rotate-90' : ''}`}>▸</span>
                          </span>
                        </button>
                        {offen && (
                          <div className="px-3 pb-3 pt-0.5 space-y-1.5 acc-body-in">
                            {cols.map(sp => {
                              const wert = draft[`${sp.id}_${schueler.id}`] ?? ''
                              return (
                                <div key={sp.id} className="flex items-center gap-2">
                                  <div className="w-24 shrink-0 min-w-0">
                                    <div className="text-xs font-medium text-ink-700 dark:text-paper-200 truncate">{sp.kuerzel}</div>
                                    {sp.datum && <div className="text-[10px] text-ink-400 tabular-nums">{fmtDatum(sp.datum)}</div>}
                                  </div>
                                  <div className="flex gap-1 flex-wrap">
                                    {['1', '2', '3', '4', '5'].map(opt => (
                                      <button
                                        key={opt}
                                        type="button"
                                        onClick={() => setWert(sp.id, opt)}
                                        className={`min-w-[1.9rem] h-8 px-1 rounded-md text-sm font-medium transition-colors ${wert === opt ? AKTIV_NOTE : INAKTIV_KLASSE}`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </section>

          {/* Mitarbeit & Hausübungen (§ 4 Abs. 2): nicht einzeln editierbar – nur die (berechnete)
              Mitarbeitsnote wird als Gesamtbeurteilung überschrieben. */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400 mb-2">
              Mitarbeit &amp; Hausübungen <span className="normal-case text-ink-400 font-normal">(§ 4 Abs. 2)</span>
            </h3>
            <div className="inline-flex rounded-xl bg-paper-100 dark:bg-ink-800 p-1 mb-2">
              <button type="button" onClick={maAufBerechnet}
                className={`px-3 h-8 rounded-lg text-sm font-medium transition-colors ${!istMaManuell ? 'bg-white dark:bg-ink-900 shadow-sm text-ink-900 dark:text-white' : 'text-ink-500 dark:text-ink-400'}`}>
                Berechnet
              </button>
              <button type="button" onClick={maAufManuell}
                className={`px-3 h-8 rounded-lg text-sm font-medium transition-colors ${istMaManuell ? 'bg-white dark:bg-ink-900 shadow-sm text-ink-900 dark:text-white' : 'text-ink-500 dark:text-ink-400'}`}>
                Manuell
              </button>
            </div>
            {istMaManuell ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaDisplay(n)}
                      className={`w-9 h-9 rounded-md font-bold text-sm transition-colors ${maManuellAnzeige === n ? AKTIV_NOTE : INAKTIV_KLASSE}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {maBerechnetAnzeige != null && (
                  <span className="text-[11px] text-ink-400 tabular-nums">berechnet {komma(maBerechnetAnzeige)}</span>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-600 dark:text-paper-300">
                {maBerechnetAnzeige != null
                  ? <>Berechnete Mitarbeitsnote: <span className={`font-bold ${noteKlasse(clamp15(Math.round(maBerechnetAnzeige)))}`}>{komma(maBerechnetAnzeige)}</span> <span className="text-ink-400">(Durchschnitt aus + / − und ✓ / ✗)</span></>
                  : <span className="text-ink-400">Noch keine Mitarbeit oder Hausübung erfasst.</span>}
              </p>
            )}
            <p className="text-[10px] text-ink-400 mt-1.5">
              {istMaManuell
                ? 'Manuelle Mitarbeitsnote (Gesamtbeurteilung) – fließt mit ihrem Gewicht in die Zeugnisnote ein.'
                : 'Die einzelnen + / − und ✓ / ✗ werden in der Notentabelle erfasst; hier zählt ihr Durchschnitt.'}
            </p>
          </section>

          {/* Manuelle Note – Segmented Control */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400 mb-2">Zeugnisnote manuell festlegen</h3>
            <div className="inline-flex rounded-xl bg-paper-100 dark:bg-ink-800 p-1 mb-2">
              <button type="button" onClick={aufBerechnet}
                className={`px-3 h-8 rounded-lg text-sm font-medium transition-colors ${!istManuell ? 'bg-white dark:bg-ink-900 shadow-sm text-ink-900 dark:text-white' : 'text-ink-500 dark:text-ink-400'}`}>
                Berechnet
              </button>
              <button type="button" onClick={aufManuell}
                className={`px-3 h-8 rounded-lg text-sm font-medium transition-colors ${istManuell ? 'bg-white dark:bg-ink-900 shadow-sm text-ink-900 dark:text-white' : 'text-ink-500 dark:text-ink-400'}`}>
                Manuell
              </button>
            </div>
            {istManuell && (
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setManuellDisplay(n)}
                    className={`w-9 h-9 rounded-md font-bold text-sm transition-colors ${manuellAnzeige === n ? 'bg-coral-600 text-white' : INAKTIV_KLASSE}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-ink-400 mt-1.5">
              {istManuell
                ? 'Manuelle Note gilt. Teilnoten-Änderungen wirken nur auf die berechnete Note im Kopf.'
                : 'Die berechnete Note aus den Teilnoten gilt.'}
            </p>
          </section>
        </div>

        {/* ── Fußzeile (fix) ── */}
        <footer className="zn-detail-footer shrink-0 px-6 py-4 border-t border-paper-200 dark:border-ink-800 flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => !speichert && onClose()} disabled={speichert}>Abbrechen</button>
          <button type="button" className="btn-primary" onClick={handleSpeichern} disabled={speichert}>
            {speichert ? 'Speichern…' : 'Speichern'}
          </button>
        </footer>

        {/* Scope-Frage: Gewichtung / Rezenzfaktor nur für Schüler:in oder ganze Klasse */}
        {scopeFrage && (
          <div className="modal-overlay" style={{ zIndex: 70 }} onMouseDown={e => e.target === e.currentTarget && !speichert && setScopeFrage(false)}>
            <div className="modal-box max-w-sm">
              <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-1">{scopeLabel} übernehmen</h3>
              <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
                Sollen die Änderungen ({scopeLabel}) nur für {schueler.vorname} {schueler.nachname} oder für die ganze Klasse gelten?
              </p>
              <div className="space-y-2">
                <button type="button" className="btn-secondary w-full" onClick={() => commit('einzeln')} disabled={speichert}>
                  Nur {schueler.vorname}
                </button>
                <button type="button" className="btn-primary w-full" onClick={() => commit('klasse')} disabled={speichert}>
                  Ganze Klasse
                </button>
                <button type="button" className="w-full text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 py-1" onClick={() => setScopeFrage(false)} disabled={speichert}>
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return ReactDOM.createPortal(modal, document.body)
}
