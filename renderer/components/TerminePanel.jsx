// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import TerminForm from './TerminForm'

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function TerminKarte({ termin, klassen, stundenzeiten, onDelete, onEdit, flashRef, flashed, extern }) {
  const heute = localDateStr(new Date())
  const vergangen = termin.datum < heute

  const stundeNummer = !extern && termin.stunde_id
    ? stundenzeiten.find(s => s.id === termin.stunde_id)?.stunde
    : null
  const stundeLabel = stundeNummer != null ? `${stundeNummer}. Std` : null

  // Farbe: eigene Termine nach Klasse (Default Coral); EduPage-Termine nach Abo-Farbe (Default Violett).
  const klassenFarbe = klassen.find(k => k.id === termin.klasse_id)?.farbe ?? null
  const farbe = extern ? (termin.abo_farbe || '#7c6cff') : (klassenFarbe ?? '#fb6936')
  const bgColor = extern
    ? (termin.abo_farbe ? termin.abo_farbe + '14' : 'rgb(124 108 255 / 0.06)')
    : (klassenFarbe ? klassenFarbe + '1a' : 'rgb(251 105 54 / 0.06)')

  const zeigeZeit = !stundeLabel && !termin.ganztags && termin.uhrzeit
  const untertitel = extern ? (termin.ort || termin.beschreibung) : termin.notiz

  return (
    <div
      ref={flashRef}
      className={`group flex items-start gap-2 p-2 rounded-xl border transition-all hover:shadow-soft ${vergangen ? 'opacity-50' : ''} ${flashed ? 'border-coral-400 ring-2 ring-coral-400/40 animate-pop-in' : 'border-transparent'}`}
      style={{ backgroundColor: bgColor, borderLeftColor: farbe, borderLeftWidth: 3 }}
    >
      <div className="flex-shrink-0 text-center min-w-[36px]">
        <div className={`text-[10px] font-bold leading-tight ${extern ? 'text-ink-600 dark:text-ink-300' : 'text-coral-600 dark:text-coral-400'}`}>
          {new Date(termin.datum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
        </div>
        {stundeLabel && (
          <div className="text-[9px] text-ink-500 leading-tight">{stundeLabel}</div>
        )}
        {zeigeZeit && (
          <div className="text-[9px] text-ink-500 leading-tight">
            <div>{termin.uhrzeit}</div>
            {termin.bis_uhrzeit && <div className="opacity-70">–{termin.bis_uhrzeit}</div>}
          </div>
        )}
        {termin.ganztags === 1 && !stundeLabel && (
          <div className="text-[9px] text-ink-400 leading-tight">ganztg.</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-800 dark:text-paper-200 leading-snug truncate">{termin.titel}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          {extern ? (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"
              style={{ backgroundColor: farbe + '26', color: farbe }}
              title="Aus abonniertem Kalender – schreibgeschützt"
            >
              <span aria-hidden>📆</span>{termin.abo_name || 'EduPage'}
            </span>
          ) : (
            termin.klasse_name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-400 font-semibold">
                {termin.klasse_name}
              </span>
            )
          )}
          {untertitel && (
            <span className="text-[10px] text-ink-500 truncate">{untertitel}</span>
          )}
        </div>
      </div>
      {!extern && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
          <button
            className="text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
            onClick={() => onEdit(termin)}
            title="Bearbeiten"
          >✎</button>
          <button
            className="text-ink-500 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
            onClick={() => onDelete(termin.id)}
            title="Löschen"
          >✕</button>
        </div>
      )}
    </div>
  )
}

export default function TerminePanel({ hoehe = 256, highlightedTerminId, onHighlightCleared }) {
  const { termine, kalenderTermine, ladeTermine, ladeKalenderTermine, klassen, aktuellesSchuljahr } = useStore()
  const [formModal, setFormModal] = useState(null) // null | { initial: null|termin }
  const [vergangeneOffen, setVergangeneOffen] = useState(false)
  const [flashedId, setFlashedId] = useState(null)
  const [stundenzeiten, setStundenzeiten] = useState([])
  const itemRefs = useRef({})

  useEffect(() => {
    ladeTermine()
    ladeKalenderTermine()
    window.api.stundenzeiten.getAll().then(setStundenzeiten)
      .catch(e => console.error('stundenzeiten.getAll:', e))
  }, [])

  useEffect(() => {
    if (!highlightedTerminId) return
    const termin = termine.find(t => t.id === highlightedTerminId)
    if (!termin) return
    const heute = localDateStr(new Date())
    if (termin.datum < heute) setVergangeneOffen(true)
    setFlashedId(highlightedTerminId)
    setTimeout(() => {
      itemRefs.current[highlightedTerminId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
    const t = setTimeout(() => { setFlashedId(null); onHighlightCleared?.() }, 1800)
    return () => clearTimeout(t)
  }, [highlightedTerminId])

  const terminSpeichern = async (data) => {
    try {
      if (formModal?.initial) {
        await window.api.termine.update(formModal.initial.id, data)
      } else {
        if (!aktuellesSchuljahr) { console.warn('[TerminePanel] kein aktuellesSchuljahr'); return }
        await window.api.termine.create({ ...data, schuljahrId: aktuellesSchuljahr.id })
      }
      await ladeTermine()
      setFormModal(null)
    } catch (err) {
      console.error('[TerminePanel] Fehler beim Speichern:', err)
    }
  }

  const terminLoeschen = async (id) => {
    try {
      await window.api.termine.delete(id)
      await ladeTermine()
    } catch (err) {
      console.error('[TerminePanel] Fehler beim Löschen:', err)
    }
  }

  const heute = localDateStr(new Date())
  // Eigene und importierte (EduPage-/webcal-)Termine gemeinsam sortieren.
  const alle = [
    ...termine.map(t => ({ item: t, extern: false, key: `t${t.id}` })),
    ...kalenderTermine.map(t => ({ item: t, extern: true, key: `k${t.id}` })),
  ].sort((a, b) => {
    const d = a.item.datum.localeCompare(b.item.datum)
    return d !== 0 ? d : (a.item.uhrzeit ?? '').localeCompare(b.item.uhrzeit ?? '')
  })
  const kommend   = alle.filter(x => x.item.datum >= heute)
  const vergangen = alle.filter(x => x.item.datum < heute).reverse()

  return (
    <div
      className={`flex flex-col bg-white dark:bg-ink-900 ${hoehe == null ? 'flex-1' : 'flex-shrink-0 border-t border-paper-200 dark:border-ink-800'}`}
      style={hoehe == null ? undefined : { height: hoehe }}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0 border-b border-paper-200 dark:border-ink-800">
        <span className="text-sm font-bold text-ink-800 dark:text-paper-100 flex items-center gap-2">
          <span aria-hidden>📅</span> Termine
        </span>
        <button
          className="text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 w-7 h-7 flex items-center justify-center rounded-xl hover:bg-coral-50 dark:hover:bg-coral-900/30 transition-all active:scale-95"
          onClick={() => setFormModal({ initial: null })}
          title="Termin hinzufügen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Liste */}
      <div className="overflow-y-auto flex-1">
        <div className="px-3 py-3 space-y-1.5">
          {kommend.length === 0 && (
            <div className="text-center py-8 text-ink-400">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-xs">Keine bevorstehenden Termine</p>
            </div>
          )}

          {kommend.map(x => (
            <TerminKarte
              key={x.key}
              termin={x.item}
              extern={x.extern}
              klassen={klassen}
              stundenzeiten={stundenzeiten}
              onDelete={terminLoeschen}
              onEdit={t => setFormModal({ initial: t })}
              flashRef={x.extern ? undefined : el => { itemRefs.current[x.item.id] = el }}
              flashed={!x.extern && flashedId === x.item.id}
            />
          ))}

          {vergangen.length > 0 && (
            <div className="border-t border-paper-200 dark:border-ink-800 pt-1.5 mt-1.5">
              <button
                className="w-full text-left text-[11px] text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 py-1 flex items-center gap-1 transition-colors"
                onClick={() => setVergangeneOffen(o => !o)}
              >
                <span>{vergangeneOffen ? '▾' : '▸'}</span>
                Vergangene ({vergangen.length})
              </button>
              {vergangeneOffen && (
                <div className="space-y-1.5 mt-1">
                  {vergangen.map(x => (
                    <TerminKarte
                      key={x.key}
                      termin={x.item}
                      extern={x.extern}
                      klassen={klassen}
                      stundenzeiten={stundenzeiten}
                      onDelete={terminLoeschen}
                      onEdit={t => setFormModal({ initial: t })}
                      flashRef={x.extern ? undefined : el => { itemRefs.current[x.item.id] = el }}
                      flashed={!x.extern && flashedId === x.item.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {formModal && (
        <TerminForm
          initial={formModal.initial}
          klassen={klassen}
          stundenzeiten={stundenzeiten}
          onSpeichern={terminSpeichern}
          onAbbrechen={() => setFormModal(null)}
        />
      )}
    </div>
  )
}
