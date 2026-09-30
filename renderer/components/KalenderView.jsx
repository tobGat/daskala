// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
//
// Vollständiger Kalender (Monat/Woche) als Alternative zum Stundenplan im Dashboard.
// Bündelt eigene Termine (bearbeitbar), EduPage-/webcal-Termine (schreibgeschützt),
// ToDo-Fälligkeiten/Erinnerungen und Ferien/Feiertage (Hintergrund).
import React, { useState, useEffect, useMemo } from 'react'
import useStore from '../store/useStore'
import TerminForm from './TerminForm'
import { toLocalDateStr, monatsName, getKalenderwoche, getMonatsWochen, getWochenTage, addDaysStr } from '../utils/datum'
import { berechneSchulferien, mergeFerien, ferienFuerTag } from '../utils/schulferien'

const WOCHENTAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const FARBE_EIGEN = '#fb6936'
const FARBE_EXTERN = '#7c6cff'
const FARBE_FAELLIG = '#ef4444'
const FARBE_ERINNERUNG = '#f59e0b'

const heuteStr = () => toLocalDateStr(new Date())
const hhmmZuMin = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }

// EduPage schreibt die Klasse(n) als Zeile „Klassen: 1a, 1b" in die Beschreibung.
const edupageKlassen = (beschr) => { const m = /(?:^|\n)\s*Klassen:\s*([^\n]+)/i.exec(beschr || ''); return m ? m[1].trim() : null }
// Beschreibung ohne die separat angezeigte „Klassen:"-Zeile (vermeidet Dopplung).
const ohneKlassenZeile = (beschr) => (beschr || '').replace(/(?:^|\n)\s*Klassen:[^\n]*/i, '').replace(/^\n+/, '').trim()

export default function KalenderView({ modus = 'monat', onTodoClick }) {
  const { termine, kalenderTermine, todos, klassen, aktuellesSchuljahr, einstellungen, ladeTermine, ladeKalenderTermine, syncKalender } = useStore()
  const [anker, setAnker] = useState(heuteStr)
  const [stundenzeiten, setStundenzeiten] = useState([])
  const [customFerien, setCustomFerien] = useState([])
  const [formModal, setFormModal] = useState(null) // { initial } | { preset }
  const [detail, setDetail] = useState(null)       // schreibgeschützter EduPage-Detail
  const [syncLaeuft, setSyncLaeuft] = useState(false)
  const [hover, setHover] = useState(null)         // { ev, x, y } – Detail-Tooltip beim Überfahren
  const zeigeHover = (ev, e) => setHover({ ev, x: e.clientX, y: e.clientY })
  const versteckeHover = () => setHover(null)

  useEffect(() => {
    ladeTermine(); ladeKalenderTermine()
    window.api.stundenzeiten.getAll().then(setStundenzeiten).catch(() => {})
  }, [])
  useEffect(() => {
    if (aktuellesSchuljahr) window.api.customFerien.getAll(aktuellesSchuljahr.id).then(r => setCustomFerien(r || [])).catch(() => {})
  }, [aktuellesSchuljahr?.id])

  const schulferien = useMemo(() => {
    const berechnet = berechneSchulferien(aktuellesSchuljahr?.bezeichnung ?? '', einstellungen?.bundesland ?? '')
    return customFerien.length > 0 ? mergeFerien(berechnet, customFerien) : berechnet
  }, [aktuellesSchuljahr?.bezeichnung, einstellungen?.bundesland, customFerien])

  const stundeZeit = (id) => stundenzeiten.find(s => s.id === id)
  const zeitVon = (ev) => ev.uhrzeit || (ev.stundeId ? stundeZeit(ev.stundeId)?.beginn : null) || null
  const zeitBis = (ev) => (ev.uhrzeit ? ev.bisUhrzeit : (ev.stundeId ? stundeZeit(ev.stundeId)?.ende : null)) || null

  // Alle Quellen in eine gemeinsame Event-Struktur normalisieren.
  const events = useMemo(() => {
    const out = []
    for (const t of termine) {
      out.push({
        id: `e${t.id}`, quelleId: t.id, typ: 'eigen', readonly: false, titel: t.titel,
        datum: t.datum, bisDatum: t.bis_datum || null, uhrzeit: t.uhrzeit, bisUhrzeit: t.bis_uhrzeit,
        ganztags: !!t.ganztags, stundeId: t.stunde_id, notiz: t.notiz,
        klasseName: klassen.find(k => k.id === t.klasse_id)?.name || null,
        farbe: klassen.find(k => k.id === t.klasse_id)?.farbe || FARBE_EIGEN, raw: t,
      })
    }
    for (const t of kalenderTermine) {
      out.push({
        id: `k${t.id}`, quelleId: t.id, typ: 'edupage', readonly: true, titel: t.titel,
        datum: t.datum, bisDatum: t.bis_datum || null, uhrzeit: t.uhrzeit, bisUhrzeit: t.bis_uhrzeit,
        ganztags: !!t.ganztags, ort: t.ort, beschreibung: t.beschreibung, aboName: t.abo_name,
        klassen: edupageKlassen(t.beschreibung), klasseName: edupageKlassen(t.beschreibung),
        farbe: t.abo_farbe || FARBE_EXTERN, raw: t,
      })
    }
    for (const td of todos) {
      if (td.erledigt) continue
      if (td.faelligkeit) out.push({ id: `tf${td.id}`, quelleId: td.id, typ: 'todo', subtyp: 'faellig', readonly: true, titel: td.titel, datum: td.faelligkeit, ganztags: true, farbe: FARBE_FAELLIG, raw: td })
      if (td.erinnerung) out.push({ id: `tr${td.id}`, quelleId: td.id, typ: 'todo', subtyp: 'erinnerung', readonly: true, titel: td.titel, datum: td.erinnerung, ganztags: true, farbe: FARBE_ERINNERUNG, raw: td })
    }
    return out
  }, [termine, kalenderTermine, todos, klassen])

  const eventsAmTag = (datum) => events.filter(e => e.datum <= datum && (e.bisDatum || e.datum) >= datum)
  const istZeitEvent = (e) => !e.ganztags && !e.bisDatum && !!zeitVon(e)

  const jahr = parseInt(anker.slice(0, 4))
  const monat = parseInt(anker.slice(5, 7))

  const springe = (richtung) => {
    if (modus === 'monat') {
      const d = new Date(jahr, monat - 1 + richtung, 1)
      setAnker(toLocalDateStr(d))
    } else {
      setAnker(addDaysStr(anker, richtung * 7))
    }
  }

  const handleSync = async () => {
    setSyncLaeuft(true)
    try { await syncKalender() } finally { setSyncLaeuft(false) }
  }
  const speichern = async (data) => {
    if (!aktuellesSchuljahr) return
    if (formModal?.initial) await window.api.termine.update(formModal.initial.id, data)
    else await window.api.termine.create({ ...data, schuljahrId: aktuellesSchuljahr.id })
    await ladeTermine(); setFormModal(null)
  }
  const loeschen = async (id) => { await window.api.termine.delete(id); await ladeTermine(); setFormModal(null) }

  const eventKlick = (e) => {
    if (e.typ === 'eigen') setFormModal({ initial: e.raw })
    else if (e.typ === 'edupage') setDetail(e)
    else if (e.typ === 'todo') onTodoClick?.(e.quelleId)
  }

  const kw = getKalenderwoche(anker).kw
  const titelText = modus === 'monat'
    ? `${monatsName(monat)} ${jahr}`
    : (() => { const tage = getWochenTage(anker); return `KW ${kw} · ${tage[0].slice(8)}.–${tage[6].slice(8)}. ${monatsName(parseInt(tage[6].slice(5, 7)))}` })()

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-ink-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-paper-200 dark:border-ink-800 flex-shrink-0">
        <button className="w-7 h-7 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-800 text-lg leading-none" onClick={() => springe(-1)} title="Zurück">‹</button>
        <button className="btn-secondary text-xs px-2 py-1" onClick={() => setAnker(heuteStr())}>Heute</button>
        <button className="w-7 h-7 rounded-lg text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-800 text-lg leading-none" onClick={() => springe(1)} title="Vor">›</button>
        <span className="text-sm font-semibold text-ink-800 dark:text-paper-100 ml-1">{titelText}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-secondary text-xs px-2 py-1" onClick={handleSync} disabled={syncLaeuft} title="EduPage-/webcal-Kalender abgleichen">
            {syncLaeuft ? 'Sync…' : '↻ Sync'}
          </button>
          <button className="btn-primary text-xs px-2 py-1" onClick={() => setFormModal({ preset: { datum: heuteStr() } })}>+ Termin</button>
        </div>
      </div>

      {modus === 'monat'
        ? <MonatsGitter jahr={jahr} monat={monat} eventsAmTag={eventsAmTag} zeitVon={zeitVon} schulferien={schulferien}
            onTag={(d) => setFormModal({ preset: { datum: d } })} onEvent={eventKlick} onHover={zeigeHover} onLeave={versteckeHover} />
        : <WochenGitter anker={anker} eventsAmTag={eventsAmTag} istZeitEvent={istZeitEvent}
            zeitVon={zeitVon} zeitBis={zeitBis} stundenzeiten={stundenzeiten} schulferien={schulferien}
            onTag={(d, uhrzeit) => setFormModal({ preset: { datum: d, uhrzeit } })} onEvent={eventKlick} onHover={zeigeHover} onLeave={versteckeHover} />}

      {hover && <TerminTooltip ev={hover.ev} x={hover.x} y={hover.y} zeitVon={zeitVon} zeitBis={zeitBis} />}

      {formModal && (
        <TerminForm
          initial={formModal.initial}
          preset={formModal.preset}
          klassen={klassen}
          stundenzeiten={stundenzeiten}
          onSpeichern={speichern}
          onLoeschen={loeschen}
          onAbbrechen={() => setFormModal(null)}
        />
      )}
      {detail && <EduPageDetail ev={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

// ── Event-Chip (kompakt) ──────────────────────────────────────────────────────
function Chip({ ev, zeit, onClick, onHover, onLeave, className = '' }) {
  const readonly = ev.readonly
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => onHover?.(ev, e)}
      onMouseLeave={() => onLeave?.()}
      className={`w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded truncate ${readonly ? 'cursor-default' : 'cursor-pointer hover:brightness-95'} ${className}`}
      style={{ backgroundColor: ev.farbe + '26', color: ev.farbe }}
    >
      {ev.typ === 'todo' ? (ev.subtyp === 'faellig' ? '✓ ' : '🔔 ') : ''}
      {zeit ? <span className="tabular-nums opacity-80">{zeit} </span> : null}
      {ev.typ === 'edupage' && ev.klassen ? <span className="font-semibold">{ev.klassen} · </span> : null}
      {ev.titel}
    </button>
  )
}

// ── Monatsansicht ─────────────────────────────────────────────────────────────
function MonatsGitter({ jahr, monat, eventsAmTag, zeitVon, schulferien, onTag, onEvent, onHover, onLeave }) {
  const wochen = getMonatsWochen(jahr, monat)
  const heute = heuteStr()
  const MAX = 3
  return (
    <div className="flex-1 min-h-0 overflow-auto p-2">
      <div className="grid grid-cols-7 gap-px mb-px">
        {WOCHENTAG_KURZ.map((t, i) => (
          <div key={t} className={`text-[11px] font-semibold text-center py-1 ${i >= 5 ? 'text-ink-400' : 'text-ink-500 dark:text-ink-400'}`}>{t}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {wochen.flat().map(({ datum, imMonat }, idx) => {
          const ferien = ferienFuerTag(datum, schulferien)
          const wochenende = (idx % 7) >= 5
          const istHeute = datum === heute
          const tages = eventsAmTag(datum).sort((a, b) => {
            const av = (a.ganztags || a.bisDatum) ? 0 : 1, bv = (b.ganztags || b.bisDatum) ? 0 : 1
            if (av !== bv) return av - bv
            return (zeitVon(a) || '').localeCompare(zeitVon(b) || '')
          })
          return (
            <div
              key={datum}
              className={`min-h-[92px] rounded-lg border p-1 flex flex-col gap-0.5 cursor-pointer transition-colors
                ${imMonat ? 'bg-white dark:bg-ink-900' : 'bg-paper-50/60 dark:bg-ink-950/40 opacity-60'}
                ${ferien ? 'bg-rose-50/70 dark:bg-rose-950/20' : ''}
                ${istHeute ? 'border-coral-400 ring-1 ring-coral-400/40' : 'border-paper-200 dark:border-ink-800'}
                hover:bg-coral-50/40 dark:hover:bg-coral-900/20`}
              onClick={() => onTag(datum)}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${istHeute ? 'text-coral-600 dark:text-coral-400' : wochenende ? 'text-ink-400' : 'text-ink-600 dark:text-ink-300'}`}>
                  {parseInt(datum.slice(8))}
                </span>
                {ferien && <span className="text-[8px] text-rose-500 truncate max-w-[70%]" title={ferien.name}>{ferien.name}</span>}
              </div>
              {tages.slice(0, MAX).map(ev => (
                <div key={ev.id} onClick={e => { e.stopPropagation(); onEvent(ev) }}>
                  <Chip ev={ev} zeit={istZeitChip(ev) ? zeitVon(ev) : null} onClick={() => {}} onHover={onHover} onLeave={onLeave} />
                </div>
              ))}
              {tages.length > MAX && (
                <span className="text-[9px] text-ink-400 pl-1">+{tages.length - MAX} weitere</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
const istZeitChip = (ev) => !ev.ganztags && !ev.bisDatum && (ev.uhrzeit || ev.stundeId)

// ── Wochenansicht (Ganztags-Band + Zeitraster) ────────────────────────────────
function WochenGitter({ anker, eventsAmTag, istZeitEvent, zeitVon, zeitBis, stundenzeiten, schulferien, onTag, onEvent, onHover, onLeave }) {
  const tage = getWochenTage(anker)
  const heute = heuteStr()

  // Zeitbereich aus den Stundenzeiten ableiten (Fallback 7–18 Uhr).
  const { startH, endH } = useMemo(() => {
    let min = 7 * 60, max = 18 * 60
    for (const s of stundenzeiten) {
      const b = hhmmZuMin(s.beginn), e = hhmmZuMin(s.ende)
      if (b != null) min = Math.min(min, b)
      if (e != null) max = Math.max(max, e)
    }
    return { startH: Math.floor(min / 60), endH: Math.ceil(max / 60) }
  }, [stundenzeiten])
  const ROW_H = 44
  const stunden = Array.from({ length: endH - startH }, (_, i) => startH + i)
  const posTop = (hhmm) => ((hhmmZuMin(hhmm) - startH * 60) / 60) * ROW_H

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      {/* Kopf: Wochentage */}
      <div className="grid sticky top-0 z-10 bg-white dark:bg-ink-900 border-b border-paper-200 dark:border-ink-800" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div />
        {tage.map(d => {
          const ferien = ferienFuerTag(d, schulferien)
          return (
            <div key={d} className={`text-center py-1 border-l border-paper-100 dark:border-ink-800 ${d === heute ? 'bg-coral-50 dark:bg-coral-900/20' : ''}`}>
              <div className="text-[10px] text-ink-400">{WOCHENTAG_KURZ[tage.indexOf(d)]}</div>
              <div className={`text-sm font-semibold ${d === heute ? 'text-coral-600 dark:text-coral-400' : 'text-ink-700 dark:text-paper-200'}`}>{parseInt(d.slice(8))}</div>
              {ferien && <div className="text-[8px] text-rose-500 truncate" title={ferien.name}>{ferien.name}</div>}
            </div>
          )
        })}
      </div>

      {/* Ganztags-/Mehrtags-Band */}
      <div className="grid border-b border-paper-200 dark:border-ink-800" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        <div className="text-[9px] text-ink-400 text-right pr-1 py-1">ganztg.</div>
        {tage.map(d => {
          const band = eventsAmTag(d).filter(e => !istZeitEvent(e))
          return (
            <div key={d} className="border-l border-paper-100 dark:border-ink-800 p-0.5 space-y-0.5 min-h-[26px]" onClick={() => onTag(d, null)}>
              {band.map(ev => (
                <div key={ev.id} onClick={e => { e.stopPropagation(); onEvent(ev) }}>
                  <Chip ev={ev} onClick={() => {}} onHover={onHover} onLeave={onLeave} />
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Zeitraster */}
      <div className="grid relative" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
        {/* Stunden-Spalte */}
        <div className="relative" style={{ height: stunden.length * ROW_H }}>
          {stunden.map((h, i) => (
            <div key={h} className="absolute right-1 text-[10px] text-ink-400 tabular-nums" style={{ top: i * ROW_H - 6 }}>{String(h).padStart(2, '0')}:00</div>
          ))}
        </div>
        {/* Tages-Spalten */}
        {tage.map(d => {
          const timed = eventsAmTag(d).filter(istZeitEvent)
          const lanes = legeInSpalten(timed, zeitVon, zeitBis)
          return (
            <div key={d} className={`relative border-l border-paper-100 dark:border-ink-800 ${d === heute ? 'bg-coral-50/30 dark:bg-coral-900/10' : ''}`} style={{ height: stunden.length * ROW_H }}>
              {stunden.map((h, i) => (
                <div key={h} className="absolute left-0 right-0 border-t border-paper-100 dark:border-ink-800/60"
                  style={{ top: i * ROW_H, height: ROW_H }}
                  onClick={() => onTag(d, `${String(h).padStart(2, '0')}:00`)} />
              ))}
              {timed.map(ev => {
                const top = posTop(zeitVon(ev))
                const ende = zeitBis(ev) ? posTop(zeitBis(ev)) : top + ROW_H / 2
                const hoehe = Math.max(18, ende - top)
                const { lane, laneCount } = lanes.get(ev.id)
                const breite = 100 / laneCount
                return (
                  <button
                    key={ev.id}
                    onClick={e => { e.stopPropagation(); onEvent(ev) }}
                    onMouseEnter={e => onHover?.(ev, e)}
                    onMouseLeave={() => onLeave?.()}
                    className={`absolute rounded px-1 py-0.5 text-[10px] leading-tight overflow-hidden text-left ${ev.readonly ? 'cursor-default' : 'cursor-pointer'}`}
                    style={{ top, height: hoehe, left: `calc(${lane * breite}% + 1px)`, width: `calc(${breite}% - 2px)`, backgroundColor: ev.farbe + '30', color: ev.farbe, borderLeft: `2px solid ${ev.farbe}` }}
                  >
                    <span className="tabular-nums opacity-80">{zeitVon(ev)}</span> {ev.typ === 'edupage' && ev.klassen ? <span className="font-semibold">{ev.klassen} · </span> : null}{ev.titel}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Überlappende Zeit-Events in nebeneinanderliegende Spalten legen (greedy).
function legeInSpalten(evs, zeitVon, zeitBis) {
  const map = new Map()
  const sortiert = [...evs].sort((a, b) => (zeitVon(a) || '').localeCompare(zeitVon(b) || ''))
  const aktiv = [] // { ende, lane }
  const gruppe = []
  let maxLane = 0
  const flush = () => {
    const count = maxLane + 1
    for (const g of gruppe) map.set(g.id, { lane: g.lane, laneCount: count })
    gruppe.length = 0; aktiv.length = 0; maxLane = 0
  }
  for (const ev of sortiert) {
    const start = hhmmZuMin(zeitVon(ev)) ?? 0
    const ende = hhmmZuMin(zeitBis(ev)) ?? (start + 30)
    // aktive Events entfernen, die vor diesem Start enden
    for (let i = aktiv.length - 1; i >= 0; i--) if (aktiv[i].ende <= start) aktiv.splice(i, 1)
    if (aktiv.length === 0 && gruppe.length) flush()
    let lane = 0
    const belegt = new Set(aktiv.map(a => a.lane))
    while (belegt.has(lane)) lane++
    aktiv.push({ ende, lane })
    maxLane = Math.max(maxLane, lane)
    gruppe.push({ id: ev.id, lane })
  }
  if (gruppe.length) flush()
  return map
}

// ── Read-only-Detail für importierte (EduPage) Termine ────────────────────────
function EduPageDetail({ ev, onClose }) {
  const zeit = ev.ganztags ? 'ganztägig' : [ev.uhrzeit, ev.bisUhrzeit].filter(Boolean).join('–')
  const datum = ev.bisDatum && ev.bisDatum !== ev.datum ? `${ev.datum} – ${ev.bisDatum}` : ev.datum
  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="flex items-start gap-2 mb-3">
          <span className="w-3 h-3 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: ev.farbe }} />
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex-1">{ev.titel}</h2>
        </div>
        <dl className="text-sm text-ink-700 dark:text-paper-300 space-y-1.5">
          <div><span className="text-ink-400">Datum: </span>{datum}{zeit ? ` · ${zeit}` : ''}</div>
          {ev.klassen && <div><span className="text-ink-400">Klassen: </span>{ev.klassen}</div>}
          {ev.ort && <div><span className="text-ink-400">Ort: </span>{ev.ort}</div>}
          {ohneKlassenZeile(ev.beschreibung) && <div className="whitespace-pre-wrap"><span className="text-ink-400">Info: </span>{ohneKlassenZeile(ev.beschreibung)}</div>}
          <div><span className="text-ink-400">Quelle: </span>📆 {ev.aboName || 'EduPage'} (schreibgeschützt)</div>
        </dl>
        <div className="mt-5"><button className="btn-primary w-full" onClick={onClose}>Schließen</button></div>
      </div>
    </div>
  )
}

// ── Hover-Tooltip mit Termin-Details ──────────────────────────────────────────
function TerminTooltip({ ev, x, y, zeitVon, zeitBis }) {
  const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit' })
  const datumText = ev.bisDatum && ev.bisDatum !== ev.datum ? `${fmt(ev.datum)} – ${fmt(ev.bisDatum)}` : fmt(ev.datum)
  const zeitText = ev.ganztags ? 'ganztägig' : (zeitVon(ev) ? `${zeitVon(ev)}${zeitBis(ev) ? '–' + zeitBis(ev) : ''} Uhr` : null)
  const quelle = ev.typ === 'edupage' ? `📆 ${ev.aboName || 'EduPage'}`
    : ev.typ === 'todo' ? `ToDo · ${ev.subtyp === 'faellig' ? 'fällig' : 'Erinnerung'}`
    : 'Termin'
  // Position mit Rand-Klemmung, damit der Tooltip im Viewport bleibt.
  const left = Math.max(8, Math.min(x + 14, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 268))
  const top = Math.max(8, Math.min(y + 14, (typeof window !== 'undefined' ? window.innerHeight : 800) - 170))
  return (
    <div
      className="fixed z-[120] pointer-events-none w-64 rounded-xl border border-paper-200 dark:border-ink-700 bg-white dark:bg-ink-800 shadow-lg p-3 animate-fade-in"
      style={{ left, top }}
    >
      <div className="flex items-start gap-2">
        <span className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: ev.farbe }} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink-900 dark:text-white leading-snug break-words">
            {ev.typ === 'todo' ? (ev.subtyp === 'faellig' ? '✓ ' : '🔔 ') : ''}{ev.titel}
          </div>
          <div className="text-[11px] text-ink-500 dark:text-ink-400 mt-0.5">
            {datumText}{zeitText ? ` · ${zeitText}` : ''}
          </div>
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-[11px] text-ink-600 dark:text-ink-300">
        {ev.klasseName && <div><span className="text-ink-400">{ev.typ === 'edupage' ? 'Klassen: ' : 'Klasse: '}</span>{ev.klasseName}</div>}
        {ev.ort && <div><span className="text-ink-400">Ort: </span>{ev.ort}</div>}
        {ev.notiz && <div className="line-clamp-2"><span className="text-ink-400">Notiz: </span>{ev.notiz}</div>}
        {ohneKlassenZeile(ev.beschreibung) && <div className="line-clamp-3 whitespace-pre-wrap">{ohneKlassenZeile(ev.beschreibung)}</div>}
        <div className="text-ink-400 pt-0.5">{quelle}{ev.readonly && ev.typ === 'edupage' ? ' · schreibgeschützt' : ''}</div>
      </div>
    </div>
  )
}
