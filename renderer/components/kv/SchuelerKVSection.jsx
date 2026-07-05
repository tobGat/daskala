// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import AktenvermerkModal from './AktenvermerkModal'
import ElternkontaktModal from './ElternkontaktModal'
import FehlstundeModal from './FehlstundeModal'

const AV_LABEL = {
  vorfall:             '⚠️ Vorfall',
  gespraech_eltern:    '💬 Gespräch Eltern',
  gespraech_schueler:  '🗣️ Gespräch Schüler:in',
  beobachtung:         '👁️ Beobachtung',
  erziehungsmassnahme: '🎯 Erziehungsmaßnahme',
}
const EK_ART = {
  telefon:         '☎️',
  mail:            '✉️',
  persoenlich:     '🤝',
  elternsprechtag: '📅',
}
const TRIGGER_TYP = {
  fruehwarnung:     'Frühwarnung',
  fehlstunden_15:   'Fehlstunden ≥ 15',
  fehlstunden_30:   'Fehlstunden ≥ 30',
  vorfall:          'Vorfall',
  elternkontakt:    'Offener Rückruf',
}
const SCHWERE_FARBE = {
  critical: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  warn:     'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  info:     'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',
}

function formatDatum(d) {
  if (!d) return '—'
  try { return new Date(d + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  catch { return d }
}

function FehlstundenKonto({ fehlstunden, onNeu, onDelete }) {
  const summen = useMemo(() => {
    const ent = fehlstunden.filter(f => f.entschuldigt).reduce((a, f) => a + f.stunden, 0)
    const unent = fehlstunden.filter(f => !f.entschuldigt).reduce((a, f) => a + f.stunden, 0)
    return { ent, unent, gesamt: ent + unent }
  }, [fehlstunden])

  // Schwellen-Farbe der unentschuldigten Summe
  let schwelleStil = 'bg-mint-50 dark:bg-mint-900/30 text-mint-700 dark:text-mint-300'
  if (summen.unent >= 30)      schwelleStil = 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
  else if (summen.unent >= 15) schwelleStil = 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
  else if (summen.unent >= 5)  schwelleStil = 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Fehlstunden</p>
        <button className="btn-soft text-xs" onClick={onNeu}>+ Eintragen</button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-ink-700 dark:text-paper-200 tabular-nums">{summen.ent}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-0.5">entschuldigt</div>
        </div>
        <div className={`border rounded-xl p-3 text-center ${schwelleStil} border-current/20`}>
          <div className="text-2xl font-bold tabular-nums">{summen.unent}</div>
          <div className="text-[10px] uppercase tracking-wider mt-0.5">unentschuldigt</div>
        </div>
        <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold text-ink-700 dark:text-paper-200 tabular-nums">{summen.gesamt}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 mt-0.5">gesamt</div>
        </div>
      </div>
      {summen.unent >= 5 && (
        <p className="text-[10px] text-ink-500 mb-2">
          {summen.unent >= 30 && '🚨 30-Stunden-Schwelle überschritten — Verständigung gem. § 45 SchUG.'}
          {summen.unent >= 15 && summen.unent < 30 && '⚠️ 15-Stunden-Schwelle überschritten.'}
          {summen.unent >= 5  && summen.unent < 15 && 'ℹ️ 5-Stunden-Schwelle erreicht.'}
        </p>
      )}
      {fehlstunden.length === 0 ? (
        <p className="text-xs text-ink-400 italic text-center py-3">Keine Fehlstunden eingetragen.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-paper-200 dark:border-ink-800">
          <table className="w-full text-xs">
            <thead className="bg-paper-100 dark:bg-ink-800/60 text-[10px] font-bold uppercase tracking-wider text-ink-500">
              <tr>
                <th className="text-left px-3 py-1.5">Datum</th>
                <th className="text-center px-2 py-1.5">Std</th>
                <th className="text-left px-2 py-1.5">Status</th>
                <th className="text-left px-3 py-1.5">Grund</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {fehlstunden.map(f => (
                <tr key={f.id} className="border-t border-paper-100 dark:border-ink-800/60 group">
                  <td className="px-3 py-1 text-ink-700 dark:text-paper-200 tabular-nums">{formatDatum(f.datum)}</td>
                  <td className="px-2 py-1 text-center font-semibold tabular-nums">{f.stunden}</td>
                  <td className="px-2 py-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      f.entschuldigt
                        ? 'bg-mint-100 dark:bg-mint-900/40 text-mint-700 dark:text-mint-300'
                        : 'bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-300'
                    }`}>{f.entschuldigt ? 'entsch.' : 'unentsch.'}</span>
                  </td>
                  <td className="px-3 py-1 text-ink-500 truncate max-w-xs">{f.grund ?? ''}</td>
                  <td className="px-2 py-1 text-center">
                    <button
                      className="text-ink-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100"
                      onClick={() => onDelete(f.id)}
                      title="Löschen"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AktenvermerkListe({ vermerke, onNeu, onDelete }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Aktenvermerke</p>
        <button className="btn-soft text-xs" onClick={onNeu}>+ Neu</button>
      </div>
      {vermerke.length === 0 ? (
        <p className="text-xs text-ink-400 italic text-center py-3">Keine Aktenvermerke vorhanden.</p>
      ) : (
        <div className="space-y-2">
          {vermerke.map(v => (
            <div key={v.id} className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3 group">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold text-ink-700 dark:text-paper-200">{AV_LABEL[v.typ] ?? v.typ}</span>
                <span className="text-[10px] text-ink-400 tabular-nums ml-auto">{formatDatum(v.datum)}</span>
                <button
                  className="text-ink-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100"
                  onClick={() => onDelete(v.id)}
                >✕</button>
              </div>
              <p className="text-sm font-semibold text-ink-800 dark:text-paper-200 mb-0.5">{v.titel}</p>
              <p className="text-xs text-ink-500 dark:text-ink-400 leading-snug whitespace-pre-wrap">{v.beschreibung}</p>
              {v.zeugen && <p className="text-[10px] text-ink-400 mt-1">Zeugen: {v.zeugen}</p>}
              {v.folgemassnahme && <p className="text-[10px] text-ink-500 mt-1 border-l-2 border-coral-300 dark:border-coral-700 pl-2 italic">→ {v.folgemassnahme}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ElternkontaktListe({ kontakte, onNeu, onToggleErledigt, onDelete }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Elternkontakte</p>
        <button className="btn-soft text-xs" onClick={onNeu}>+ Neu</button>
      </div>
      {kontakte.length === 0 ? (
        <p className="text-xs text-ink-400 italic text-center py-3">Keine Elternkontakte protokolliert.</p>
      ) : (
        <div className="space-y-2">
          {kontakte.map(k => {
            const offen = !k.erledigt
            return (
              <div
                key={k.id}
                className={`border rounded-xl p-3 group ${
                  offen
                    ? 'bg-coral-50 dark:bg-coral-900/30 border-coral-200 dark:border-coral-800/60'
                    : 'bg-paper-50 dark:bg-ink-900/40 border-paper-200 dark:border-ink-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base" aria-hidden>{EK_ART[k.art] ?? '•'}</span>
                  <span className="text-[10px] font-semibold text-ink-700 dark:text-paper-200">{k.initiator === 'kv' ? 'KV → Eltern' : 'Eltern → KV'}</span>
                  {offen && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-coral-200 dark:bg-coral-800/60 text-coral-800 dark:text-coral-200">OFFEN</span>}
                  <span className="text-[10px] text-ink-400 tabular-nums ml-auto">{formatDatum(k.datum)}</span>
                </div>
                <p className="text-sm font-semibold text-ink-800 dark:text-paper-200 mb-0.5">{k.thema}</p>
                {k.inhalt && <p className="text-xs text-ink-500 dark:text-ink-400 leading-snug whitespace-pre-wrap">{k.inhalt}</p>}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    className="text-[10px] font-semibold text-coral-600 dark:text-coral-300 hover:underline"
                    onClick={() => onToggleErledigt(k.id, !k.erledigt)}
                  >
                    {offen ? '✓ Als erledigt markieren' : '↺ Wieder als offen'}
                  </button>
                  <button
                    className="ml-auto text-ink-400 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(k.id)}
                  >✕</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function TriggerHistorie({ trigger }) {
  if (trigger.length === 0) return null
  return (
    <section>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">Trigger-Historie</p>
      <div className="space-y-1.5">
        {trigger.map(t => (
          <div key={t.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${t.archiviert ? 'bg-paper-50 dark:bg-ink-900/40 opacity-60' : 'bg-coral-50 dark:bg-coral-900/30'}`}>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${SCHWERE_FARBE[t.schweregrad]}`}>{t.schweregrad}</span>
            <span className="text-xs font-semibold text-ink-700 dark:text-paper-200">{TRIGGER_TYP[t.typ] ?? t.typ}</span>
            <span className="text-[10px] text-ink-500 truncate flex-1">{t.ausloeser}</span>
            <span className="text-[9px] text-ink-400 tabular-nums">{formatDatum(t.erstellt_am?.slice(0,10))}</span>
            {t.archiviert ? <span className="text-[9px] text-mint-600 dark:text-mint-400">✓</span> : null}
          </div>
        ))}
      </div>
    </section>
  )
}

export default function SchuelerKVSection({ schueler, klasseId }) {
  const [fehlstunden, setFehlstunden] = useState([])
  const [aktenvermerke, setAktenvermerke] = useState([])
  const [elternkontakte, setElternkontakte] = useState([])
  const [trigger, setTrigger] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)  // 'fehlstunde' | 'aktenvermerk' | 'elternkontakt'

  const laden = useCallback(async () => {
    if (!schueler?.id) return
    setLoading(true)
    try {
      const [f, av, ek, tr] = await Promise.all([
        window.api.kv.fehlstunden.getAlleFuerSchueler(schueler.id),
        window.api.kv.aktenvermerke.getAlleFuerSchueler(schueler.id),
        window.api.kv.elternkontakte.getAlleFuerSchueler(schueler.id),
        window.api.kv.trigger.getAlleFuerSchueler(schueler.id),
      ])
      setFehlstunden(f); setAktenvermerke(av); setElternkontakte(ek); setTrigger(tr)
    } finally { setLoading(false) }
  }, [schueler?.id])

  useEffect(() => { laden() }, [laden])

  // Handlers
  const fehlstundeDelete    = async (id) => { if (confirm('Wirklich löschen?')) { await window.api.kv.fehlstunden.delete(id); await laden() } }
  const aktenvermerkDelete  = async (id) => { if (confirm('Aktenvermerk löschen?')) { await window.api.kv.aktenvermerke.delete(id); await laden() } }
  const elternkontaktDelete = async (id) => { if (confirm('Eintrag löschen?')) { await window.api.kv.elternkontakte.delete(id); await laden() } }
  const elternkontaktToggle = async (id, erledigt) => { await window.api.kv.elternkontakte.setErledigt(id, erledigt ? 1 : 0); await laden() }

  if (loading) return <p className="text-sm text-ink-400 animate-pulse">Lade KV-Daten…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-2xl bg-coral-100 dark:bg-coral-900/40 flex items-center justify-center text-base">📜</div>
        <div>
          <h3 className="text-lg font-bold text-ink-900 dark:text-paper-100 font-display">KV-Daten</h3>
          <p className="text-xs text-ink-500">Aktenvermerke, Elternkontakte, Fehlstunden &amp; Trigger</p>
        </div>
      </div>

      <FehlstundenKonto
        fehlstunden={fehlstunden}
        onNeu={() => setModal('fehlstunde')}
        onDelete={fehlstundeDelete}
      />

      <AktenvermerkListe
        vermerke={aktenvermerke}
        onNeu={() => setModal('aktenvermerk')}
        onDelete={aktenvermerkDelete}
      />

      <ElternkontaktListe
        kontakte={elternkontakte}
        onNeu={() => setModal('elternkontakt')}
        onToggleErledigt={elternkontaktToggle}
        onDelete={elternkontaktDelete}
      />

      <TriggerHistorie trigger={trigger} />

      {/* Modale */}
      {modal === 'fehlstunde' && (
        <FehlstundeModal
          schueler={schueler}
          onClose={() => setModal(null)}
          onSaved={laden}
        />
      )}
      {modal === 'aktenvermerk' && (
        <AktenvermerkModal
          klasseId={klasseId}
          schueler={schueler}
          onClose={() => setModal(null)}
          onSaved={laden}
        />
      )}
      {modal === 'elternkontakt' && (
        <ElternkontaktModal
          schueler={schueler}
          onClose={() => setModal(null)}
          onSaved={laden}
        />
      )}
    </div>
  )
}
