import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { getKWBereich, toLocalDateStr } from '../../utils/datum'
import KvAufgabenModal from './KvAufgabenModal'

function NotizPopup({ aufgabe, woche, status, klasse, schuljahr, onClose, onSaved, anchorRect }) {
  const [notiz, setNotiz] = useState(status?.notiz ?? '')
  const [saving, setSaving] = useState(false)

  const speichern = async () => {
    setSaving(true)
    try {
      await window.api.kv.wochenaufgaben.setStatus(
        aufgabe.id, klasse.id, schuljahr.id, woche.kw, woche.jahr,
        status?.erledigt_am ?? null,
        notiz.trim() || null
      )
      onSaved()
      onClose()
    } finally { setSaving(false) }
  }

  // Position relativ zur anklickenden Zelle
  const w = 280
  let left = anchorRect ? anchorRect.left : 100
  let top  = anchorRect ? anchorRect.bottom + 6 : 100
  if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed z-50 bg-white dark:bg-ink-800 rounded-2xl border border-paper-200 dark:border-ink-700 shadow-pop p-3 animate-pop-in"
        style={{ left, top, width: w }}>
        <p className="text-xs font-semibold text-ink-700 dark:text-paper-200 mb-0.5 truncate">{aufgabe.titel}</p>
        <p className="text-[10px] text-ink-500 mb-2">KW {woche.kw} · {woche.montag}</p>
        <textarea
          className="input resize-none text-xs"
          rows={3}
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          autoFocus
          placeholder="Notiz zur Woche…"
        />
        <div className="flex gap-2 mt-2">
          <button className="btn-secondary flex-1 text-xs" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1 text-xs" onClick={speichern} disabled={saving}>
            {saving ? '…' : 'Speichern'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function Wochenroutine({ klasse, schuljahr }) {
  const [aufgaben, setAufgaben] = useState([])
  const [stati, setStati] = useState({})        // { 'aufgabeId_jahr_kw': status }
  const [loading, setLoading] = useState(true)
  const [popup, setPopup] = useState(null)      // { aufgabe, woche, status, anchorRect }
  const [aufgabenModal, setAufgabenModal] = useState(null) // { vorlage } oder { vorlage: null } für Neu

  const wochen = useMemo(() => getKWBereich(8, 2), [])

  const laden = useCallback(async () => {
    if (!klasse?.id || !schuljahr?.id) return
    setLoading(true)
    try {
      const [a, st] = await Promise.all([
        window.api.kv.wochenaufgaben.getAlle(),
        window.api.kv.wochenaufgaben.getStatusFuerWochen(
          klasse.id, schuljahr.id, wochen.map(w => ({ kw: w.kw, jahr: w.jahr }))
        ),
      ])
      setAufgaben(a)
      const map = {}
      for (const s of st) map[`${s.aufgabe_id}_${s.jahr}_${s.kalenderwoche}`] = s
      setStati(map)
    } finally {
      setLoading(false)
    }
  }, [klasse?.id, schuljahr?.id, wochen])

  useEffect(() => { laden() }, [laden])

  const statusFuer = (aufgabeId, w) => stati[`${aufgabeId}_${w.jahr}_${w.kw}`]

  const toggle = async (aufgabe, w) => {
    const st = statusFuer(aufgabe.id, w)
    const erledigtAm = st?.erledigt_am ? null : toLocalDateStr(new Date())
    await window.api.kv.wochenaufgaben.setStatus(
      aufgabe.id, klasse.id, schuljahr.id, w.kw, w.jahr,
      erledigtAm, st?.notiz ?? null
    )
    setStati(prev => ({
      ...prev,
      [`${aufgabe.id}_${w.jahr}_${w.kw}`]: { ...(st ?? {}), aufgabe_id: aufgabe.id, klasse_id: klasse.id, kalenderwoche: w.kw, jahr: w.jahr, erledigt_am: erledigtAm }
    }))
  }

  const openNotiz = (e, aufgabe, w) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPopup({ aufgabe, woche: w, status: statusFuer(aufgabe.id, w), anchorRect: rect })
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col p-4">
      <div className="flex-1 overflow-hidden daskala-card">
        <div className="overflow-auto h-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-paper-200 dark:border-ink-800">
                <th className="sticky left-0 z-10 bg-white dark:bg-ink-900 text-left px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 border-r border-paper-200 dark:border-ink-800"
                  style={{ minWidth: 280, width: 280 }}>
                  Aufgabe
                </th>
                {wochen.map(w => (
                  <th
                    key={`${w.jahr}-${w.kw}`}
                    className={`text-center px-1 py-2 border-r border-paper-100 dark:border-ink-800/60 ${
                      w.istAktuell ? 'bg-coral-50 dark:bg-coral-900/30' : 'bg-paper-50 dark:bg-ink-900/40'
                    }`}
                    style={{ minWidth: 56, width: 56 }}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-[11px] font-bold ${w.istAktuell ? 'text-coral-700 dark:text-coral-300' : 'text-ink-600 dark:text-ink-300'}`}>
                        KW {w.kw}
                      </span>
                      <span className="text-[9px] text-ink-400 tabular-nums">
                        {w.montag.slice(8, 10)}.{w.montag.slice(5, 7)}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={wochen.length + 1} className="text-center py-6 text-ink-400 text-sm">Lade…</td></tr>
              )}
              {!loading && aufgaben.length === 0 && (
                <tr><td colSpan={wochen.length + 1} className="text-center py-6 text-ink-400 text-sm">Keine Wochenaufgaben definiert.</td></tr>
              )}
              {aufgaben.map((a, idx) => (
                <tr key={a.id} className={`group border-b border-paper-100 dark:border-ink-800/50 ${idx % 2 === 1 ? 'bg-paper-50/40 dark:bg-ink-900/20' : ''}`}>
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-2 border-r border-paper-200 dark:border-ink-800"
                    style={{ minWidth: 280, width: 280, backgroundColor: idx % 2 === 1 ? 'inherit' : undefined }}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-800 dark:text-paper-200 font-medium leading-tight flex-1">{a.titel}</span>
                      {a.rechtsbezug && (
                        <span className="text-[9px] text-ink-400 dark:text-ink-500 bg-paper-100 dark:bg-ink-800 px-1 py-0.5 rounded flex-shrink-0">
                          {a.rechtsbezug}
                        </span>
                      )}
                      <button
                        className="text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={() => setAufgabenModal({ vorlage: a })}
                        title="Vorlage bearbeiten"
                      >✎</button>
                    </div>
                  </td>
                  {wochen.map(w => {
                    const st = statusFuer(a.id, w)
                    const erledigt = !!st?.erledigt_am
                    const hatNotiz = !!st?.notiz
                    return (
                      <td
                        key={`${w.jahr}-${w.kw}`}
                        className={`px-1 py-1 text-center cursor-pointer border-r border-paper-100 dark:border-ink-800/60 transition-colors
                          ${w.istAktuell ? 'bg-coral-50/40 dark:bg-coral-900/20' : ''}
                          hover:bg-coral-50 dark:hover:bg-coral-900/30`}
                        onClick={() => toggle(a, w)}
                        onContextMenu={e => openNotiz(e, a, w)}
                        title={st?.notiz ?? (erledigt ? `Erledigt am ${st.erledigt_am}` : 'Klick: erledigt · Rechtsklick: Notiz')}
                      >
                        <div className="flex items-center justify-center h-8 relative">
                          {erledigt ? (
                            <svg className="w-4 h-4 text-mint-600 dark:text-mint-400" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <div className="w-4 h-4 rounded-md border border-paper-300 dark:border-ink-700" />
                          )}
                          {hatNotiz && (
                            <span className="absolute -top-0.5 -right-0.5 text-[9px]">📝</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!loading && (
                <tr className="border-t-2 border-paper-200 dark:border-ink-800">
                  <td colSpan={wochen.length + 1} className="px-3 py-2">
                    <button
                      className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400 hover:text-coral-600 dark:hover:text-coral-300 hover:bg-coral-50 dark:hover:bg-coral-900/30 rounded-lg px-3 py-1.5 transition-colors w-full text-left"
                      onClick={() => setAufgabenModal({ vorlage: null })}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Neue Wochenaufgabe…
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-ink-400 mt-2 text-center">
        Klick = erledigt umschalten · Rechtsklick = Notiz · Aktuelle KW ist hervorgehoben
      </p>

      {popup && (
        <NotizPopup
          aufgabe={popup.aufgabe}
          woche={popup.woche}
          status={popup.status}
          klasse={klasse}
          schuljahr={schuljahr}
          anchorRect={popup.anchorRect}
          onClose={() => setPopup(null)}
          onSaved={laden}
        />
      )}

      {aufgabenModal && (
        <KvAufgabenModal
          modus="woche"
          vorlage={aufgabenModal.vorlage}
          onClose={() => setAufgabenModal(null)}
          onSaved={laden}
        />
      )}
    </div>
  )
}
