import { useState, useEffect } from 'react'

export function toLocalDateStr(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function berechneFristDatum(wocheDatum, wochentag, offsetWochen) {
  const d = new Date(wocheDatum + 'T00:00:00')
  d.setDate(d.getDate() + (wochentag - 1) + offsetWochen * 7)
  return toLocalDateStr(d)
}

// Nächste/übernächste Lektion desselben Fachs finden
export function naechsteLektionDatum(wocheDatum, aktuellerWochentag, fachWochentage, skip = 1) {
  const tage = [...fachWochentage].sort((a, b) => a - b)
  if (tage.length === 0) return berechneFristDatum(wocheDatum, aktuellerWochentag, skip)
  let gefunden = 0
  let wocheOffset = 0
  for (let versuch = 0; versuch < 20; versuch++) {
    for (const tag of tage) {
      if (wocheOffset === 0 && tag <= aktuellerWochentag) continue
      gefunden++
      if (gefunden === skip) {
        const d = new Date(wocheDatum + 'T00:00:00')
        d.setDate(d.getDate() + (tag - 1) + wocheOffset * 7)
        return toLocalDateStr(d)
      }
    }
    wocheOffset++
  }
  return berechneFristDatum(wocheDatum, aktuellerWochentag, skip)
}

export function formatFristDatum(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' })
}

export default function PlanungModal({ eintrag, wocheDatum, fachWochentage = [], onClose, onGespeichert }) {
  const [titel, setTitel] = useState('')
  const [inhalt, setInhalt] = useState('')
  const [musizieren, setMusizieren] = useState(false)
  const [musiziertWarnung, setMusiziertWarnung] = useState(false)
  const [laden, setLaden] = useState(true)
  const [jahresAbschnitte, setJahresAbschnitte] = useState([])
  const [hueText, setHueText] = useState('')
  const [hueFristOption, setHueFristOption] = useState('naechste')
  const [hueFristDatum, setHueFristDatum] = useState('')
  const [link, setLink] = useState('')
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
      if (plan) {
        setTitel(plan.titel)
        setInhalt(plan.inhalt)
        setMusizieren(!!plan.musizieren)
        setHueText(plan.hue_text ?? '')
        setLink(plan.link ?? '')
        if (plan.hue_frist_datum) {
          const naechste = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 1)
          const uebnaechste = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 2)
          if (plan.hue_frist_datum === naechste) setHueFristOption('naechste')
          else if (plan.hue_frist_datum === uebnaechste) setHueFristOption('uebnaechste')
          else { setHueFristOption('datum'); setHueFristDatum(plan.hue_frist_datum) }
        }
      }
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

  const naechsteDatum = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 1)
  const uebnaechsteDatum = naechsteLektionDatum(wocheDatum, eintrag.wochentag, fachWochentage, 2)

  const berechneHueFrist = () => {
    if (!hueText) return null
    if (hueFristOption === 'naechste') return naechsteDatum
    if (hueFristOption === 'uebnaechste') return uebnaechsteDatum
    return hueFristDatum || null
  }

  const speichern = async () => {
    try {
      await window.api.stundenPlanung.save(eintrag.id, wocheDatum, titel, inhalt, musizieren, hueText || null, berechneHueFrist(), link || null)
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
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        className="modal-box w-full max-w-xl"
        style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-ink-400">{eintrag.fach_name} · {eintrag.klasse_name} · {wocheAnzeige}</span>
            {eintrag.klasse_teams_link && (
              <button
                type="button"
                className="text-xs px-2 py-0.5 rounded bg-coral-100 dark:bg-coral-900/30 text-coral-600 dark:text-coral-300 hover:bg-coral-200 dark:hover:bg-coral-700 transition-colors font-medium flex-shrink-0 ml-2"
                onClick={() => window.api.shell.open(eintrag.klasse_teams_link)}
                title="In Teams öffnen"
              >Teams ↗</button>
            )}
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

        {/* Scrollbarer Inhaltsbereich */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0">

        {/* Jahresplanung-Referenz */}
        {jahresAbschnitte.length > 0 && (
          <div className="mb-3 rounded-lg border border-coral-100 dark:border-coral-900/50 bg-coral-50/60 dark:bg-coral-900/30 px-3 py-2 flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold text-coral-400 dark:text-coral-500 uppercase tracking-wide">Jahresplanung</span>
            {jahresAbschnitte.map(a => (
              <div key={a.id}>
                <div className="flex items-center gap-2">
                  {a.farbe && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: a.farbe }} />}
                  <span className="text-xs font-medium text-coral-800 dark:text-coral-200">{a.titel}</span>
                  <span className="text-[10px] text-coral-400 dark:text-coral-500 ml-auto whitespace-nowrap">
                    {a.datum_von.split('-').reverse().slice(0,2).join('.')}. – {a.datum_bis.split('-').reverse().slice(0,2).join('.')}.
                  </span>
                </div>
                {a.inhalt && (
                  <p className="text-[11px] text-coral-600 dark:text-coral-400 mt-0.5 ml-4 whitespace-pre-wrap line-clamp-3">{a.inhalt}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formatierungs-Toolbar */}
        <div className="flex items-center gap-1 mb-2 pb-2 border-b border-paper-100 dark:border-ink-800">
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
              className={`w-7 h-7 flex items-center justify-center text-sm rounded border border-paper-200 dark:border-ink-700 text-ink-600 dark:text-paper-300 hover:bg-paper-50 dark:hover:bg-ink-800 transition-colors ${btn.cls}`}
              onMouseDown={e => { e.preventDefault(); formatierung(btn.aktion) }}
            >
              {btn.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-ink-400">Markdown</span>
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

        {/* Hausübung */}
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
                  <input
                    type="radio"
                    name="hue-frist"
                    value={opt}
                    checked={hueFristOption === opt}
                    onChange={() => setHueFristOption(opt)}
                    className="accent-violet-600"
                  />
                  <span className="text-xs text-ink-600 dark:text-ink-400">
                    {opt === 'naechste' ? `Nächste Stunde (${formatFristDatum(naechsteDatum)})` : opt === 'uebnaechste' ? `Übernächste (${formatFristDatum(uebnaechsteDatum)})` : 'Datum'}
                  </span>
                </label>
              ))}
              {hueFristOption === 'datum' && (
                <input
                  type="date"
                  className="text-xs border border-paper-300 dark:border-ink-700 rounded px-1.5 py-0.5 bg-white dark:bg-ink-800 dark:text-paper-200"
                  value={hueFristDatum}
                  onChange={e => setHueFristDatum(e.target.value)}
                />
              )}
            </div>
          )}
        </div>

        {/* Link */}
        <div className="mt-3">
          <label className="block text-xs font-medium text-ink-500 dark:text-ink-400 mb-1">Link / Dateipfad <span className="font-normal">(optional)</span></label>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-sm"
              placeholder="https://… oder C:\…"
              value={link}
              onChange={e => setLink(e.target.value)}
            />
            <button
              type="button"
              className="btn-secondary text-xs px-2 py-1 flex-shrink-0"
              onClick={async () => { const p = await window.api.dialog.openFile([]); if (p) setLink(p) }}
              title="Datei auswählen"
            >📂</button>
            {link && (
              <button
                type="button"
                className="btn-secondary text-xs px-2 py-1 flex-shrink-0"
                onClick={() => window.api.shell?.open(link)}
                title="Öffnen"
              >↗</button>
            )}
          </div>
        </div>

        {/* Musizieren-Checkbox (nur bei Musik) */}
        {istMusik && (
          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={musizieren}
              onChange={e => handleMusiziertChange(e.target.checked)}
              className="accent-coral-600 w-4 h-4"
            />
            <span className="text-sm text-ink-700 dark:text-paper-300">Musizieren</span>
          </label>
        )}

        </div>{/* Ende scrollbarer Bereich */}

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
            <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-2">Bereits musiziert</h3>
            <p className="text-sm text-ink-600 dark:text-ink-400 mb-5">
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
