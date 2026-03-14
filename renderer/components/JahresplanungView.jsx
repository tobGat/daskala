import React, { useState, useEffect, useCallback } from 'react'
import useStore from '../store/useStore'

const MONATS_NAMEN = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const WOCHENTAG_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

const FARB_PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#64748b',
]

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function MonatKalender({ year, month, abschnitte, aktivesFach, onTagKlick }) {
  const ersterTag = new Date(year, month, 1)
  const letzterTag = new Date(year, month + 1, 0)
  const startDow = (ersterTag.getDay() + 6) % 7 // 0=Mo

  // Wochen aufbauen
  const wochen = []
  let woche = Array(startDow).fill(null)
  for (let d = 1; d <= letzterTag.getDate(); d++) {
    woche.push(d)
    if (woche.length === 7) { wochen.push(woche); woche = [] }
  }
  if (woche.length > 0) {
    while (woche.length < 7) woche.push(null)
    wochen.push(woche)
  }

  const getAbschnittFuerTag = (d) => {
    if (!d) return null
    const dateStr = toDateStr(year, month, d)
    return abschnitte.find(a => dateStr >= a.datum_von && dateStr <= a.datum_bis) ?? null
  }

  const getFarbe = (a) => a.farbe ?? aktivesFach?.farbe ?? '#6366f1'

  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 px-0.5">
        {MONATS_NAMEN[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-px mb-0.5">
        {WOCHENTAG_KURZ.map(t => (
          <div key={t} className={`text-center text-[10px] font-medium pb-0.5 ${
            t === 'Sa' || t === 'So' ? 'text-zinc-400 dark:text-zinc-600' : 'text-zinc-400 dark:text-zinc-500'
          }`}>{t}</div>
        ))}
      </div>
      <div className="flex flex-col gap-px">
        {wochen.map((woche, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-px">
            {woche.map((d, di) => {
              const abschnitt = getAbschnittFuerTag(d)
              const farbe = abschnitt ? getFarbe(abschnitt) : null
              const dateStr = d ? toDateStr(year, month, d) : null
              const istStart = abschnitt && dateStr === abschnitt.datum_von
              const istEnde = abschnitt && dateStr === abschnitt.datum_bis
              const istWochenende = di >= 5
              // Label zeigen: erster Tag des Abschnitts in dieser Woche
              const istErsteSichtbareWochenstelle = abschnitt && (
                istStart ||
                (di === 0 && d && dateStr > abschnitt.datum_von)
              )

              return (
                <div
                  key={di}
                  onClick={() => d && onTagKlick(toDateStr(year, month, d), abschnitt)}
                  className={`relative h-7 flex items-center justify-center cursor-pointer select-none
                    ${!d ? 'pointer-events-none' : ''}
                    ${istWochenende ? 'opacity-60' : ''}
                    ${!abschnitt && d ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded' : ''}
                  `}
                  style={abschnitt && d ? {
                    backgroundColor: farbe + '33',
                    borderRadius: istStart && istEnde ? '6px'
                      : istStart ? '6px 0 0 6px'
                      : istEnde ? '0 6px 6px 0'
                      : '0',
                  } : {}}
                  title={abschnitt ? abschnitt.titel : ''}
                >
                  {/* Abschnitts-Balken-Linie */}
                  {abschnitt && d && (
                    <div
                      className="absolute inset-x-0 bottom-1 h-1 pointer-events-none"
                      style={{
                        backgroundColor: farbe,
                        borderRadius: istStart && istEnde ? '4px'
                          : istStart ? '4px 0 0 4px'
                          : istEnde ? '0 4px 4px 0'
                          : '0',
                        marginLeft: istStart ? '2px' : '0',
                        marginRight: istEnde ? '2px' : '0',
                      }}
                    />
                  )}
                  {/* Tag-Zahl */}
                  {d && (
                    <span className={`text-[11px] relative z-10 w-5 h-5 flex items-center justify-center rounded-full
                      ${abschnitt
                        ? 'text-zinc-700 dark:text-zinc-200 font-medium'
                        : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {d}
                    </span>
                  )}
                  {/* Abschnitts-Label (erster sichtbarer Tag der Woche) */}
                  {istErsteSichtbareWochenstelle && (
                    <span
                      className="absolute left-0.5 top-0 text-[8px] font-semibold leading-none truncate pointer-events-none z-20"
                      style={{ color: farbe, maxWidth: '100%' }}
                    >
                      {abschnitt.titel}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function JahresplanungView() {
  const { aktivesFach, einstellungen } = useStore()
  const [abschnitte, setAbschnitte] = useState([])
  const [selektiert, setSelektiert] = useState(null)    // bestehender Abschnitt zum Bearbeiten
  const [istNeu, setIstNeu] = useState(false)
  const [loeschenBestaetigung, setLoeschenBestaetigung] = useState(false)

  // Formular-State
  const [formTitel, setFormTitel] = useState('')
  const [formVon, setFormVon] = useState('')
  const [formBis, setFormBis] = useState('')
  const [formFarbe, setFormFarbe] = useState(null)
  const [formInhalt, setFormInhalt] = useState('')

  // Schuljahr ableiten
  const schuljahr = einstellungen?.schuljahr_aktuell ?? ''
  const startJahr = parseInt(schuljahr.split('/')[0]) || new Date().getFullYear()
  const monate = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5].map(m => ({
    year: m >= 8 ? startJahr : startJahr + 1,
    month: m,
  }))

  const ladeAbschnitte = useCallback(async () => {
    if (!aktivesFach) return
    const rows = await window.api.jahresplanung.getAll(aktivesFach.id)
    setAbschnitte(rows)
  }, [aktivesFach?.id])

  useEffect(() => {
    ladeAbschnitte()
    setSelektiert(null)
    setIstNeu(false)
  }, [aktivesFach?.id])

  const panelOeffnen = (abschnitt) => {
    setSelektiert(abschnitt)
    setIstNeu(false)
    setLoeschenBestaetigung(false)
    setFormTitel(abschnitt.titel)
    setFormVon(abschnitt.datum_von)
    setFormBis(abschnitt.datum_bis)
    setFormFarbe(abschnitt.farbe)
    setFormInhalt(abschnitt.inhalt ?? '')
  }

  const neuOeffnen = (datumVon = '', datumBis = '') => {
    setSelektiert(null)
    setIstNeu(true)
    setLoeschenBestaetigung(false)
    setFormTitel('')
    setFormVon(datumVon)
    setFormBis(datumBis || datumVon)
    setFormFarbe(null)
    setFormInhalt('')
  }

  const panelSchliessen = () => {
    setSelektiert(null)
    setIstNeu(false)
    setLoeschenBestaetigung(false)
  }

  const handleTagKlick = (dateStr, abschnitt) => {
    if (abschnitt) {
      panelOeffnen(abschnitt)
    } else {
      neuOeffnen(dateStr, dateStr)
    }
  }

  const handleSpeichern = async () => {
    if (!aktivesFach) return
    const data = {
      fachId: aktivesFach.id,
      titel: formTitel.trim(),
      inhalt: formInhalt,
      datumVon: formVon,
      datumBis: formBis,
      farbe: formFarbe,
    }
    if (istNeu) {
      await window.api.jahresplanung.create(data)
    } else {
      await window.api.jahresplanung.update(selektiert.id, data)
    }
    await ladeAbschnitte()
    panelSchliessen()
  }

  const handleLoeschen = async () => {
    if (!loeschenBestaetigung) { setLoeschenBestaetigung(true); return }
    await window.api.jahresplanung.delete(selektiert.id)
    await ladeAbschnitte()
    panelSchliessen()
  }

  const panelOffen = istNeu || selektiert !== null

  if (!aktivesFach) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">
        Bitte ein Fach auswählen
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800">
        <button
          className="btn-secondary text-xs"
          onClick={() => neuOeffnen()}
        >
          + Neuer Abschnitt
        </button>
        <span className="text-xs text-zinc-400">
          {aktivesFach.name} · Schuljahr {schuljahr}
        </span>
        {abschnitte.length > 0 && (
          <span className="text-xs text-zinc-400 ml-auto">
            {abschnitte.length} {abschnitte.length === 1 ? 'Abschnitt' : 'Abschnitte'}
          </span>
        )}
      </div>

      {/* Haupt-Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Kalender-Bereich */}
        <div
          className="flex-1 overflow-auto p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) panelSchliessen()
          }}
        >
          <div className="grid grid-cols-5 gap-5">
            {monate.map(({ year, month }, i) => (
              <MonatKalender
                key={i}
                year={year}
                month={month}
                abschnitte={abschnitte}
                aktivesFach={aktivesFach}
                onTagKlick={handleTagKlick}
              />
            ))}
          </div>
        </div>

        {/* Detail-Panel */}
        {panelOffen && (
          <div className="w-72 border-l border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-hidden flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {istNeu ? 'Neuer Abschnitt' : 'Abschnitt bearbeiten'}
              </span>
              <button
                onClick={panelSchliessen}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm leading-none"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {/* Titel */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Titel</label>
                <input
                  type="text"
                  value={formTitel}
                  onChange={e => setFormTitel(e.target.value)}
                  placeholder="z. B. Quadratische Gleichungen"
                  className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-1.5 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  autoFocus
                />
              </div>

              {/* Zeitraum */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Zeitraum</label>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={formVon}
                    onChange={e => {
                      setFormVon(e.target.value)
                      if (formBis < e.target.value) setFormBis(e.target.value)
                    }}
                    className="flex-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <span className="text-zinc-400 text-xs flex-shrink-0">bis</span>
                  <input
                    type="date"
                    value={formBis}
                    min={formVon}
                    onChange={e => setFormBis(e.target.value)}
                    className="flex-1 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                </div>
              </div>

              {/* Farbe */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Farbe</label>
                <div className="flex flex-wrap gap-1.5">
                  {FARB_PALETTE.map(f => (
                    <button
                      key={f}
                      onClick={() => setFormFarbe(f === formFarbe ? null : f)}
                      className="w-5 h-5 rounded-full transition-transform hover:scale-110"
                      style={{
                        backgroundColor: f,
                        outline: formFarbe === f ? `2px solid ${f}` : '2px solid transparent',
                        outlineOffset: '2px',
                      }}
                    />
                  ))}
                  {formFarbe && (
                    <button
                      onClick={() => setFormFarbe(null)}
                      className="w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-600 text-zinc-400 flex items-center justify-center text-[9px] hover:bg-zinc-100 dark:hover:bg-zinc-700"
                      title="Fach-Farbe verwenden"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  {formFarbe ? 'Eigene Farbe' : `Fach-Farbe (${aktivesFach.farbe ?? 'Standard'})`}
                </p>
              </div>

              {/* Inhalt */}
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mb-1">Inhalte / Notizen</label>
                <textarea
                  value={formInhalt}
                  onChange={e => setFormInhalt(e.target.value)}
                  rows={6}
                  placeholder="Themen, Lernziele, Materialien…"
                  className="w-full text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md px-2.5 py-2 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800 flex gap-2">
              <button
                onClick={handleSpeichern}
                disabled={!formTitel.trim() || !formVon || !formBis}
                className="flex-1 btn-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Speichern
              </button>
              {!istNeu && (
                <button
                  onClick={handleLoeschen}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    loeschenBestaetigung
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  }`}
                >
                  {loeschenBestaetigung ? 'Sicher?' : 'Löschen'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
