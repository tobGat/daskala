// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import MaterialListe from './MaterialListe'

// Mehrere Materialien werden zeilensepariert in der bestehenden `link`-Spalte gespeichert
// (rückwärtskompatibel: ein einzelner Link/Pfad bleibt ein Eintrag).
const parseLinks = (s) => String(s ?? '').split('\n').map(x => x.trim()).filter(Boolean)
const joinLinks = (arr) => (arr && arr.length ? arr.join('\n') : null)

export function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function berechneFristDatum(wocheDatum, wochentag, offsetWochen) {
  const d = new Date(wocheDatum + 'T00:00:00')
  d.setDate(d.getDate() + (wochentag - 1) + offsetWochen * 7)
  return toLocalDateStr(d)
}

// Nächste/übernächste Lektion desselben Fachs finden
export function naechsteLektionDatum(wocheDatum, aktuellerWochentag, fachWochentage, skip = 1) {
  const tage = [...fachWochentage].sort((a, b) => a - b)
  if (tage.length === 0) return berechneFristDatum(wocheDatum, aktuellerWochentag, skip)
  let gefunden = 0
  let wocheOffset = 0
  for (let versuch = 0; versuch < 20; versuch++) {
    for (const tag of tage) {
      if (wocheOffset === 0 && tag <= aktuellerWochentag) continue
      gefunden++
      if (gefunden === skip) {
        const d = new Date(wocheDatum + 'T00:00:00')
        d.setDate(d.getDate() + (tag - 1) + wocheOffset * 7)
        return toLocalDateStr(d)
      }
    }
    wocheOffset++
  }
  return berechneFristDatum(wocheDatum, aktuellerWochentag, skip)
}

export function formatFristDatum(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

export default function PlanungModal({ eintrag: eintragProp, wocheDatum: wocheProp, fachWochentage = [], nachbarLektion, onClose, onGespeichert }) {
  // Lokaler Zustand für die aktuell angezeigte Lektion – so kann im Modal zur
  // vorherigen/nächsten Stunde desselben Fachs geblättert werden.
  const [eintrag, setEintrag] = useState(eintragProp)
  const [wocheDatum, setWocheDatum] = useState(wocheProp)
  const [titel, setTitel] = useState('')
  const [inhalt, setInhalt] = useState('')
  const [musizieren, setMusizieren] = useState(false)
  const [musiziertWarnung, setMusiziertWarnung] = useState(false)
  const [laden, setLaden] = useState(true)
  const [bereit, setBereit] = useState(false)
  const [jahresAbschnitte, setJahresAbschnitte] = useState([])
  const [hueText, setHueText] = useState('')
  const [hueFristOption, setHueFristOption] = useState('naechste')
  const [hueFristDatum, setHueFristDatum] = useState('')
  const [links, setLinks] = useState([])
  const istMusik = eintrag.fach_name?.toLowerCase().includes('musik')
  // Ausgangszustand der geladenen Planung (für „geändert?"-Erkennung) und ob
  // für diese Lektion bereits eine Planung existierte.
  const snapshotRef = useRef(null)
  const bestandRef = useRef(false)

  useEffect(() => {
    let aktiv = true
    setLaden(true)
    setMusiziertWarnung(false)
    const [datum] = wocheDatum.split('T')
    const freitag = new Date(datum)
    freitag.setDate(freitag.getDate() + 4)
    const freitagStr = freitag.toISOString().split('T')[0]

    Promise.all([
      window.api.stundenPlanung.get(eintrag.id, wocheDatum),
      window.api.jahresplanung.getAll(eintrag.fach_id),
    ]).then(([plan, abschnitte]) => {
      if (!aktiv) return
      let opt = 'naechste', fdat = ''
      const geladeneLinks = plan ? parseLinks(plan.link) : []
      if (plan && plan.hue_frist_datum) {
        const naechste = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 1)
        const uebnaechste = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 2)
        if (plan.hue_frist_datum === naechste) opt = 'naechste'
        else if (plan.hue_frist_datum === uebnaechste) opt = 'uebnaechste'
        else { opt = 'datum'; fdat = plan.hue_frist_datum }
      }
      // Felder immer setzen (auch leer) – damit beim Wechsel zu einer leeren Lektion
      // keine Inhalte der vorherigen stehenbleiben.
      setTitel(plan?.titel ?? '')
      setInhalt(plan?.inhalt ?? '')
      setMusizieren(!!plan?.musizieren)
      setHueText(plan?.hue_text ?? '')
      setHueFristOption(opt)
      setHueFristDatum(fdat)
      setLinks(geladeneLinks)
      bestandRef.current = !!plan
      snapshotRef.current = {
        titel: plan?.titel ?? '', inhalt: plan?.inhalt ?? '', musizieren: !!plan?.musizieren,
        hueText: plan?.hue_text ?? '', hueFristOption: opt, hueFristDatum: fdat, links: geladeneLinks,
      }
      setJahresAbschnitte(abschnitte.filter(a => a.datum_bis >= datum && a.datum_von <= freitagStr))
    }).catch(e => {
      console.error('PlanungModal laden:', e)
      useStore.getState().pushToast('Planung konnte nicht geladen werden.', 'error')
    })
      .finally(() => { if (aktiv) { setLaden(false); setBereit(true) } })

    return () => { aktiv = false }
  }, [eintrag.id, wocheDatum])

  // Hat sich seit dem Laden etwas geändert?
  const istDirty = () => {
    const s = snapshotRef.current
    if (!s) return false
    return s.titel !== titel || s.inhalt !== inhalt || s.musizieren !== musizieren
      || s.hueText !== hueText || s.hueFristOption !== hueFristOption || s.hueFristDatum !== hueFristDatum
      || joinLinks(s.links) !== joinLinks(links)
  }

  // Vor dem Blättern ungespeicherte Änderungen sichern – aber keine leeren Planungen anlegen.
  const persistWennNötig = async () => {
    if (!istDirty()) return
    const hatInhalt = !!(titel || inhalt || hueText || (links && links.length))
    if (!hatInhalt && !bestandRef.current) return
    try {
      await window.api.stundenPlanung.save(eintrag.id, wocheDatum, titel, inhalt, musizieren, hueText || null, berechneHueFrist(), joinLinks(links))
      await onGespeichert()
    } catch (e) {
      console.error('stundenPlanung.save (Navigation):', e)
      useStore.getState().pushToast('Fehler beim Speichern: ' + e.message, 'error')
    }
  }

  const geheZu = async (richtung) => {
    if (!nachbarLektion || laden) return
    const ziel = nachbarLektion(eintrag, wocheDatum, richtung)
    if (!ziel) return
    await persistWennNötig()
    setEintrag(ziel.eintrag)
    setWocheDatum(ziel.wocheDatum)
  }

  const handleMusiziertChange = async (checked) => {
    if (checked) {
      try {
        const konflikt = await window.api.stundenPlanung.checkMusizieren?.(wocheDatum, eintrag.klasse_id, eintrag.id)
        if (konflikt) { setMusizieren(true); setMusiziertWarnung(true); return }
      } catch (e) {
        console.error('checkMusizieren:', e)
      }
    }
    setMusizieren(checked)
  }

  const naechsteDatum = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 1)
  const uebnaechsteDatum = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 2)

  const berechneHueFrist = () => {
    if (!hueText) return null
    if (hueFristOption === 'naechste') return naechsteDatum
    if (hueFristOption === 'uebnaechste') return uebnaechsteDatum
    return hueFristDatum || null
  }

  const speichern = async () => {
    try {
      await window.api.stundenPlanung.save(eintrag.id, wocheDatum, titel, inhalt, musizieren, hueText || null, berechneHueFrist(), joinLinks(links))
    } catch (e) {
      console.error('stundenPlanung.save Fehler:', e)
      useStore.getState().pushToast('Fehler beim Speichern: ' + e.message, 'error')
      return
    }
    await onGespeichert()
    onClose()
  }

  const loeschen = async () => {
    await window.api.stundenPlanung.delete(eintrag.id, wocheDatum)
    await onGespeichert()
    onClose()
  }

  const formatierung = (typ) => {
    const ta = document.getElementById('planung-inhalt')
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = inhalt.slice(start, end)
    let neu = inhalt
    let cursorDelta = 0
    if (typ === 'fett') {
      neu = inhalt.slice(0, start) + `**${sel}**` + inhalt.slice(end)
      cursorDelta = sel ? 4 : 2
    } else if (typ === 'kursiv') {
      neu = inhalt.slice(0, start) + `*${sel}*` + inhalt.slice(end)
      cursorDelta = sel ? 2 : 1
    } else if (typ === 'aufzaehlung') {
      const zeileStart = inhalt.lastIndexOf('\n', start - 1) + 1
      neu = inhalt.slice(0, zeileStart) + '- ' + inhalt.slice(zeileStart)
      cursorDelta = 2
    } else if (typ === 'trennlinie') {
      neu = inhalt.slice(0, start) + '\n---\n' + inhalt.slice(end)
      cursorDelta = 5
    }
    setInhalt(neu)
    setTimeout(() => {
      ta.focus()
      const pos = end + cursorDelta
      ta.setSelectionRange(pos, pos)
    }, 0)
  }

  // Konkretes Datum der aktuell angezeigten Lektion (Montag + Wochentag-Versatz).
  const lektionDatumAnzeige = (() => {
    const d = new Date(berechneFristDatum(wocheDatum, eintrag.wochentag, 0) + 'T00:00:00')
    return d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  })()

  if (!bereit) return null

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box w-full max-w-xl"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-ink-400">{eintrag.fach_name} · {eintrag.klasse_name}</span>
            {eintrag.klasse_teams_link && (
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded bg-coral-100 dark:bg-coral-900/30 text-coral-600 dark:text-coral-300 hover:bg-coral-200 dark:hover:bg-coral-700 transition-colors font-medium flex-shrink-0 ml-2"
                onClick={() => window.api.shell.open(eintrag.klasse_teams_link)}
                title="In Teams öffnen"
              >Teams ↗</button>
            )}
          </div>

          {/* Navigation zur vorherigen/nächsten Stunde desselben Fachs */}
          {nachbarLektion && (
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                onClick={() => geheZu(-1)}
                disabled={laden}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:cursor-default"
                title="Zur vorherigen Stunde dieses Fachs – z. B. um nachzusehen, was zuletzt gemacht wurde"
              >
                <span aria-hidden className="text-sm leading-none">‹</span> Vorige Stunde
              </button>
              <span className="text-xs font-medium text-ink-500 dark:text-ink-400 text-center truncate">{lektionDatumAnzeige}</span>
              <button
                type="button"
                onClick={() => geheZu(1)}
                disabled={laden}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:cursor-default"
                title="Zur nächsten Stunde dieses Fachs – z. B. um die kommenden Stunden vorzuplanen"
              >
                Nächste Stunde <span aria-hidden className="text-sm leading-none">›</span>
              </button>
            </div>
          )}

          <input
            className="input text-base font-semibold"
            placeholder="Titel der Stunde…"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            autoFocus
          />
        </div>

        {/* Scrollbarer Inhaltsbereich */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

        {/* Jahresplanung-Referenz */}
        {jahresAbschnitte.length > 0 && (
          <div className="mb-3 rounded-lg border border-coral-100 dark:border-coral-900/50 bg-coral-50/60 dark:bg-coral-900/30 px-3 py-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-coral-400 dark:text-coral-500 uppercase tracking-wide">Jahresplanung</span>
            {jahresAbschnitte.map(a => (
              <div key={a.id}>
                <div className="flex items-center gap-2">
                  {a.farbe && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.farbe }} />}
                  <span className="text-xs font-medium text-coral-800 dark:text-coral-200">{a.titel}</span>
                  <span className="text-[10px] text-coral-400 dark:text-coral-500 ml-auto whitespace-nowrap">
                    {a.datum_von.split('-').reverse().slice(0,2).join('.')}. – {a.datum_bis.split('-').reverse().slice(0,2).join('.')}.
                  </span>
                </div>
                {a.inhalt && (
                  <p className="text-[11px] text-coral-600 dark:text-coral-400 mt-0.5 ml-4 whitespace-pre-wrap line-clamp-3">{a.inhalt}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formatierungs-Toolbar */}
        <div className="flex items-center gap-1 mb-2 pb-2 border-b border-paper-100 dark:border-ink-800">
          {[
            { label: 'B', title: 'Fett (**text**)', aktion: 'fett', cls: 'font-bold' },
            { label: 'I', title: 'Kursiv (*text*)', aktion: 'kursiv', cls: 'italic' },
            { label: '—', title: 'Trennlinie (---)', aktion: 'trennlinie', cls: '' },
            { label: '•', title: 'Aufzählung (- )', aktion: 'aufzaehlung', cls: '' },
          ].map(btn => (
            <button
              key={btn.aktion}
              type="button"
              title={btn.title}
              tabIndex={-1}
              className={`w-7 h-7 flex items-center justify-center text-sm rounded border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors ${btn.cls}`}
              onMouseDown={e => { e.preventDefault(); formatierung(btn.aktion) }}
            >
              {btn.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-ink-400">Markdown</span>
        </div>

        {/* Inhalt */}
        <textarea
          id="planung-inhalt"
          className="input flex-1 resize-none font-mono text-sm leading-relaxed"
          style={{ minHeight: 200 }}
          placeholder="Unterrichtsinhalt, Materialien, Ziele…"
          value={inhalt}
          onChange={e => setInhalt(e.target.value)}
        />

        {/* Hausübung */}
        <div className="mt-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Hausübung <span className="font-normal">(optional)</span></label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder="Aufgabe…"
              value={hueText}
              onChange={e => setHueText(e.target.value)}
            />
          </div>
          {hueText && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-500">Abgabe:</span>
              {['naechste', 'uebnaechste', 'datum'].map(opt => (
                <label key={opt} className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="hue-frist"
                    value={opt}
                    checked={hueFristOption === opt}
                    onChange={() => setHueFristOption(opt)}
                    className="accent-violet-600"
                  />
                  <span className="text-xs text-ink-600 dark:text-ink-400">
                    {opt === 'naechste' ? `Nächste Stunde (${formatFristDatum(naechsteDatum)})` : opt === 'uebnaechste' ? `Übernächste (${formatFristDatum(uebnaechsteDatum)})` : 'Datum'}
                  </span>
                </label>
              ))}
              {hueFristOption === 'datum' && (
                <input
                  type="date"
                  className="text-xs border border-paper-300 dark:border-ink-700 rounded px-1.5 py-0.5 bg-white dark:bg-ink-800 dark:text-paper-200"
                  value={hueFristDatum}
                  onChange={e => setHueFristDatum(e.target.value)}
                />
              )}
            </div>
          )}
        </div>

        {/* Materialien / Links (mehrere möglich) */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Materialien / Links <span className="font-normal">(optional)</span></label>
          <MaterialListe items={links} onChange={setLinks} />
        </div>

        {/* Musizieren-Checkbox (nur bei Musik) */}
        {istMusik && (
          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={musizieren}
              onChange={e => handleMusiziertChange(e.target.checked)}
              className="accent-coral-600 w-4 h-4"
            />
            <span className="text-sm text-ink-700 dark:text-paper-300">Musizieren</span>
          </label>
        )}

        </div>{/* Ende scrollbarer Bereich */}

        {/* Aktionen */}
        <div className="flex gap-3 mt-4">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-danger" onClick={loeschen} title="Planung für diese Woche löschen">Löschen</button>
          <button className="btn-primary flex-1" onClick={speichern}>Speichern</button>
        </div>
      </div>

      {/* Musizieren-Warnungsmodal */}
      {musiziertWarnung && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-box max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-2">Bereits musiziert</h3>
            <p className="text-sm text-ink-600 dark:text-ink-400 mb-5">
              Mit dieser Klasse wurde in dieser Woche bereits musiziert.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => { setMusizieren(false); setMusiziertWarnung(false) }}>
                Haken entfernen
              </button>
              <button className="btn-primary flex-1" onClick={() => setMusiziertWarnung(false)}>
                Ignorieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
