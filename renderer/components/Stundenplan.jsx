import { useState, useEffect, useCallback } from 'react'
import useStore from '../store/useStore'

function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMontag(wochenOffset) {
  const now = new Date()
  const dow = now.getDay()
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(now)
  mon.setDate(now.getDate() + daysToMon + wochenOffset * 7)
  return toLocalDateStr(mon)
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

function faelligkeitRelativ(faelligkeit, vonDatum) {
  if (!faelligkeit) return null
  const diff = Math.round(
    (new Date(faelligkeit + 'T00:00:00') - new Date(vonDatum + 'T00:00:00')) / 86400000
  )
  if (diff < 0)  return `${Math.abs(diff)}d überfällig`
  if (diff === 0) return 'Heute fällig'
  if (diff === 1) return 'Morgen fällig'
  return `in ${diff} Tagen fällig`
}

function getKalenderwoche(datumStr) {
  const d = new Date(datumStr + 'T00:00:00')
  const dayNum = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dayNum)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

const KLASSE_FARBEN = [
  { bg: 'bg-indigo-100 dark:bg-indigo-900',   text: 'text-indigo-900 dark:text-indigo-100',   border: 'border-indigo-400 dark:border-indigo-600',   accent: 'bg-indigo-400 dark:bg-indigo-500' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900', text: 'text-emerald-900 dark:text-emerald-100', border: 'border-emerald-400 dark:border-emerald-600', accent: 'bg-emerald-400 dark:bg-emerald-500' },
  { bg: 'bg-violet-100 dark:bg-violet-900',   text: 'text-violet-900 dark:text-violet-100',   border: 'border-violet-400 dark:border-violet-600',   accent: 'bg-violet-400 dark:bg-violet-500' },
  { bg: 'bg-amber-100 dark:bg-amber-900',     text: 'text-amber-900 dark:text-amber-100',     border: 'border-amber-400 dark:border-amber-600',     accent: 'bg-amber-400 dark:bg-amber-500' },
  { bg: 'bg-rose-100 dark:bg-rose-900',       text: 'text-rose-900 dark:text-rose-100',       border: 'border-rose-400 dark:border-rose-600',       accent: 'bg-rose-400 dark:bg-rose-500' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900',       text: 'text-cyan-900 dark:text-cyan-100',       border: 'border-cyan-400 dark:border-cyan-600',       accent: 'bg-cyan-400 dark:bg-cyan-500' },
  { bg: 'bg-orange-100 dark:bg-orange-900',   text: 'text-orange-900 dark:text-orange-100',   border: 'border-orange-400 dark:border-orange-600',   accent: 'bg-orange-400 dark:bg-orange-500' },
]

function getKlasseFarbe(klasseId) {
  return KLASSE_FARBEN[klasseId % KLASSE_FARBEN.length]
}

function SlotInhalt({ eintrag, planungTitel }) {
  const f = getKlasseFarbe(eintrag.klasse_id)
  return (
    <div className={`h-full rounded overflow-hidden border ${f.bg} ${f.border} flex`}>
      <div className={`w-1 flex-shrink-0 ${f.accent}`} />
      <div className={`flex-1 px-1.5 py-1 min-w-0 ${f.text}`}>
        <div className="font-semibold text-xs truncate leading-tight">{eintrag.fach_name}</div>
        <div className="text-xs truncate leading-tight opacity-60">{eintrag.klasse_name}</div>
        {planungTitel && (
          <div className="text-xs truncate opacity-70 mt-0.5 italic">{planungTitel}</div>
        )}
      </div>
    </div>
  )
}

function aktuelleStunde(stundenzeiten) {
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return stundenzeiten.find(sz => sz.beginn <= hhmm && hhmm <= sz.ende)
}

function aktuellerWochentag() {
  const d = new Date().getDay()
  return d >= 1 && d <= 5 ? d : null
}

export default function Stundenplan() {
  const { klassen, todos, termine } = useStore()

  const [stundenzeiten, setStundenzeiten] = useState([])
  const [stundenplanEintraege, setStundenplanEintraege] = useState([])
  const [bearbeitungsModus, setBearbeitungsModus] = useState(false)
  const [slotModal, setSlotModal] = useState(null)
  const [planungModal, setPlanungModal] = useState(null) // { eintrag, wocheDatum }
  const [exportModal, setExportModal] = useState(false)
  const [alleFaecher, setAlleFaecher] = useState([])
  const [aktuelleWoche, setAktuelleWoche] = useState(0)
  const [kontextMenu, setKontextMenu] = useState(null)
  const [planungen, setPlanungen] = useState([]) // [{ stundenplan_id, titel, ... }]

  const wocheDatum = getMontag(aktuelleWoche)

  // Daten der Woche (Mo–Fr) als lokale Datums-Strings
  const wochenDaten = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(wocheDatum + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return toLocalDateStr(d)
  })

  useEffect(() => {
    laden()
  }, [])

  useEffect(() => {
    ladenPlanungen()
  }, [aktuelleWoche])

  // Kontextmenü bei Klick außerhalb schließen
  useEffect(() => {
    if (!kontextMenu) return
    const close = () => setKontextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [kontextMenu])

  const laden = async () => {
    const [sz, sp] = await Promise.all([
      window.api.stundenzeiten.getAll(),
      window.api.stundenplan.getAll(),
    ])
    setStundenzeiten(sz)
    setStundenplanEintraege(sp)
  }

  const ladenPlanungen = async () => {
    try {
      const datum = getMontag(aktuelleWoche)
      const pl = await window.api.stundenPlanung.getWoche(datum)
      setPlanungen(pl)
    } catch (e) {
      console.error('ladenPlanungen:', e)
    }
  }

  const planungFuerEintrag = (stundenplanId) =>
    planungen.find(p => p.stundenplan_id === stundenplanId)

  useEffect(() => {
    const store = useStore.getState()
    Promise.all(store.klassen.map(k => window.api.faecher.getAll(k.id)))
      .then(results => setAlleFaecher(results.flat()))
  }, [klassen])

  const eintragFuerSlot = (wochentag, stundeId) =>
    stundenplanEintraege.find(e => e.wochentag === wochentag && e.stunde_id === stundeId)

  const handleSlotClick = (wochentag, stunde) => {
    const eintrag = eintragFuerSlot(wochentag, stunde.id)
    if (bearbeitungsModus) {
      setSlotModal({ wochentag, stundeId: stunde.id, eintrag })
    } else if (eintrag) {
      setPlanungModal({ eintrag, wocheDatum })
    }
  }

  const handleSlotContextMenu = (e, wochentag, stunde) => {
    e.preventDefault()
    e.stopPropagation()
    const eintrag = eintragFuerSlot(wochentag, stunde.id)
    setKontextMenu({ x: e.clientX, y: e.clientY, wochentag, stunde, eintrag })
  }

  const navigiereZuNotentabelle = async (eintrag) => {
    const store = useStore.getState()
    const klasse = store.klassen.find(k => k.id === eintrag.klasse_id)
    if (!klasse) return
    await store.setAktiveKlasse(klasse)
    const fachListe = await window.api.faecher.getAll(klasse.id)
    const fach = fachListe.find(f => f.id === eintrag.fach_id)
    if (fach) await store.setAktivesFach(fach)
    store.setCurrentView('notentabelle')
  }

  const handleSlotSpeichern = async (fachId) => {
    if (!slotModal) return
    if (slotModal.eintrag) {
      if (fachId) {
        await window.api.stundenplan.update(slotModal.eintrag.id, { fachId })
      } else {
        await window.api.stundenplan.delete(slotModal.eintrag.id)
      }
    } else if (fachId) {
      await window.api.stundenplan.create({
        wochentag: slotModal.wochentag,
        stundeId: slotModal.stundeId,
        fachId,
      })
    }
    await laden()
    setSlotModal(null)
  }

  const handleKontextAktion = async (aktion) => {
    const { wochentag, stunde, eintrag } = kontextMenu
    setKontextMenu(null)
    if (aktion === 'oeffnen' && eintrag) {
      navigiereZuNotentabelle(eintrag)
    } else if (aktion === 'planen' && eintrag) {
      setPlanungModal({ eintrag, wocheDatum })
    } else if (aktion === 'bearbeiten') {
      setSlotModal({ wochentag, stundeId: stunde.id, eintrag })
    } else if (aktion === 'entfernen' && eintrag) {
      await window.api.stundenplan.delete(eintrag.id)
      await laden()
    }
  }

  const handleStundeHinzufuegen = async () => {
    await window.api.stundenzeiten.create()
    await laden()
  }

  const handleStundeLoeschen = async (id) => {
    await window.api.stundenzeiten.delete(id)
    await laden()
  }

  const handleZeitChange = useCallback((id, field, value) => {
    setStundenzeiten(prev => prev.map(sz => sz.id === id ? { ...sz, [field]: value } : sz))
  }, [])

  const handleZeitBlur = useCallback(async (id) => {
    const sz = stundenzeiten.find(s => s.id === id)
    if (sz) await window.api.stundenzeiten.update(id, { beginn: sz.beginn, ende: sz.ende })
  }, [stundenzeiten])

  const aktStunde = aktuelleStunde(stundenzeiten)
  const aktTag = aktuellerWochentag()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-zinc-950 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="flex items-center gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            onClick={() => setAktuelleWoche(w => w - 1)}
            title="Vorherige Woche"
          >
            ‹
          </button>
          <button
            className="px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            onClick={() => setAktuelleWoche(0)}
          >
            Heute
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            onClick={() => setAktuelleWoche(w => w + 1)}
            title="Nächste Woche"
          >
            ›
          </button>
        </div>
        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800">
          KW {getKalenderwoche(wocheDatum)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded-lg font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            onClick={() => setExportModal(true)}
          >
            PDF exportieren
          </button>
          <button
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors
              ${bearbeitungsModus
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}
            onClick={() => setBearbeitungsModus(!bearbeitungsModus)}
          >
            {bearbeitungsModus ? '✓ Fertig' : 'Bearbeiten'}
          </button>
        </div>
      </div>

      {/* Stundenplan-Raster */}
      <div className="flex-1 overflow-auto p-4 bg-slate-50 dark:bg-zinc-950">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: bearbeitungsModus ? 100 : 72 }} />
            {WOCHENTAGE.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            {/* Zeile 1: Wochentag + Datum */}
            <tr>
              <th className="text-left px-2 py-2 text-xs font-medium text-zinc-400 dark:text-zinc-600">
                {bearbeitungsModus && (
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">Zeiten</span>
                )}
              </th>
              {WOCHENTAGE.map((tag, i) => {
                const istHeute = aktuelleWoche === 0 && aktTag === i + 1
                return (
                  <th
                    key={i}
                    className={`px-2 py-2 text-center ${istHeute ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-400'}`}
                  >
                    <div className={`text-sm font-semibold ${istHeute ? 'underline underline-offset-4 decoration-indigo-400' : ''}`}>
                      {tag}
                    </div>
                    <div className="text-[11px] font-normal opacity-70 mt-0.5">
                      {new Date(wochenDaten[i] + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
                    </div>
                  </th>
                )
              })}
            </tr>
            {/* Zeile 2: Todo-Badges */}
            <tr>
              <td />
              {wochenDaten.map((tagDatum, i) => {
                const faelligHier    = todos.filter(t => !t.erledigt && t.faelligkeit === tagDatum)
                const erinnerungHier = todos.filter(t => !t.erledigt && t.erinnerung  === tagDatum)
                const termineHier    = termine.filter(t => t.datum === tagDatum)
                const badges = [
                  ...faelligHier.map(t => ({ t, typ: 'faellig' })),
                  ...erinnerungHier.map(t => ({ t, typ: 'erinnerung' })),
                  ...termineHier.map(t => ({ t, typ: 'termin' })),
                ]
                return (
                  <td key={i} className="px-1 pb-1.5 align-top">
                    <div className="flex flex-col gap-0.5">
                      {badges.map(({ t, typ }) => (
                        <div
                          key={`${typ}-${t.id}`}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium truncate ${
                            typ === 'faellig'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              : typ === 'erinnerung'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                          }`}
                          title={t.titel}
                        >
                          {typ === 'faellig'
                            ? `✓ ${t.titel}`
                            : typ === 'erinnerung'
                            ? `🔔 ${t.titel} – ${faelligkeitRelativ(t.faelligkeit, tagDatum)}`
                            : `◆ ${t.uhrzeit ? t.uhrzeit + ' ' : ''}${t.titel}`}
                        </div>
                      ))}
                    </div>
                  </td>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {stundenzeiten.map(stunde => {
              const istAktuelleStunde = aktuelleWoche === 0 && aktStunde?.id === stunde.id
              return (
                <tr key={stunde.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  {/* Zeit-Spalte */}
                  <td className="px-2 py-1 align-top">
                    {bearbeitungsModus ? (
                      <div className="flex flex-col gap-0.5 py-0.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`text-xs font-medium ${istAktuelleStunde ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400'}`}>
                            {stunde.stunde}. Std
                          </span>
                          <button
                            className="text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 text-xs leading-none transition-colors"
                            title="Stunde entfernen"
                            onClick={() => handleStundeLoeschen(stunde.id)}
                          >
                            ✕
                          </button>
                        </div>
                        <input
                          type="time"
                          className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5 bg-white dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-indigo-400 w-full"
                          value={stunde.beginn}
                          onChange={e => handleZeitChange(stunde.id, 'beginn', e.target.value)}
                          onBlur={() => handleZeitBlur(stunde.id)}
                        />
                        <input
                          type="time"
                          className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5 bg-white dark:bg-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-indigo-400 w-full"
                          value={stunde.ende}
                          onChange={e => handleZeitChange(stunde.id, 'ende', e.target.value)}
                          onBlur={() => handleZeitBlur(stunde.id)}
                        />
                      </div>
                    ) : (
                      <div className="text-right">
                        <div className={`text-xs font-medium ${istAktuelleStunde ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 dark:text-zinc-500'}`}>
                          {stunde.stunde}. Std
                        </div>
                        <div className="text-xs text-zinc-400">{stunde.beginn}</div>
                      </div>
                    )}
                  </td>

                  {/* Wochentage */}
                  {WOCHENTAGE.map((_, tagIdx) => {
                    const wochentag = tagIdx + 1
                    const eintrag = eintragFuerSlot(wochentag, stunde.id)
                    const istAktuell = istAktuelleStunde && aktuelleWoche === 0 && aktTag === wochentag

                    return (
                      <td
                        key={tagIdx}
                        className={`px-1 py-1 h-14 align-top border border-zinc-200 dark:border-zinc-800 transition-colors
                          ${istAktuell ? 'ring-2 ring-indigo-400 ring-inset' : ''}
                          ${bearbeitungsModus ? 'cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30' : ''}
                          ${!bearbeitungsModus && eintrag ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => handleSlotClick(wochentag, stunde)}
                        onContextMenu={e => handleSlotContextMenu(e, wochentag, stunde)}
                      >
                        {eintrag ? (
                          <SlotInhalt eintrag={eintrag} planungTitel={planungFuerEintrag(eintrag.id)?.titel} />
                        ) : (
                          bearbeitungsModus && (
                            <div className="h-full rounded border border-dashed border-zinc-200 dark:border-zinc-700 flex items-center justify-center">
                              <span className="text-zinc-300 dark:text-zinc-600 text-lg font-light">+</span>
                            </div>
                          )
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {bearbeitungsModus && (
              <tr className="border-t border-zinc-200 dark:border-zinc-800">
                <td colSpan={6} className="px-2 py-1">
                  <button
                    className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-lg px-3 py-1.5 transition-colors w-full text-left"
                    onClick={handleStundeHinzufuegen}
                  >
                    + Stunde hinzufügen
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Kontextmenü */}
      {kontextMenu && (
        <div
          className="context-menu fixed"
          style={{ top: kontextMenu.y, left: kontextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {kontextMenu.eintrag ? (
            <>
              <div className="px-3 py-1.5 mb-0.5">
                <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {kontextMenu.eintrag.fach_name}
                </div>
                <div className="text-xs text-zinc-400">{kontextMenu.eintrag.klasse_name}</div>
              </div>
              <div className="context-menu-separator" />
              <div className="context-menu-item" onClick={() => handleKontextAktion('planen')}>
                <span className="text-zinc-400">📋</span> Stunde planen
              </div>
              <div className="context-menu-item" onClick={() => handleKontextAktion('oeffnen')}>
                <span className="text-zinc-400">→</span> Zur Notentabelle
              </div>
              <div className="context-menu-item" onClick={() => handleKontextAktion('bearbeiten')}>
                <span className="text-zinc-400">✎</span> Fach ändern
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => handleKontextAktion('entfernen')}
              >
                <span>✕</span> Eintrag entfernen
              </div>
            </>
          ) : (
            <div className="context-menu-item" onClick={() => handleKontextAktion('bearbeiten')}>
              <span className="text-zinc-400">+</span> Stunde belegen
            </div>
          )}
        </div>
      )}

      {/* Slot-Modal */}
      {slotModal && (
        <SlotModal
          slotModal={slotModal}
          alleFaecher={alleFaecher}
          klassen={klassen}
          onSpeichern={handleSlotSpeichern}
          onClose={() => setSlotModal(null)}
        />
      )}

      {/* Planungs-Modal */}
      {planungModal && (
        <PlanungModal
          eintrag={planungModal.eintrag}
          wocheDatum={planungModal.wocheDatum}
          onClose={() => setPlanungModal(null)}
          onGespeichert={ladenPlanungen}
        />
      )}

      {/* Export-Modal */}
      {exportModal && (
        <PlanungsExportModal onClose={() => setExportModal(false)} />
      )}
    </div>
  )
}

function PlanungModal({ eintrag, wocheDatum, onClose, onGespeichert }) {
  const [titel, setTitel] = useState('')
  const [inhalt, setInhalt] = useState('')
  const [musizieren, setMusizieren] = useState(false)
  const [musiziertWarnung, setMusiziertWarnung] = useState(false)
  const [laden, setLaden] = useState(true)
  const [jahresAbschnitte, setJahresAbschnitte] = useState([])
  const istMusik = eintrag.fach_name?.toLowerCase().includes('musik')

  useEffect(() => {
    const [datum] = wocheDatum.split('T')
    const freitag = new Date(datum)
    freitag.setDate(freitag.getDate() + 4)
    const freitagStr = freitag.toISOString().split('T')[0]

    Promise.all([
      window.api.stundenPlanung.get(eintrag.id, wocheDatum),
      window.api.jahresplanung.getAll(eintrag.fach_id),
    ]).then(([plan, abschnitte]) => {
      if (plan) { setTitel(plan.titel); setInhalt(plan.inhalt); setMusizieren(!!plan.musizieren) }
      setJahresAbschnitte(abschnitte.filter(a => a.datum_bis >= datum && a.datum_von <= freitagStr))
    }).catch(e => console.error('PlanungModal laden:', e))
      .finally(() => setLaden(false))
  }, [])

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

  const speichern = async () => {
    try {
      await window.api.stundenPlanung.save(eintrag.id, wocheDatum, titel, inhalt, musizieren)
    } catch (e) {
      console.error('stundenPlanung.save Fehler:', e)
      alert('Fehler beim Speichern: ' + e.message)
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

  const [datum] = wocheDatum.split('T')
  const wocheAnzeige = (() => {
    const d = new Date(datum)
    const fr = new Date(d); fr.setDate(d.getDate() + 4)
    return `${d.getDate()}.${d.getMonth()+1}. – ${fr.getDate()}.${fr.getMonth()+1}.${fr.getFullYear()}`
  })()

  if (laden) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box w-full max-w-xl"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-400">{eintrag.fach_name} · {eintrag.klasse_name} · {wocheAnzeige}</span>
          </div>
          <input
            className="input text-base font-semibold"
            placeholder="Titel der Stunde…"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && e.preventDefault()}
            autoFocus
          />
        </div>

        {/* Jahresplanung-Referenz */}
        {jahresAbschnitte.length > 0 && (
          <div className="mb-3 rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-indigo-400 dark:text-indigo-500 uppercase tracking-wide">Jahresplanung</span>
            {jahresAbschnitte.map(a => (
              <div key={a.id}>
                <div className="flex items-center gap-2">
                  {a.farbe && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.farbe }} />}
                  <span className="text-xs font-medium text-indigo-800 dark:text-indigo-200">{a.titel}</span>
                  <span className="text-[10px] text-indigo-400 dark:text-indigo-500 ml-auto whitespace-nowrap">
                    {a.datum_von.split('-').reverse().slice(0,2).join('.')}. – {a.datum_bis.split('-').reverse().slice(0,2).join('.')}.
                  </span>
                </div>
                {a.inhalt && (
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-0.5 ml-4 whitespace-pre-wrap line-clamp-3">{a.inhalt}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formatierungs-Toolbar */}
        <div className="flex items-center gap-1 mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800">
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
              className={`w-7 h-7 flex items-center justify-center text-sm rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors ${btn.cls}`}
              onMouseDown={e => { e.preventDefault(); formatierung(btn.aktion) }}
            >
              {btn.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-zinc-400">Markdown</span>
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

        {/* Musizieren-Checkbox (nur bei Musik) */}
        {istMusik && (
          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={musizieren}
              onChange={e => handleMusiziertChange(e.target.checked)}
              className="accent-indigo-600 w-4 h-4"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">Musizieren</span>
          </label>
        )}

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
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">Bereits musiziert</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
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

function SlotModal({ slotModal, alleFaecher, klassen, onSpeichern, onClose }) {
  const [gewaehltFachId, setGewaehltFachId] = useState(slotModal.eintrag?.fach_id ?? '')

  const fachNachKlasse = {}
  for (const f of alleFaecher) {
    if (!fachNachKlasse[f.klasse_id]) fachNachKlasse[f.klasse_id] = []
    fachNachKlasse[f.klasse_id].push(f)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white mb-4">
          {slotModal.eintrag ? 'Stunde bearbeiten' : 'Stunde belegen'}
        </h2>

        <div className="mb-5">
          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Fach & Klasse</label>
          <select
            className="input"
            value={gewaehltFachId}
            onChange={e => setGewaehltFachId(e.target.value)}
          >
            <option value="">— Leer lassen —</option>
            {klassen.map(k => (
              <optgroup key={k.id} label={k.name}>
                {(fachNachKlasse[k.id] ?? []).map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          {slotModal.eintrag && (
            <button className="btn-danger" onClick={() => onSpeichern(null)}>Löschen</button>
          )}
          <button
            className="btn-primary flex-1"
            onClick={() => onSpeichern(gewaehltFachId ? parseInt(gewaehltFachId) : null)}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanungsExportModal({ onClose }) {
  const [wochen, setWochen] = useState([])
  const [ausgewaehlt, setAusgewaehlt] = useState([])
  const [einzeln, setEinzeln] = useState(false)
  const [laden, setLaden] = useState(true)
  const [exportiert, setExportiert] = useState(false)

  useEffect(() => {
    window.api.stundenPlanung.getVorhandeneWochen?.()
      ?.then(w => {
        setWochen(w)
        setAusgewaehlt(w)
      })
      ?.catch(e => console.error('getVorhandeneWochen:', e))
      ?.finally(() => setLaden(false))
      ?? setLaden(false)
  }, [])

  const toggleWoche = (datum) => {
    setAusgewaehlt(prev =>
      prev.includes(datum) ? prev.filter(d => d !== datum) : [...prev, datum]
    )
  }

  const wocheLabel = (datum) => {
    const d = new Date(datum)
    const fr = new Date(d); fr.setDate(d.getDate() + 4)
    const dayNum = (d.getUTCDay() || 7)
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
    const ys = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
    const kw = Math.ceil((((tmp - ys) / 86400000) + 1) / 7)
    return `KW ${kw} · ${d.getDate()}.${d.getMonth()+1}. – ${fr.getDate()}.${fr.getMonth()+1}.${fr.getFullYear()}`
  }

  const handleExport = async () => {
    if (!ausgewaehlt.length) return
    setExportiert(true)
    try {
      await window.api.export.planungPdf(ausgewaehlt.sort(), einzeln)
    } finally {
      setExportiert(false)
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Planung als PDF exportieren</h2>
          <button className="text-zinc-400 hover:text-zinc-600 text-xl" onClick={onClose}>✕</button>
        </div>

        {laden ? (
          <p className="text-sm text-zinc-400 text-center py-6">Laden…</p>
        ) : wochen.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-6">Keine Planungen vorhanden.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Wochen</span>
              <div className="flex gap-2">
                <button className="text-xs text-indigo-500 hover:text-indigo-700" onClick={() => setAusgewaehlt(wochen)}>Alle</button>
                <button className="text-xs text-zinc-400 hover:text-zinc-600" onClick={() => setAusgewaehlt([])}>Keine</button>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 mb-4 border border-zinc-100 dark:border-zinc-800 rounded-lg p-2">
              {wochen.map(datum => (
                <label key={datum} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ausgewaehlt.includes(datum)}
                    onChange={() => toggleWoche(datum)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-300">{wocheLabel(datum)}</span>
                </label>
              ))}
            </div>

            <div className="mb-5">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide block mb-2">Format</span>
              <div className="flex gap-2">
                {[
                  { val: false, label: 'Alle Wochen in einer PDF' },
                  { val: true, label: 'Jede Woche als eigene PDF' },
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    onClick={() => setEinzeln(opt.val)}
                    className={`flex-1 py-2 text-xs rounded-lg border font-medium transition-colors ${
                      einzeln === opt.val
                        ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300'
                        : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button
            className="btn-primary flex-1"
            onClick={handleExport}
            disabled={exportiert || ausgewaehlt.length === 0}
          >
            {exportiert ? 'Exportieren…' : `${ausgewaehlt.length} Woche${ausgewaehlt.length !== 1 ? 'n' : ''} exportieren`}
          </button>
        </div>
      </div>
    </div>
  )
}
