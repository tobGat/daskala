// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Detail-Modal der Zeugnisnote (Klick auf die ZN-Zelle). Erlaubt:
//  • die einzelnen Teilnoten (alle Aufzeichnungen dieses Fachs/Schüler:in) ansehen & ändern,
//    mit sofortiger Vorschau der Zeugnisnote (§ 4 Abs. 2 LBVO – Mitarbeit als eigene Note),
//  • die Zeugnisnote manuell überschreiben (bzw. zurücksetzen),
//  • den Rezenzfaktor (§ 20 LBVO) pro (Fach, Schüler:in) einzustellen, grafisch dargestellt.
// Alles ist ein Entwurf – Commit erst bei „OK". Bei geändertem Rezenzfaktor wird gefragt,
// ob er nur für diese:n Schüler:in oder die ganze Klasse gelten soll.
import React, { useState, useMemo } from 'react'
import useStore from '../store/useStore'
import { computeZN, maSymboleVon } from '../utils/znBreakdown'
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

// Auswahl-Symbole einer MA-Spalte je nach Stufen (2-stufig fix +/−, 3-/4-stufig aus der Spalte).
function maOptionen(spalte) {
  if (spalte.ma_stufen === 3 || spalte.ma_stufen === 4) return maSymboleVon(spalte)
  return ['+', '-']
}
const HUE_OPTIONEN = ['✓', '✗', '—']

// Chronologische Sortierung wie im Kern (gewichteterSchnitt): Datum (leer = ältest) → Semester → Reihenfolge.
function chronologisch(a, b) {
  const da = a.datum || '', db = b.datum || ''
  if (da !== db) return da < db ? -1 : 1
  if ((a.semester ?? 0) !== (b.semester ?? 0)) return (a.semester ?? 0) - (b.semester ?? 0)
  return (a.reihenfolge ?? 0) - (b.reihenfolge ?? 0)
}

const KAT_LABEL = { SA: 'Schularbeiten', T: 'Tests', CUSTOM: 'Individuell' }

export default function ZeugnisnoteModal({ schueler, onClose }) {
  const {
    aktivesFach, spalten, eintraege, gewichtungGlobal,
    niveaus, niveauHistorie, einstellungen, zeugnisnoten, rezenzFaktoren,
    ladeFachDaten,
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

  // ── Entwurfs-Zustand ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState(() => {
    const d = {}
    for (const sp of fachSpalten) {
      const key = `${sp.id}_${schueler.id}`
      d[key] = eintraege[key] ?? ''
    }
    return d
  })
  const [manuellIntern, setManuellIntern] = useState(manuellInternInit)
  const [faktor, setFaktor] = useState(rezenzInit)
  const [resetGewuenscht, setResetGewuenscht] = useState(false)
  const [scopeFrage, setScopeFrage] = useState(false)
  const [speichert, setSpeichert] = useState(false)

  const setWert = (spalteId, wert) => {
    const key = `${spalteId}_${schueler.id}`
    setDraft(d => ({ ...d, [key]: d[key] === wert ? '' : wert }))
  }

  // ── Vorschau (reine computeZN mit Entwurf + Slider-Faktor) ────────────────
  const gewichtung = useMemo(() => ({
    SA:     aktivesFach?.gewichtung_sa     ?? gewichtungGlobal?.SA     ?? 0.4,
    T:      aktivesFach?.gewichtung_t      ?? gewichtungGlobal?.T      ?? 0.3,
    CUSTOM: aktivesFach?.gewichtung_custom ?? gewichtungGlobal?.CUSTOM ?? 0.1,
    MA:     aktivesFach?.gewichtung_ma     ?? gewichtungGlobal?.MA     ?? 0.2,
  }), [aktivesFach, gewichtungGlobal])

  const bd = useMemo(() => computeZN({
    spalten: fachSpalten, eintraege: draft, gewichtung, rezenzFaktor: faktor,
    istDifferenziert: isDifferenziert,
    niveauHistorie: niveauHistorie?.[schueler.id],
    niveauFallback: niveau ?? 'AHS',
    schuelerId: schueler.id,
  }), [fachSpalten, draft, gewichtung, faktor, isDifferenziert, niveauHistorie, niveau, schueler.id])

  const berAnzeige = bd?.basisIntern != null ? bd.basisIntern - offset : null
  const istManuell = manuellIntern != null
  const manuellAnzeige = istManuell ? clamp15(manuellIntern - offset) : null
  const previewNote = istManuell
    ? manuellAnzeige
    : (berAnzeige != null ? clamp15(Math.round(berAnzeige)) : null)

  // Zwischennote (x,5) – nur relevant ohne manuelle Überschreibung.
  const istTie = !istManuell && berAnzeige != null && berAnzeige >= 1 && berAnzeige <= 5
    && Math.abs((berAnzeige % 1) - 0.5) < 0.01
  const tieLabel = istTie ? berAnzeige.toFixed(1).replace('.', ',') : null

  const maWarnung = einstellungen?.ma_pflicht_warnung !== '0'
    && !!bd && bd.hatBasisNoten && !bd.hatMitarbeit && !istManuell

  // ── Rezenz-Graph: Gewichts-Balken je Kategorie (SA/T/CUSTOM) ──────────────
  const rezenzRows = useMemo(() => {
    const rows = []
    for (const kat of ['SA', 'T', 'CUSTOM']) {
      const arr = []
      for (const sp of fachSpalten) {
        if (sp.kategorie !== kat) continue
        const w = draft[`${sp.id}_${schueler.id}`] ?? ''
        const n = parseInt(w)
        if (!(n >= 1 && n <= 5)) continue
        arr.push({ n, datum: sp.datum || '', semester: sp.semester ?? 0, reihenfolge: sp.reihenfolge ?? 0 })
      }
      if (!arr.length) continue
      arr.sort(chronologisch)
      const m = arr.length
      const ramp = faktor > 1 && m >= 2
      const maxG = ramp ? faktor : 1
      const bars = arr.map((e, i) => ({
        n: e.n,
        g: ramp ? 1 + (faktor - 1) * (i / (m - 1)) : 1,
      })).map(b => ({ ...b, hoehe: Math.round((b.g / maxG) * 100) }))
      rows.push({ kat, bars })
    }
    return rows
  }, [fachSpalten, draft, faktor, schueler.id])

  const rezenzChanged = resetGewuenscht
    ? hatOverride
    : Math.abs(faktor - rezenzInit) > 0.001

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
    // 2. Manuelle Note
    if (manuellIntern !== manuellInternInit) {
      if (manuellIntern == null) await window.api.zeugnisnoten.clearManuell(fachId, schueler.id)
      else await window.api.zeugnisnoten.setManuell(fachId, schueler.id, manuellIntern)
    }
    // 3. Rezenzfaktor (per-Schüler:in oder Klasse; resetGewuenscht → null = auf global zurück)
    if (scope) {
      const val = resetGewuenscht ? null : faktor
      if (scope === 'klasse') await window.api.rezenz.setKlasse(fachId, val)
      else await window.api.rezenz.set(fachId, schueler.id, val)
    }
    // 4. Neu berechnen + Fach-Daten (inkl. rezenzFaktoren) neu laden
    await window.api.zeugnisnoten.berechneFach(fachId)
    await ladeFachDaten(fachId)
    setSpeichert(false)
    onClose()
  }

  const handleOk = () => {
    if (rezenzChanged) { setScopeFrage(true); return }
    commit(null)
  }

  const setManuellDisplay = (n) => setManuellIntern(n + offset)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" style={{ zIndex: 60 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg max-h-[88vh] overflow-y-auto">
        {/* Kopf */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white leading-tight">Zeugnisnote</h2>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {schueler.vorname} {schueler.nachname}
              {aktivesFach?.name ? <> · {aktivesFach.name}</> : null}
              {isDifferenziert ? <span className="ml-1">({niveau})</span> : null}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className={`text-4xl font-bold leading-none ${previewNote ? noteKlasse(previewNote) : 'text-ink-300'}`}>
              {previewNote ?? '–'}
            </div>
            {istManuell
              ? <p className="text-[11px] text-yellow-600 dark:text-yellow-400 mt-1">manuell</p>
              : (berAnzeige != null && <p className="text-[11px] text-ink-400 mt-1 tabular-nums">berechnet {berAnzeige.toFixed(2).replace('.', ',')}</p>)}
          </div>
        </div>

        {maWarnung && (
          <div className="mb-4 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
            <span className="shrink-0">⚠</span>
            <span>Keine Mitarbeit erfasst – laut § 3 LBVO dürfen schriftliche Leistungen nicht alleinige Beurteilungsgrundlage sein.</span>
          </div>
        )}

        {/* Teilnoten-Editor */}
        <section className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400 mb-2">Teilnoten</h3>
          {fachSpalten.length === 0 ? (
            <p className="text-sm text-ink-400">Noch keine Aufzeichnungen in diesem Fach.</p>
          ) : (
            <div className="space-y-1.5">
              {fachSpalten.map(sp => {
                const wert = draft[`${sp.id}_${schueler.id}`] ?? ''
                let optionen = null
                if (sp.kategorie === 'SA' || sp.kategorie === 'T' || sp.kategorie === 'CUSTOM') optionen = ['1', '2', '3', '4', '5']
                else if (sp.kategorie === 'MA') optionen = maOptionen(sp)
                else if (sp.kategorie === 'HÜ') optionen = HUE_OPTIONEN
                if (!optionen) return null
                return (
                  <div key={sp.id} className="flex items-center gap-2">
                    <div className="w-24 shrink-0 min-w-0">
                      <div className="text-xs font-medium text-ink-700 dark:text-paper-200 truncate">{sp.kuerzel}</div>
                      {sp.datum && <div className="text-[10px] text-ink-400 tabular-nums">{sp.datum}</div>}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {optionen.map(opt => {
                        const aktiv = wert === opt
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setWert(sp.id, opt)}
                            className={`min-w-[1.9rem] h-8 px-1 rounded-md text-sm font-medium transition-colors
                              ${aktiv
                                ? 'bg-coral-600 text-white'
                                : 'bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-700'}`}
                          >
                            {opt}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Manuelle Überschreibung */}
        <section className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400 mb-2">Note manuell</h3>
          {istTie && (
            <p className="text-[11px] text-ink-500 dark:text-ink-400 mb-1.5">
              Zwischennote {tieLabel} – bitte bessere oder schlechtere Note wählen:
            </p>
          )}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map(n => {
              const aktiv = istManuell
                ? manuellAnzeige === n
                : (berAnzeige != null && clamp15(Math.round(berAnzeige)) === n)
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setManuellDisplay(n)}
                  className={`w-9 h-9 rounded-md font-bold text-sm transition-colors
                    ${aktiv && istManuell ? 'bg-coral-600 text-white'
                      : aktiv ? 'ring-2 ring-coral-300 text-ink-700 dark:text-paper-200'
                      : 'bg-paper-100 dark:bg-ink-800 text-ink-700 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-700'}`}
                >
                  {n}
                </button>
              )
            })}
            {istManuell && (
              <button
                type="button"
                onClick={() => setManuellIntern(null)}
                className="ml-2 text-xs text-ink-500 hover:text-coral-600 dark:text-ink-400 dark:hover:text-coral-300"
              >
                Berechnung wiederherstellen
              </button>
            )}
          </div>
          <p className="text-[10px] text-ink-400 mt-1.5">
            {istManuell
              ? 'Teilnoten-Änderungen wirken nur auf die berechnete Note darunter.'
              : 'Ohne Überschreibung gilt die berechnete Note.'}
          </p>
        </section>

        {/* Rezenz-Panel (§ 20 LBVO) */}
        <section className="mb-5 rounded-2xl bg-paper-50 dark:bg-ink-800/60 border border-paper-200 dark:border-ink-700 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">Gewichtung neuer Leistungen</span>
            <span className="text-base font-bold tabular-nums text-coral-600 dark:text-coral-300">
              {faktor.toFixed(1).replace('.', ',')}×
            </span>
          </div>
          <input
            type="range"
            min="1" max="3" step="0.1"
            value={faktor}
            onChange={e => { setFaktor(parseFloat(e.target.value)); setResetGewuenscht(false) }}
            className="w-full accent-coral-500"
          />
          <div className="flex justify-between text-[10px] text-ink-400 mt-0.5">
            <span>1,0 – gleich</span>
            <span>3,0 – stark</span>
          </div>

          {/* Grafische Darstellung: je Kategorie ein Balken pro Leistung (Höhe = Rang-Gewicht) */}
          {rezenzRows.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {rezenzRows.map(({ kat, bars }) => (
                <div key={kat}>
                  <div className="text-[10px] text-ink-500 dark:text-ink-400 mb-0.5">{KAT_LABEL[kat]} <span className="text-ink-400">(alt → neu)</span></div>
                  <div className="flex items-end gap-1 h-12">
                    {bars.map((b, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`Note ${b.n} · Gewicht ${b.g.toFixed(2).replace('.', ',')}×`}>
                        <div className="w-full max-w-[1.5rem] rounded-t bg-coral-400 dark:bg-coral-500" style={{ height: `${Math.max(8, b.hoehe)}%` }} />
                        <span className="text-[9px] text-ink-500 dark:text-ink-400 tabular-nums mt-0.5">{b.n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-ink-400 mt-3">Rezenz wirkt erst ab 2 Leistungen je Kategorie (SA/Test/Individuell).</p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-paper-200 dark:border-ink-700 pt-2">
            <span className="text-[11px] text-ink-500 dark:text-ink-400">
              Standard (Fach): <span className="tabular-nums">{globalRezenz.toFixed(1).replace('.', ',')}×</span>
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

        {/* Fußzeile */}
        <div className="flex items-center justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={speichert}>Abbrechen</button>
          <button type="button" className="btn-primary" onClick={handleOk} disabled={speichert}>
            {speichert ? 'Speichert …' : 'OK'}
          </button>
        </div>

        {/* Scope-Frage: Rezenzfaktor nur für Schüler:in oder ganze Klasse */}
        {scopeFrage && (
          <div className="modal-overlay" style={{ zIndex: 70 }} onMouseDown={e => e.target === e.currentTarget && setScopeFrage(false)}>
            <div className="modal-box max-w-sm">
              <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-1">Rezenzfaktor übernehmen</h3>
              <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
                {resetGewuenscht
                  ? 'Soll die individuelle Gewichtung nur bei dieser Schüler:in oder in der ganzen Klasse entfernt werden?'
                  : <>Soll der Faktor <span className="font-medium tabular-nums">{faktor.toFixed(1).replace('.', ',')}×</span> nur für diese:n Schüler:in oder für die ganze Klasse gelten?</>}
              </p>
              <div className="space-y-2">
                <button type="button" className="btn-secondary w-full" onClick={() => commit('einzeln')} disabled={speichert}>
                  Nur {schueler.vorname}
                </button>
                <button type="button" className="btn-primary w-full" onClick={() => commit('klasse')} disabled={speichert}>
                  Ganze Klasse
                </button>
                <button type="button" className="w-full text-xs text-ink-400 hover:text-ink-600 py-1" onClick={() => setScopeFrage(false)} disabled={speichert}>
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
