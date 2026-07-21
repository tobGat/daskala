// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import { useState, useEffect, useMemo } from 'react'
import useStore from '../store/useStore'
import PlanungModal, { toLocalDateStr, berechneFristDatum } from './PlanungModal'
import { berechneSchulferien, ferienFuerTag, mergeFerien } from '../utils/schulferien'

function getMontag(wochenOffset) {
  const now = new Date()
  const dow = now.getDay()
  const daysToMon = dow === 0 ? -6 : 1 - dow
  const mon = new Date(now)
  mon.setDate(now.getDate() + daysToMon + wochenOffset * 7)
  return toLocalDateStr(mon)
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

// WMO-Wettercode → Emoji (Open-Meteo)
function wetterSymbol(code) {
  if (code == null) return ''
  if (code === 0) return '☀️'
  if (code <= 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '🌨️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  return '⛈️'
}
function wetterText(code) {
  if (code == null) return ''
  if (code === 0) return 'Klar'
  if (code <= 2) return 'Heiter'
  if (code === 3) return 'Bewölkt'
  if (code <= 48) return 'Nebel'
  if (code <= 57) return 'Nieselregen'
  if (code <= 67) return 'Regen'
  if (code <= 77) return 'Schnee'
  if (code <= 82) return 'Regenschauer'
  if (code <= 86) return 'Schneeschauer'
  return 'Gewitter'
}

// Wetter im Tages-Header: klein, rechts neben Wochentag/Datum.
// Kompakt (Tageshöchst) oder mit Tageszeiten (Vm/Mi/Ab).
function TagWetter({ w, detail }) {
  if (!w) return null
  if (detail && (w.vm || w.mi || w.ab)) {
    const teile = [['Vm', w.vm], ['Mi', w.mi], ['Ab', w.ab]]
    return (
      <div className="text-[9px] leading-tight text-ink-500 dark:text-ink-400">
        {teile.map(([lbl, teil]) => teil ? (
          <div key={lbl} className="flex items-center gap-0.5" title={wetterText(teil.code)}>
            <span className="opacity-60 w-4">{lbl}</span>
            <span className="text-[11px] leading-none">{wetterSymbol(teil.code)}</span>
            <span className="tabular-nums w-5 text-right">{Math.round(teil.temp)}°</span>
          </div>
        ) : null)}
      </div>
    )
  }
  if (w.tmax == null) return null
  return (
    <div className="flex items-center gap-0.5 text-[10px] font-normal text-ink-500 dark:text-ink-400" title={wetterText(w.code)}>
      <span className="text-[12px] leading-none">{wetterSymbol(w.code)}</span>
      <span className="tabular-nums">{Math.round(w.tmax)}°</span>
    </div>
  )
}

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
  { bg: 'bg-coral-100 dark:bg-coral-900',   text: 'text-coral-900 dark:text-coral-100',   border: 'border-coral-400 dark:border-coral-600',   accent: 'bg-coral-400 dark:bg-coral-500' },
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

function SupplierInhalt({ supplier }) {
  return (
    <div className="h-full rounded overflow-hidden border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 flex">
      <div className="w-1 flex-shrink-0 bg-orange-400 dark:bg-orange-600" />
      <div className="flex-1 px-1.5 py-1 min-w-0">
        <div className="font-semibold text-xs truncate leading-tight text-orange-900 dark:text-orange-100">
          {supplier.fach_text || '—'}
        </div>
        <div className="text-xs truncate leading-tight opacity-70 text-orange-800 dark:text-orange-200">
          {supplier.klasse_text || ''}
        </div>
        {supplier.titel ? (
          <div className="text-xs truncate leading-tight opacity-70 italic text-orange-800 dark:text-orange-200">
            {supplier.titel}
          </div>
        ) : (
          <div className="text-[9px] font-bold text-orange-400 dark:text-orange-500 uppercase tracking-wide leading-tight">
            Sup
          </div>
        )}
      </div>
    </div>
  )
}

// Rhythmus-Kürzel: 2 → „14-tg.", sonst „/N Wo."
function intervallLabel(iv) {
  return iv === 2 ? '14-tg.' : `/${iv} Wo.`
}

function SlotInhalt({ eintrag, planungTitel, planungNotiz, entfall, pausiert }) {
  const f = getKlasseFarbe(eintrag.klasse_id)
  const iv = eintrag.wochen_intervall || 1
  const ivBadge = iv > 1 ? (
    <span
      className="text-[8px] font-bold px-1 rounded bg-black/10 dark:bg-white/15 whitespace-nowrap leading-tight"
      title={`Findet alle ${iv} Wochen statt`}
    >
      {intervallLabel(iv)}
    </span>
  ) : null
  if (entfall) {
    return (
      <div className="h-full rounded overflow-hidden border border-paper-300 dark:border-ink-600 bg-paper-100 dark:bg-ink-800/60 flex relative">
        <div className="w-1 flex-shrink-0 bg-red-400 dark:bg-red-600" />
        <div className="flex-1 px-1.5 py-1 min-w-0 opacity-50">
          <div className="font-semibold text-xs truncate leading-tight line-through text-ink-500 dark:text-ink-400 decoration-red-500 dark:decoration-red-400 decoration-2">{eintrag.fach_name}</div>
          <div className="text-xs truncate leading-tight text-ink-400 dark:text-ink-500 line-through decoration-red-500 dark:decoration-red-400 decoration-2">{eintrag.klasse_name}</div>
          <div className="text-[9px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wide leading-tight mt-0.5">Entfall</div>
        </div>
      </div>
    )
  }
  return (
    <div className={`h-full rounded overflow-hidden border ${f.bg} ${f.border} flex ${pausiert ? 'opacity-40 border-dashed' : ''}`}>
      <div className={`w-1 flex-shrink-0 ${f.accent}`} />
      <div className={`flex-1 px-1.5 py-1 min-w-0 ${f.text}`}>
        <div className="font-semibold text-xs truncate leading-tight">{eintrag.fach_name}</div>
        <div className="text-xs leading-tight opacity-60 flex items-center gap-1 min-w-0">
          <span className="truncate">{eintrag.klasse_name}</span>
          {ivBadge}
          {pausiert && <span className="text-[8px] font-semibold uppercase tracking-wide whitespace-nowrap">· diese Wo. frei</span>}
        </div>
        {planungTitel && (
          <div className="text-xs truncate opacity-70 mt-0.5 italic">{planungTitel}</div>
        )}
        {!planungTitel && planungNotiz && (
          <div className="text-[10px] truncate opacity-70 mt-0.5 flex items-center gap-1">
            <span aria-hidden>📝</span>
            <span className="truncate">{planungNotiz}</span>
          </div>
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

export default function Stundenplan({ onTodoBadgeClick, onTerminBadgeClick }) {
  const { klassen, todos, termine, aktuellesSchuljahr, einstellungen } = useStore()
  const planungAktiv = einstellungen?.planung_aktiv === '1'
  const wetterDetail = einstellungen?.wetter_detail === '1'
  const wetterZellen = einstellungen?.wetter_zellen === '1'

  const [stundenzeiten, setStundenzeiten] = useState([])
  const [stundenplanEintraege, setStundenplanEintraege] = useState([])
  const [bearbeitungsModus, setBearbeitungsModus] = useState(false)
  const [dragEintragId, setDragEintragId] = useState(null)      // id der per Drag gezogenen Stunde
  const [dragOverSlot, setDragOverSlot] = useState(null)        // { wochentag, stundeId } — Ziel-Highlight
  const [zeitenModalOffen, setZeitenModalOffen] = useState(false)
  const [slotModal, setSlotModal] = useState(null)
  const [planungModal, setPlanungModal] = useState(null) // { eintrag, wocheDatum } or { supplier, wocheDatum, stunde }
  const [notizModal, setNotizModal] = useState(null) // { eintrag, wocheDatum, planung }
  const [exportModal, setExportModal] = useState(null) // null | 'wahl' | 'planung'
  const [alleFaecher, setAlleFaecher] = useState([])
  const [aktuelleWoche, setAktuelleWoche] = useState(0)
  const [kontextMenu, setKontextMenu] = useState(null)
  const [planungen, setPlanungen] = useState([])
  const [supplierstunden, setSupplierstunden] = useState([])
  const [supplierModal, setSupplierModal] = useState(null) // { wochentag, stunde, tagDatum }
  const [hueEintraege, setHueEintraege] = useState([])
  const [customFerien, setCustomFerien] = useState([])
  const [wetter, setWetter] = useState(null)   // { 'YYYY-MM-DD': { code, tmax, tmin } }

  // Schulferien berechnen (berechnete + benutzerdefinierte)
  const schulferien = useMemo(() => {
    const schuljahr = aktuellesSchuljahr?.bezeichnung ?? ''
    const bundesland = einstellungen?.bundesland ?? ''
    const berechnet = berechneSchulferien(schuljahr, bundesland)
    if (customFerien.length > 0) return mergeFerien(berechnet, customFerien)
    return berechnet
  }, [aktuellesSchuljahr?.bezeichnung, einstellungen?.bundesland, customFerien])

  const wocheDatum = getMontag(aktuelleWoche)

  // Daten der Woche (Mo–Fr) als lokale Datums-Strings
  const wochenDaten = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(wocheDatum + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return toLocalDateStr(d)
  })

  // Wettervorhersage laden – nur wenn aktiviert und Bundesland oder genauer Ort gesetzt ist.
  useEffect(() => {
    const an = einstellungen?.wetter_aktiv === '1'
    const bl = einstellungen?.bundesland
    const hatOrt = !!einstellungen?.wetter_lat
    if (!an || (!bl && !hatOrt)) { setWetter(null); return }
    let aktiv = true
    window.api.wetter?.getWoche?.(bl, wocheDatum)
      .then(w => { if (aktiv) setWetter(w) })
      .catch(() => { if (aktiv) setWetter(null) })
    return () => { aktiv = false }
  }, [wocheDatum, einstellungen?.bundesland, einstellungen?.wetter_lat, einstellungen?.wetter_aktiv])

  useEffect(() => {
    laden()
    if (aktuellesSchuljahr) {
      window.api.customFerien.getAll(aktuellesSchuljahr.id).then(setCustomFerien)
    }
  }, [aktuellesSchuljahr])

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
      const [pl, sup, hue] = await Promise.all([
        window.api.stundenPlanung.getWoche(datum),
        window.api.supplierstunden.getWoche(datum),
        window.api.stundenPlanung.getHueWoche(datum),
      ])
      setPlanungen(pl)
      setSupplierstunden(sup)
      setHueEintraege(hue)
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

  // Drag-Zustand aufräumen, falls außerhalb einer Zelle losgelassen wird.
  useEffect(() => {
    const clear = () => { setDragEintragId(null); setDragOverSlot(null) }
    window.addEventListener('dragend', clear)
    return () => window.removeEventListener('dragend', clear)
  }, [])

  const eintragFuerSlot = (wochentag, stundeId) =>
    stundenplanEintraege.find(e => e.wochentag === wochentag && e.stunde_id === stundeId)

  // Findet die Stunde in der angezeigten Woche statt? Bei Intervall > 1 nur in
  // Wochen, deren Abstand zum Anker-Montag ein Vielfaches des Intervalls ist.
  const aktivInWoche = (eintrag, montag = wocheDatum) => {
    const iv = eintrag?.wochen_intervall || 1
    if (iv <= 1 || !eintrag?.anker_datum) return true
    const diff = Math.round((new Date(montag + 'T00:00:00') - new Date(eintrag.anker_datum + 'T00:00:00')) / (7 * 86400000))
    return (((diff % iv) + iv) % iv) === 0
  }

  const supplierFuerSlot = (wochentag, stundeId) =>
    supplierstunden.find(s => s.wochentag === wochentag && s.stunde_id === stundeId)

  const handleSlotClick = (wochentag, stunde) => {
    const eintragRaw = eintragFuerSlot(wochentag, stunde.id)
    // In der normalen Ansicht zählt ein Eintrag nur in seiner aktiven Woche.
    const eintrag = eintragRaw && (bearbeitungsModus || aktivInWoche(eintragRaw)) ? eintragRaw : null
    const supplier = !eintrag ? supplierFuerSlot(wochentag, stunde.id) : null
    if (bearbeitungsModus) {
      setSlotModal({ wochentag, stundeId: stunde.id, eintrag })
    } else if (eintrag) {
      // Bei deaktivierter Planung nur ein schlankes Notiz-Modal — keine volle Planung
      if (planungAktiv) {
        setPlanungModal({ eintrag, wocheDatum })
      } else {
        setNotizModal({ eintrag, wocheDatum, wochentag })
      }
    } else if (supplier) {
      setPlanungModal({ supplier, wocheDatum, stunde })
    }
  }

  // ── Drag & Drop: Stunden im Bearbeitungsmodus zwischen Slots verschieben ──
  const dragAufraeumen = () => { setDragEintragId(null); setDragOverSlot(null) }

  const handleSlotDragStart = (e, eintrag) => {
    setDragEintragId(eintrag.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(eintrag.id)) // nötig, damit Drop (z.B. Firefox) feuert
  }

  const handleSlotDragOver = (e, wochentag, stundeId) => {
    if (!bearbeitungsModus || dragEintragId == null) return
    e.preventDefault() // ohne preventDefault feuert onDrop nicht
    e.dataTransfer.dropEffect = 'move'
    if (!dragOverSlot || dragOverSlot.wochentag !== wochentag || dragOverSlot.stundeId !== stundeId) {
      setDragOverSlot({ wochentag, stundeId })
    }
  }

  const handleSlotDrop = async (e, wochentag, stundeId) => {
    if (!bearbeitungsModus) return
    e.preventDefault()
    const id = dragEintragId
    dragAufraeumen()
    if (id == null) return
    await window.api.stundenplan.verschieben(id, wochentag, stundeId)
    await laden()
  }

  const handleSlotContextMenu = (e, wochentag, stunde) => {
    e.preventDefault()
    e.stopPropagation()
    const eintragRaw = eintragFuerSlot(wochentag, stunde.id)
    const eintrag = eintragRaw && (bearbeitungsModus || aktivInWoche(eintragRaw)) ? eintragRaw : null
    const supplier = supplierFuerSlot(wochentag, stunde.id)
    setKontextMenu({ x: e.clientX, y: e.clientY, wochentag, stunde, eintrag, supplier })
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

  const handleSlotSpeichern = async (fachId, opts = {}) => {
    if (!slotModal) return
    const { wochenIntervall = 1, ankerDatum = null } = opts
    if (slotModal.eintrag) {
      if (fachId) {
        await window.api.stundenplan.update(slotModal.eintrag.id, { fachId, wochenIntervall, ankerDatum })
      } else {
        await window.api.stundenplan.delete(slotModal.eintrag.id)
      }
    } else if (fachId) {
      await window.api.stundenplan.create({
        wochentag: slotModal.wochentag,
        stundeId: slotModal.stundeId,
        fachId,
        wochenIntervall,
        ankerDatum,
      })
    }
    await laden()
    setSlotModal(null)
  }

  const handleKontextAktion = async (aktion) => {
    const { wochentag, stunde, eintrag, supplier } = kontextMenu
    setKontextMenu(null)
    if (aktion === 'entfall' && eintrag) {
      const vorruecken = confirm('Sollen die Inhalte der nächsten Stunden vorgerückt werden?')
      // Ferien-Zeiträume ans Backend übergeben für die Vorrückung
      const ferienZeitraeume = schulferien ? [...(schulferien.ferien || []), ...(schulferien.feiertage || []).map(ft => ({ von: ft.datum, bis: ft.datum }))] : []
      await window.api.stundenPlanung.setEntfall(eintrag.id, wocheDatum, vorruecken, ferienZeitraeume)
      await ladenPlanungen()
      return
    } else if (aktion === 'entfall-supplier' && eintrag) {
      // Stunde entfällt und wird durch eine Supplierstunde ersetzt (kein Vorrücken).
      const ferienZeitraeume = schulferien ? [...(schulferien.ferien || []), ...(schulferien.feiertage || []).map(ft => ({ von: ft.datum, bis: ft.datum }))] : []
      await window.api.stundenPlanung.setEntfall(eintrag.id, wocheDatum, false, ferienZeitraeume)
      await ladenPlanungen()
      setSupplierModal({ wochentag, stunde, tagDatum: wochenDaten[wochentag - 1] })
      return
    } else if (aktion === 'entfall-aufheben' && eintrag) {
      await window.api.stundenPlanung.removeEntfall(eintrag.id, wocheDatum)
      await ladenPlanungen()
      return
    } else if (aktion === 'oeffnen' && eintrag) {
      navigiereZuNotentabelle(eintrag)
    } else if (aktion === 'planen' && eintrag) {
      if (planungAktiv) {
        setPlanungModal({ eintrag, wocheDatum })
      } else {
        setNotizModal({ eintrag, wocheDatum, wochentag })
      }
    } else if (aktion === 'bearbeiten') {
      setSlotModal({ wochentag, stundeId: stunde.id, eintrag })
    } else if (aktion === 'entfernen' && eintrag) {
      await window.api.stundenplan.delete(eintrag.id)
      await laden()
    } else if (aktion === 'supplier-erstellen') {
      setSupplierModal({ wochentag, stunde, tagDatum: wochenDaten[wochentag - 1] })
    } else if (aktion === 'supplier-loeschen' && supplier) {
      await window.api.supplierstunden.delete(supplier.id)
      await ladenPlanungen()
    }
  }

  const aktStunde = aktuelleStunde(stundenzeiten)
  const aktTag = aktuellerWochentag()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-ink-950 border-b border-paper-100 dark:border-ink-800/60">
        <div className="flex items-center gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center text-ink-500 hover:bg-paper-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
            onClick={() => setAktuelleWoche(w => w - 1)}
            title="Vorherige Woche"
          >
            ‹
          </button>
          <button
            className="px-2.5 py-1 text-xs text-ink-600 dark:text-ink-400 hover:bg-paper-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
            onClick={() => setAktuelleWoche(0)}
          >
            Heute
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center text-ink-500 hover:bg-paper-100 dark:hover:bg-ink-800 rounded-lg transition-colors"
            onClick={() => setAktuelleWoche(w => w + 1)}
            title="Nächste Woche"
          >
            ›
          </button>
        </div>
        <span className="text-xs font-semibold text-ink-500 dark:text-ink-400 px-2 py-0.5 rounded-md bg-paper-100 dark:bg-ink-800">
          KW {getKalenderwoche(wocheDatum)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-xs rounded-lg font-medium border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors"
            onClick={() => setExportModal('wahl')}
          >
            PDF exportieren
          </button>
          {bearbeitungsModus && (
            <button
              className="px-3 py-1.5 text-xs rounded-lg font-medium border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors"
              onClick={() => setZeitenModalOffen(true)}
              title="Stunden- und Pausenzeiten bearbeiten"
            >
              🕐 Zeiten
            </button>
          )}
          <button
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors
              ${bearbeitungsModus
                ? 'bg-coral-600 text-white hover:bg-coral-700'
                : 'border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800'}`}
            onClick={() => setBearbeitungsModus(!bearbeitungsModus)}
          >
            {bearbeitungsModus ? '✓ Fertig' : 'Bearbeiten'}
          </button>
        </div>
      </div>

      {/* Stundenplan-Raster */}
      <div className="flex-1 overflow-auto p-4 bg-paper-50 dark:bg-ink-950">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 72 }} />
            {WOCHENTAGE.map((_, i) => <col key={i} />)}
          </colgroup>
          <thead>
            {/* Zeile 1: Wochentag + Datum */}
            <tr>
              <th className="text-left px-2 py-2 text-xs font-medium text-ink-400 dark:text-ink-600">
                {bearbeitungsModus && (
                  <span className="text-xs text-ink-400 dark:text-ink-600">Zeiten</span>
                )}
              </th>
              {WOCHENTAGE.map((tag, i) => {
                const istHeute = aktuelleWoche === 0 && aktTag === i + 1
                const headerFerien = schulferien ? ferienFuerTag(wochenDaten[i], schulferien) : null
                return (
                  <th
                    key={i}
                    className={`px-2 py-2 ${headerFerien ? 'text-rose-400 dark:text-rose-500' : istHeute ? 'text-coral-600 dark:text-coral-400' : 'text-ink-500 dark:text-ink-400'}`}
                  >
                    <div className={wetterDetail ? 'flex items-center justify-center gap-1.5' : 'text-center'}>
                      <div className="text-center">
                        <div className={`text-sm font-semibold ${istHeute && !headerFerien ? 'underline underline-offset-4 decoration-coral-400' : ''}`}>
                          {tag}
                        </div>
                        <div className="mt-0.5 flex items-center justify-center gap-1">
                          <span className="text-[11px] font-normal opacity-70">
                            {new Date(wochenDaten[i] + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}
                          </span>
                          {!wetterDetail && <TagWetter w={wetter?.[wochenDaten[i]]} detail={false} />}
                        </div>
                      </div>
                      {wetterDetail && <TagWetter w={wetter?.[wochenDaten[i]]} detail />}
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
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium truncate cursor-pointer ${
                            typ === 'faellig'
                              ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                              : typ === 'erinnerung'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                              : 'bg-coral-100 dark:bg-coral-900/30 text-coral-600 dark:text-coral-400'
                          }`}
                          title={t.titel}
                          onClick={e => {
                            e.stopPropagation()
                            if (typ === 'termin') onTerminBadgeClick?.(t.id)
                            else onTodoBadgeClick?.(t.id)
                          }}
                        >
                          {typ === 'faellig'
                            ? `✓ ${t.titel}`
                            : typ === 'erinnerung'
                            ? `🔔 ${t.titel} – ${faelligkeitRelativ(t.faelligkeit, tagDatum)}`
                            : (() => {
                                const stHinweis = t.stunde_id
                                  ? (stundenzeiten.find(s => s.id === t.stunde_id)?.stunde + '. Std ')
                                  : (t.uhrzeit ? t.uhrzeit + ' ' : '')
                                return `◆ ${stHinweis ?? ''}${t.titel}`
                              })()}
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
                <tr key={stunde.id} className="border-t border-paper-200 dark:border-ink-800">
                  {/* Zeit-Spalte (read-only; Bearbeitung über den „Zeiten"-Dialog) */}
                  <td className="px-2 py-1 align-top">
                    <div className="text-right">
                      <div className={`text-xs font-medium ${istAktuelleStunde ? 'text-coral-600 dark:text-coral-400' : 'text-ink-500 dark:text-ink-500'}`}>
                        {stunde.stunde}. Std
                      </div>
                      <div className="text-xs text-ink-400 tabular-nums">{stunde.beginn}–{stunde.ende}</div>
                    </div>
                  </td>

                  {/* Wochentage */}
                  {WOCHENTAGE.map((_, tagIdx) => {
                    const wochentag = tagIdx + 1
                    const eintragRaw = eintragFuerSlot(wochentag, stunde.id)
                    const eintragAktiv = eintragRaw ? aktivInWoche(eintragRaw) : false
                    // Nicht-aktive (z. B. 14-tägige) Stunden: im Bearbeitungsmodus gedimmt zeigen,
                    // in der normalen Ansicht wie ein freier Slot behandeln.
                    const eintrag = eintragRaw && (bearbeitungsModus || eintragAktiv) ? eintragRaw : null
                    const pausiert = !!eintrag && !eintragAktiv
                    const istAktuell = istAktuelleStunde && aktuelleWoche === 0 && aktTag === wochentag
                    const planung = eintrag ? planungFuerEintrag(eintrag.id) : null
                    const entfallen = !!planung?.entfall
                    // Supplierstunde: freier Slot ODER Ersatz für eine entfallene Stunde
                    const supplier = (!eintrag || entfallen) ? supplierFuerSlot(wochentag, stunde.id) : null
                    const hueHier = hueEintraege.filter(h => h.wochentag === wochentag && h.stunde_id === stunde.id)
                    const stripMd = (s) => s?.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/^---+$/gm, '—').replace(/^- /gm, '• ')
                    const tooltipText = planung ? [planung.titel, planung.inhalt?.substring(0, 150)].filter(Boolean).map(stripMd).join('\n') : ''

                    // Ferien-Prüfung
                    const tagDatum = wochenDaten[tagIdx]
                    const ferienInfo = schulferien ? ferienFuerTag(tagDatum, schulferien) : null
                    const istFerien = !!ferienInfo

                    // Wetter zur Uhrzeit dieser Stunde (optional, transparent, rechts oben)
                    const zellenWetter = wetterZellen && !istFerien
                      ? wetter?.[tagDatum]?.stunden?.[stunde.beginn?.slice(0, 2)]
                      : null

                    // Drag & Drop (nur Bearbeitungsmodus)
                    const istDragOver = bearbeitungsModus && dragEintragId != null &&
                      dragOverSlot?.wochentag === wochentag && dragOverSlot?.stundeId === stunde.id
                    const istGezogen = bearbeitungsModus && !!eintrag && dragEintragId === eintrag.id

                    return (
                      <td
                        key={tagIdx}
                        className={`relative px-1 py-1 h-14 align-top border border-paper-200 dark:border-ink-800 transition-colors
                          ${istFerien ? 'bg-rose-50/60 dark:bg-rose-950/20' : ''}
                          ${istAktuell && !istFerien ? 'ring-2 ring-coral-400 ring-inset' : ''}
                          ${istDragOver ? 'ring-2 ring-coral-500 ring-inset bg-coral-50/60 dark:bg-coral-900/40' : ''}
                          ${istGezogen ? 'opacity-50' : ''}
                          ${!istFerien && bearbeitungsModus ? (eintrag ? 'cursor-move' : 'cursor-pointer') + ' hover:bg-coral-50/50 dark:hover:bg-coral-900/30' : ''}
                          ${!istFerien && !bearbeitungsModus && (eintrag || supplier) ? 'cursor-pointer hover:opacity-80' : ''}`}
                        draggable={bearbeitungsModus && !!eintrag}
                        onDragStart={eintrag ? (e => handleSlotDragStart(e, eintrag)) : undefined}
                        onDragOver={e => handleSlotDragOver(e, wochentag, stunde.id)}
                        onDrop={e => handleSlotDrop(e, wochentag, stunde.id)}
                        onDragEnd={dragAufraeumen}
                        onClick={() => !istFerien && handleSlotClick(wochentag, stunde)}
                        onContextMenu={e => istFerien ? e.preventDefault() : handleSlotContextMenu(e, wochentag, stunde)}
                        title={istFerien ? ferienInfo.name : tooltipText}
                      >
                        {zellenWetter && (
                          <span
                            className="pointer-events-none absolute top-2 right-2 flex items-center gap-0.5 text-[9px] leading-none z-10 tabular-nums text-ink-400 dark:text-ink-500"
                            title={wetterText(zellenWetter.code)}
                          >
                            <span className="text-[10px]">{wetterSymbol(zellenWetter.code)}</span>
                            {zellenWetter.temp != null && <span>{Math.round(zellenWetter.temp)}°</span>}
                          </span>
                        )}
                        {istFerien ? (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-[10px] font-medium text-rose-400 dark:text-rose-500 text-center leading-tight px-1">{ferienInfo.name}</span>
                          </div>
                        ) : supplier ? (
                          <SupplierInhalt supplier={supplier} />
                        ) : eintrag ? (
                          <SlotInhalt
                            eintrag={eintrag}
                            planungTitel={planung?.titel}
                            planungNotiz={planung?.inhalt ? stripMd(planung.inhalt).split('\n').filter(Boolean)[0] : null}
                            entfall={entfallen}
                            pausiert={pausiert}
                          />
                        ) : (
                          bearbeitungsModus && (
                            <div className="h-full rounded border border-dashed border-paper-200 dark:border-ink-700 flex items-center justify-center">
                              <span className="text-ink-600 dark:text-paper-300 dark:text-ink-600 text-lg font-light">+</span>
                            </div>
                          )
                        )}
                        {hueHier.length > 0 && (
                          <div className="flex gap-0.5 flex-wrap mt-0.5">
                            {hueHier.map(h => (
                              <span
                                key={h.id}
                                className="text-[8px] px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold leading-tight"
                                title={h.hue_text}
                              >
                                HÜ
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
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
                <div className="text-xs font-semibold text-ink-900 dark:text-paper-100 truncate">
                  {kontextMenu.eintrag.fach_name}
                </div>
                <div className="text-xs text-ink-400">{kontextMenu.eintrag.klasse_name}</div>
              </div>
              <div className="context-menu-separator" />
              {(() => {
                const pl = planungFuerEintrag(kontextMenu.eintrag.id)
                return pl?.entfall ? (
                  <div className="context-menu-item" onClick={() => handleKontextAktion('entfall-aufheben')}>
                    <span className="text-green-500">↩</span> Entfall aufheben
                  </div>
                ) : (
                  <div className="context-menu-item text-red-600 dark:text-red-400 group relative justify-between">
                    <span className="flex items-center gap-2"><span>⊘</span> Entfall</span>
                    <span className="text-ink-400 pl-2">▸</span>
                    {/* Untermenü beim Hover: ersatzlos vs. Supplierung */}
                    <div className="context-menu hidden group-hover:block left-full top-0 -mt-1.5">
                      <div className="context-menu-item" onClick={() => handleKontextAktion('entfall')}>
                        <span className="text-ink-400">∅</span> ersatzlos
                      </div>
                      <div className="context-menu-item" onClick={() => handleKontextAktion('entfall-supplier')}>
                        <span className="text-ink-400">↔</span> Durch Supplierung ersetzen
                      </div>
                    </div>
                  </div>
                )
              })()}
              <div className="context-menu-item" onClick={() => handleKontextAktion('planen')}>
                <span className="text-ink-400">{planungAktiv ? '📋' : '📝'}</span> {planungAktiv ? 'Stunde planen' : 'Notiz hinzufügen'}
              </div>
              <div className="context-menu-item" onClick={() => handleKontextAktion('oeffnen')}>
                <span className="text-ink-400">→</span> Zur Notentabelle
              </div>
              <div className="context-menu-item" onClick={() => handleKontextAktion('bearbeiten')}>
                <span className="text-ink-400">✎</span> Fach ändern
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => handleKontextAktion('entfernen')}
              >
                <span>✕</span> Eintrag entfernen
              </div>
            </>
          ) : kontextMenu.supplier ? (
            <>
              <div className="px-3 py-1.5 mb-0.5">
                <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 truncate">
                  {kontextMenu.supplier.fach_text || '—'}
                </div>
                <div className="text-xs text-ink-400">{kontextMenu.supplier.klasse_text || 'Supplierstunde'}</div>
              </div>
              <div className="context-menu-separator" />
              <div
                className="context-menu-item text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => handleKontextAktion('supplier-loeschen')}
              >
                <span>✕</span> Supplierstunde entfernen
              </div>
            </>
          ) : bearbeitungsModus ? (
            <div className="context-menu-item" onClick={() => handleKontextAktion('bearbeiten')}>
              <span className="text-ink-400">+</span> Stunde belegen
            </div>
          ) : (
            <div className="context-menu-item" onClick={() => handleKontextAktion('supplier-erstellen')}>
              <span className="text-orange-400">↔</span> Supplierstunde eintragen
            </div>
          )}
        </div>
      )}

      {/* Slot-Modal */}
      {slotModal && (
        <SlotModal
          slotModal={slotModal}
          wocheDatum={wocheDatum}
          alleFaecher={alleFaecher}
          klassen={klassen}
          onSpeichern={handleSlotSpeichern}
          onClose={() => setSlotModal(null)}
        />
      )}

      {/* Stunden-/Pausenzeiten-Editor */}
      {zeitenModalOffen && (
        <StundenzeitenModal
          onClose={() => setZeitenModalOffen(false)}
          onSaved={async () => { await laden() }}
        />
      )}

      {/* Planungs-Modal — nur wenn Planungsmodul aktiv */}
      {planungAktiv && planungModal && planungModal.eintrag && (
        <PlanungModal
          eintrag={planungModal.eintrag}
          wocheDatum={planungModal.wocheDatum}
          fachWochentage={stundenplanEintraege.filter(e => e.fach_id === planungModal.eintrag.fach_id).map(e => e.wochentag)}
          onClose={() => setPlanungModal(null)}
          onGespeichert={ladenPlanungen}
        />
      )}

      {/* Notiz-Modal — bei deaktiviertem Planungsmodul */}
      {notizModal && (
        <NotizModal
          eintrag={notizModal.eintrag}
          wochentag={notizModal.wochentag}
          wocheDatum={notizModal.wocheDatum}
          wochenDaten={wochenDaten}
          stundenzeiten={stundenzeiten}
          alleFaecher={alleFaecher}
          klassen={klassen}
          aktuelleplanung={planungFuerEintrag(notizModal.eintrag.id)}
          onClose={() => setNotizModal(null)}
          onGespeichert={async () => { await ladenPlanungen(); setNotizModal(null) }}
        />
      )}
      {planungModal && planungModal.supplier && (
        <SupplierPlanungModal
          supplier={planungModal.supplier}
          stunde={planungModal.stunde}
          wocheDatum={planungModal.wocheDatum}
          onClose={() => setPlanungModal(null)}
          onGespeichert={ladenPlanungen}
        />
      )}

      {/* Export: Auswahl Planung vs. Stundenplan */}
      {exportModal === 'wahl' && (
        <ExportWahlModal
          planungAktiv={planungAktiv}
          onPlanung={() => setExportModal('planung')}
          onStundenplan={async () => {
            setExportModal(null)
            await window.api.export.stundenplanPdf(aktuellesSchuljahr?.bezeichnung ?? '')
          }}
          onClose={() => setExportModal(null)}
        />
      )}

      {/* Export-Modal: Planung */}
      {exportModal === 'planung' && (
        <PlanungsExportModal onClose={() => setExportModal(null)} />
      )}

      {/* Supplier-Modal */}
      {supplierModal && (
        <SupplierModal
          wochentag={supplierModal.wochentag}
          stunde={supplierModal.stunde}
          tagDatum={supplierModal.tagDatum}
          wocheDatum={wocheDatum}
          onSpeichern={async (data) => {
            await window.api.supplierstunden.create(data)
            await ladenPlanungen()
            setSupplierModal(null)
          }}
          onClose={() => setSupplierModal(null)}
        />
      )}
    </div>
  )
}

// ─── Schlankes Notiz-Modal (bei deaktiviertem Planungsmodul) ─────────────────
function NotizModal({ eintrag, wochentag, wocheDatum, wochenDaten, stundenzeiten, alleFaecher, klassen, aktuelleplanung, onClose, onGespeichert }) {
  const fach    = alleFaecher.find(f => f.id === eintrag.fach_id)
  const klasse  = klassen.find(k => k.id === eintrag.klasse_id)
  const stunde  = stundenzeiten.find(s => s.id === eintrag.stunde_id)
  const tagDatum = wochenDaten?.[wochentag - 1]
  const farben  = getKlasseFarbe(eintrag.klasse_id)

  const [notiz, setNotiz] = useState(aktuelleplanung?.inhalt ?? '')
  const [saving, setSaving] = useState(false)

  const datumLabel = tagDatum
    ? new Date(tagDatum + 'T00:00:00').toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const speichern = async () => {
    setSaving(true)
    try {
      // Bestehende Werte (Titel, HÜ, Link etc.) erhalten — wir aktualisieren nur das Inhalt-Feld
      await window.api.stundenPlanung.save(
        eintrag.id,
        wocheDatum,
        aktuelleplanung?.titel ?? '',
        notiz.trim(),
        aktuelleplanung?.musizieren ? 1 : 0,
        aktuelleplanung?.hue_text ?? '',
        aktuelleplanung?.hue_frist_datum ?? null,
        aktuelleplanung?.link ?? '',
      )
      onGespeichert?.()
    } finally {
      setSaving(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) speichern()
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        {/* Kopf: Klasse + Fach + Datum */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold ${farben.bg} ${farben.text} flex-shrink-0`}
          >
            {(klasse?.name?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-ink-900 dark:text-white truncate">
              {klasse?.name ?? '—'}{fach && <span className="text-ink-500 font-normal"> · {fach.name}</span>}
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400 truncate">
              {datumLabel}{stunde && ` · ${stunde.stunde}. Stunde${stunde.beginn ? ` (${stunde.beginn})` : ''}`}
            </p>
          </div>
        </div>

        <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1.5">Notiz</label>
        <textarea
          className="input resize-none"
          rows={4}
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          placeholder="Kurze Notiz zu dieser Stunde…"
          autoFocus
          onKeyDown={handleKey}
        />
        <p className="text-[10px] text-ink-400 mt-1.5 mb-4">
          ⌘/Strg + Enter zum Speichern · Esc zum Schließen
        </p>

        <div className="flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button
            className="btn-primary flex-1"
            onClick={speichern}
            disabled={saving}
          >
            {saving ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SupplierPlanungModal({ supplier, wocheDatum, onClose, onGespeichert }) {
  const [titel, setTitel] = useState(supplier.titel ?? '')
  const [inhalt, setInhalt] = useState(supplier.inhalt ?? '')
  const [hueText, setHueText] = useState(supplier.hue_text ?? '')
  const [hueFristOption, setHueFristOption] = useState('naechste')
  const [hueFristDatum, setHueFristDatum] = useState('')
  const [link, setLink] = useState(supplier.link ?? '')

  useEffect(() => {
    if (supplier.hue_frist_datum) {
      const naechste = berechneFristDatum(wocheDatum, supplier.wochentag, 1)
      const uebnaechste = berechneFristDatum(wocheDatum, supplier.wochentag, 2)
      if (supplier.hue_frist_datum === naechste) setHueFristOption('naechste')
      else if (supplier.hue_frist_datum === uebnaechste) setHueFristOption('uebnaechste')
      else { setHueFristOption('datum'); setHueFristDatum(supplier.hue_frist_datum) }
    }
  }, [])

  const berechneHueFrist = () => {
    if (!hueText) return null
    if (hueFristOption === 'naechste') return berechneFristDatum(wocheDatum, supplier.wochentag, 1)
    if (hueFristOption === 'uebnaechste') return berechneFristDatum(wocheDatum, supplier.wochentag, 2)
    return hueFristDatum || null
  }

  const speichern = async () => {
    await window.api.supplierstunden.update(supplier.id, {
      fachText: supplier.fach_text,
      klasseText: supplier.klasse_text,
      notiz: supplier.notiz,
      titel: titel || null,
      inhalt: inhalt || null,
      hueText: hueText || null,
      hueFristDatum: berechneHueFrist(),
      link: link || null,
    })
    await onGespeichert()
    onClose()
  }

  const WOCHENTAG_NAME = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
  const datumStr = wocheDatum ? (() => {
    const d = new Date(wocheDatum + 'T00:00:00')
    d.setDate(d.getDate() + (supplier.wochentag - 1))
    return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })
  })() : ''

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box w-full max-w-xl"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="mb-4">
          <span className="text-xs text-ink-400">
            {supplier.fach_text || '—'} · {supplier.klasse_text || 'Supplierstunde'} · {WOCHENTAG_NAME[supplier.wochentag]}, {datumStr}
          </span>
          <input
            className="input text-base font-semibold mt-2"
            placeholder="Titel der Stunde…"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            autoFocus
          />
        </div>

        <textarea
          className="input flex-1 resize-none font-mono text-sm leading-relaxed"
          style={{ minHeight: 160 }}
          placeholder="Unterrichtsinhalt…"
          value={inhalt}
          onChange={e => setInhalt(e.target.value)}
        />

        <div className="mt-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Hausübung <span className="font-normal">(optional)</span></label>
            <textarea
              className="input resize-none text-sm"
              rows={2}
              placeholder="Aufgabe…"
              value={hueText}
              onChange={e => setHueText(e.target.value)}
            />
          </div>
          {hueText && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-500">Abgabe:</span>
              {['naechste', 'uebnaechste', 'datum'].map(opt => (
                <label key={opt} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="sup-hue-frist" value={opt} checked={hueFristOption === opt} onChange={() => setHueFristOption(opt)} className="accent-violet-600" />
                  <span className="text-xs text-ink-600 dark:text-ink-400">
                    {opt === 'naechste' ? 'Nächste Stunde' : opt === 'uebnaechste' ? 'Übernächste' : 'Datum'}
                  </span>
                </label>
              ))}
              {hueFristOption === 'datum' && (
                <input type="date" className="text-xs border border-paper-300 dark:border-ink-700 rounded px-1.5 py-0.5 bg-white dark:bg-ink-800 dark:text-paper-200" value={hueFristDatum} onChange={e => setHueFristDatum(e.target.value)} />
              )}
            </div>
          )}
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Link / Dateipfad <span className="font-normal">(optional)</span></label>
          <div className="flex gap-2">
            <input className="input flex-1 text-sm" placeholder="https://… oder C:\…" value={link} onChange={e => setLink(e.target.value)} />
            <button type="button" className="btn-secondary text-xs px-2 py-1 flex-shrink-0" onClick={async () => { const p = await window.api.dialog.openFile([]); if (p) setLink(p) }} title="Datei auswählen">📂</button>
            {link && (
              <button type="button" className="btn-secondary text-xs px-2 py-1 flex-shrink-0" onClick={() => window.api.shell?.open(link)} title="Öffnen">↗</button>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={speichern}>Speichern</button>
        </div>
      </div>
    </div>
  )
}

function SlotModal({ slotModal, wocheDatum, alleFaecher, klassen, onSpeichern, onClose }) {
  const [gewaehltFachId, setGewaehltFachId] = useState(slotModal.eintrag?.fach_id ?? '')

  // Wochen-Rhythmus. intervall === 0 ist der Sentinel für „Individuell".
  const initIv = slotModal.eintrag?.wochen_intervall || 1
  const PRESETS = [1, 2, 3, 4]
  const [intervall, setIntervall] = useState(PRESETS.includes(initIv) ? initIv : 0)
  const [customStr, setCustomStr] = useState(PRESETS.includes(initIv) ? '' : String(initIv))
  const istCustom = intervall === 0
  const effIv = istCustom ? Math.min(52, Math.max(2, parseInt(customStr) || 2)) : intervall

  const fachNachKlasse = {}
  for (const f of alleFaecher) {
    if (!fachNachKlasse[f.klasse_id]) fachNachKlasse[f.klasse_id] = []
    fachNachKlasse[f.klasse_id].push(f)
  }

  // Anker-Montag: bei unverändertem Intervall den bestehenden behalten (Parität
  // bleibt stabil), sonst die aktuell angezeigte Woche als „findet-statt"-Woche.
  const ankerBerechnen = (iv) => {
    if (iv <= 1) return null
    if (slotModal.eintrag && (slotModal.eintrag.wochen_intervall || 1) === iv && slotModal.eintrag.anker_datum) {
      return slotModal.eintrag.anker_datum
    }
    return wocheDatum
  }

  const speichern = () => {
    onSpeichern(
      gewaehltFachId ? parseInt(gewaehltFachId) : null,
      { wochenIntervall: effIv, ankerDatum: ankerBerechnen(effIv) },
    )
  }

  const kw = wocheDatum ? getKalenderwoche(wocheDatum) : null

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 className="text-base font-semibold text-ink-900 dark:text-white mb-4">
          {slotModal.eintrag ? 'Stunde bearbeiten' : 'Stunde belegen'}
        </h2>

        <div className="mb-5">
          <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wide mb-2">Fach & Klasse</label>
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

        {gewaehltFachId && (
          <div className="mb-5">
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wide mb-2">Wiederholung</label>
            <select
              className="input"
              value={istCustom ? 'custom' : String(intervall)}
              onChange={e => {
                const v = e.target.value
                if (v === 'custom') setIntervall(0)
                else setIntervall(parseInt(v))
              }}
            >
              <option value="1">Jede Woche</option>
              <option value="2">Alle 2 Wochen (14-tägig)</option>
              <option value="3">Alle 3 Wochen</option>
              <option value="4">Alle 4 Wochen</option>
              <option value="custom">Individuell…</option>
            </select>
            {istCustom && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-ink-600 dark:text-ink-400">Alle</span>
                <input
                  type="number"
                  min="2"
                  max="52"
                  className="input w-20"
                  value={customStr}
                  onChange={e => setCustomStr(e.target.value)}
                  placeholder="5"
                  autoFocus
                />
                <span className="text-sm text-ink-600 dark:text-ink-400">Wochen</span>
              </div>
            )}
            {effIv > 1 && (
              <p className="text-[11px] text-ink-400 mt-2">
                Findet in {kw ? `KW ${kw}` : 'dieser Woche'} statt und dann alle {effIv} Wochen.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          {slotModal.eintrag && (
            <button className="btn-danger" onClick={() => onSpeichern(null)}>Löschen</button>
          )}
          <button
            className="btn-primary flex-1"
            onClick={speichern}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  )
}

// Kompakter Editor für Stunden-/Pausenzeiten: Generator + editierbare Liste + Sammel-Speichern.
function StundenzeitenModal({ onClose, onSaved }) {
  const [zeilen, setZeilen] = useState([])
  const [startzeit, setStartzeit] = useState('07:55')
  const [stundenLaenge, setStundenLaenge] = useState('45')
  const [pausenLaenge, setPausenLaenge] = useState('5')
  const [anzahl, setAnzahl] = useState('8')
  const [grossePauseNach, setGrossePauseNach] = useState('')
  const [grossePauseLaenge, setGrossePauseLaenge] = useState('15')
  const [originalIds, setOriginalIds] = useState([])
  const [saving, setSaving] = useState(false)

  const toMin = (hhmm) => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
  const toHHMM = (min) => { const v = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}` }

  useEffect(() => {
    window.api.stundenzeiten.getAll().then(rows => {
      const zs = rows.map(r => ({ id: r.id, beginn: r.beginn, ende: r.ende }))
      setZeilen(zs)
      setOriginalIds(zs.map(z => z.id))
      if (zs[0]?.beginn) setStartzeit(zs[0].beginn)
      if (zs.length) setAnzahl(String(zs.length))
    }).catch(e => console.error('stundenzeiten laden:', e))
  }, [])

  const handleErzeugen = () => {
    if (zeilen.length > 0 && !confirm('Alle Zeiten neu berechnen? Bestehende Beginn-/Endzeiten werden überschrieben.')) return
    const n = Math.max(0, parseInt(anzahl) || 0)
    const len = Math.max(1, parseInt(stundenLaenge) || 45)
    const pause = Math.max(0, parseInt(pausenLaenge) || 0)
    const gpNach = parseInt(grossePauseNach) || 0
    const gpLen = Math.max(0, parseInt(grossePauseLaenge) || 0)
    let cursor = toMin(startzeit)
    const neu = []
    for (let i = 0; i < n; i++) {
      neu.push({ id: zeilen[i]?.id ?? null, beginn: toHHMM(cursor), ende: toHHMM(cursor + len) })
      cursor += len + ((gpNach && i + 1 === gpNach) ? gpLen : pause)
    }
    setZeilen(neu)
  }

  const handleChange = (idx, field, value) => setZeilen(prev => prev.map((z, i) => i === idx ? { ...z, [field]: value } : z))
  const handleRemove = (idx) => setZeilen(prev => prev.filter((_, i) => i !== idx))
  const handleAdd = () => setZeilen(prev => {
    const last = prev[prev.length - 1]
    const start = last ? toMin(last.ende) + (parseInt(pausenLaenge) || 0) : toMin(startzeit)
    return [...prev, { id: null, beginn: toHHMM(start), ende: toHHMM(start + (parseInt(stundenLaenge) || 45)) }]
  })

  const handleSpeichern = async () => {
    const gueltig = zeilen.filter(z => z.beginn && z.ende)
    const keptIds = new Set(gueltig.filter(z => z.id != null).map(z => z.id))
    const entfernt = originalIds.filter(id => !keptIds.has(id))
    if (entfernt.length > 0 && !confirm(`${entfernt.length} Stunde(n) werden entfernt – dort eingetragene Fächer und Planungen gehen dabei verloren. Fortfahren?`)) return
    setSaving(true)
    try {
      await window.api.stundenzeiten.saveAll(gueltig)
      await onSaved?.()
      onClose()
    } catch (e) {
      console.error('stundenzeiten speichern:', e)
      useStore.getState().pushToast?.('Speichern der Zeiten fehlgeschlagen.', 'error')
      setSaving(false)
    }
  }

  const GRID = '2rem 1fr 1fr 5rem 1.5rem'

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <h2 className="text-base font-semibold text-ink-900 dark:text-white mb-4">Stunden- &amp; Pausenzeiten</h2>

        {/* Generator */}
        <div className="rounded-lg border border-paper-200 dark:border-ink-700 p-3 mb-4">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wide mb-2">Automatisch erzeugen</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <label className="text-[11px] text-ink-500 dark:text-ink-400">Startzeit
              <input type="time" className="input mt-0.5" value={startzeit} onChange={e => setStartzeit(e.target.value)} />
            </label>
            <label className="text-[11px] text-ink-500 dark:text-ink-400">Stundenlänge (min)
              <input type="number" min="1" className="input mt-0.5" value={stundenLaenge} onChange={e => setStundenLaenge(e.target.value)} />
            </label>
            <label className="text-[11px] text-ink-500 dark:text-ink-400">Pausenlänge (min)
              <input type="number" min="0" className="input mt-0.5" value={pausenLaenge} onChange={e => setPausenLaenge(e.target.value)} />
            </label>
            <label className="text-[11px] text-ink-500 dark:text-ink-400">Anzahl Stunden
              <input type="number" min="1" max="20" className="input mt-0.5" value={anzahl} onChange={e => setAnzahl(e.target.value)} />
            </label>
            <label className="text-[11px] text-ink-500 dark:text-ink-400">Große Pause nach Std.
              <input type="number" min="0" className="input mt-0.5" value={grossePauseNach} onChange={e => setGrossePauseNach(e.target.value)} placeholder="—" />
            </label>
            <label className="text-[11px] text-ink-500 dark:text-ink-400">Große Pause (min)
              <input type="number" min="0" className="input mt-0.5" value={grossePauseLaenge} onChange={e => setGrossePauseLaenge(e.target.value)} />
            </label>
          </div>
          <button className="btn-secondary w-full mt-2 text-sm" onClick={handleErzeugen}>Zeiten erzeugen</button>
        </div>

        {/* Editierbare Liste */}
        <div className="grid gap-1 items-center text-[10px] font-semibold text-ink-400 uppercase tracking-wide mb-1" style={{ gridTemplateColumns: GRID }}>
          <span>Nr.</span><span>Beginn</span><span>Ende</span><span>Pause</span><span></span>
        </div>
        <div className="max-h-56 overflow-y-auto pr-1">
          {zeilen.map((z, i) => {
            const naechste = zeilen[i + 1]
            const pauseMin = naechste ? toMin(naechste.beginn) - toMin(z.ende) : null
            const ungueltig = !!z.beginn && !!z.ende && toMin(z.ende) <= toMin(z.beginn)
            const ueberlappt = pauseMin != null && pauseMin < 0
            return (
              <div key={z.id ?? `neu-${i}`} className="grid gap-1 items-center mb-1" style={{ gridTemplateColumns: GRID }}>
                <span className="text-xs text-ink-400 tabular-nums">{i + 1}.</span>
                <input type="time" className={`input ${ungueltig ? 'border-rose-400' : ''}`} value={z.beginn} onChange={e => handleChange(i, 'beginn', e.target.value)} />
                <input type="time" className={`input ${ungueltig ? 'border-rose-400' : ''}`} value={z.ende} onChange={e => handleChange(i, 'ende', e.target.value)} />
                <span className={`text-[11px] tabular-nums ${ueberlappt ? 'text-rose-500 font-semibold' : 'text-ink-400'}`}>
                  {pauseMin == null ? '—' : `${pauseMin} min`}
                </span>
                <button className="text-ink-400 hover:text-rose-500 text-sm leading-none" title="Stunde entfernen" onClick={() => handleRemove(i)}>✕</button>
              </div>
            )
          })}
        </div>
        <button className="text-xs text-ink-400 hover:text-coral-600 dark:hover:text-coral-400 mt-1 mb-3" onClick={handleAdd}>+ Stunde</button>

        <p className="text-[11px] text-ink-400 dark:text-ink-500 mb-3 leading-snug">
          Pausen ergeben sich aus den Lücken zwischen den Stunden. Entfernte Stunden löschen dort eingetragene Fächer und Planungen mit.
        </p>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}

function SupplierModal({ wochentag, stunde, tagDatum, wocheDatum, onSpeichern, onClose }) {
  const [fachText, setFachText] = useState('')
  const [klasseText, setKlasseText] = useState('')
  const [notiz, setNotiz] = useState('')

  const WOCHENTAG_NAME = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
  const datumAnzeige = new Date(tagDatum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })

  const speichern = async () => {
    await onSpeichern({
      wocheDatum,
      wochentag,
      stundeId: stunde.id,
      klasseText: klasseText.trim(),
      fachText: fachText.trim(),
      notiz: notiz.trim() || null,
    })
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <h2 className="text-base font-semibold text-ink-900 dark:text-white mb-1">Supplierstunde</h2>
        <p className="text-xs text-ink-400 mb-4">
          {WOCHENTAG_NAME[wochentag]}, {datumAnzeige} · {stunde.stunde}. Stunde ({stunde.beginn})
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Fach</label>
            <input
              className="input"
              value={fachText}
              onChange={e => setFachText(e.target.value)}
              placeholder="z.B. Mathematik"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && speichern()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Klasse</label>
            <input
              className="input"
              value={klasseText}
              onChange={e => setKlasseText(e.target.value)}
              placeholder="z.B. 3A"
              onKeyDown={e => e.key === 'Enter' && speichern()}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">
              Notiz <span className="font-normal text-ink-400">(optional)</span>
            </label>
            <input
              className="input"
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              placeholder="z.B. Vertretung für Mag. Muster"
              onKeyDown={e => e.key === 'Enter' && speichern()}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={speichern} disabled={!fachText.trim()}>
            Eintragen
          </button>
        </div>
      </div>
    </div>
  )
}

// Auswahl-Dialog: Was soll als PDF exportiert werden?
function ExportWahlModal({ planungAktiv, onPlanung, onStundenplan, onClose }) {
  const [busy, setBusy] = useState(false)

  const stundenplanExport = async () => {
    setBusy(true)
    try { await onStundenplan() } finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">PDF exportieren</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-3">
          {/* Stundenplan */}
          <button
            className="w-full text-left rounded-xl border border-paper-200 dark:border-ink-700 hover:border-coral-400 dark:hover:border-coral-500 hover:bg-coral-50/50 dark:hover:bg-coral-900/20 transition-colors p-4 flex items-start gap-3 disabled:opacity-50"
            onClick={stundenplanExport}
            disabled={busy}
          >
            <span className="text-2xl leading-none mt-0.5">🗓️</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink-900 dark:text-white">Stundenplan exportieren</span>
              <span className="block text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                Der Wochenplan als optisch aufbereitete PDF im Querformat – zum Ausdrucken und Aufhängen.
              </span>
            </span>
          </button>

          {/* Planung */}
          <button
            className="w-full text-left rounded-xl border border-paper-200 dark:border-ink-700 hover:border-coral-400 dark:hover:border-coral-500 hover:bg-coral-50/50 dark:hover:bg-coral-900/20 transition-colors p-4 flex items-start gap-3 disabled:opacity-50"
            onClick={onPlanung}
            disabled={busy}
          >
            <span className="text-2xl leading-none mt-0.5">📋</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink-900 dark:text-white">Planung exportieren</span>
              <span className="block text-xs text-ink-500 dark:text-ink-400 mt-0.5">
                Die {planungAktiv ? 'geplanten' : 'notierten'} Unterrichtsinhalte ausgewählter Wochen als PDF.
              </span>
            </span>
          </button>
        </div>

        {busy && <p className="text-xs text-ink-400 text-center mt-4">Stundenplan wird erstellt…</p>}
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
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">Planung als PDF exportieren</h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose}>✕</button>
        </div>

        {laden ? (
          <p className="text-sm text-ink-400 text-center py-6">Laden…</p>
        ) : wochen.length === 0 ? (
          <p className="text-sm text-ink-400 text-center py-6">Keine Planungen vorhanden.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wide">Wochen</span>
              <div className="flex gap-2">
                <button className="text-xs text-coral-500 hover:text-coral-700" onClick={() => setAusgewaehlt(wochen)}>Alle</button>
                <button className="text-xs text-ink-400 hover:text-ink-600" onClick={() => setAusgewaehlt([])}>Keine</button>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1 mb-4 border border-paper-100 dark:border-ink-800 rounded-lg p-2">
              {wochen.map(datum => (
                <label key={datum} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-paper-50 dark:hover:bg-ink-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ausgewaehlt.includes(datum)}
                    onChange={() => toggleWoche(datum)}
                    className="accent-coral-600"
                  />
                  <span className="text-sm text-ink-700 dark:text-paper-300">{wocheLabel(datum)}</span>
                </label>
              ))}
            </div>

            <div className="mb-5">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wide block mb-2">Format</span>
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
                        ? 'border-coral-400 bg-coral-50 text-coral-700 dark:bg-coral-900/40 dark:text-coral-300'
                        : 'border-paper-200 dark:border-ink-700 text-ink-500 hover:border-paper-300'
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
