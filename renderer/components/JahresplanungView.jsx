import { useState, useEffect, useCallback, useMemo } from 'react'
import useStore from '../store/useStore'
import { berechneSchulferien, ferienFuerTag } from '../utils/schulferien'

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

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatDatum(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${parseInt(d)}.${parseInt(m)}.`
}

// ─── Monats-Kalender (rechte Seite) ──────────────────────────────────────────
function MonatKalender({ year, month, abschnitte, aktivesFach, dragOverDate, onDrop, onDragOverDay, onDragLeaveDay, onAbschnittKlick, resizingId, onResizeStart, schulferien }) {
  const ersterTag = new Date(year, month, 1)
  const letzterTag = new Date(year, month + 1, 0)
  const startDow = (ersterTag.getDay() + 6) % 7

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

  // Bei Resize: Vorschau-Bereich berechnen
  const resizingAbschnitt = resizingId ? abschnitte.find(a => a.id === resizingId) : null
  const previewVon = resizingAbschnitt?.datum_von ?? null
  const previewBis = (resizingAbschnitt && dragOverDate && dragOverDate >= previewVon) ? dragOverDate : null

  const getAbschnittFuerTag = (d) => {
    if (!d) return null
    const dateStr = toDateStr(year, month, d)
    return abschnitte.find(a => a.datum_von && a.datum_bis && dateStr >= a.datum_von && dateStr <= a.datum_bis) ?? null
  }

  // Vorschau-Status für einen Tag bestimmen
  const getPreviewStatus = (dateStr) => {
    if (!resizingAbschnitt || !previewBis || !dateStr) return null
    const origVon = resizingAbschnitt.datum_von
    const origBis = resizingAbschnitt.datum_bis
    const inOriginal = dateStr >= origVon && dateStr <= origBis
    const inPreview = dateStr >= previewVon && dateStr <= previewBis

    if (inPreview && !inOriginal) return 'extend'    // neu dazu (Verlängerung)
    if (inOriginal && !inPreview) return 'shrink'     // wird entfernt (Verkürzung)
    if (inPreview && dateStr === previewBis) return 'new-end' // neues Ende
    return null
  }

  const getFarbe = (a) => a.farbe ?? aktivesFach?.farbe ?? '#6366f1'

  return (
    <div className="min-w-0">
      <div className="text-xs font-semibold text-ink-700 dark:text-paper-300 mb-1.5 px-0.5">
        {MONATS_NAMEN[month]} {year}
      </div>
      <div className="grid grid-cols-7 gap-px mb-0.5">
        {WOCHENTAG_KURZ.map(t => (
          <div key={t} className={`text-center text-[10px] font-medium pb-0.5 ${
            t === 'Sa' || t === 'So' ? 'text-ink-400 dark:text-ink-600' : 'text-ink-400 dark:text-ink-500'
          }`}>{t}</div>
        ))}
      </div>
      <div className="flex flex-col gap-px">
        {wochen.map((woche, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-px">
            {woche.map((d, di) => {
              const abschnitt = getAbschnittFuerTag(d)
              const dateStr = d ? toDateStr(year, month, d) : null
              const preview = getPreviewStatus(dateStr)
              const istResizing = abschnitt && resizingId === abschnitt?.id

              // Bei Resize: virtuelle Start/Ende basierend auf Vorschau
              const effektivBis = (istResizing && previewBis) ? previewBis : abschnitt?.datum_bis
              const farbe = abschnitt ? getFarbe(abschnitt) : (preview === 'extend' && resizingAbschnitt ? getFarbe(resizingAbschnitt) : null)

              const istStart = abschnitt && dateStr === abschnitt.datum_von
              const istEnde = abschnitt && dateStr === effektivBis
              const istOrigEnde = abschnitt && dateStr === abschnitt.datum_bis
              const istWochenende = di >= 5
              const ferien = d && schulferien ? ferienFuerTag(dateStr, schulferien) : null
              const istDragOver = d && dateStr === dragOverDate && !resizingId
              const istErsteSichtbareWochenstelle = abschnitt && (
                istStart ||
                (di === 0 && d && dateStr > abschnitt.datum_von)
              )

              // Vorschau-Styles
              const isExtendPreview = preview === 'extend'
              const isShrinkPreview = preview === 'shrink'
              const isNewEnd = preview === 'new-end'
              const previewFarbe = resizingAbschnitt ? getFarbe(resizingAbschnitt) : null

              // Bestimme ob dieser Tag im Resize-Abschnitt (erweitert) liegt
              const inPreviewRange = istResizing && previewBis && dateStr && dateStr >= previewVon && dateStr <= previewBis
              const previewStart = inPreviewRange && dateStr === previewVon
              const previewEnd = inPreviewRange && dateStr === previewBis

              return (
                <div
                  key={di}
                  onDragOver={(e) => {
                    if (!d) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    onDragOverDay(dateStr)
                  }}
                  onDragLeave={() => d && onDragLeaveDay()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (d) onDrop(dateStr, e)
                  }}
                  onClick={() => abschnitt && d && onAbschnittKlick(abschnitt)}
                  className={`relative h-7 flex items-center justify-center select-none
                    ${!d ? 'pointer-events-none' : 'cursor-pointer'}
                    ${istWochenende ? 'opacity-60' : ''}
                    ${ferien && !abschnitt ? 'bg-rose-50 dark:bg-rose-950/30' : ''}
                    ${!abschnitt && !isExtendPreview && !ferien && d && !istDragOver ? 'hover:bg-paper-100 dark:hover:bg-ink-800 rounded' : ''}
                    ${istDragOver && !abschnitt ? 'ring-2 ring-coral-400 ring-inset rounded bg-coral-50 dark:bg-coral-900/30' : ''}
                    ${isShrinkPreview ? 'opacity-40' : ''}
                  `}
                  style={{
                    // Bestehender Abschnitt (nicht geschrumpft)
                    ...(abschnitt && d && !isShrinkPreview ? {
                      backgroundColor: farbe + '33',
                      borderRadius: istStart && previewEnd ? '6px'
                        : istStart ? '6px 0 0 6px'
                        : previewEnd && istResizing ? '0 6px 6px 0'
                        : istEnde && !istResizing ? '0 6px 6px 0'
                        : istStart && istEnde ? '6px'
                        : '0',
                    } : {}),
                    // Geschrumpfter Bereich: durchgestrichen-Optik
                    ...(isShrinkPreview && d ? {
                      backgroundColor: previewFarbe + '15',
                      borderRadius: '0',
                    } : {}),
                    // Erweiterungs-Vorschau
                    ...(isExtendPreview && d ? {
                      backgroundColor: previewFarbe + '25',
                      borderRadius: isNewEnd ? '0 6px 6px 0' : '0',
                      outline: `1px dashed ${previewFarbe}80`,
                      outlineOffset: '-1px',
                    } : {}),
                  }}
                  title={abschnitt ? abschnitt.titel : ferien ? ferien.name : ''}
                >
                  {/* Abschnitts-Balken – Originalbereich */}
                  {abschnitt && d && !isShrinkPreview && (
                    <div
                      className="absolute inset-x-0 bottom-1 h-1 pointer-events-none"
                      style={{
                        backgroundColor: farbe,
                        borderRadius: istStart && previewEnd ? '4px'
                          : istStart ? '4px 0 0 4px'
                          : previewEnd && istResizing ? '0 4px 4px 0'
                          : istEnde && !istResizing ? '0 4px 4px 0'
                          : '0',
                        marginLeft: istStart ? '2px' : '0',
                        marginRight: (previewEnd && istResizing) || (istEnde && !istResizing) ? '2px' : '0',
                      }}
                    />
                  )}
                  {/* Geschrumpfter Bereich: gestrichelte Linie */}
                  {isShrinkPreview && d && (
                    <div
                      className="absolute inset-x-0 bottom-1 h-1 pointer-events-none"
                      style={{
                        backgroundImage: `repeating-linear-gradient(90deg, ${previewFarbe}60 0 3px, transparent 3px 6px)`,
                        borderRadius: dateStr === resizingAbschnitt?.datum_bis ? '0 4px 4px 0' : '0',
                        marginRight: dateStr === resizingAbschnitt?.datum_bis ? '2px' : '0',
                      }}
                    />
                  )}
                  {/* Erweiterungs-Vorschau: gestrichelter Balken */}
                  {isExtendPreview && d && (
                    <div
                      className="absolute inset-x-0 bottom-1 h-1 pointer-events-none"
                      style={{
                        backgroundImage: `repeating-linear-gradient(90deg, ${previewFarbe} 0 3px, transparent 3px 6px)`,
                        borderRadius: isNewEnd ? '0 4px 4px 0' : '0',
                        marginRight: isNewEnd ? '2px' : '0',
                      }}
                    />
                  )}
                  {/* Neues-Ende-Marker */}
                  {isNewEnd && d && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-0.5 pointer-events-none z-20"
                      style={{ backgroundColor: previewFarbe }}
                    />
                  )}
                  {/* Resize-Handle am Ende des Abschnitts */}
                  {istOrigEnde && d && (!resizingId || resizingId === abschnitt.id) && (
                    <div
                      draggable
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => {
                        e.stopPropagation()
                        e.dataTransfer.setData('text/plain', `resize:${abschnitt.id}`)
                        e.dataTransfer.effectAllowed = 'move'
                        const c = document.createElement('canvas')
                        c.width = 1; c.height = 1
                        e.dataTransfer.setDragImage(c, 0, 0)
                        onResizeStart(abschnitt.id)
                      }}
                      className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize z-30"
                      title="Ziehen zum Verlängern/Verkürzen"
                    >
                      <div className="absolute right-0.5 top-1 bottom-1 w-1 rounded-full bg-current opacity-0 hover:opacity-40 transition-opacity"
                        style={{ color: farbe }} />
                    </div>
                  )}
                  {d && (
                    <span className={`text-[11px] relative z-10 w-5 h-5 flex items-center justify-center rounded-full
                      ${abschnitt || isExtendPreview
                        ? 'text-ink-700 dark:text-paper-200 font-medium'
                        : ferien
                          ? 'text-rose-400 dark:text-rose-500'
                          : 'text-ink-600 dark:text-ink-400'
                      }
                      ${isShrinkPreview ? 'line-through text-ink-400' : ''}`}
                    >
                      {d}
                    </span>
                  )}
                  {istErsteSichtbareWochenstelle && !isShrinkPreview && (
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

// ─── Abschnitt-Karte (linke Seite) ──────────────────────────────────────────
function AbschnittKarte({ abschnitt, aktivesFach, istSelektiert, onClick, onCalendarDragStart, onListDragStart, onListDrop, listDragOverId }) {
  const farbe = abschnitt.farbe ?? aktivesFach?.farbe ?? '#6366f1'
  const istGeplant = !!abschnitt.datum_von
  const istDropTarget = listDragOverId === abschnitt.id

  return (
    <div
      draggable
      onDragStart={(e) => {
        // Drag nicht starten wenn aus einem Input/Textarea
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          e.preventDefault()
          return
        }
        if (!istGeplant) onCalendarDragStart(e, abschnitt)
        onListDragStart(e, abschnitt)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onListDrop(abschnitt.id, true)
      }}
      onDragLeave={() => onListDrop(null, true)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onListDrop(abschnitt.id, false)
      }}
      onClick={() => onClick(abschnitt)}
      className={`group relative rounded-lg border transition-all cursor-grab active:cursor-grabbing
        ${istSelektiert
          ? 'border-coral-400 dark:border-coral-500 bg-coral-50/50 dark:bg-coral-900/20 shadow-sm'
          : 'border-paper-200 dark:border-ink-700 hover:border-paper-300 dark:hover:border-ink-600 bg-white dark:bg-ink-900'
        }
        ${istDropTarget ? 'ring-2 ring-coral-400 ring-inset scale-[1.02]' : ''}
      `}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <svg className="w-3 h-3 text-ink-600 dark:text-paper-300 dark:text-ink-600 flex-shrink-0 mt-1.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
          <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
          <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
        </svg>
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1"
          style={{ backgroundColor: farbe }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-ink-800 dark:text-paper-100 truncate">
            {abschnitt.titel || 'Ohne Titel'}
          </div>
          {istGeplant ? (
            <div className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5">
              {formatDatum(abschnitt.datum_von)} – {formatDatum(abschnitt.datum_bis)}
            </div>
          ) : (
            <div className="text-[11px] text-ink-400 dark:text-ink-500 mt-0.5 italic">
              Noch nicht eingeplant
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────
export default function JahresplanungView() {
  const { aktivesFach, einstellungen, aktuellesSchuljahr, pushToast } = useStore()
  const [abschnitte, setAbschnitte] = useState([])
  const [selektiert, setSelektiert] = useState(null)
  const [istNeu, setIstNeu] = useState(false)
  const [loeschenBestaetigung, setLoeschenBestaetigung] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [importQuellen, setImportQuellen] = useState([])
  const [importiertVon, setImportiertVon] = useState(null)

  // Formular
  const [formTitel, setFormTitel] = useState('')
  const [formFarbe, setFormFarbe] = useState(null)
  const [formInhalt, setFormInhalt] = useState('')

  // Materialien
  const [materialien, setMaterialien] = useState({ root: false, ordner: null, dateien: [], links: [] })
  const [linkForm, setLinkForm] = useState({ open: false, url: '', anzeigename: '', beschreibung: '' })
  const [metaEdit, setMetaEdit] = useState(null) // { typ, ref, id, anzeigename, beschreibung }
  const [exportLaeuft, setExportLaeuft] = useState(false)

  // Drag & Drop (Kalender)
  const [dragOverDate, setDragOverDate] = useState(null)
  const [dragAbschnittId, setDragAbschnittId] = useState(null)
  const [resizingId, setResizingId] = useState(null)

  // Drag & Drop (Listen-Reorder)
  const [listDragId, setListDragId] = useState(null)
  const [listDragOverId, setListDragOverId] = useState(null)

  // Schuljahr + Ferien: folgen automatisch dem aktiven Schuljahr (Wechsel/Vorrücken, Dropdown)
  const schuljahr = aktuellesSchuljahr?.bezeichnung ?? ''
  const bundesland = einstellungen?.bundesland ?? ''
  const startJahr = parseInt(schuljahr.split('/')[0]) || new Date().getFullYear()
  const schulferien = useMemo(() => berechneSchulferien(schuljahr, bundesland), [schuljahr, bundesland])
  const monate = [8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6].map(m => ({
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

  // ─── Materialien ─────────────────────────────────────────────────────────
  const ladeMaterialien = useCallback(async () => {
    if (!selektiert?.id) { setMaterialien({ root: false, ordner: null, dateien: [], links: [] }); return }
    setMaterialien(await window.api.materialien.list(selektiert.id))
  }, [selektiert?.id])

  useEffect(() => { ladeMaterialien(); setLinkForm({ open: false, url: '', anzeigename: '', beschreibung: '' }); setMetaEdit(null) }, [selektiert?.id])

  // Stellt sicher, dass ein Materialordner gewählt ist (fragt bei Bedarf).
  const stelleRootSicher = async () => {
    if (einstellungen?.material_root_pfad) return true
    const p = await window.api.materialien.waehleRoot()
    if (!p) { pushToast('Kein Materialordner gewählt.', 'info'); return false }
    useStore.setState({ einstellungen: await window.api.einstellungen.getAll() })
    return true
  }

  const handleOrdnerOeffnen = async () => {
    if (!selektiert || !(await stelleRootSicher())) return
    const r = await window.api.materialien.ordnerOeffnen(selektiert.id)
    if (!r?.ok) pushToast('Ordner konnte nicht geöffnet werden.', 'error')
    else ladeMaterialien()
  }

  const handleDateienHinzufuegen = async () => {
    if (!selektiert || !(await stelleRootSicher())) return
    const r = await window.api.materialien.dateienHinzufuegen(selektiert.id)
    if (r?.ok) ladeMaterialien()
    else if (r?.grund === 'fs') pushToast('Dateien konnten nicht kopiert werden.', 'error')
  }

  const handleLinkSpeichern = async () => {
    if (!selektiert || !linkForm.url.trim()) return
    await window.api.materialien.linkHinzufuegen(selektiert.id, {
      url: linkForm.url.trim(), anzeigename: linkForm.anzeigename.trim() || null, beschreibung: linkForm.beschreibung.trim() || null,
    })
    setLinkForm({ open: false, url: '', anzeigename: '', beschreibung: '' })
    ladeMaterialien()
  }

  const handleMaterialOeffnen = async (m) => {
    if (m.typ === 'datei' && m.fehlt) return
    const r = await window.api.materialien.oeffnen({ abschnittId: selektiert.id, typ: m.typ, ref: m.ref })
    if (!r?.ok) pushToast('Konnte nicht geöffnet werden.', 'error')
  }

  const handleMetaSpeichern = async () => {
    if (!metaEdit) return
    await window.api.materialien.metaSetzen({
      abschnittId: selektiert.id, typ: metaEdit.typ, ref: metaEdit.ref, id: metaEdit.id,
      anzeigename: metaEdit.anzeigename.trim() || null, beschreibung: metaEdit.beschreibung.trim() || null,
    })
    setMetaEdit(null)
    ladeMaterialien()
  }

  const handleMaterialEntfernen = async (m) => {
    await window.api.materialien.entfernen({ abschnittId: selektiert.id, typ: m.typ, ref: m.ref, id: m.id })
    ladeMaterialien()
  }

  const handleExport = async () => {
    if (!aktivesFach) return
    setExportLaeuft(true)
    try { await window.api.export.jahresplanungPdf(aktivesFach.id) }
    finally { setExportLaeuft(false) }
  }

  // ─── Abschnitt selektieren / bearbeiten ──────────────────────────────────
  const abschnittWaehlen = (abschnitt) => {
    setSelektiert(abschnitt)
    setIstNeu(false)
    setLoeschenBestaetigung(false)
    setFormTitel(abschnitt.titel)
    setFormFarbe(abschnitt.farbe)
    setFormInhalt(abschnitt.inhalt ?? '')
  }

  const neuOeffnen = () => {
    setSelektiert(null)
    setIstNeu(true)
    setLoeschenBestaetigung(false)
    setFormTitel('')
    setFormFarbe(null)
    setFormInhalt('')
  }

  const panelSchliessen = () => {
    setSelektiert(null)
    setIstNeu(false)
    setLoeschenBestaetigung(false)
  }

  const handleSpeichern = async () => {
    if (!aktivesFach) return
    let zielId = selektiert?.id
    if (istNeu) {
      // Nur Titel, Farbe, Inhalt – ohne Datum (wird per Drag gesetzt)
      zielId = await window.api.jahresplanung.create({
        fachId: aktivesFach.id,
        titel: formTitel.trim(),
        inhalt: formInhalt,
        datumVon: null,
        datumBis: null,
        farbe: formFarbe,
      })
    } else if (selektiert) {
      const res = await window.api.jahresplanung.update(selektiert.id, {
        titel: formTitel.trim(),
        inhalt: formInhalt,
        datumVon: selektiert.datum_von,
        datumBis: selektiert.datum_bis,
        farbe: formFarbe,
      })
      if (res?.ordnerWarnung) pushToast(res.ordnerWarnung, 'error')
    }
    // Abschnitte neu laden und den gespeicherten Abschnitt selektiert lassen,
    // damit die Materialien-Sektion (auch für neue Abschnitte) direkt nutzbar ist.
    const rows = await window.api.jahresplanung.getAll(aktivesFach.id)
    setAbschnitte(rows)
    const ziel = rows.find(a => a.id === zielId)
    if (ziel) {
      setSelektiert(ziel); setIstNeu(false); setLoeschenBestaetigung(false)
      setFormTitel(ziel.titel); setFormFarbe(ziel.farbe); setFormInhalt(ziel.inhalt ?? '')
    } else {
      panelSchliessen()
    }
  }

  const handleLoeschen = async () => {
    if (!loeschenBestaetigung) { setLoeschenBestaetigung(true); return }
    if (!selektiert) return
    await window.api.jahresplanung.delete(selektiert.id)
    await ladeAbschnitte()
    panelSchliessen()
  }

  // Abschnitt aus Kalender entfernen (Daten löschen, nicht den Abschnitt selbst)
  const handleAusKalenderEntfernen = async () => {
    if (!selektiert) return
    await window.api.jahresplanung.update(selektiert.id, {
      titel: selektiert.titel,
      inhalt: selektiert.inhalt,
      datumVon: null,
      datumBis: null,
      farbe: selektiert.farbe,
    })
    await ladeAbschnitte()
    panelSchliessen()
  }

  // ─── Drag & Drop: Abschnitt → Kalender ──────────────────────────────────
  const handleDragStart = (e, abschnitt) => {
    setDragAbschnittId(abschnitt.id)
    e.dataTransfer.setData('text/plain', `abschnitt:${abschnitt.id}`)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverDay = (dateStr) => {
    setDragOverDate(dateStr)
  }

  const handleDragLeaveDay = () => {
    // Wir löschen nicht sofort – onDragOver vom nächsten Tag überschreibt
  }

  const handleDrop = async (dateStr, e) => {
    setDragOverDate(null)

    // dataTransfer auslesen um Resize vs. normalen Drop zu unterscheiden
    const transferData = e?.dataTransfer?.getData('text/plain') ?? ''

    // Resize-Drop
    if (transferData.startsWith('resize:') || resizingId) {
      const id = resizingId || parseInt(transferData.split(':')[1])
      const abschnitt = abschnitte.find(a => a.id === id)
      if (abschnitt && dateStr >= abschnitt.datum_von) {
        await window.api.jahresplanung.update(id, {
          titel: abschnitt.titel,
          inhalt: abschnitt.inhalt,
          datumVon: abschnitt.datum_von,
          datumBis: dateStr,
          farbe: abschnitt.farbe,
        })
        await ladeAbschnitte()
      }
      setResizingId(null)
      setDragAbschnittId(null)
      return
    }

    // Normaler Drop (Abschnitt einplanen)
    let id = dragAbschnittId
    if (!id && transferData.startsWith('abschnitt:')) {
      id = parseInt(transferData.split(':')[1])
    }
    if (!id) return
    const abschnitt = abschnitte.find(a => a.id === id)
    if (!abschnitt) { setDragAbschnittId(null); return }

    const datumBis = addDays(dateStr, 6) // 1 Woche Standard
    await window.api.jahresplanung.update(abschnitt.id, {
      titel: abschnitt.titel,
      inhalt: abschnitt.inhalt,
      datumVon: dateStr,
      datumBis: datumBis,
      farbe: abschnitt.farbe,
    })
    await ladeAbschnitte()
    setDragAbschnittId(null)
  }

  // ─── Listen-Drag: Abschnitte vertauschen ─────────────────────────────────
  const handleListDragStart = (e, abschnitt) => {
    setListDragId(abschnitt.id)
    e.dataTransfer.setData('text/plain', `list:${abschnitt.id}`)
  }

  const handleListDrop = async (targetId, hoverOnly) => {
    if (hoverOnly) {
      setListDragOverId(targetId)
      return
    }
    // Tatsächlicher Drop: vertauschen
    const sourceId = listDragId
    setListDragOverId(null)
    setListDragId(null)
    if (!sourceId || !targetId || sourceId === targetId) return
    await window.api.jahresplanung.swap(sourceId, targetId)
    await ladeAbschnitte()
  }

  // Global dragend listener – aufräumen
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDragAbschnittId(null)
      setResizingId(null)
      setDragOverDate(null)
      setListDragId(null)
      setListDragOverId(null)
    }
    window.addEventListener('dragend', handleGlobalDragEnd)
    return () => window.removeEventListener('dragend', handleGlobalDragEnd)
  }, [])

  // ─── Import ──────────────────────────────────────────────────────────────
  const handleImportOeffnen = async () => {
    const quellen = await window.api.jahresplanung.getFaecherMitPlan()
    setImportQuellen(quellen.filter(f => f.id !== aktivesFach?.id))
    setImportModal(true)
  }

  const handleImport = async (quelle) => {
    // Aus einer Vorlage → ohne Termine (Abschnitte landen unplatziert); aus echter Klasse → mit Terminen.
    const ohneTermine = quelle.ist_vorlage === 1
    await window.api.jahresplanung.importVonFach(quelle.id, aktivesFach.id, { ohneTermine })
    await ladeAbschnitte()
    setImportModal(false)
    setImportiertVon(quelle.id)
    setTimeout(() => setImportiertVon(null), 3000)
  }

  const panelOffen = istNeu || selektiert !== null

  if (!aktivesFach) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-400 text-sm">
        Bitte ein Fach auswählen
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-ink-900 border-b border-paper-100 dark:border-ink-800">
        <span className="text-xs text-ink-400">
          {aktivesFach.name} · Schuljahr {schuljahr}
        </span>
        <button
          className="btn-secondary text-xs ml-auto"
          onClick={handleImportOeffnen}
        >
          Übernehmen
        </button>
        <button
          className="btn-secondary text-xs"
          onClick={handleExport}
          disabled={exportLaeuft || abschnitte.length === 0}
          title="Gesamte Jahresplanung inkl. Materiallisten als PDF exportieren"
        >
          {exportLaeuft ? 'Exportiere…' : 'Exportieren'}
        </button>
        {importiertVon && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Übernommen</span>
        )}
        {abschnitte.length > 0 && (
          <span className="text-xs text-ink-400">
            {abschnitte.length} {abschnitte.length === 1 ? 'Abschnitt' : 'Abschnitte'}
          </span>
        )}
      </div>

      {/* Haupt-Layout: Links Abschnitte, Rechts Kalender */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─── Linke Seite: Abschnitt-Liste ─────────────────────────────── */}
        <div className="w-96 flex-shrink-0 border-r border-paper-100 dark:border-ink-800 flex flex-col bg-white dark:bg-ink-900">
          {/* Neuer Abschnitt */}
          <div className="p-3 border-b border-paper-100 dark:border-ink-800">
            <button
              className="w-full btn-secondary text-xs flex items-center justify-center gap-1.5"
              onClick={neuOeffnen}
            >
              <span className="text-base leading-none">+</span> Neuer Abschnitt
            </button>
          </div>

          {/* Liste */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {abschnitte.map(a => (
              <AbschnittKarte
                key={a.id}
                abschnitt={a}
                aktivesFach={aktivesFach}
                istSelektiert={selektiert?.id === a.id}
                onClick={abschnittWaehlen}
                onCalendarDragStart={handleDragStart}
                onListDragStart={handleListDragStart}
                onListDrop={handleListDrop}
                listDragOverId={listDragOverId}
              />
            ))}
            {abschnitte.length === 0 && !istNeu && (
              <div className="text-center text-ink-400 dark:text-ink-500 text-xs py-8">
                Noch keine Abschnitte erstellt.
                <br/>
                <span className="text-ink-600 dark:text-paper-300 dark:text-ink-600">Erstelle einen neuen Abschnitt und ziehe ihn in den Kalender.</span>
              </div>
            )}
          </div>

          {/* Bearbeitungs-Modal */}
          {panelOffen && (
            <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && panelSchliessen()}>
              <div className="modal-box max-w-xl w-full flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-ink-800 dark:text-paper-100">
                    {istNeu ? 'Neuer Abschnitt' : 'Abschnitt bearbeiten'}
                  </h3>
                  <button onClick={panelSchliessen} className="text-ink-400 hover:text-ink-600 text-sm">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto flex flex-col gap-4 px-0.5 pt-1 pb-1">
                  {/* Titel */}
                  <div>
                    <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Titel</label>
                    <input
                      type="text"
                      value={formTitel}
                      onChange={e => setFormTitel(e.target.value)}
                      placeholder="Titel des Abschnitts"
                      className="w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-3 py-2 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400"
                      autoFocus
                    />
                  </div>

                  {/* Datum-Info (nur bei geplanten) */}
                  {selektiert?.datum_von && (
                    <div className="flex items-center justify-between gap-2 text-xs bg-coral-50/70 dark:bg-coral-900/20 border border-coral-100 dark:border-coral-900/40 rounded-lg px-3 py-2">
                      <span className="text-ink-600 dark:text-paper-300">📅 {formatDatum(selektiert.datum_von)} – {formatDatum(selektiert.datum_bis)}</span>
                      <button
                        onClick={handleAusKalenderEntfernen}
                        className="text-[11px] text-ink-400 hover:text-red-500 transition-colors flex-shrink-0"
                        title="Aus dem Kalender entfernen"
                      >
                        Entfernen
                      </button>
                    </div>
                  )}

                  {/* Farbe */}
                  <div>
                    <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1.5">Farbe</label>
                    <div className="flex flex-wrap gap-2">
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
                    </div>
                  </div>

                  {/* Inhalt */}
                  <div>
                    <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Inhalt / Notizen</label>
                    <textarea
                      value={formInhalt}
                      onChange={e => setFormInhalt(e.target.value)}
                      rows={4}
                      placeholder="Inhalte, Notizen…"
                      className="w-full text-sm bg-white dark:bg-ink-800 border border-paper-200 dark:border-ink-700 rounded-lg px-3 py-2 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-coral-400/40 focus:border-coral-400 resize-none"
                    />
                  </div>

                  {/* Materialien (nur für gespeicherte Abschnitte) */}
                  {selektiert && !istNeu && (
                    <div className="pt-3 border-t border-paper-200 dark:border-ink-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-ink-600 dark:text-paper-300 uppercase tracking-wide">Materialien</span>
                          {(materialien.dateien.length + materialien.links.length) > 0 && (
                            <span className="text-[10px] font-medium text-ink-400 bg-paper-100 dark:bg-ink-800 rounded-full px-1.5 py-0.5">{materialien.dateien.length + materialien.links.length}</span>
                          )}
                        </div>
                        <button onClick={handleOrdnerOeffnen} className="text-[11px] text-ink-400 hover:text-coral-500 flex items-center gap-1" title="Ordner im Explorer öffnen">
                          <span>📂</span> Ordner öffnen
                        </button>
                      </div>

                      {(materialien.dateien.length + materialien.links.length) === 0 && (
                        <div className="text-xs text-ink-400 text-center border border-dashed border-paper-200 dark:border-ink-700 rounded-lg py-4 mb-2">
                          Noch keine Materialien.
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        {[...materialien.dateien, ...materialien.links].map(m => {
                          const key = m.typ === 'datei' ? 'd:' + m.ref : 'l:' + m.id
                          const inEdit = metaEdit && metaEdit.typ === m.typ && (m.typ === 'datei' ? metaEdit.ref === m.ref : metaEdit.id === m.id)
                          return (
                            <div key={key} className="rounded-lg border border-paper-100 dark:border-ink-800 hover:border-paper-300 dark:hover:border-ink-700 bg-white dark:bg-ink-800/40 transition-colors">
                              <div className="flex items-center gap-2.5 px-2.5 py-2 group/mat">
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${m.typ === 'datei' ? 'bg-sky-100 dark:bg-sky-900/40' : 'bg-coral-100 dark:bg-coral-900/40'}`}>
                                  {m.typ === 'datei' ? '📄' : '🔗'}
                                </span>
                                <button
                                  onClick={() => handleMaterialOeffnen(m)}
                                  disabled={m.typ === 'datei' && m.fehlt}
                                  className={`flex-1 min-w-0 text-left ${m.typ === 'datei' && m.fehlt ? 'cursor-default' : ''}`}
                                  title={m.ref}
                                >
                                  <div className={`text-xs font-medium truncate transition-colors ${m.typ === 'datei' && m.fehlt ? 'text-ink-400 line-through' : 'text-ink-800 dark:text-paper-200 group-hover/mat:text-coral-600 dark:group-hover/mat:text-coral-400'}`}>
                                    {m.anzeigename || m.ref}
                                    {m.typ === 'datei' && m.fehlt && <span className="ml-1.5 text-[9px] text-red-500 no-underline font-normal">fehlt</span>}
                                  </div>
                                  {m.beschreibung && !inEdit && <div className="text-[10px] text-ink-400 truncate">{m.beschreibung}</div>}
                                </button>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover/mat:opacity-100 transition-opacity flex-shrink-0">
                                  <button onClick={() => setMetaEdit({ typ: m.typ, ref: m.ref, id: m.id, anzeigename: m.anzeigename || '', beschreibung: m.beschreibung || '' })}
                                    className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-ink-400 hover:text-ink-700 dark:hover:text-paper-200 hover:bg-paper-100 dark:hover:bg-ink-700" title="Bearbeiten">✎</button>
                                  <button onClick={() => handleMaterialEntfernen(m)}
                                    className="w-6 h-6 rounded flex items-center justify-center text-[11px] text-ink-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Entfernen">🗑</button>
                                </div>
                              </div>
                              {inEdit && (
                                <div className="px-2.5 pb-2.5 pt-2 flex flex-col gap-1.5 border-t border-paper-100 dark:border-ink-800">
                                  <input value={metaEdit.anzeigename} onChange={e => setMetaEdit(s => ({ ...s, anzeigename: e.target.value }))} placeholder="Anzeigename"
                                    className="w-full text-xs bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-700 rounded-md px-2.5 py-1.5 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-coral-400" />
                                  <input value={metaEdit.beschreibung} onChange={e => setMetaEdit(s => ({ ...s, beschreibung: e.target.value }))} placeholder="Beschreibung"
                                    className="w-full text-xs bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-700 rounded-md px-2.5 py-1.5 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-coral-400" />
                                  <div className="flex gap-3 pt-0.5">
                                    <button onClick={handleMetaSpeichern} className="text-[11px] font-medium text-coral-600 hover:text-coral-700">Speichern</button>
                                    <button onClick={() => setMetaEdit(null)} className="text-[11px] text-ink-400 hover:text-ink-600">Abbrechen</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Hinzufügen */}
                      <div className="flex gap-2 mt-2.5">
                        <button onClick={handleDateienHinzufuegen} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-dashed border-paper-300 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:border-coral-400 hover:text-coral-600 dark:hover:text-coral-400 transition-colors flex items-center justify-center gap-1.5">
                          <span className="text-sm leading-none">＋</span> Datei
                        </button>
                        <button onClick={() => setLinkForm(f => ({ ...f, open: !f.open }))} className="flex-1 text-xs font-medium px-3 py-2 rounded-lg border border-dashed border-paper-300 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:border-coral-400 hover:text-coral-600 dark:hover:text-coral-400 transition-colors flex items-center justify-center gap-1.5">
                          <span className="leading-none">🔗</span> Link
                        </button>
                      </div>

                      {linkForm.open && (
                        <div className="mt-2 flex flex-col gap-1.5 bg-paper-50 dark:bg-ink-800/60 border border-paper-200 dark:border-ink-700 rounded-lg p-2.5">
                          <input value={linkForm.url} onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" autoFocus
                            className="w-full text-xs bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-700 rounded-md px-2.5 py-1.5 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-coral-400" />
                          <input value={linkForm.anzeigename} onChange={e => setLinkForm(f => ({ ...f, anzeigename: e.target.value }))} placeholder="Anzeigename (optional)"
                            className="w-full text-xs bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-700 rounded-md px-2.5 py-1.5 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-coral-400" />
                          <input value={linkForm.beschreibung} onChange={e => setLinkForm(f => ({ ...f, beschreibung: e.target.value }))} placeholder="Beschreibung (optional)"
                            className="w-full text-xs bg-white dark:bg-ink-900 border border-paper-200 dark:border-ink-700 rounded-md px-2.5 py-1.5 text-ink-800 dark:text-paper-200 placeholder-ink-400 focus:outline-none focus:ring-1 focus:ring-coral-400" />
                          <div className="flex gap-3 pt-0.5">
                            <button onClick={handleLinkSpeichern} disabled={!linkForm.url.trim()} className="text-[11px] font-medium text-coral-600 hover:text-coral-700 disabled:opacity-40 disabled:cursor-not-allowed">Hinzufügen</button>
                            <button onClick={() => setLinkForm({ open: false, url: '', anzeigename: '', beschreibung: '' })} className="text-[11px] text-ink-400 hover:text-ink-600">Abbrechen</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Buttons */}
                <div className="flex gap-2 pt-4 mt-3 border-t border-paper-100 dark:border-ink-800">
                  <button
                    onClick={handleSpeichern}
                    disabled={!formTitel.trim()}
                    className="flex-1 btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Speichern
                  </button>
                  {!istNeu && (
                    <button
                      onClick={handleLoeschen}
                      className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
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
            </div>
          )}
        </div>

        {/* ─── Rechte Seite: Kalender ───────────────────────────────────── */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 gap-5 xl:grid-cols-4">
            {monate.map(({ year, month }, i) => (
              <MonatKalender
                key={i}
                year={year}
                month={month}
                abschnitte={abschnitte}
                aktivesFach={aktivesFach}
                dragOverDate={dragOverDate}
                onDrop={handleDrop}
                onDragOverDay={handleDragOverDay}
                onDragLeaveDay={handleDragLeaveDay}
                onAbschnittKlick={abschnittWaehlen}
                resizingId={resizingId}
                onResizeStart={(id) => setResizingId(id)}
                schulferien={schulferien}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ─── Import-Modal ──────────────────────────────────────────────── */}
      {importModal && (
        <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && setImportModal(false)}>
          <div className="modal-box max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-ink-800 dark:text-paper-100">
                Jahresplanung übernehmen
              </h3>
              <button onClick={() => setImportModal(false)} className="text-ink-400 hover:text-ink-600 text-sm">✕</button>
            </div>
            {importQuellen.length === 0 ? (
              <p className="text-sm text-ink-400 text-center py-4">
                Keine anderen Fächer mit Jahresplanung vorhanden.
              </p>
            ) : (
              <>
                <p className="text-xs text-ink-400 mb-3">
                  Alle Abschnitte werden kopiert und können danach individuell angepasst werden.
                </p>

                {/* Vorlagen zuerst – Import ohne Termine */}
                {importQuellen.some(f => f.ist_vorlage === 1) && (
                  <div className="mb-3">
                    <p className="text-[10px] font-semibold text-coral-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <span aria-hidden>📐</span> Vorlagen
                      <span className="normal-case font-normal text-ink-300 dark:text-ink-600">· ohne Termine</span>
                    </p>
                    <div className="flex flex-col gap-1">
                      {importQuellen.filter(f => f.ist_vorlage === 1).map(f => (
                        <button
                          key={f.id}
                          onClick={() => handleImport(f)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-paper-50 dark:hover:bg-ink-800 text-left transition-colors group"
                        >
                          {f.farbe && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.farbe }} />}
                          <span className="text-sm font-medium text-ink-700 dark:text-paper-200 flex-1">{f.klasse_name} · {f.name}</span>
                          <span className="text-xs text-ink-400 group-hover:text-coral-500">{f.abschnitt_anzahl} Abschnitte</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Echte Klassen (mit Terminen) */}
                {Object.entries(
                  importQuellen.filter(f => f.ist_vorlage !== 1).reduce((acc, f) => {
                    ;(acc[f.klasse_name] = acc[f.klasse_name] || []).push(f)
                    return acc
                  }, {})
                ).map(([klasseName, faecher]) => (
                  <div key={klasseName} className="mb-3">
                    <p className="text-[10px] font-semibold text-ink-400 uppercase tracking-wide mb-1">{klasseName}</p>
                    <div className="flex flex-col gap-1">
                      {faecher.map(f => (
                        <button
                          key={f.id}
                          onClick={() => handleImport(f)}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-paper-50 dark:hover:bg-ink-800 text-left transition-colors group"
                        >
                          {f.farbe && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.farbe }} />}
                          <span className="text-sm font-medium text-ink-700 dark:text-paper-200 flex-1">{f.name}</span>
                          <span className="text-xs text-ink-400 group-hover:text-coral-500">{f.abschnitt_anzahl} Abschnitte</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
