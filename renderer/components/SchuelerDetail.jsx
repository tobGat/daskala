// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useState, useEffect, useMemo, useRef } from 'react'
import useStore from '../store/useStore'
import SchuelerKVSection from './kv/SchuelerKVSection'
import SchuelerAvatar from './SchuelerAvatar'
import AvatarEditorModal from './AvatarEditorModal'
import { avatarSvg } from '../utils/avatar'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function noteZuFarbe(note) {
  if (note == null) return '#71717a'
  if (note <= 1.5) return '#22c55e'
  if (note <= 2.5) return '#84cc16'
  if (note <= 3.5) return '#eab308'
  if (note <= 4.5) return '#f97316'
  return '#ef4444'
}

function istGueltigeNote(wert) {
  const n = parseInt(wert)
  return n >= 1 && n <= 5
}

function formatDatum(d) {
  if (!d) return '—'
  try { return new Date(d + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  catch { return d }
}

// ─── SA/T-Liniendiagramm (Notenverlauf) ──────────────────────────────────────
function NotenChart({ eintraege }) {
  const W = 540, H = 180
  const padL = 32, padT = 20, padR = 14, padB = 24
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const sa = eintraege.filter(e => e.kategorie === 'SA' && istGueltigeNote(e.wert))
    .sort((a, b) => a.semester - b.semester || a.reihenfolge - b.reihenfolge)
  const t = eintraege.filter(e => e.kategorie === 'T' && istGueltigeNote(e.wert))
    .sort((a, b) => a.semester - b.semester || a.reihenfolge - b.reihenfolge)
  if (!sa.length && !t.length) return null

  const all = [...sa.map(p => ({ p, typ: 'SA' })), ...t.map(p => ({ p, typ: 'T' }))]
    .sort((a, b) => a.p.semester - b.p.semester || a.p.reihenfolge - b.p.reihenfolge)
  const n = all.length
  const positions = all.map((_, i) => padL + (n === 1 ? plotW / 2 : i / (n - 1) * plotW))
  const idxMap = new Map(all.map((item, i) => [item, i]))
  const xOf = item => positions[idxMap.get(item)]
  const yOf = note => padT + (parseInt(note) - 1) / 4 * plotH

  const saItems = all.filter(it => it.typ === 'SA')
  const tItems = all.filter(it => it.typ === 'T')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Grid */}
      {[1, 2, 3, 4, 5].map(grade => (
        <g key={grade}>
          <line x1={padL} y1={yOf(grade)} x2={W - padR} y2={yOf(grade)} stroke="#cfc9c2" strokeWidth={0.5} strokeDasharray="2,3" />
          <text x={padL - 5} y={yOf(grade) + 3} textAnchor="end" fontSize={10} fill="#a59c91">{grade}</text>
        </g>
      ))}
      {/* SA Linie + Punkte */}
      {saItems.length > 1 && (
        <polyline
          points={saItems.map(it => `${xOf(it).toFixed(1)},${yOf(it.p.wert).toFixed(1)}`).join(' ')}
          fill="none" stroke="#fb6936" strokeWidth={2} strokeOpacity={0.6}
        />
      )}
      {saItems.map((it, i) => (
        <g key={`sa-${i}`}>
          <circle cx={xOf(it)} cy={yOf(it.p.wert)} r={6} fill="#fb6936" stroke="white" strokeWidth={1.5} />
          <text x={xOf(it)} y={yOf(it.p.wert) - 10} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#c43a14">
            {it.p.kuerzel || 'SA'}
          </text>
        </g>
      ))}
      {/* T Linie + Punkte */}
      {tItems.length > 1 && (
        <polyline
          points={tItems.map(it => `${xOf(it).toFixed(1)},${yOf(it.p.wert).toFixed(1)}`).join(' ')}
          fill="none" stroke="#8b66f5" strokeWidth={1.5} strokeOpacity={0.5}
        />
      )}
      {tItems.map((it, i) => (
        <g key={`t-${i}`}>
          <circle cx={xOf(it)} cy={yOf(it.p.wert)} r={4.5} fill="#8b66f5" stroke="white" strokeWidth={1.2} />
          <text x={xOf(it)} y={yOf(it.p.wert) - 8} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#623bc4">
            {it.p.kuerzel || 'T'}
          </text>
        </g>
      ))}
      {/* Legend */}
      <g>
        <circle cx={padL + 4} cy={H - 6} r={4} fill="#fb6936" />
        <text x={padL + 12} y={H - 3} fontSize={9} fill="#5e544c">Schularbeit</text>
        <circle cx={padL + 80} cy={H - 6} r={3.5} fill="#8b66f5" />
        <text x={padL + 88} y={H - 3} fontSize={9} fill="#5e544c">Test</text>
      </g>
    </svg>
  )
}

// ─── Tabellarische Aufzeichnungen ────────────────────────────────────────────
const KAT_STIL = {
  SA: { label: 'SA',  bg: 'bg-coral-100 dark:bg-coral-900/40',    text: 'text-coral-700 dark:text-coral-300' },
  T:  { label: 'T',   bg: 'bg-lavender-100 dark:bg-lavender-900/40', text: 'text-lavender-700 dark:text-lavender-300' },
  MA: { label: 'MA',  bg: 'bg-mint-100 dark:bg-mint-900/40',      text: 'text-mint-700 dark:text-mint-300' },
  'HÜ': { label: 'HÜ', bg: 'bg-sky-100 dark:bg-sky-900/40',       text: 'text-sky-700 dark:text-sky-300' },
  CUSTOM: { label: 'IND', bg: 'bg-paper-200 dark:bg-ink-800',     text: 'text-ink-700 dark:text-ink-300' },
}

function EintraegeTabelle({ eintraege }) {
  // Sortiert: erst Semester, dann reihenfolge
  const sortiert = useMemo(
    () => [...eintraege].sort((a, b) => a.semester - b.semester || a.reihenfolge - b.reihenfolge),
    [eintraege]
  )
  if (sortiert.length === 0) {
    return <p className="text-xs text-ink-400 italic">Keine Einträge.</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-paper-200 dark:border-ink-800">
      <table className="w-full text-xs">
        <thead className="bg-paper-100 dark:bg-ink-800/60 text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400">
          <tr>
            <th className="text-left px-3 py-2 w-16">Sem.</th>
            <th className="text-left px-3 py-2 w-20">Datum</th>
            <th className="text-left px-3 py-2 w-20">Kat.</th>
            <th className="text-left px-3 py-2 w-20">Kürzel</th>
            <th className="text-center px-3 py-2 w-16">Wert</th>
            <th className="text-left px-3 py-2">Kommentar</th>
          </tr>
        </thead>
        <tbody>
          {sortiert.map((e, i) => {
            const stil = KAT_STIL[e.kategorie] ?? KAT_STIL.CUSTOM
            const noteFarbe = istGueltigeNote(e.wert) ? noteZuFarbe(parseInt(e.wert)) : null
            return (
              <tr key={i} className="border-t border-paper-100 dark:border-ink-800/60 hover:bg-paper-50 dark:hover:bg-ink-800/30">
                <td className="px-3 py-1.5 text-ink-500 dark:text-ink-400 tabular-nums">S{e.semester}</td>
                <td className="px-3 py-1.5 text-ink-500 dark:text-ink-400 tabular-nums">{formatDatum(e.datum)}</td>
                <td className="px-3 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded-md font-bold text-[10px] ${stil.bg} ${stil.text}`}>
                    {stil.label}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-ink-700 dark:text-paper-200 font-medium">{e.kuerzel || '—'}</td>
                <td className="px-3 py-1.5 text-center">
                  {noteFarbe ? (
                    <span className="font-bold text-sm tabular-nums" style={{ color: noteFarbe }}>{e.wert}</span>
                  ) : (
                    <span className="font-bold text-sm">{e.wert}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-ink-500 dark:text-ink-400 truncate max-w-xs" title={e.kommentar ?? ''}>
                  {e.kommentar ?? ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Statistik-Bar (MA / HÜ) ─────────────────────────────────────────────────
function StatBar({ label, positiv, negativ, gesamt, posColor, negColor, posLabel, negLabel }) {
  const posPct = gesamt > 0 ? (positiv / gesamt * 100) : 0
  const negPct = gesamt > 0 ? (negativ / gesamt * 100) : 0
  return (
    <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-ink-700 dark:text-paper-200">{label}</span>
        <span className="text-xs text-ink-500 tabular-nums">{positiv}/{gesamt} · {Math.round(posPct)}%</span>
      </div>
      <div className="h-2.5 flex rounded-full overflow-hidden bg-paper-200 dark:bg-ink-800">
        <div style={{ width: `${posPct}%`, background: posColor }} />
        <div style={{ width: `${negPct}%`, background: negColor }} />
      </div>
      <div className="flex justify-between text-[10px] text-ink-500 mt-1.5">
        <span><span style={{ color: posColor }}>●</span> {posLabel}: <strong>{positiv}</strong></span>
        {negativ > 0 && <span><span style={{ color: negColor }}>●</span> {negLabel}: <strong>{negativ}</strong></span>}
      </div>
    </div>
  )
}

// ─── Fach-Detail im Modal ─────────────────────────────────────────────────────
function FachDetail({ fach, eintraege, zeugnisnoten, notizen, klassenname, schueler }) {
  const fachEintraege = eintraege.filter(e => e.fach_id === fach.id)
  const fachNotizen   = notizen.filter(n => n.fach_id === fach.id)

  // Notizen sind 1:1 pro Fach in der DB; wir nutzen sie als Free-Text-Editor
  const initialNotiz = fachNotizen[0]?.text ?? ''
  const [notiz, setNotiz] = useState(initialNotiz)
  const [notizDirty, setNotizDirty] = useState(false)
  const notizTimer = useRef(null)

  useEffect(() => {
    setNotiz(initialNotiz)
    setNotizDirty(false)
  }, [fach.id, schueler.id])

  const handleNotizChange = (val) => {
    setNotiz(val)
    setNotizDirty(true)
    if (notizTimer.current) clearTimeout(notizTimer.current)
    notizTimer.current = setTimeout(async () => {
      await window.api.notizen.set(schueler.id, fach.id, val)
      setNotizDirty(false)
    }, 500)
  }

  // Kompetenzen pro Fach laden
  const [kompBereiche, setKompBereiche] = useState([])
  const [kompSk, setKompSk] = useState({})
  useEffect(() => {
    (async () => {
      const [kb, skArr] = await Promise.all([
        window.api.kompetenzbereiche.getAll(fach.id),
        window.api.schuelerKompetenzen.getAll(fach.id),
      ])
      setKompBereiche(kb)
      const map = {}
      skArr.forEach(sk => { map[`${sk.kompetenzbereich_id}_${sk.schueler_id}`] = sk })
      setKompSk(map)
    })()
  }, [fach.id])

  const setKompetenz = async (kbId, niveau) => {
    await window.api.schuelerKompetenzen.set(kbId, schueler.id, niveau, null)
    setKompSk(prev => ({
      ...prev,
      [`${kbId}_${schueler.id}`]: { kompetenzbereich_id: kbId, schueler_id: schueler.id, niveau, notiz: null, aktualisiert: new Date().toISOString() }
    }))
  }

  // Stats
  const maEintr = fachEintraege.filter(e => e.kategorie === 'MA' && e.wert)
  const maPos = maEintr.filter(e => e.wert === '+').length
  const maNeg = maEintr.filter(e => e.wert === '-').length

  const hueEintr = fachEintraege.filter(e => e.kategorie === 'HÜ' && e.wert)
  const huePos = hueEintr.filter(e => e.wert === '✓').length
  const hueNeg = hueEintr.filter(e => e.wert === '✗' || e.wert === '—').length

  // Zeugnisnoten
  const znS1 = zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 1)
  const znS2 = zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 2)
  const znEN = zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 3)
  const anzeige = (zn) => zn?.note_manuell ?? (zn?.note_berechnet ? Math.round(zn.note_berechnet) : null)

  // Verlauf
  const [verlaufOffen, setVerlaufOffen] = useState(false)
  const [verlauf, setVerlauf] = useState([])
  useEffect(() => {
    if (!verlaufOffen) return
    window.api.verlauf.get(schueler.id, fach.id).then(setVerlauf)
  }, [verlaufOffen, fach.id, schueler.id])

  const hatSaT = fachEintraege.some(e => (e.kategorie === 'SA' || e.kategorie === 'T') && istGueltigeNote(e.wert))

  return (
    <div className="space-y-6">
      {/* Fach-Header mit Noten-Pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-soft"
          style={{ backgroundColor: fach.farbe || '#fb6936' }}
        >
          {(fach.name?.[0] ?? '?').toUpperCase()}
        </div>
        <h3 className="text-lg font-bold text-ink-900 dark:text-paper-100 font-display">{fach.name}</h3>
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {[
            { label: 'SN 1', zn: znS1, highlight: false },
            { label: 'SN 2', zn: znS2, highlight: false },
            { label: 'ZN',   zn: znEN, highlight: true  },
          ].map(({ label, zn, highlight }) => {
            const note = anzeige(zn)
            return (
              <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl ${highlight ? 'bg-coral-50 dark:bg-coral-900/30 border border-coral-200 dark:border-coral-800/60' : 'bg-paper-100 dark:bg-ink-800'}`}>
                <span className={`text-[10px] font-bold ${highlight ? 'text-coral-700 dark:text-coral-300' : 'text-ink-500'}`}>{label}</span>
                {note != null ? (
                  <span className="text-base font-bold tabular-nums" style={{ color: noteZuFarbe(note) }}>
                    {note}
                  </span>
                ) : (
                  <span className="text-base font-bold text-ink-400">–</span>
                )}
                {zn?.note_berechnet != null && zn?.note_manuell == null && (
                  <span className="text-[9px] text-ink-400 tabular-nums">{zn.note_berechnet.toFixed(2)}</span>
                )}
                {zn?.note_manuell != null && (
                  <span className="text-[9px] text-lavender-500 font-medium">M</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Leistungsentwicklung — Chart */}
      {hatSaT && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">Leistungsentwicklung</p>
          <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3">
            <NotenChart eintraege={fachEintraege} />
          </div>
        </section>
      )}

      {/* MA + HÜ Bars (Grid) */}
      {(maEintr.length > 0 || hueEintr.length > 0) && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">Mitarbeit &amp; Hausübungen</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {maEintr.length > 0 && (
              <StatBar
                label="Mitarbeit"
                positiv={maPos} negativ={maNeg} gesamt={maEintr.length}
                posColor="#31a982" negColor="#fb6936"
                posLabel="positiv" negLabel="negativ"
              />
            )}
            {hueEintr.length > 0 && (
              <StatBar
                label="Hausübungen"
                positiv={huePos} negativ={hueNeg} gesamt={hueEintr.length}
                posColor="#56c39e" negColor="#ec4d1a"
                posLabel="gemacht" negLabel="nicht gemacht"
              />
            )}
          </div>
        </section>
      )}

      {/* Tabelle aller Aufzeichnungen */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Aufzeichnungen</p>
          <span className="text-[10px] text-ink-400">{fachEintraege.length} {fachEintraege.length === 1 ? 'Eintrag' : 'Einträge'}</span>
        </div>
        <EintraegeTabelle eintraege={fachEintraege} />
      </section>

      {/* Kompetenzen – vorübergehend ausgeblendet, bis die Funktion vollständig eingebettet ist */}
      {false && kompBereiche.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">Kompetenzen</p>
          <div className="bg-paper-50 dark:bg-ink-900/40 border border-paper-200 dark:border-ink-800 rounded-xl p-3 space-y-1.5">
            {kompBereiche.map(kb => {
              const sk = kompSk[`${kb.id}_${schueler.id}`]
              const niveau = sk?.niveau ?? 0
              return (
                <div key={kb.id} className="flex items-center gap-2">
                  <span className="text-xs text-ink-700 dark:text-paper-300 flex-1 truncate" title={kb.beschreibung || kb.titel}>
                    {kb.titel}
                  </span>
                  <div className="flex gap-0.5">
                    {[
                      [0, '·', 'Nicht erfasst',       'bg-paper-200 dark:bg-ink-700 text-ink-500'],
                      [1, 'G', 'Grundniveau',         'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'],
                      [2, 'E', 'Erweitertes Niveau',  'bg-coral-100 text-coral-700 dark:bg-coral-900/40 dark:text-coral-400'],
                      [3, 'V', 'Vertieftes Niveau',   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'],
                    ].map(([n, label, title, activeCls]) => (
                      <button
                        key={n}
                        className={`w-6 h-6 rounded-lg text-xs font-bold transition-all active:scale-90 ${
                          niveau === n
                            ? activeCls
                            : 'text-ink-400 hover:bg-paper-200 dark:hover:bg-ink-800'
                        }`}
                        onClick={() => setKompetenz(kb.id, n)}
                        title={title}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Notizen */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Notiz</p>
          {notizDirty && <span className="text-[10px] text-ink-400 italic">Speichert…</span>}
        </div>
        <textarea
          className="input resize-none text-sm"
          rows={3}
          value={notiz}
          onChange={e => handleNotizChange(e.target.value)}
          placeholder={`Freitext zu ${schueler.vorname} in ${fach.name}…`}
        />
      </section>

      {/* Verlauf */}
      <section>
        <button
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-500 hover:text-ink-700 dark:hover:text-paper-200 transition-colors"
          onClick={() => setVerlaufOffen(v => !v)}
        >
          <span>{verlaufOffen ? '▾' : '▸'}</span>
          Änderungsverlauf
        </button>
        {verlaufOffen && (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-paper-200 dark:border-ink-800 bg-paper-50 dark:bg-ink-900/30">
            {verlauf.length === 0 ? (
              <p className="text-xs text-ink-400 italic px-3 py-3">Keine Änderungen aufgezeichnet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-paper-100 dark:bg-ink-800/60 text-[10px] font-bold uppercase text-ink-500">
                  <tr>
                    <th className="text-left px-3 py-1.5">Wann</th>
                    <th className="text-left px-3 py-1.5">Was</th>
                    <th className="text-left px-3 py-1.5">Vorher → Nachher</th>
                  </tr>
                </thead>
                <tbody>
                  {verlauf.map(v => (
                    <tr key={v.id} className="border-t border-paper-100 dark:border-ink-800/60">
                      <td className="px-3 py-1 text-ink-500 tabular-nums">
                        {new Date(v.zeitstempel).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </td>
                      <td className="px-3 py-1 text-ink-600 dark:text-ink-400">
                        {v.kategorie ?? '?'}{v.kuerzel ? ` ${v.kuerzel}` : ''}
                        {v.aktion === 'spalte_geloescht' && <span className="ml-1 text-red-500">(gelöscht)</span>}
                      </td>
                      <td className="px-3 py-1 text-ink-700 dark:text-paper-200">
                        <span className="text-ink-400">{v.wert_alt ?? '–'}</span>
                        <span className="text-ink-400 mx-1">→</span>
                        <span className="font-medium">{v.wert_neu ?? '–'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Haupt-Modal ──────────────────────────────────────────────────────────────
export default function SchuelerDetail() {
  const { detailSchueler, closeDetail, aktivesFach, aktiveKlasse, ladeSchueler } = useStore()

  const [profil, setProfil] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedFachId, setSelectedFachId] = useState(null)
  const [kvAktiv, setKvAktiv] = useState(false)         // ob KV-Sektion in Sidebar gewählt ist
  const [exportLoading, setExportLoading] = useState(false)
  const [avatarSchueler, setAvatarSchueler] = useState(null)

  useEffect(() => {
    if (!detailSchueler) return
    setLoading(true)
    window.api.schueler.getLeistungsProfil(detailSchueler.id).then(data => {
      setProfil(data)
      // Initial wähle aktives Fach (falls Teil dieser Klasse) oder das erste
      const initial = data?.faecher?.find(f => f.id === aktivesFach?.id) ?? data?.faecher?.[0]
      setSelectedFachId(initial?.id ?? null)
      setLoading(false)
    })
  }, [detailSchueler])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeDetail() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDetail])

  if (!detailSchueler) return null

  const handleExportPdf = async () => {
    if (!profil) return
    setExportLoading(true)
    try {
      const profilMitAvatar = { ...profil, avatarSvg: avatarSvg(profil.schueler, 96) }
      await window.api.schueler.exportProfilPDF({ profil: profilMitAvatar, klassenname: aktiveKlasse?.name ?? '' })
    } finally {
      setExportLoading(false)
    }
  }

  const headerSchueler = profil?.schueler ?? detailSchueler
  const selectedFach = profil?.faecher?.find(f => f.id === selectedFachId)

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && closeDetail()}>
      <div className="modal-box max-w-6xl w-[92vw] h-[88vh] p-0 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-paper-200 dark:border-ink-800 flex-shrink-0">
          <SchuelerAvatar
            schueler={headerSchueler}
            size={44}
            className="rounded-2xl shadow-soft"
            onClick={() => setAvatarSchueler(headerSchueler)}
            title="Avatar bearbeiten"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-bold text-base text-ink-900 dark:text-paper-100 font-display truncate">
                {detailSchueler.nachname} <span className="font-normal text-ink-500">{detailSchueler.vorname}</span>
              </h2>
              {detailSchueler.lernschwaeche ? <span title="Lernschwäche" className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">LS</span> : null}
              {detailSchueler.legasthenie   ? <span title="Legasthenie"  className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400">LEG</span> : null}
              {detailSchueler.spf           ? <span title="SPF" className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400">SPF</span> : null}
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
              {aktiveKlasse?.name ?? '—'}{profil?.faecher && ` · ${profil.faecher.length} F${profil.faecher.length === 1 ? 'ach' : 'ächer'}`}
            </p>
          </div>

          <button
            className="btn-soft text-xs flex items-center gap-1.5 flex-shrink-0"
            onClick={handleExportPdf}
            disabled={exportLoading || !profil}
            title="Profil als PDF exportieren"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            {exportLoading ? '…' : 'PDF'}
          </button>
          <button
            className="text-ink-500 hover:text-ink-900 dark:hover:text-paper-200 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-paper-200 dark:hover:bg-ink-800 transition-all flex-shrink-0"
            onClick={closeDetail}
            title="Schließen (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: Sidebar (Fächer) + Detail */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-sm text-ink-400 animate-pulse">Lade Profil…</span>
            </div>
          ) : !profil ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-sm text-ink-400">Profil konnte nicht geladen werden.</span>
            </div>
          ) : (
            <>
              {/* Sidebar: Fach-Liste + KV (wenn KV-Klasse) */}
              <div className="w-60 border-r border-paper-200 dark:border-ink-800 overflow-y-auto flex-shrink-0 bg-paper-50 dark:bg-ink-900/30">
                <div className="p-2 space-y-1">
                  {aktiveKlasse?.ist_kv && (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 px-2 py-1.5">Klassenvorstand</p>
                      <button
                        className={`w-full text-left px-2.5 py-2 rounded-xl transition-all flex items-center gap-2 ${
                          kvAktiv
                            ? 'bg-white dark:bg-ink-800 shadow-soft'
                            : 'hover:bg-paper-100 dark:hover:bg-ink-800/50'
                        }`}
                        onClick={() => setKvAktiv(true)}
                      >
                        <span className="text-base" aria-hidden>📜</span>
                        <span className={`text-sm font-semibold flex-1 ${kvAktiv ? 'text-ink-900 dark:text-paper-100' : 'text-ink-700 dark:text-paper-200'}`}>
                          KV-Daten
                        </span>
                      </button>
                      <div className="h-px bg-paper-200 dark:bg-ink-800 my-2" />
                    </>
                  )}
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-400 px-2 py-1.5">Fächer</p>
                  {profil.faecher.length === 0 && (
                    <p className="text-xs text-ink-400 px-2 py-2">Keine Fächer angelegt.</p>
                  )}
                  {profil.faecher.map(fach => {
                    const znEN = profil.zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 3)
                    const znS2 = profil.zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 2)
                    const znS1 = profil.zeugnisnoten.find(z => z.fach_id === fach.id && z.semester === 1)
                    const ad = (zn) => zn?.note_manuell ?? (zn?.note_berechnet ? Math.round(zn.note_berechnet) : null)
                    const nEN = ad(znEN), nS2 = ad(znS2), nS1 = ad(znS1)
                    const selected = !kvAktiv && selectedFachId === fach.id
                    return (
                      <button
                        key={fach.id}
                        className={`w-full text-left px-2.5 py-2 rounded-xl transition-all ${
                          selected
                            ? 'bg-white dark:bg-ink-800 shadow-soft'
                            : 'hover:bg-paper-100 dark:hover:bg-ink-800/50'
                        }`}
                        onClick={() => { setKvAktiv(false); setSelectedFachId(fach.id) }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: fach.farbe || '#cfc9c2' }}
                          />
                          <span className={`text-sm font-semibold truncate flex-1 ${selected ? 'text-ink-900 dark:text-paper-100' : 'text-ink-700 dark:text-paper-200'}`}>
                            {fach.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 pl-4">
                          {[['SN 1', nS1], ['SN 2', nS2], ['ZN', nEN]].map(([label, n]) => (
                            <span
                              key={label}
                              className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                                n != null
                                  ? 'text-white'
                                  : 'text-ink-400 dark:text-ink-600 bg-paper-100 dark:bg-ink-800'
                              }`}
                              style={n != null ? { backgroundColor: noteZuFarbe(n) } : undefined}
                            >
                              {label} {n ?? '–'}
                            </span>
                          ))}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Detail */}
              <div className="flex-1 overflow-y-auto p-5">
                {kvAktiv && aktiveKlasse?.ist_kv ? (
                  <SchuelerKVSection schueler={detailSchueler} klasseId={aktiveKlasse.id} />
                ) : selectedFach ? (
                  <FachDetail
                    key={selectedFach.id}
                    fach={selectedFach}
                    eintraege={profil.eintraege}
                    zeugnisnoten={profil.zeugnisnoten}
                    notizen={profil.notizen}
                    klassenname={aktiveKlasse?.name ?? ''}
                    schueler={detailSchueler}
                  />
                ) : (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-2">📚</div>
                    <p className="text-sm text-ink-500">Wähle links ein Fach.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {avatarSchueler && (
        <AvatarEditorModal
          schueler={avatarSchueler}
          onClose={() => setAvatarSchueler(null)}
          onSaved={async () => {
            const data = await window.api.schueler.getLeistungsProfil(detailSchueler.id)
            setProfil(data)
            await ladeSchueler()   // Store-Schülerliste (Notentabelle/Sitzplan) mit aktualisieren
          }}
        />
      )}
    </div>
  )
}
