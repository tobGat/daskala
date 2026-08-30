// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Schritt-für-Schritt-Assistent zum Erfassen der Kompetenz-Niveaus einer:s Schüler:in in einem Fach.
// Ein Durchlauf = eine Erhebung (Zeitpunkt). Bewertet wird JEDE Kann-Beschreibung (Item): pro Item wählst du
// das erreichte Niveau, wobei die Optionen die echten Raster-Formulierungen zeigen (mit der Niveaustufen-
// Bezeichnung als Label, z. B. „unter Anleitung"). Gegliedert je Kompetenzbereich → Teilkompetenz.
import React, { useState } from 'react'

const heute = () => new Date().toISOString().slice(0, 10)

function Fortschritt({ aktuell, anzahl }) {
  return (
    <div className="mb-4">
      <div className="h-1.5 w-full bg-paper-200 dark:bg-ink-800 rounded-full overflow-hidden">
        <div className="h-full bg-coral-500 rounded-full transition-all" style={{ width: `${(aktuell / anzahl) * 100}%` }} />
      </div>
    </div>
  )
}

export default function KompetenzAssistent({ schueler, fach, letzteSchulstufe, gesperrteSchulstufe, letzteSchulzweig, gesperrterSchulzweig, autoSchulzweig, schulstufen, erhebung, onClose, onSaved }) {
  const istBearbeiten = !!erhebung // bestehende Erhebung korrigieren
  const [schritt, setSchritt] = useState(0) // 0 = Intro, 1..N = Kompetenzbereiche, N+1 = Zusammenfassung
  const [schulstufe, setSchulstufe] = useState(erhebung?.schulstufe ?? gesperrteSchulstufe ?? letzteSchulstufe ?? null)
  // Beim Bearbeiten den ursprünglichen Zweig behalten; sonst autoSchulzweig (differenziert) mit Vorrang.
  const [schulzweig, setSchulzweig] = useState(erhebung?.schulzweig ?? autoSchulzweig ?? gesperrterSchulzweig ?? letzteSchulzweig ?? 'ahs') // 'ahs' | 'ms' (ab Stufe 6)
  const [datum, setDatum] = useState(erhebung?.datum ?? heute())
  const [titel, setTitel] = useState(erhebung?.titel ?? '')
  const [raster, setRaster] = useState(null)
  const [werte, setWerte] = useState({}) // { [bi]: { [ti]: { [ii]: niveau } } }
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState('')
  const [speichern, setSpeichern] = useState(false)

  const bereiche = raster?.bereiche ?? []
  // Standard (MS) hat ab Stufe 6 im Raster NUR Kompetenzniveau 1 ("unter Anleitung"); AHS hat 1–3.
  const istStandardMS = (schulstufe ?? 0) >= 6 && schulzweig === 'ms'
  const maxNiveau = istStandardMS ? 1 : ((raster?.niveaustufen ?? []).length || 1)
  const bezeichnung = (k) => (raster?.niveaustufen ?? []).find(x => x.niveau === k)?.bezeichnung || `Niveau ${k}`

  // Ein Item aufbereiten: Gibt es je Niveau UNTERSCHIEDLICHE Formulierungen (Stufe 3–4, teils 6–8)? Dann diese
  // als Anker je Niveau zeigen. Sonst (ein Text bzw. identische Niveaus – Stufe 1–2, 5, viele 6–8) den Satz
  // einmal als Aussage zeigen; das Niveau wählst du über die Niveaustufen-Knöpfe (1..maxNiveau).
  const itemInfo = (it) => {
    const ms = schulzweig === 'ms'
    const primN1 = ms ? (it.niveau1_standard ?? it.niveau1) : it.niveau1
    const primText = ms ? (it.text_standard ?? it.text) : it.text
    const distinct = [...new Set([primN1, it.niveau2, it.niveau3].filter(Boolean))]
    const textsDiffer = distinct.length >= 2
    // Hinweis auf die jeweils ANDERE Zug-Variante, falls abweichend.
    let otherNote = null
    if (ms) {
      const ahs = it.text ?? it.niveau1
      const prim = it.text_standard ?? it.niveau1_standard
      if (prim && ahs && ahs !== prim) otherNote = { label: 'AHS', text: ahs }
    } else {
      const std = it.text_standard ?? it.niveau1_standard
      if (std) otherNote = { label: 'Standard (MS)', text: std }
    }
    return {
      textsDiffer,
      single: textsDiffer ? null : (primText ?? distinct[0] ?? ''),
      nivText: { 1: primN1 || null, 2: it.niveau2 || null, 3: it.niveau3 || null },
      otherNote,
    }
  }

  const rasterLaden = async () => {
    if (!schulstufe) { setFehler('Bitte eine Schulstufe wählen.'); return }
    setLaden(true); setFehler('')
    try {
      const r = await window.api.kompetenzKatalog.getRaster(fach.name, schulstufe)
      if (!r || !r.bereiche?.length) { setFehler('Für diese Schulstufe ist kein Raster hinterlegt.'); setLaden(false); return }
      setRaster(r)
      const init = {}
      r.bereiche.forEach((b, bi) => {
        init[bi] = {}
        ;(b.kategorien ?? []).forEach((k, ti) => {
          init[bi][ti] = {}
          ;(k.items ?? []).forEach((_, ii) => { init[bi][ti][ii] = 0 })
        })
      })
      // Beim Bearbeiten die gespeicherten Niveaus übernehmen (per Position).
      if (erhebung) {
        for (const w of erhebung.werte ?? []) {
          if (init[w.bereich_idx]?.[w.teilkompetenz_idx]?.[w.item_idx] !== undefined) {
            init[w.bereich_idx][w.teilkompetenz_idx][w.item_idx] = w.niveau
          }
        }
      }
      setWerte(init)
      setSchritt(1)
    } catch {
      setFehler('Raster konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }

  const getNiveau = (bi, ti, ii) => werte[bi]?.[ti]?.[ii] ?? 0
  const setNiveau = (bi, ti, ii, k) => setWerte(w => ({
    ...w, [bi]: { ...w[bi], [ti]: { ...w[bi]?.[ti], [ii]: k } },
  }))
  const weiter = () => setSchritt(s => s + 1)
  const zurueck = () => { setFehler(''); setSchritt(s => s - 1) }

  const speichernFertig = async () => {
    setSpeichern(true); setFehler('')
    try {
      const alleWerte = []
      bereiche.forEach((b, bi) => (b.kategorien ?? []).forEach((k, ti) => (k.items ?? []).forEach((_, ii) => {
        alleWerte.push({
          bereich_idx: bi, teilkompetenz_idx: ti, item_idx: ii,
          bereich_name: b.name, teilkompetenz_name: k.name,
          niveau: getNiveau(bi, ti, ii), notiz: null,
        })
      })))
      if (istBearbeiten) {
        await window.api.kompetenzErhebungen.update(erhebung.id, { datum, titel: titel.trim() || null, werte: alleWerte })
      } else {
        await window.api.kompetenzErhebungen.speichern({
          schuelerId: schueler.id, fachId: fach.id, schulstufe,
          schulzweig: schulstufe >= 6 ? schulzweig : null,
          datum, titel: titel.trim() || null, werte: alleWerte,
        })
      }
      onSaved?.()
      onClose?.()
    } catch {
      setFehler('Speichern fehlgeschlagen.')
      setSpeichern(false)
    }
  }

  const anzahlSchritte = (bereiche.length || 1) + 1
  const aktBereichIdx = schritt >= 1 && schritt <= bereiche.length ? schritt - 1 : null
  const aktBereich = aktBereichIdx != null ? bereiche[aktBereichIdx] : null

  // Zähler für die Zusammenfassung: wie viele Kann-Beschreibungen sind erfasst (Niveau > 0)?
  const zaehle = (bi) => {
    let gesamt = 0, erfasst = 0
    ;(bereiche[bi]?.kategorien ?? []).forEach((k, ti) => (k.items ?? []).forEach((_, ii) => {
      gesamt++; if (getNiveau(bi, ti, ii) > 0) erfasst++
    }))
    return { gesamt, erfasst }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl w-[92vw] flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Kompetenzen-Assistent{istBearbeiten ? ' – bearbeiten' : ''}</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">{schueler.vorname} {schueler.nachname} · {fach.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-600 text-sm">✕</button>
        </div>

        {schritt > 0 && <Fortschritt aktuell={schritt} anzahl={anzahlSchritte} />}

        <div className="flex-1 overflow-y-auto px-0.5">
          {/* Schritt 0: Intro */}
          {schritt === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600 dark:text-paper-300">
                Erfasse den aktuellen Stand jeder Kann-Beschreibung. Pro Beschreibung wählst du das erreichte Niveau.
                Der Durchlauf wird als Erhebung mit Datum gespeichert – beliebig oft pro Jahr wiederholbar, die Entwicklung
                erscheint im Netzdiagramm.
              </p>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Datum</label>
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)}
                  className="w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-3 py-2 text-ink-800 dark:text-paper-200 focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Titel (optional)</label>
                <input type="text" value={titel} onChange={e => setTitel(e.target.value)} placeholder="z. B. Herbst, Semesterende…"
                  className="w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-3 py-2 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Schulstufe</label>
                {(gesperrteSchulstufe || istBearbeiten) ? (
                  <p className="text-sm text-ink-700 dark:text-paper-200">{schulstufe}. Schulstufe <span className="text-ink-400">({istBearbeiten ? 'Erhebung wird bearbeitet' : 'für dieses Fach festgelegt'})</span></p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(schulstufen ?? []).map(s => (
                      <button key={s} onClick={() => setSchulstufe(s)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${schulstufe === s ? 'bg-coral-500 text-white shadow-soft' : 'bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-700'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(schulstufe ?? 0) >= 6 && (
                <div>
                  <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Leistungsniveau</label>
                  {istBearbeiten ? (
                    <p className="text-sm text-ink-700 dark:text-paper-200">{schulzweig === 'ms' ? 'Standard (Mittelschule)' : 'Standard AHS'} <span className="text-ink-400">(Erhebung wird bearbeitet)</span></p>
                  ) : autoSchulzweig ? (
                    <p className="text-sm text-ink-700 dark:text-paper-200">{autoSchulzweig === 'ms' ? 'Standard (Mittelschule)' : 'Standard AHS'} <span className="text-ink-400">(automatisch – differenziertes Fach, Niveau {autoSchulzweig === 'ms' ? 'ST' : 'AHS'})</span></p>
                  ) : gesperrterSchulzweig ? (
                    <p className="text-sm text-ink-700 dark:text-paper-200">{gesperrterSchulzweig === 'ms' ? 'Standard (Mittelschule)' : 'Standard AHS'} <span className="text-ink-400">(für dieses Fach festgelegt)</span></p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {[['ahs', 'Standard AHS'], ['ms', 'Standard (Mittelschule)']].map(([val, lab]) => (
                        <button key={val} onClick={() => setSchulzweig(val)}
                          className={`px-3 h-9 rounded-lg text-sm font-semibold transition-all ${schulzweig === val ? 'bg-coral-500 text-white shadow-soft' : 'bg-paper-100 dark:bg-ink-800 text-ink-600 dark:text-paper-300 hover:bg-paper-200 dark:hover:bg-ink-700'}`}>
                          {lab}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-ink-400">Ab der 6. Schulstufe unterscheidet das Raster Standard (Mittelschule) und AHS; die Formulierungen richten sich danach.</p>
                </div>
              )}
            </div>
          )}

          {/* Schritt 1..N: je Kompetenzbereich → Teilkompetenzen → Kann-Beschreibungen */}
          {aktBereich && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Kompetenzbereich {schritt}/{bereiche.length}</p>
                <h3 className="text-base font-semibold text-ink-900 dark:text-white">{aktBereich.name}</h3>
                {aktBereich.basis && <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{aktBereich.basis}</p>}
                <p className="text-[11px] text-ink-400 mt-1">Wähle je Kann-Beschreibung das erreichte Niveau (oder „noch nicht").</p>
              </div>

              {(aktBereich.kategorien ?? []).map((k, ti) => (
                <div key={ti} className="space-y-2">
                  <p className="text-sm font-semibold text-ink-800 dark:text-paper-100 border-b border-paper-100 dark:border-ink-800 pb-1">{k.name}</p>
                  {(k.items ?? []).map((it, ii) => {
                    const gewaehlt = getNiveau(aktBereichIdx, ti, ii)
                    const info = itemInfo(it)
                    return (
                      <div key={ii} className="rounded-lg border border-paper-200 dark:border-ink-800 p-2 space-y-1">
                        {info.single != null && (
                          <div className="px-1 pb-0.5">
                            <p className="text-[12px] text-ink-700 dark:text-paper-200 leading-snug">kann {info.single}</p>
                            {info.otherNote && <p className="text-[11px] text-ink-400 italic">{info.otherNote.label}: kann {info.otherNote.text}</p>}
                          </div>
                        )}
                        {Array.from({ length: maxNiveau }, (_, i) => i + 1).map(nk => {
                          const aktiv = gewaehlt === nk
                          const anker = info.textsDiffer ? info.nivText[nk] : null
                          return (
                            <button key={nk} onClick={() => setNiveau(aktBereichIdx, ti, ii, aktiv ? 0 : nk)}
                              className={`w-full text-left rounded-md px-2.5 py-1.5 flex gap-2 items-start transition-colors ${aktiv
                                ? 'bg-coral-50 dark:bg-coral-900/30 ring-1 ring-coral-300 dark:ring-coral-700'
                                : 'hover:bg-paper-100 dark:hover:bg-ink-800'}`}>
                              <span className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${aktiv ? 'bg-coral-500 border-coral-500 text-white' : 'border-paper-300 dark:border-ink-600 text-ink-400'}`}>
                                {nk}
                              </span>
                              <span className="text-[12px] leading-snug">
                                <span className={`font-semibold ${aktiv ? 'text-coral-700 dark:text-coral-300' : 'text-ink-600 dark:text-paper-300'}`}>{bezeichnung(nk)}</span>
                                {anker && <span className="text-ink-600 dark:text-paper-300"> — kann {anker}</span>}
                                {nk === 1 && info.single == null && info.otherNote && <span className="block text-[11px] text-ink-400 italic">{info.otherNote.label}: kann {info.otherNote.text}</span>}
                              </span>
                            </button>
                          )
                        })}
                        <button onClick={() => setNiveau(aktBereichIdx, ti, ii, 0)}
                          className={`text-[11px] px-2.5 ${gewaehlt === 0 ? 'text-ink-500 font-medium' : 'text-ink-400 hover:text-ink-600'}`}>
                          · noch nicht erfasst
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Letzter Schritt: Zusammenfassung */}
          {schritt === bereiche.length + 1 && bereiche.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-ink-600 dark:text-paper-300">Zusammenfassung – erfasste Kann-Beschreibungen je Bereich. Speichern legt die Erhebung an.</p>
              <div className="border border-paper-200 dark:border-ink-800 rounded-lg divide-y divide-paper-100 dark:divide-ink-800">
                {bereiche.map((b, bi) => {
                  const { gesamt, erfasst } = zaehle(bi)
                  return (
                    <div key={bi} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-sm text-ink-700 dark:text-paper-200 truncate">{b.name}</span>
                      <span className="text-xs text-ink-500 dark:text-ink-400 flex-shrink-0"><span className="font-bold text-coral-600 dark:text-coral-400">{erfasst}</span>/{gesamt} erfasst</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {fehler && <p className="text-red-500 text-sm mt-3">{fehler}</p>}
        </div>

        <div className="flex gap-3 pt-4 mt-2 border-t border-paper-100 dark:border-ink-800">
          {schritt === 0 ? (
            <>
              <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
              <button className="btn-primary flex-1" onClick={rasterLaden} disabled={laden}>{laden ? 'Lädt…' : 'Weiter'}</button>
            </>
          ) : (
            <>
              <button className="btn-secondary flex-1" onClick={zurueck}>Zurück</button>
              {schritt <= bereiche.length ? (
                <button className="btn-primary flex-1" onClick={weiter}>Weiter</button>
              ) : (
                <button className="btn-primary flex-1" onClick={speichernFertig} disabled={speichern}>{speichern ? 'Speichert…' : 'Speichern'}</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
