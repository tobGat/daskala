import { useState, useEffect, useCallback, Fragment } from 'react'
import useStore from '../store/useStore'
import PlanungModal, { toLocalDateStr } from './PlanungModal'

const WT_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr']

const FACH_FARBEN = [
  { border: 'border-l-coral-400 dark:border-l-coral-500', bg: 'bg-coral-50 dark:bg-coral-900/20', pill: 'bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-300', pillActive: 'bg-coral-600 dark:bg-coral-500 text-white', header: 'text-coral-600 dark:text-coral-400', headerBorder: 'border-coral-200 dark:border-coral-800' },
  { border: 'border-l-emerald-400 dark:border-l-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20', pill: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300', pillActive: 'bg-emerald-600 dark:bg-emerald-500 text-white', header: 'text-emerald-600 dark:text-emerald-400', headerBorder: 'border-emerald-200 dark:border-emerald-800' },
  { border: 'border-l-violet-400 dark:border-l-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/20', pill: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', pillActive: 'bg-violet-600 dark:bg-violet-500 text-white', header: 'text-violet-600 dark:text-violet-400', headerBorder: 'border-violet-200 dark:border-violet-800' },
  { border: 'border-l-amber-400 dark:border-l-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20', pill: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', pillActive: 'bg-amber-600 dark:bg-amber-500 text-white', header: 'text-amber-600 dark:text-amber-400', headerBorder: 'border-amber-200 dark:border-amber-800' },
  { border: 'border-l-rose-400 dark:border-l-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/20', pill: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300', pillActive: 'bg-rose-600 dark:bg-rose-500 text-white', header: 'text-rose-600 dark:text-rose-400', headerBorder: 'border-rose-200 dark:border-rose-800' },
  { border: 'border-l-cyan-400 dark:border-l-cyan-500', bg: 'bg-cyan-50 dark:bg-cyan-950/20', pill: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300', pillActive: 'bg-cyan-600 dark:bg-cyan-500 text-white', header: 'text-cyan-600 dark:text-cyan-400', headerBorder: 'border-cyan-200 dark:border-cyan-800' },
  { border: 'border-l-orange-400 dark:border-l-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/20', pill: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300', pillActive: 'bg-orange-600 dark:bg-orange-500 text-white', header: 'text-orange-600 dark:text-orange-400', headerBorder: 'border-orange-200 dark:border-orange-800' },
]

function getMontag(wochenOffset) {
  const now = new Date()
  const dow = now.getDay()
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(now)
  mon.setDate(now.getDate() + daysToMon + wochenOffset * 7)
  return toLocalDateStr(mon)
}

function getKalenderwoche(datumStr) {
  const d = new Date(datumStr + 'T00:00:00')
  const dayNum = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dayNum)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

function formatDatum(datumStr) {
  const d = new Date(datumStr + 'T00:00:00')
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

function StundenKarte({ slot, plan, farbe, onClick, gedaempft }) {
  const hatPlanung = plan && (plan.titel || plan.inhalt)
  return (
    <button
      className={`w-full text-left rounded-lg border transition-all hover:shadow-sm cursor-pointer group
        ${hatPlanung
          ? `border-paper-200 dark:border-ink-700 ${farbe.bg} border-l-4 ${farbe.border}`
          : 'border-dashed border-paper-200 dark:border-ink-800 border-l-4 border-l-paper-200 dark:border-l-ink-700'
        }
        ${gedaempft ? 'opacity-75' : ''}
      `}
      onClick={onClick}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-ink-700 dark:text-paper-300">
            {WT_KURZ[slot.wochentag - 1]} {slot.stunde}. Std
          </span>
          <span className="text-[11px] text-ink-400 dark:text-ink-500 ml-auto">
            {slot.beginn}–{slot.ende}
          </span>
        </div>
        {hatPlanung ? (
          <div>
            {plan.titel && (
              <div className="text-sm font-medium text-ink-800 dark:text-paper-200 truncate">
                {plan.titel}
              </div>
            )}
            {plan.inhalt && (
              <div className="text-xs text-ink-500 dark:text-ink-400 truncate mt-0.5">
                {plan.inhalt.split('\n')[0]}
              </div>
            )}
            {plan.hue_text && (
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-medium">
                HÜ: {plan.hue_text.length > 40 ? plan.hue_text.slice(0, 40) + '…' : plan.hue_text}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-ink-600 dark:text-paper-300 dark:text-ink-600 group-hover:text-ink-400 dark:group-hover:text-ink-500 transition-colors">
            (keine Planung)
          </div>
        )}
      </div>
    </button>
  )
}

export default function KlassenplanungView() {
  const { aktiveKlasse } = useStore()
  const [slots, setSlots] = useState([])
  const [planungen, setPlanungen] = useState({})
  const [anzahlWochen, setAnzahlWochen] = useState(8)
  const [sichtbareFaecher, setSichtbareFaecher] = useState(new Set())
  const [planungModal, setPlanungModal] = useState(null)
  const [laden, setLaden] = useState(true)

  // Jahresplanung: { [fachId]: [{ id, titel, inhalt, farbe, datum_von, datum_bis }, ...] }
  const [jahresplanung, setJahresplanung] = useState({})

  // Parallelklassen: { [fachId]: { parallelKlassen: [...], aktiveRefs: [fachId, ...] } }
  const [parallelDaten, setParallelDaten] = useState({})
  // Planungen der Referenzspalten: gleicher Key-Aufbau wie `planungen`
  const [refPlanungen, setRefPlanungen] = useState({})

  const ladeSlots = useCallback(async () => {
    if (!aktiveKlasse) return
    setLaden(true)
    try {
      const data = await window.api.stundenplan.getByKlasse(aktiveKlasse.id)
      setSlots(data)
      const ids = new Set()
      for (const s of data) ids.add(s.fach_id)
      setSichtbareFaecher(ids)
    } catch (e) {
      console.error('getByKlasse:', e)
    }
    setLaden(false)
  }, [aktiveKlasse?.id])

  // Jahresplanungs-Abschnitte pro Fach laden
  const ladeJahresplanung = useCallback(async () => {
    if (slots.length === 0) return
    const fachIds = new Set()
    for (const s of slots) fachIds.add(s.fach_id)
    const jpMap = {}
    await Promise.all([...fachIds].map(fachId =>
      window.api.jahresplanung.getAll(fachId).then(abschnitte => {
        if (abschnitte.length > 0) jpMap[fachId] = abschnitte
      })
    ))
    setJahresplanung(jpMap)
  }, [slots])

  const ladePlanungen = useCallback(async () => {
    if (!aktiveKlasse) return
    const planMap = {}
    const promises = []
    for (let w = 0; w < anzahlWochen; w++) {
      const wocheDatum = getMontag(w)
      promises.push(
        window.api.stundenPlanung.getWoche(wocheDatum).then(liste => {
          for (const p of liste) {
            planMap[`${p.stundenplan_id}_${wocheDatum}`] = p
          }
        })
      )
    }
    await Promise.all(promises)
    setPlanungen(planMap)
  }, [aktiveKlasse?.id, anzahlWochen])

  // Parallelklassen-Daten laden
  const ladeParallelDaten = useCallback(async () => {
    if (!aktiveKlasse || slots.length === 0) return
    const fachNamen = new Map()
    for (const s of slots) {
      if (!fachNamen.has(s.fach_id)) fachNamen.set(s.fach_id, s.fach_name)
    }
    const neueParallel = {}
    const promises = []
    for (const [fachId, fachName] of fachNamen) {
      promises.push(
        window.api.stundenplan.getParallelFach(aktiveKlasse.id, fachName).then(result => {
          if (result.length > 0) {
            neueParallel[fachId] = {
              parallelKlassen: result,
              aktiveRefs: parallelDaten[fachId]?.aktiveRefs || [],
            }
          }
        })
      )
    }
    await Promise.all(promises)
    setParallelDaten(prev => {
      // aktiveRefs beibehalten wenn noch gültig
      const merged = {}
      for (const [fachId, data] of Object.entries(neueParallel)) {
        const bisherige = prev[fachId]?.aktiveRefs || []
        const nochGueltig = bisherige.filter(ref => data.parallelKlassen.some(pk => pk.fach_id === ref))
        merged[fachId] = { ...data, aktiveRefs: nochGueltig }
      }
      return merged
    })
  }, [aktiveKlasse?.id, slots])

  // Referenz-Planungen laden wenn Refs aktiviert werden
  const ladeRefPlanungen = useCallback(async () => {
    const hatAktiveRefs = Object.values(parallelDaten).some(d => d.aktiveRefs.length > 0)
    if (!hatAktiveRefs) { setRefPlanungen({}); return }

    // Alle Ref-Slot-IDs sammeln
    const refSlotIds = new Set()
    for (const pd of Object.values(parallelDaten)) {
      for (const refId of pd.aktiveRefs) {
        const pk = pd.parallelKlassen.find(p => p.fach_id === refId)
        if (pk) for (const s of pk.slots) refSlotIds.add(s.id)
      }
    }

    const planMap = {}
    const promises = []
    for (let w = 0; w < anzahlWochen; w++) {
      const wocheDatum = getMontag(w)
      promises.push(
        window.api.stundenPlanung.getWoche(wocheDatum).then(liste => {
          for (const p of liste) {
            if (refSlotIds.has(p.stundenplan_id)) {
              planMap[`${p.stundenplan_id}_${wocheDatum}`] = p
            }
          }
        })
      )
    }
    await Promise.all(promises)
    setRefPlanungen(planMap)
  }, [parallelDaten, anzahlWochen])

  useEffect(() => { ladeSlots() }, [ladeSlots])
  useEffect(() => { if (slots.length > 0) ladePlanungen() }, [slots, ladePlanungen])
  useEffect(() => { ladeJahresplanung() }, [ladeJahresplanung])
  useEffect(() => { ladeParallelDaten() }, [ladeParallelDaten])
  useEffect(() => { ladeRefPlanungen() }, [ladeRefPlanungen])

  // Fächer aus Slots ableiten (unique, stabile Reihenfolge)
  const faecher = []
  const seenFach = new Set()
  for (const s of slots) {
    if (!seenFach.has(s.fach_id)) {
      seenFach.add(s.fach_id)
      faecher.push({ id: s.fach_id, name: s.fach_name })
    }
  }

  const fachFarbeMap = {}
  faecher.forEach((f, i) => { fachFarbeMap[f.id] = FACH_FARBEN[i % FACH_FARBEN.length] })

  const fachWochentageMap = {}
  for (const s of slots) {
    if (!fachWochentageMap[s.fach_id]) fachWochentageMap[s.fach_id] = new Set()
    fachWochentageMap[s.fach_id].add(s.wochentag)
  }

  const toggleFach = (fachId) => {
    setSichtbareFaecher(prev => {
      const neu = new Set(prev)
      if (neu.has(fachId)) {
        if (neu.size > 1) neu.delete(fachId)
      } else {
        neu.add(fachId)
      }
      return neu
    })
  }

  const toggleRef = (fachId, refFachId) => {
    setParallelDaten(prev => {
      const current = prev[fachId]
      if (!current) return prev
      const refs = current.aktiveRefs || []
      const neueRefs = refs.includes(refFachId)
        ? refs.filter(r => r !== refFachId)
        : [...refs, refFachId]
      return {
        ...prev,
        [fachId]: { ...current, aktiveRefs: neueRefs },
      }
    })
  }

  const alleRefsAusblenden = (fachId) => {
    setParallelDaten(prev => {
      const current = prev[fachId]
      if (!current) return prev
      return { ...prev, [fachId]: { ...current, aktiveRefs: [] } }
    })
  }

  // Wochen-Daten (einmal berechnen)
  const wochenDaten = []
  for (let w = 0; w < anzahlWochen; w++) {
    const wocheDatum = getMontag(w)
    const kw = getKalenderwoche(wocheDatum)
    const freitag = new Date(wocheDatum + 'T00:00:00')
    freitag.setDate(freitag.getDate() + 4)
    const freitagStr = formatDatum(toLocalDateStr(freitag))
    const montagStr = formatDatum(wocheDatum)
    const jahr = freitag.getFullYear()
    wochenDaten.push({ wocheDatum, kw, montagStr, freitagStr, jahr })
  }

  // Karten pro Fach (für eigene Spalten und Referenzspalten)
  const kartenProSlots = (fachSlots, fachId, planMap) => {
    const wochen = []
    const farbe = fachFarbeMap[fachId] || FACH_FARBEN[0]
    for (const wd of wochenDaten) {
      const karten = fachSlots.map(slot => ({
        key: `${slot.id}_${wd.wocheDatum}`,
        slot,
        wocheDatum: wd.wocheDatum,
        plan: planMap[`${slot.id}_${wd.wocheDatum}`],
        farbe,
      }))
      if (karten.length > 0) {
        wochen.push({ ...wd, karten })
      }
    }
    return wochen
  }

  const oeffnePlanung = (slot, wocheDatum) => {
    // fachWochentage: aus eigenen Slots ODER aus Ref-Slots
    let fachTage = fachWochentageMap[slot.fach_id]
    if (!fachTage) {
      // Ref-Slot: Wochentage aus den Ref-Slots ableiten
      fachTage = new Set()
      for (const pd of Object.values(parallelDaten)) {
        const pk = pd.parallelKlassen.find(p => p.fach_id === slot.fach_id)
        if (pk) for (const s of pk.slots) fachTage.add(s.wochentag)
      }
    }
    setPlanungModal({ eintrag: slot, wocheDatum, fachWochentage: [...fachTage] })
  }

  const sichtbareListe = faecher.filter(f => sichtbareFaecher.has(f.id))

  if (!aktiveKlasse) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">
        Klasse auswählen
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header: Fach-Toggles */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          {faecher.map((f, i) => {
            const farbe = FACH_FARBEN[i % FACH_FARBEN.length]
            const aktiv = sichtbareFaecher.has(f.id)
            return (
              <button
                key={f.id}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  aktiv ? farbe.pillActive : farbe.pill + ' opacity-50'
                }`}
                onClick={() => toggleFach(f.id)}
                title={aktiv ? `${f.name} ausblenden` : `${f.name} einblenden`}
              >
                {f.name}
              </button>
            )
          })}
          {faecher.length > 2 && (
            <button
              className="px-2 py-1 rounded-full text-[10px] font-medium text-ink-400 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 transition-colors"
              onClick={() => {
                const alleIds = new Set(faecher.map(f => f.id))
                const alleSichtbar = faecher.every(f => sichtbareFaecher.has(f.id))
                if (alleSichtbar) {
                  setSichtbareFaecher(new Set([faecher[0].id]))
                } else {
                  setSichtbareFaecher(alleIds)
                }
              }}
              title={faecher.every(f => sichtbareFaecher.has(f.id)) ? 'Nur erstes Fach zeigen' : 'Alle Fächer zeigen'}
            >
              {faecher.every(f => sichtbareFaecher.has(f.id)) ? '− Reduzieren' : '+ Alle'}
            </button>
          )}
        </div>
      </div>

      {/* Spalten-Layout */}
      <div className="flex-1 overflow-hidden flex">
        {laden && slots.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Laden...</div>
        ) : sichtbareListe.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">Keine Stunden im Stundenplan für diese Klasse</div>
        ) : (
          sichtbareListe.map((fach, idx) => {
            const farbe = fachFarbeMap[fach.id]
            const fachSlots = slots.filter(s => s.fach_id === fach.id)
            const wochen = kartenProSlots(fachSlots, fach.id, planungen)
            const pd = parallelDaten[fach.id]
            const aktiveRefDatas = (pd?.aktiveRefs || [])
              .map(refId => pd.parallelKlassen.find(pk => pk.fach_id === refId))
              .filter(Boolean)

            return (
              <Fragment key={fach.id}>
                {/* Haupt-Fach-Spalte */}
                <FachSpalte
                  fach={fach}
                  farbe={farbe}
                  wochen={wochen}
                  istErste={idx === 0}
                  parallelDaten={pd}
                  jahresAbschnitte={jahresplanung[fach.id] || []}
                  klasseName={aktiveKlasse.name}
                  wochenDaten={wochenDaten}
                  onToggleRef={(refFachId) => toggleRef(fach.id, refFachId)}
                  onAlleRefsAus={() => alleRefsAusblenden(fach.id)}
                  onKarteClick={oeffnePlanung}
                  onMehrWochen={() => setAnzahlWochen(n => n + 4)}
                />

                {/* Referenz-Spalten (mehrere möglich) */}
                {aktiveRefDatas.map(refData => (
                  <FachSpalte
                    key={refData.fach_id}
                    fach={{ id: refData.fach_id, name: `${refData.klasse_name} ${refData.fach_name}` }}
                    farbe={farbe}
                    wochen={kartenProSlots(refData.slots, fach.id, refPlanungen)}
                    istErste={false}
                    istReferenz
                    jahresAbschnitte={[]}
                    onSchliessen={() => toggleRef(fach.id, refData.fach_id)}
                    onKarteClick={oeffnePlanung}
                    onMehrWochen={() => setAnzahlWochen(n => n + 4)}
                  />
                ))}
              </Fragment>
            )
          })
        )}
      </div>

      {/* PlanungModal */}
      {planungModal && (
        <PlanungModal
          eintrag={planungModal.eintrag}
          wocheDatum={planungModal.wocheDatum}
          fachWochentage={planungModal.fachWochentage}
          onClose={() => setPlanungModal(null)}
          onGespeichert={async () => { await ladePlanungen(); await ladeRefPlanungen() }}
        />
      )}
    </div>
  )
}

function FachSpalte({ fach, farbe, wochen, istErste, istReferenz, parallelDaten, jahresAbschnitte = [], klasseName, wochenDaten, onToggleRef, onAlleRefsAus, onSchliessen, onKarteClick, onMehrWochen }) {
  const [refDropdownOffen, setRefDropdownOffen] = useState(false)
  const [exportPopover, setExportPopover] = useState(false)
  const [exportiert, setExportiert] = useState(false)

  const exportDocx = async (anzahlWochen) => {
    if (!wochenDaten || !klasseName) return
    setExportPopover(false)
    setExportiert(true)
    try {
      const daten = wochenDaten.slice(0, anzahlWochen)
      await window.api.export.fachPlanungDocx(fach.id, fach.name, klasseName, daten)
    } catch (e) { console.error('DOCX-Export:', e) }
    setTimeout(() => setExportiert(false), 1500)
  }

  // Abschnitte finden die in eine KW fallen (Mo-Fr der Woche)
  const abschnitteFuerWoche = (wocheDatum) => {
    if (jahresAbschnitte.length === 0) return []
    const mo = wocheDatum
    const frDate = new Date(wocheDatum + 'T00:00:00')
    frDate.setDate(frDate.getDate() + 4)
    const fr = toLocalDateStr(frDate)
    return jahresAbschnitte.filter(a =>
      a.datum_von && a.datum_bis && a.datum_bis >= mo && a.datum_von <= fr
    )
  }

  return (
    <div
      className={`flex-1 min-w-0 flex flex-col overflow-hidden
        ${!istErste ? 'border-l border-paper-200 dark:border-ink-800' : ''}
        ${istReferenz ? 'bg-paper-50/50 dark:bg-ink-900/30' : ''}
      `}
    >
      {/* Spalten-Header */}
      <div className={`flex-shrink-0 px-4 py-2 border-b flex items-center gap-2 ${
        istReferenz ? 'border-dashed border-paper-300 dark:border-ink-700' : farbe.headerBorder
      }`}>
        <h3 className={`text-sm font-semibold truncate ${
          istReferenz ? 'text-ink-500 dark:text-ink-400' : farbe.header
        }`}>
          {fach.name}
          {istReferenz && <span className="text-[10px] font-normal ml-1 opacity-60">(Ref.)</span>}
        </h3>

        {/* DOCX-Export */}
        {!istReferenz && wochenDaten && (
          <div className="relative flex-shrink-0 ml-auto">
            <button
              className="text-[10px] px-2 py-0.5 rounded text-ink-400 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 hover:bg-paper-100 dark:hover:bg-ink-800 transition-colors"
              onClick={() => setExportPopover(v => !v)}
              title="Planung als Word-Dokument exportieren"
              disabled={exportiert}
            >
              {exportiert ? '✓' : '↓ DOCX'}
            </button>
            {exportPopover && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setExportPopover(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-ink-800 rounded-lg shadow-lg border border-paper-200 dark:border-ink-700 py-1 min-w-[130px]">
                  {[4, 8, 12].filter(n => n <= wochenDaten.length).map(n => (
                    <button
                      key={n}
                      className="w-full text-left px-3 py-1.5 text-xs text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
                      onClick={() => exportDocx(n)}
                    >
                      {n} Wochen
                    </button>
                  ))}
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs text-ink-600 dark:text-ink-400 hover:bg-paper-50 dark:hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
                    onClick={() => exportDocx(wochenDaten.length)}
                  >
                    Alle ({wochenDaten.length} Wochen)
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Parallelklassen-Dropdown */}
        {!istReferenz && parallelDaten && parallelDaten.parallelKlassen.length > 0 && (
          <div className="relative flex-shrink-0">
            <button
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                parallelDaten.aktiveRefs.length > 0
                  ? 'bg-white dark:bg-ink-700 dark:bg-paper-300 text-white dark:text-ink-900 font-semibold'
                  : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 hover:bg-paper-100 dark:hover:bg-ink-800'
              }`}
              onClick={() => setRefDropdownOffen(v => !v)}
              title="Parallelklassen einblenden"
            >
              {parallelDaten.aktiveRefs.length > 0
                ? `${parallelDaten.aktiveRefs.length} Parallel`
                : '+ Parallel'
              }
            </button>
            {refDropdownOffen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setRefDropdownOffen(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-ink-800 rounded-lg shadow-lg border border-paper-200 dark:border-ink-700 py-1 min-w-[120px]">
                  {parallelDaten.parallelKlassen.map(pk => {
                    const istAktiv = parallelDaten.aktiveRefs.includes(pk.fach_id)
                    return (
                      <button
                        key={pk.fach_id}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-paper-50 dark:hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors flex items-center gap-2 ${
                          istAktiv
                            ? 'font-semibold text-ink-900 dark:text-white'
                            : 'text-ink-600 dark:text-ink-400'
                        }`}
                        onClick={() => onToggleRef(pk.fach_id)}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                          istAktiv
                            ? 'bg-white dark:bg-ink-700 dark:bg-paper-300 border-ink-700 dark:border-paper-300 text-white dark:text-ink-900'
                            : 'border-paper-300 dark:border-ink-600'
                        }`}>
                          {istAktiv && <span className="text-[9px]">✓</span>}
                        </span>
                        {pk.klasse_name}
                      </button>
                    )
                  })}
                  {parallelDaten.aktiveRefs.length > 0 && (
                    <>
                      <div className="border-t border-paper-100 dark:border-ink-700 my-1" />
                      <button
                        className="w-full text-left px-3 py-1.5 text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 hover:bg-paper-50 dark:hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
                        onClick={() => { onAlleRefsAus(); setRefDropdownOffen(false) }}
                      >
                        Alle ausblenden
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Referenz schließen */}
        {istReferenz && onSchliessen && (
          <button
            className="ml-auto text-ink-400 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 transition-colors text-xs flex-shrink-0"
            onClick={onSchliessen}
            title="Referenzspalte schließen"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scrollbare Kartenliste */}
      <div className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
        {wochen.map(woche => {
          const kwAbschnitte = abschnitteFuerWoche(woche.wocheDatum)
          return (
          <div key={woche.kw} className="mb-5">
            <div className="sticky top-0 z-10 bg-paper-50 dark:bg-ink-950 pb-1.5 pt-0.5">
              <span className="text-[10px] font-semibold text-ink-400 dark:text-ink-500 uppercase tracking-wide">
                KW {woche.kw} · {woche.montagStr} – {woche.freitagStr}{woche.jahr}
              </span>
              {kwAbschnitte.length > 0 && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {kwAbschnitte.map(a => (
                    <div key={a.id} className="flex items-center gap-1.5">
                      {a.farbe && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: a.farbe }} />}
                      <span className="text-[10px] text-ink-500 dark:text-ink-400 truncate">{a.titel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {woche.karten.map(karte => (
                <StundenKarte
                  key={karte.key}
                  slot={karte.slot}
                  plan={karte.plan}
                  farbe={karte.farbe}
                  gedaempft={istReferenz}
                  onClick={() => onKarteClick(karte.slot, karte.wocheDatum)}
                />
              ))}
            </div>
          </div>
          )
        })}

        <div className="text-center mt-2 mb-2">
          <button
            className="text-[10px] text-ink-400 hover:text-ink-600 dark:hover:text-ink-900 dark:hover:text-paper-300 transition-colors px-3 py-1.5 rounded border border-dashed border-paper-200 dark:border-ink-700 hover:border-ink-400 dark:hover:border-ink-500"
            onClick={onMehrWochen}
          >
            Mehr Wochen
          </button>
        </div>
      </div>
    </div>
  )
}
