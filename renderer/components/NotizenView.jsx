// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Zentraler Notiz-Bereich („Notizen") mit Ordnern, pro Schuljahr. 3-Spalten-Layout:
//   links  = Ordner (je Klasse automatisch ein Ordner + eigene Ordner + „Allgemein"),
//   mitte  = Notizliste des gewählten Ordners,
//   rechts = Editor (Titel + Text) mit automatischem Speichern (debounced).
// Lädt die eigenen Daten lokal (Muster: kv/SchuelerKVSection) über window.api.notizbuch.*.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useStore from '../store/useStore'

// Vorgegebene Ordnerfarben (Auswahl beim Anlegen).
const FARBEN = ['#fb6936', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ec4899']

function fmtWann(s) {
  if (!s) return ''
  const d = new Date(String(s).replace(' ', 'T') + 'Z') // in der DB als UTC (datetime('now'))
  if (isNaN(d)) return String(s)
  return d.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
// Anzeige-Titel einer Notiz: Titel, sonst erste Textzeile, sonst Platzhalter.
function titelVon(n) {
  if (n.titel && n.titel.trim()) return n.titel.trim()
  const ersteZeile = (n.text || '').split('\n').find(z => z.trim())
  return ersteZeile ? ersteZeile.trim() : 'Ohne Titel'
}
function snippetVon(n) {
  const txt = (n.text || '').replace(/\s+/g, ' ').trim()
  return txt.length > 90 ? txt.slice(0, 89) + '…' : txt
}

export default function NotizenView() {
  const { aktuellesSchuljahr, klassen } = useStore()
  const echteKlassen = useMemo(() => (klassen || []).filter(k => !k.ist_vorlage), [klassen])
  const sjId = aktuellesSchuljahr?.id

  const [ordner, setOrdner] = useState([])
  const [notizen, setNotizen] = useState([])
  const [sel, setSel] = useState('all')          // 'all' | 'k:<klasseId>' | 'o:<ordnerId>'
  const [selNotizId, setSelNotizId] = useState(null)
  const [entwurf, setEntwurf] = useState({ titel: '', text: '' })
  // Ordner-UI
  const [ordnerFormOffen, setOrdnerFormOffen] = useState(false)
  const [neuName, setNeuName] = useState('')
  const [neuFarbe, setNeuFarbe] = useState(FARBEN[0])
  const [renameId, setRenameId] = useState(null)
  const [renameWert, setRenameWert] = useState('')
  const [loeschOrdnerId, setLoeschOrdnerId] = useState(null)
  const [loeschNotizId, setLoeschNotizId] = useState(null)
  const saveTimer = useRef(null)
  const titelRef = useRef(null)

  const laden = useCallback(async () => {
    if (!sjId) { setOrdner([]); setNotizen([]); return }
    const [o, n] = await Promise.all([
      window.api.notizbuch.ordnerGetAll(sjId),
      window.api.notizbuch.notizGetAll(sjId),
    ])
    setOrdner(o || []); setNotizen(n || [])
  }, [sjId])
  useEffect(() => { laden() }, [laden])

  // Zuordnung Notiz → gewählter Ordner
  const inSel = useCallback((n) => {
    if (sel === 'all') return n.klasse_id == null && n.ordner_id == null
    if (sel.startsWith('k:')) return n.klasse_id === Number(sel.slice(2))
    if (sel.startsWith('o:')) return n.ordner_id === Number(sel.slice(2))
    return false
  }, [sel])
  const selToIds = (key) => key === 'all' ? { klasseId: null, ordnerId: null }
    : key.startsWith('k:') ? { klasseId: Number(key.slice(2)), ordnerId: null }
      : { klasseId: null, ordnerId: Number(key.slice(2)) }

  const notizenImOrdner = notizen.filter(inSel)
  const zaehle = (pred) => notizen.filter(pred).length

  const selNotiz = notizen.find(n => n.id === selNotizId) || null
  // Editor-Puffer bei Notizwechsel neu setzen.
  useEffect(() => {
    if (selNotiz) setEntwurf({ titel: selNotiz.titel ?? '', text: selNotiz.text ?? '' })
  }, [selNotizId]) // absichtlich nur bei Notizwechsel
  // Beim Ordnerwechsel Auswahl aufheben, falls die Notiz nicht mehr sichtbar ist.
  useEffect(() => {
    if (selNotizId && !notizen.some(n => n.id === selNotizId && inSel(n))) setSelNotizId(null)
  }, [sel]) // absichtlich nur bei Ordnerwechsel

  const patchLokal = (id, fields) => setNotizen(list => list.map(n => n.id === id ? { ...n, ...fields } : n))
  const planeSpeichern = (id, daten) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { window.api.notizbuch.notizUpdate(id, daten) }, 500)
  }
  const bearbeite = (feld, wert) => {
    if (!selNotiz) return
    const neu = { ...entwurf, [feld]: wert }
    setEntwurf(neu)
    patchLokal(selNotiz.id, { [feld]: wert })
    planeSpeichern(selNotiz.id, { titel: neu.titel, text: neu.text, klasseId: selNotiz.klasse_id, ordnerId: selNotiz.ordner_id })
  }
  // Sofort speichern, wenn der Editor verlassen wird (Notizwechsel/Blur), damit nichts verloren geht.
  const sofortSpeichern = () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (selNotiz) window.api.notizbuch.notizUpdate(selNotiz.id, { titel: entwurf.titel, text: entwurf.text, klasseId: selNotiz.klasse_id, ordnerId: selNotiz.ordner_id })
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const waehleNotiz = (id) => { sofortSpeichern(); setSelNotizId(id) }

  const neueNotiz = async () => {
    if (!sjId) return
    sofortSpeichern()
    const { klasseId, ordnerId } = selToIds(sel)
    const id = await window.api.notizbuch.notizCreate({ schuljahrId: sjId, klasseId, ordnerId, titel: '', text: '' })
    await laden()
    setSelNotizId(id)
    setTimeout(() => titelRef.current?.focus(), 30)
  }
  const loescheNotiz = async (id) => {
    setLoeschNotizId(null)
    if (saveTimer.current && selNotiz?.id === id) { clearTimeout(saveTimer.current); saveTimer.current = null }
    await window.api.notizbuch.notizDelete(id)
    if (selNotizId === id) setSelNotizId(null)
    await laden()
  }
  const verschiebe = async (ziel) => {
    if (!selNotiz) return
    const { klasseId, ordnerId } = selToIds(ziel)
    await window.api.notizbuch.notizUpdate(selNotiz.id, { titel: entwurf.titel, text: entwurf.text, klasseId, ordnerId })
    await laden()
    setSel(ziel) // der Notiz in den Zielordner folgen
  }

  const ordnerAnlegen = async () => {
    const name = neuName.trim(); if (!name || !sjId) return
    const id = await window.api.notizbuch.ordnerCreate({ schuljahrId: sjId, name, farbe: neuFarbe })
    setNeuName(''); setOrdnerFormOffen(false); setNeuFarbe(FARBEN[0])
    await laden(); setSel('o:' + id)
  }
  const ordnerUmbenennen = async () => {
    const name = renameWert.trim()
    const o = ordner.find(x => x.id === renameId)
    if (name && o) await window.api.notizbuch.ordnerUpdate(o.id, { name, farbe: o.farbe })
    setRenameId(null); setRenameWert('')
    await laden()
  }
  const ordnerLoeschen = async (id) => {
    setLoeschOrdnerId(null)
    await window.api.notizbuch.ordnerDelete(id)
    if (sel === 'o:' + id) { setSel('all'); setSelNotizId(null) }
    await laden()
  }

  if (!sjId) {
    return <div className="flex-1 flex items-center justify-center text-sm text-ink-400 bg-paper-50 dark:bg-ink-950">Kein Schuljahr ausgewählt.</div>
  }

  // Ziel-Optionen für das Verschieben-Dropdown im Editor.
  const zielOptionen = [
    { key: 'all', label: 'Allgemein' },
    ...echteKlassen.map(k => ({ key: 'k:' + k.id, label: 'Klasse ' + k.name })),
    ...ordner.map(o => ({ key: 'o:' + o.id, label: o.name })),
  ]
  const aktKey = selNotiz ? (selNotiz.klasse_id != null ? 'k:' + selNotiz.klasse_id : selNotiz.ordner_id != null ? 'o:' + selNotiz.ordner_id : 'all') : 'all'

  const OrdnerBtn = ({ aktiv, farbe, icon, name, count, onClick, kinder }) => (
    <div className={`group flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-lg cursor-pointer text-sm transition-colors ${aktiv
      ? 'bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-200'
      : 'text-ink-700 dark:text-paper-200 hover:bg-paper-100 dark:hover:bg-ink-800'}`} onClick={onClick}>
      {farbe ? <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: farbe }} /> : <span aria-hidden className="text-sm leading-none">{icon}</span>}
      <span className="flex-1 truncate">{name}</span>
      {count > 0 && <span className="text-[10px] text-ink-400 tabular-nums flex-shrink-0">{count}</span>}
      {kinder}
    </div>
  )

  return (
    <div className="flex-1 overflow-hidden flex bg-paper-50 dark:bg-ink-950">

      {/* ── Spalte 1: Ordner ─────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 border-r border-paper-200 dark:border-ink-800 flex flex-col bg-white dark:bg-ink-900/40">
        <div className="px-3 py-2.5 border-b border-paper-200 dark:border-ink-800">
          <h1 className="text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-1.5"><span aria-hidden>📝</span> Notizen</h1>
          <p className="text-[10px] text-ink-400 mt-0.5 truncate">{aktuellesSchuljahr?.bezeichnung ?? ''}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          <div>
            <OrdnerBtn aktiv={sel === 'all'} icon="🗒️" name="Allgemein" count={zaehle(n => n.klasse_id == null && n.ordner_id == null)} onClick={() => setSel('all')} />
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 px-2 mb-1">Klassen</p>
            {echteKlassen.length === 0
              ? <p className="text-[11px] text-ink-400 px-2">Keine Klassen.</p>
              : echteKlassen.map(k => (
                <OrdnerBtn key={k.id} aktiv={sel === 'k:' + k.id} icon="📁" name={k.name}
                  count={zaehle(n => n.klasse_id === k.id)} onClick={() => setSel('k:' + k.id)} />
              ))}
          </div>

          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Eigene Ordner</p>
              <button onClick={() => { setOrdnerFormOffen(o => !o); setNeuName('') }} title="Ordner hinzufügen"
                className="text-ink-400 hover:text-coral-600 text-sm leading-none w-5 h-5 rounded flex items-center justify-center hover:bg-paper-100 dark:hover:bg-ink-800">＋</button>
            </div>
            {ordner.map(o => (
              renameId === o.id ? (
                <div key={o.id} className="flex items-center gap-1 px-1.5 py-1">
                  <input autoFocus value={renameWert} onChange={e => setRenameWert(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') ordnerUmbenennen(); if (e.key === 'Escape') setRenameId(null) }}
                    className="flex-1 min-w-0 text-sm px-1.5 py-0.5 rounded border border-coral-300 dark:border-coral-700 bg-white dark:bg-ink-800 text-ink-800 dark:text-paper-100 focus:outline-none" />
                  <button onClick={ordnerUmbenennen} className="text-mint-600 text-xs px-1">✓</button>
                  <button onClick={() => setRenameId(null)} className="text-ink-400 text-xs px-1">✕</button>
                </div>
              ) : loeschOrdnerId === o.id ? (
                <div key={o.id} className="flex items-center gap-1.5 px-2 py-1.5 text-[11px]">
                  <span className="flex-1 text-ink-600 dark:text-paper-300 truncate">Löschen? {zaehle(n => n.ordner_id === o.id)} Notiz(en)</span>
                  <button onClick={() => ordnerLoeschen(o.id)} className="text-red-500 hover:text-red-600 font-medium">Löschen</button>
                  <button onClick={() => setLoeschOrdnerId(null)} className="text-ink-400">Abbr.</button>
                </div>
              ) : (
                <OrdnerBtn key={o.id} aktiv={sel === 'o:' + o.id} farbe={o.farbe || '#94a3b8'} name={o.name}
                  count={zaehle(n => n.ordner_id === o.id)} onClick={() => setSel('o:' + o.id)}
                  kinder={
                    <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); setRenameId(o.id); setRenameWert(o.name) }} title="Umbenennen"
                        className="w-5 h-5 rounded flex items-center justify-center text-ink-400 hover:text-coral-600">✎</button>
                      <button onClick={e => { e.stopPropagation(); setLoeschOrdnerId(o.id) }} title="Löschen"
                        className="w-5 h-5 rounded flex items-center justify-center text-ink-400 hover:text-red-500">✕</button>
                    </span>
                  } />
              )
            ))}
            {ordnerFormOffen && (
              <div className="px-1.5 py-1.5 space-y-1.5">
                <input autoFocus value={neuName} onChange={e => setNeuName(e.target.value)} placeholder="Ordnername"
                  onKeyDown={e => { if (e.key === 'Enter') ordnerAnlegen(); if (e.key === 'Escape') setOrdnerFormOffen(false) }}
                  className="w-full text-sm px-2 py-1 rounded-lg border border-paper-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-800 dark:text-paper-100 focus:outline-none focus:ring-2 focus:ring-coral-400/30" />
                <div className="flex items-center gap-1.5">
                  {FARBEN.map(f => (
                    <button key={f} onClick={() => setNeuFarbe(f)} className={`w-4 h-4 rounded-full ${neuFarbe === f ? 'ring-2 ring-offset-1 ring-ink-400 dark:ring-offset-ink-900' : ''}`} style={{ backgroundColor: f }} />
                  ))}
                  <button onClick={ordnerAnlegen} disabled={!neuName.trim()} className="ml-auto text-xs font-semibold px-2 py-1 rounded-lg bg-coral-600 text-white hover:bg-coral-700 disabled:opacity-40">Anlegen</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Spalte 2: Notizliste ─────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-paper-200 dark:border-ink-800 flex flex-col bg-white dark:bg-ink-900/20">
        <div className="px-3 py-2 border-b border-paper-200 dark:border-ink-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-700 dark:text-paper-200">{notizenImOrdner.length} Notiz{notizenImOrdner.length === 1 ? '' : 'en'}</span>
          <button onClick={neueNotiz} className="text-xs font-semibold px-2 h-7 rounded-lg bg-coral-600 text-white hover:bg-coral-700 flex items-center gap-1">＋ Notiz</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {notizenImOrdner.length === 0 ? (
            <div className="text-center text-xs text-ink-400 py-10">Noch keine Notiz in diesem Ordner.</div>
          ) : notizenImOrdner.map(n => (
            <div key={n.id} onClick={() => waehleNotiz(n.id)}
              className={`group rounded-lg px-2.5 py-2 cursor-pointer border transition-colors ${selNotizId === n.id
                ? 'border-coral-300 bg-coral-50 dark:border-coral-700 dark:bg-coral-900/20'
                : 'border-transparent hover:bg-paper-100 dark:hover:bg-ink-800'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-ink-800 dark:text-paper-100 truncate flex-1">{titelVon(n)}</p>
                {loeschNotizId === n.id ? (
                  <span className="flex items-center gap-1 text-[11px] flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button onClick={() => loescheNotiz(n.id)} className="text-red-500 hover:text-red-600 font-medium">Löschen</button>
                    <button onClick={() => setLoeschNotizId(null)} className="text-ink-400">Abbr.</button>
                  </span>
                ) : (
                  <button onClick={e => { e.stopPropagation(); setLoeschNotizId(n.id) }} title="Löschen"
                    className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-500 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center">✕</button>
                )}
              </div>
              {snippetVon(n) && <p className="text-[11px] text-ink-500 dark:text-ink-400 truncate mt-0.5">{snippetVon(n)}</p>}
              <p className="text-[10px] text-ink-400 mt-0.5">{fmtWann(n.aktualisiert_am)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Spalte 3: Editor ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-ink-900/40">
        {!selNotiz ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ink-400 px-6 text-center">
            {notizenImOrdner.length === 0 ? 'Lege mit „＋ Notiz" eine neue Notiz an.' : 'Wähle links eine Notiz oder lege eine neue an.'}
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-paper-200 dark:border-ink-800 flex items-center gap-2 flex-wrap">
              <label className="text-[11px] text-ink-400">Ordner</label>
              <select value={aktKey} onChange={e => verschiebe(e.target.value)}
                className="h-7 text-xs px-2 rounded-lg border border-paper-300 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-800 dark:text-paper-100 focus:outline-none focus:ring-2 focus:ring-coral-400/30">
                {zielOptionen.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>
              <span className="text-[10px] text-ink-400 ml-auto">zuletzt geändert {fmtWann(selNotiz.aktualisiert_am)}</span>
              <button onClick={() => setLoeschNotizId(selNotiz.id)} className="text-xs text-ink-500 hover:text-red-500 flex items-center gap-1" title="Notiz löschen">🗑 Löschen</button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
              <input ref={titelRef} value={entwurf.titel} onChange={e => bearbeite('titel', e.target.value)} onBlur={sofortSpeichern}
                placeholder="Titel" className="w-full text-lg font-semibold bg-transparent text-ink-900 dark:text-white placeholder-ink-300 dark:placeholder-ink-600 focus:outline-none" />
              <textarea value={entwurf.text} onChange={e => bearbeite('text', e.target.value)} onBlur={sofortSpeichern}
                placeholder="Notiz schreiben…"
                className="flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-ink-800 dark:text-paper-200 placeholder-ink-300 dark:placeholder-ink-600 focus:outline-none" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
