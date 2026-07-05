// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { monatsName, SCHULJAHR_MONATE, toLocalDateStr } from '../../utils/datum'
import KvAufgabenModal from './KvAufgabenModal'

// Kategorie-Farben aus dem App-Schema
const KAT = {
  organisation: { bg: 'bg-mint-50 dark:bg-mint-900/30',         text: 'text-mint-700 dark:text-mint-300',         dot: 'bg-mint-500',     label: 'Organisation' },
  doku:         { bg: 'bg-lavender-50 dark:bg-lavender-900/30', text: 'text-lavender-700 dark:text-lavender-300', dot: 'bg-lavender-500', label: 'Dokumentation' },
  elternarbeit: { bg: 'bg-coral-50 dark:bg-coral-900/30',       text: 'text-coral-700 dark:text-coral-300',       dot: 'bg-coral-500',    label: 'Elternarbeit' },
  konferenz:    { bg: 'bg-sky-50 dark:bg-sky-900/30',           text: 'text-sky-700 dark:text-sky-300',           dot: 'bg-sky-500',      label: 'Konferenz' },
}
function katStil(k) { return KAT[k] ?? { bg: 'bg-paper-100 dark:bg-ink-800', text: 'text-ink-600 dark:text-ink-300', dot: 'bg-ink-400', label: k ?? '—' } }

function NotizFeld({ aufgabe, onNotiz }) {
  const [editNotiz, setEditNotiz] = useState(false)
  const [notiz, setNotiz] = useState(aufgabe.notiz ?? '')
  useEffect(() => { setNotiz(aufgabe.notiz ?? '') }, [aufgabe.notiz])

  if (editNotiz) {
    return (
      <textarea
        className="input resize-none text-xs mt-1.5"
        rows={2}
        value={notiz}
        onChange={e => setNotiz(e.target.value)}
        onBlur={() => { onNotiz(aufgabe, notiz.trim() || null); setEditNotiz(false) }}
        onKeyDown={e => { if (e.key === 'Escape') { setEditNotiz(false); setNotiz(aufgabe.notiz ?? '') } }}
        autoFocus
        placeholder="Notiz…"
      />
    )
  }
  if (aufgabe.notiz) {
    return (
      <button
        className="text-[10px] text-ink-500 dark:text-ink-400 italic hover:text-coral-600 dark:hover:text-coral-300 text-left w-full mt-1"
        onClick={() => setEditNotiz(true)}
      >
        📝 {aufgabe.notiz}
      </button>
    )
  }
  return (
    <button
      className="text-[10px] text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 opacity-0 group-hover:opacity-100 mt-1 transition-opacity"
      onClick={() => setEditNotiz(true)}
    >
      + Notiz
    </button>
  )
}

function SubAufgabe({ aufgabe, onToggle, onNotiz, onEdit }) {
  const erledigt = !!aufgabe.erledigt_am
  return (
    <div className="group flex items-start gap-2 pl-5 pr-1 py-1 hover:bg-paper-50 dark:hover:bg-ink-800/40 rounded-md transition-colors">
      <button
        onClick={() => onToggle(aufgabe)}
        className={`mt-0.5 w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all active:scale-90
          ${erledigt
            ? 'bg-mint-500 border-mint-500 text-white'
            : 'border-ink-400 dark:border-ink-500 hover:border-coral-500'}`}
        title={erledigt ? `Erledigt am ${aufgabe.erledigt_am}` : 'Als erledigt markieren'}
      >
        {erledigt && (
          <svg className="w-2 h-2" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] leading-snug ${erledigt ? 'text-ink-400 line-through' : 'text-ink-700 dark:text-paper-300'}`}>
            {aufgabe.titel}
          </span>
          <button
            className="ml-auto text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]"
            onClick={() => onEdit(aufgabe)}
            title="Sub-Aufgabe bearbeiten"
          >✎</button>
        </div>
        <NotizFeld aufgabe={aufgabe} onNotiz={onNotiz} />
      </div>
    </div>
  )
}

function TopLevelAufgabe({ aufgabe, subs, onToggle, onNotiz, onEdit, onAddSub }) {
  const erledigt = !!aufgabe.erledigt_am
  const stil = katStil(aufgabe.kategorie)
  const subErledigt = subs.filter(s => s.erledigt_am).length
  const subTotal = subs.length

  return (
    <div className={`group rounded-xl border ${erledigt ? 'border-paper-200 dark:border-ink-800 bg-paper-50/60 dark:bg-ink-900/30' : 'border-paper-200 dark:border-ink-800 bg-white dark:bg-ink-900'} p-2.5 transition-colors hover:border-coral-200 dark:hover:border-coral-800`}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => onToggle(aufgabe)}
          className={`mt-0.5 w-4 h-4 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all active:scale-90
            ${erledigt
              ? `${stil.dot} border-transparent text-white`
              : 'border-ink-400 dark:border-ink-500 hover:border-coral-500'}`}
          title={erledigt ? `Erledigt am ${aufgabe.erledigt_am}` : 'Als erledigt markieren'}
        >
          {erledigt && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-xs font-semibold leading-snug ${erledigt ? 'text-ink-400 line-through' : 'text-ink-800 dark:text-paper-200'}`}>
              {aufgabe.titel}
            </span>
            {aufgabe.rechtsbezug && (
              <span className="text-[9px] font-medium text-ink-400 dark:text-ink-500 bg-paper-100 dark:bg-ink-800 px-1 py-0.5 rounded">
                {aufgabe.rechtsbezug}
              </span>
            )}
            {subTotal > 0 && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                subErledigt === subTotal
                  ? 'bg-mint-100 dark:bg-mint-900/40 text-mint-700 dark:text-mint-300'
                  : 'bg-paper-200 dark:bg-ink-800 text-ink-600 dark:text-ink-400'
              }`}>
                {subErledigt}/{subTotal}
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 text-[11px] px-1"
                onClick={onAddSub}
                title="Sub-Aufgabe hinzufügen"
              >+sub</button>
              <button
                className="text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 text-xs px-0.5"
                onClick={() => onEdit(aufgabe)}
                title="Vorlage bearbeiten"
              >✎</button>
            </div>
          </div>
          {aufgabe.beschreibung && (
            <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-0.5 leading-snug">{aufgabe.beschreibung}</p>
          )}
          <NotizFeld aufgabe={aufgabe} onNotiz={onNotiz} />
        </div>
      </div>
      {subs.length > 0 && (
        <div className="mt-2 border-l-2 border-paper-200 dark:border-ink-800 ml-2 pl-1 space-y-0.5">
          {subs.map(s => (
            <SubAufgabe
              key={s.id}
              aufgabe={s}
              onToggle={onToggle}
              onNotiz={onNotiz}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Monatskarte({ monat, topLevel, subsMap, onToggle, onNotiz, onEditTemplate, onAddTemplate, onAddSub, filter }) {
  const heute = new Date()
  const istAktuellerMonat = (heute.getMonth() + 1) === monat
  const erledigCount = topLevel.filter(a => a.erledigt_am).length
  const offenCount = topLevel.length - erledigCount

  return (
    <div className={`daskala-card p-3 self-start flex flex-col gap-2 ${istAktuellerMonat ? 'ring-2 ring-coral-400 dark:ring-coral-600' : ''}`}>
      <div className="flex items-center justify-between border-b border-paper-200 dark:border-ink-800 pb-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-bold text-ink-800 dark:text-paper-100 font-display">
            {monatsName(monat)}
          </h3>
          {filter === 'erledigt' && (
            <span className="text-mint-600 dark:text-mint-400" title="Alle erledigt">✓</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-ink-500 dark:text-ink-400">
            {topLevel.length} {topLevel.length === 1 ? 'Aufgabe' : 'Aufgaben'}
            {filter === 'offen' && erledigCount > 0 && (
              <span className="ml-1 text-ink-400">· {offenCount} offen</span>
            )}
          </span>
          <button
            className="text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 w-5 h-5 flex items-center justify-center rounded-md hover:bg-coral-50 dark:hover:bg-coral-900/30 transition-colors"
            onClick={() => onAddTemplate(monat)}
            title={`Neue Aufgabe für ${monatsName(monat)}`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {topLevel.map(a => (
          <TopLevelAufgabe
            key={a.id}
            aufgabe={a}
            subs={subsMap.get(a.id) ?? []}
            onToggle={onToggle}
            onNotiz={onNotiz}
            onEdit={onEditTemplate}
            onAddSub={() => onAddSub(a)}
          />
        ))}
      </div>
    </div>
  )
}

export default function Jahresplaner({ klasse, schuljahr }) {
  const [aufgaben, setAufgaben] = useState([])
  const [filter, setFilter] = useState('offen') // 'offen' | 'erledigt'
  const [loading, setLoading] = useState(true)
  const [aufgabenModal, setAufgabenModal] = useState(null) // { vorlage, initialMonat, parent }

  const laden = useCallback(async () => {
    if (!klasse?.id || !schuljahr?.id) return
    setLoading(true)
    try {
      const data = await window.api.kv.jahresaufgaben.getAlle(klasse.id, schuljahr.id)
      setAufgaben(data)
    } finally {
      setLoading(false)
    }
  }, [klasse?.id, schuljahr?.id])

  useEffect(() => { laden() }, [laden])

  const handleToggle = useCallback(async (aufgabe) => {
    const erledigtAm = aufgabe.erledigt_am ? null : toLocalDateStr(new Date())
    await window.api.kv.jahresaufgaben.setStatus(aufgabe.id, klasse.id, schuljahr.id, erledigtAm, aufgabe.notiz ?? null)
    setAufgaben(prev => prev.map(a => a.id === aufgabe.id ? { ...a, erledigt_am: erledigtAm } : a))
  }, [klasse?.id, schuljahr?.id])

  const handleNotiz = useCallback(async (aufgabe, notiz) => {
    await window.api.kv.jahresaufgaben.setStatus(aufgabe.id, klasse.id, schuljahr.id, aufgabe.erledigt_am ?? null, notiz)
    setAufgaben(prev => prev.map(a => a.id === aufgabe.id ? { ...a, notiz } : a))
  }, [klasse?.id, schuljahr?.id])

  // Aufgaben gruppieren — Filter-Logik auf Monatsebene (atomisch pro Monat):
  //  - Ein Monat ist "komplett fertig", wenn ALLE Top-Level-Aufgaben selbst erledigt sind
  //    UND alle ihre Sub-Aufgaben erledigt sind.
  //  - 'offen':    zeigt alle Monate, die NICHT komplett fertig sind — Karte enthält ALLE
  //                Aufgaben des Monats (erledigte durchgestrichen). So bleibt der Kontext
  //                erhalten, bis der Monat geschlossen wird.
  //  - 'erledigt': zeigt nur Monate, die komplett fertig sind — Karte enthält alle Aufgaben.
  const { topLevelProMonat, subsMap } = useMemo(() => {
    // Alle Subs nach parent_id gruppieren (ungefiltert)
    const alleSubs = new Map()
    for (const a of aufgaben) {
      if (a.parent_id) {
        const arr = alleSubs.get(a.parent_id) ?? []
        arr.push(a)
        alleSubs.set(a.parent_id, arr)
      }
    }

    // Top-Level pro Monat sammeln
    const monatsTL = new Map(SCHULJAHR_MONATE.map(m => [m, []]))
    for (const a of aufgaben) {
      if (a.parent_id) continue
      if (monatsTL.has(a.monat)) monatsTL.get(a.monat).push(a)
    }

    // Pro Monat entscheiden: komplett fertig oder noch offen?
    const tlMap = new Map(SCHULJAHR_MONATE.map(m => [m, []]))
    for (const monat of SCHULJAHR_MONATE) {
      const tl = monatsTL.get(monat) ?? []
      if (tl.length === 0) continue
      const monatFertig = tl.every(a => {
        const subs = alleSubs.get(a.id) ?? []
        return !!a.erledigt_am && subs.every(s => !!s.erledigt_am)
      })
      const passt = filter === 'erledigt' ? monatFertig : !monatFertig
      if (passt) tlMap.set(monat, tl)
    }
    return { topLevelProMonat: tlMap, subsMap: alleSubs }
  }, [aufgaben, filter])

  const summe = aufgaben.filter(a => !a.parent_id).length
  const summeErledigt = aufgaben.filter(a => {
    if (a.parent_id) return false
    const subs = aufgaben.filter(x => x.parent_id === a.id)
    return !!a.erledigt_am && subs.every(s => !!s.erledigt_am)
  }).length

  // Monate, die nach dem aktuellen Filter mindestens eine sichtbare Karte liefern
  const sichtbareMonate = SCHULJAHR_MONATE.filter(m => (topLevelProMonat.get(m) ?? []).length > 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 min-h-0">
      <div className="max-w-7xl mx-auto">
        {/* Filter + Stats */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-0.5 bg-paper-100 dark:bg-ink-800 rounded-xl p-0.5">
            {[
              ['offen',    'Offen'],
              ['erledigt', 'Erledigt'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`px-3 py-1 text-xs rounded-lg font-semibold transition-all
                  ${filter === id
                    ? 'bg-white dark:bg-ink-700 text-coral-600 dark:text-coral-300 shadow-soft'
                    : 'text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-paper-200'}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-xs text-ink-500 dark:text-ink-400 ml-auto">
            {loading ? 'Lade…' : (
              <>
                <span className="font-semibold text-ink-700 dark:text-paper-200">{summeErledigt}</span> von <span className="font-semibold text-ink-700 dark:text-paper-200">{summe}</span> Aufgaben erledigt
                {summe > 0 && <span className="ml-1.5 text-ink-400">({Math.round(summeErledigt / summe * 100)}%)</span>}
              </>
            )}
          </div>
        </div>

        {/* Empty States pro Filter */}
        {!loading && sichtbareMonate.length === 0 && filter === 'offen' && (
          <div className="text-center py-12 daskala-card">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-sm text-ink-700 dark:text-paper-200 font-semibold">Alles erledigt!</p>
            <p className="text-xs text-ink-500 mt-1">Wechsle zu „Erledigt" um deine abgeschlossenen Aufgaben zu sehen.</p>
          </div>
        )}
        {!loading && sichtbareMonate.length === 0 && filter === 'erledigt' && (
          <div className="text-center py-12 daskala-card">
            <div className="text-4xl mb-2">📋</div>
            <p className="text-sm text-ink-700 dark:text-paper-200 font-semibold">Noch nichts abgeschlossen</p>
            <p className="text-xs text-ink-500 mt-1">Sobald in einem Monat alle Aufgaben erledigt sind, taucht er hier auf.</p>
          </div>
        )}

        {/*
          Grid mit items-start: Karten werden NICHT auf die Zeilen-Höhe gestreckt,
          jede Karte nimmt nur ihren Wunsch-Höhenbedarf. Bei verschiedenen Inhalts-
          mengen entstehen kleine Lücken in der Zeile — aber keine leeren Containers.
        */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
          {sichtbareMonate.map(m => (
            <Monatskarte
              key={m}
              monat={m}
              topLevel={topLevelProMonat.get(m) ?? []}
              subsMap={subsMap}
              filter={filter}
              onToggle={handleToggle}
              onNotiz={handleNotiz}
              onEditTemplate={(a) => setAufgabenModal({ vorlage: a, initialMonat: m, parent: null })}
              onAddTemplate={(monat) => setAufgabenModal({ vorlage: null, initialMonat: monat, parent: null })}
              onAddSub={(parent) => setAufgabenModal({ vorlage: null, initialMonat: m, parent })}
            />
          ))}
        </div>
      </div>

      {aufgabenModal && (
        <KvAufgabenModal
          modus="jahr"
          vorlage={aufgabenModal.vorlage}
          initialMonat={aufgabenModal.initialMonat}
          parent={aufgabenModal.parent}
          onClose={() => setAufgabenModal(null)}
          onSaved={laden}
        />
      )}
    </div>
  )
}
