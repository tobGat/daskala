// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Schritt-für-Schritt-Assistent zum Erfassen der Kompetenz-Niveaus einer:s Schüler:in in einem Fach.
// Ein Durchlauf = eine Erhebung (Zeitpunkt). Bewertet wird je TEILKOMPETENZ auf Niveau 0–3 (Beschriftung aus
// den Niveaustufen des Rasters); die einzelnen Kann-Beschreibungen dienen als Niveau-Anker/Hilfe.
import React, { useState } from 'react'

const heute = () => new Date().toISOString().slice(0, 10)

// Kompakter Fortschritts-Balken (variable Schrittzahl).
function Fortschritt({ aktuell, anzahl }) {
  return (
    <div className="mb-4">
      <div className="h-1.5 w-full bg-paper-200 dark:bg-ink-800 rounded-full overflow-hidden">
        <div className="h-full bg-coral-500 rounded-full transition-all" style={{ width: `${(aktuell / anzahl) * 100}%` }} />
      </div>
    </div>
  )
}

export default function KompetenzAssistent({ schueler, fach, letzteSchulstufe, gesperrteSchulstufe, schulstufen, onClose, onSaved }) {
  const [schritt, setSchritt] = useState(0) // 0 = Intro, 1..N = Kompetenzbereiche, N+1 = Zusammenfassung
  const [schulstufe, setSchulstufe] = useState(gesperrteSchulstufe ?? letzteSchulstufe ?? null)
  const [datum, setDatum] = useState(heute())
  const [titel, setTitel] = useState('')
  const [raster, setRaster] = useState(null)
  const [werte, setWerte] = useState({}) // { [bereichIdx]: { [teilkompIdx]: { niveau, notiz } } }
  const [offeneHilfe, setOffeneHilfe] = useState(() => new Set())
  const [laden, setLaden] = useState(false)
  const [fehler, setFehler] = useState('')
  const [speichern, setSpeichern] = useState(false)

  const bereiche = raster?.bereiche ?? []
  const niveauLabel = (n) => {
    if (n === 0) return 'noch nicht erfasst'
    const ns = (raster?.niveaustufen ?? []).find(x => x.niveau === n)
    return ns ? ns.bezeichnung : `Niveau ${n}`
  }

  const rasterLaden = async () => {
    if (!schulstufe) { setFehler('Bitte eine Schulstufe wählen.'); return }
    setLaden(true); setFehler('')
    try {
      const r = await window.api.kompetenzKatalog.getRaster(fach.name, schulstufe)
      if (!r || !r.bereiche?.length) { setFehler('Für diese Schulstufe ist kein Raster hinterlegt.'); setLaden(false); return }
      setRaster(r)
      setWerte(Object.fromEntries(r.bereiche.map((b, bi) =>
        [bi, Object.fromEntries((b.kategorien ?? []).map((k, ti) => [ti, { niveau: 0, notiz: '' }]))]
      )))
      setSchritt(1)
    } catch {
      setFehler('Raster konnte nicht geladen werden.')
    } finally {
      setLaden(false)
    }
  }

  const setNiveau = (bi, ti, niveau) => setWerte(w => ({ ...w, [bi]: { ...w[bi], [ti]: { ...w[bi]?.[ti], niveau } } }))
  const setNotiz = (bi, ti, notiz) => setWerte(w => ({ ...w, [bi]: { ...w[bi], [ti]: { ...w[bi]?.[ti], notiz } } }))
  const toggleHilfe = (key) => setOffeneHilfe(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })
  const weiter = () => setSchritt(s => s + 1)
  const zurueck = () => { setFehler(''); setSchritt(s => s - 1) }

  const speichernFertig = async () => {
    setSpeichern(true); setFehler('')
    try {
      const alleWerte = []
      bereiche.forEach((b, bi) => (b.kategorien ?? []).forEach((k, ti) => {
        alleWerte.push({
          bereich_idx: bi,
          teilkompetenz_idx: ti,
          bereich_name: b.name,
          teilkompetenz_name: k.name,
          niveau: werte[bi]?.[ti]?.niveau ?? 0,
          notiz: werte[bi]?.[ti]?.notiz?.trim() || null,
        })
      }))
      await window.api.kompetenzErhebungen.speichern({
        schuelerId: schueler.id, fachId: fach.id, schulstufe, datum, titel: titel.trim() || null, werte: alleWerte,
      })
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

  // Kann-Beschreibungen eines Items als Zeilen (Niveau-Anker) aufbereiten.
  const itemZeilen = (it) => {
    if (it.text) return [it.text]
    return [
      it.niveau1 && `1: ${it.niveau1}`,
      it.niveau1_standard && `1 (Standard): ${it.niveau1_standard}`,
      it.niveau2 && `2: ${it.niveau2}`,
      it.niveau3 && `3: ${it.niveau3}`,
    ].filter(Boolean)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl w-[92vw] flex flex-col max-h-[88vh]">
        {/* Kopf */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Kompetenzen-Assistent</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">{schueler.vorname} {schueler.nachname} · {fach.name}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-ink-400 hover:text-ink-600 text-sm">✕</button>
        </div>

        {schritt > 0 && <Fortschritt aktuell={schritt} anzahl={anzahlSchritte} />}

        {/* Körper */}
        <div className="flex-1 overflow-y-auto px-0.5">
          {/* Schritt 0: Intro */}
          {schritt === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-ink-600 dark:text-paper-300">
                Erfasse den aktuellen Kompetenzstand je Teilkompetenz. Der Durchlauf wird als Erhebung mit Datum gespeichert –
                du kannst ihn im Schuljahr beliebig oft wiederholen und die Entwicklung im Netzdiagramm verfolgen.
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
                {gesperrteSchulstufe ? (
                  <p className="text-sm text-ink-700 dark:text-paper-200">{gesperrteSchulstufe}. Schulstufe <span className="text-ink-400">(für dieses Fach festgelegt)</span></p>
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
            </div>
          )}

          {/* Schritt 1..N: je Kompetenzbereich, darin je Teilkompetenz */}
          {aktBereich && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Kompetenzbereich {schritt}/{bereiche.length}</p>
                <h3 className="text-base font-semibold text-ink-900 dark:text-white">{aktBereich.name}</h3>
                {aktBereich.basis && <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{aktBereich.basis}</p>}
              </div>

              {(aktBereich.kategorien ?? []).map((k, ti) => {
                const w = werte[aktBereichIdx]?.[ti] ?? { niveau: 0, notiz: '' }
                const hilfeKey = `${aktBereichIdx}:${ti}`
                const hilfeOffen = offeneHilfe.has(hilfeKey)
                return (
                  <div key={ti} className="border border-paper-200 dark:border-ink-800 rounded-xl p-3 space-y-2">
                    <p className="text-sm font-medium text-ink-800 dark:text-paper-100">{k.name}</p>
                    <div className="flex gap-1.5">
                      {[0, 1, 2, 3].map(n => {
                        const aktiv = w.niveau === n
                        return (
                          <button key={n} onClick={() => setNiveau(aktBereichIdx, ti, n)}
                            className={`flex-1 h-10 rounded-lg text-sm font-bold transition-all active:scale-95 ${aktiv
                              ? (n === 0 ? 'bg-ink-400 text-white' : 'bg-coral-500 text-white shadow-soft')
                              : 'bg-paper-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400 hover:bg-paper-200 dark:hover:bg-ink-700'}`}>
                            {n === 0 ? '·' : n}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-ink-600 dark:text-paper-300 text-center">{niveauLabel(w.niveau)}</p>

                    <button onClick={() => toggleHilfe(hilfeKey)} className="text-xs font-medium text-coral-600 dark:text-coral-400 hover:underline">
                      {hilfeOffen ? '▾ Kann-Beschreibungen ausblenden' : '▸ Kann-Beschreibungen anzeigen'}
                    </button>
                    {hilfeOffen && (
                      <ul className="bg-paper-50 dark:bg-ink-900/40 border border-paper-100 dark:border-ink-800 rounded-lg p-2.5 space-y-1.5 max-h-48 overflow-y-auto">
                        {(k.items ?? []).map((it, ii) => (
                          <li key={ii} className="text-[11px] text-ink-500 dark:text-ink-400 leading-snug">
                            {itemZeilen(it).map((z, zi) => <span key={zi} className="block">{z}</span>)}
                          </li>
                        ))}
                      </ul>
                    )}

                    <textarea rows={2} value={w.notiz ?? ''} onChange={e => setNotiz(aktBereichIdx, ti, e.target.value)}
                      className="w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-3 py-2 text-ink-800 dark:text-paper-200 placeholder-ink-400 resize-none focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400"
                      placeholder="Notiz (optional)…" />
                  </div>
                )
              })}
            </div>
          )}

          {/* Letzter Schritt: Zusammenfassung */}
          {schritt === bereiche.length + 1 && bereiche.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-ink-600 dark:text-paper-300">Zusammenfassung – prüfe die Niveaus und speichere die Erhebung.</p>
              {bereiche.map((b, bi) => (
                <div key={bi}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-1">{b.name}</p>
                  <div className="border border-paper-200 dark:border-ink-800 rounded-lg divide-y divide-paper-100 dark:divide-ink-800">
                    {(b.kategorien ?? []).map((k, ti) => (
                      <div key={ti} className="flex items-center justify-between gap-2 px-3 py-1.5">
                        <span className="text-sm text-ink-700 dark:text-paper-200 truncate">{k.name}</span>
                        <span className="text-xs text-ink-500 dark:text-ink-400 flex-shrink-0">
                          <span className="font-bold text-coral-600 dark:text-coral-400">{werte[bi]?.[ti]?.niveau ?? 0}</span> · {niveauLabel(werte[bi]?.[ti]?.niveau ?? 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {fehler && <p className="text-red-500 text-sm mt-3">{fehler}</p>}
        </div>

        {/* Fußzeile */}
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
