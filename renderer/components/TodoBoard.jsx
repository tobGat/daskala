import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'

function datumsAnzeige(datum) {
  if (!datum) return null
  const heute = new Date()
  heute.setHours(0, 0, 0, 0)
  const d = new Date(datum + 'T00:00:00')
  const diffTage = Math.round((d - heute) / 86400000)

  let text, klasse
  if (diffTage < 0) {
    text = `${Math.abs(diffTage)}d überfällig`
    klasse = 'text-red-600 dark:text-red-400'
  } else if (diffTage === 0) {
    text = 'Heute'
    klasse = 'text-orange-500 dark:text-orange-400'
  } else if (diffTage === 1) {
    text = 'Morgen'
    klasse = 'text-yellow-600 dark:text-yellow-400'
  } else {
    text = d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    klasse = 'text-ink-400 dark:text-ink-500'
  }
  return { text, klasse }
}

const ERINNERUNG_OPTIONEN = [
  { value: '',       label: 'Keine Erinnerung' },
  { value: '0',      label: 'Am Fälligkeitstag' },
  { value: '-1',     label: '1 Tag davor' },
  { value: '-3',     label: '3 Tage davor' },
  { value: '-7',     label: '1 Woche davor' },
  { value: 'custom', label: 'Eigenes Datum …' },
]

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function berechneErinnerungsDatum(faelligkeit, option) {
  if (!faelligkeit || option === '' || option === 'custom') return ''
  const d = new Date(faelligkeit + 'T00:00:00')
  d.setDate(d.getDate() + parseInt(option))
  return toLocalDateStr(d)
}

function detectErinnerungOption(faelligkeit, erinnerung) {
  if (!erinnerung) return ''
  if (!faelligkeit) return 'custom'
  const f = new Date(faelligkeit + 'T00:00:00')
  const e = new Date(erinnerung + 'T00:00:00')
  const diff = Math.round((e - f) / 86400000)
  if ([0, -1, -3, -7].includes(diff)) return String(diff)
  return 'custom'
}


function TodoKarte({ todo, klassen = [], faecher = [], onToggle, onDelete, onEditFull, flashRef, flashed }) {
  const [editModus, setEditModus] = useState(false)
  const [editTitel, setEditTitel] = useState('')
  const [editFaelligkeit, setEditFaelligkeit] = useState('')
  const [editErinnerungOption, setEditErinnerungOption] = useState('')
  const [editErinnerungDatum, setEditErinnerungDatum] = useState('')
  const [editFachId, setEditFachId] = useState('')
  const titelInputRef = useRef(null)

  const startEdit = () => {
    setEditTitel(todo.titel)
    setEditFaelligkeit(todo.faelligkeit ?? '')
    const opt = detectErinnerungOption(todo.faelligkeit, todo.erinnerung)
    setEditErinnerungOption(opt)
    setEditErinnerungDatum(todo.erinnerung ?? '')
    setEditFachId(todo.fach_id ? String(todo.fach_id) : '')
    setEditModus(true)
    setTimeout(() => titelInputRef.current?.focus(), 50)
  }

  const handleFaelligkeitChange = (val) => {
    setEditFaelligkeit(val)
    if (editErinnerungOption && editErinnerungOption !== 'custom') {
      setEditErinnerungDatum(berechneErinnerungsDatum(val, editErinnerungOption))
    }
  }

  const handleErinnerungOptionChange = (val) => {
    setEditErinnerungOption(val)
    if (val && val !== 'custom') {
      setEditErinnerungDatum(berechneErinnerungsDatum(editFaelligkeit, val))
    } else if (val === '') {
      setEditErinnerungDatum('')
    }
  }

  const speichernEdit = async () => {
    const erinnerung = editErinnerungOption === '' ? null : (editErinnerungDatum || null)
    await onEditFull(todo.id, {
      titel: editTitel.trim() || todo.titel,
      faelligkeit: editFaelligkeit || null,
      erinnerung,
      fachId: editFachId ? parseInt(editFachId) : null,
    })
    setEditModus(false)
  }

  const faelligkeit = datumsAnzeige(todo.faelligkeit)
  const erinnerung  = datumsAnzeige(todo.erinnerung)
  const klasse = klassen.find(k => k.id === todo.klasse_id)

  if (editModus) {
    return (
      <div className="space-y-2 bg-coral-50 dark:bg-ink-800 rounded-2xl p-3 border border-coral-200 dark:border-coral-700/60 shadow-softer animate-pop-in">
        <input
          ref={titelInputRef}
          className="w-full text-sm bg-transparent outline-none text-ink-800 dark:text-paper-100 placeholder:text-ink-400 dark:placeholder:text-ink-500 border-b border-coral-200 dark:border-ink-700 pb-1 font-medium"
          value={editTitel}
          onChange={e => setEditTitel(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') speichernEdit()
            if (e.key === 'Escape') setEditModus(false)
          }}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-500 flex-shrink-0">📅 Fällig:</span>
          <input
            type="date"
            className="flex-1 text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 cursor-pointer"
            value={editFaelligkeit}
            onChange={e => handleFaelligkeitChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-ink-500 flex-shrink-0">🔔</span>
          <select
            className="flex-1 text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 cursor-pointer border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-0.5"
            value={editErinnerungOption}
            onChange={e => handleErinnerungOptionChange(e.target.value)}
          >
            {ERINNERUNG_OPTIONEN.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {editErinnerungOption === 'custom' && (
          <div className="flex items-center gap-1.5 pl-3.5">
            <input
              type="date"
              className="flex-1 text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 cursor-pointer"
              value={editErinnerungDatum}
              onChange={e => setEditErinnerungDatum(e.target.value)}
            />
          </div>
        )}
        {editErinnerungOption && editErinnerungOption !== 'custom' && editErinnerungDatum && (
          <div className="pl-3.5 text-[10px] text-amber-600 dark:text-amber-400">
            {new Date(editErinnerungDatum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </div>
        )}
        {faecher.length > 0 && (
          <select
            className="w-full text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-0.5"
            value={editFachId}
            onChange={e => setEditFachId(e.target.value)}
          >
            <option value="">Kein Fach</option>
            {faecher.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <div className="flex gap-1.5 pt-0.5">
          <button
            className="flex-1 text-xs py-1.5 rounded-xl bg-coral-500 text-white hover:bg-coral-600 active:scale-[0.98] transition-all font-semibold shadow-softer"
            onClick={speichernEdit}
          >
            Speichern
          </button>
          <button
            className="text-xs px-2.5 py-1.5 rounded-xl text-ink-500 hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
            onClick={() => setEditModus(false)}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  // Hintergrund- und Border-Farbe: Klassenfarbe (subtil) oder Coral-Fallback
  const bgColor  = klasse?.farbe ? klasse.farbe + '1a' : 'rgb(251 105 54 / 0.06)'
  const leftCol  = klasse?.farbe ?? '#fb6936'

  return (
    <div
      ref={flashRef}
      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition-all hover:shadow-soft ${todo.erledigt ? 'opacity-50' : ''} ${flashed ? 'border-coral-400 ring-2 ring-coral-400/40 animate-pop-in' : 'border-transparent'}`}
      style={{ backgroundColor: bgColor, borderLeftColor: leftCol, borderLeftWidth: 3 }}
    >
      <button
        className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all active:scale-90 ${
          todo.erledigt
            ? 'bg-coral-500 border-coral-500 text-white'
            : 'border-ink-400 dark:border-ink-500 hover:border-coral-500 hover:bg-coral-50 dark:hover:bg-coral-900/40'
        }`}
        onClick={() => onToggle(todo.id)}
      >
        {!!todo.erledigt && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
        <span className={`text-sm font-medium text-ink-800 dark:text-paper-200 leading-snug ${todo.erledigt ? 'line-through' : ''}`}>
          {todo.titel}
        </span>
        {klasse && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0"
            style={klasse.farbe
              ? { backgroundColor: klasse.farbe + '33', color: klasse.farbe }
              : { backgroundColor: 'rgb(251 105 54 / 0.18)', color: '#c43a14' }}
          >
            {klasse.name}
          </span>
        )}
        {todo.fach_name && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-coral-100 dark:bg-coral-900/40 text-coral-700 dark:text-coral-400 leading-none flex-shrink-0">
            {todo.fach_name}
          </span>
        )}
        {faelligkeit && (
          <span className={`text-[10px] font-semibold leading-none flex-shrink-0 ${faelligkeit.klasse}`}>
            📅 {faelligkeit.text}
          </span>
        )}
        {erinnerung && (
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 leading-none flex-shrink-0"
            title={`Erinnerung: ${todo.erinnerung}`}>
            🔔 {erinnerung.text}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
        {!todo.erledigt && (
          <button
            className="text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
            onClick={startEdit}
            title="Bearbeiten"
          >✎</button>
        )}
        <button
          className="text-ink-500 hover:text-red-500 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={() => onDelete(todo.id)}
          title="Löschen"
        >✕</button>
      </div>
    </div>
  )
}

function NeueingabeForm({ klassen, faecher = [], onSpeichern, onAbbrechen }) {
  const [titel, setTitel] = useState('')
  const [klasseId, setKlasseId] = useState('')
  const [fachId, setFachId] = useState('')
  const [faelligkeit, setFaelligkeit] = useState('')
  const [erinnerungOption, setErinnerungOption] = useState('')
  const [erinnerungDatum, setErinnerungDatum] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleFaelligkeitChange = (val) => {
    setFaelligkeit(val)
    if (erinnerungOption && erinnerungOption !== 'custom') {
      setErinnerungDatum(berechneErinnerungsDatum(val, erinnerungOption))
    }
  }

  const handleErinnerungOptionChange = (val) => {
    setErinnerungOption(val)
    if (val && val !== 'custom') {
      setErinnerungDatum(berechneErinnerungsDatum(faelligkeit, val))
    } else if (val === '') {
      setErinnerungDatum('')
    }
  }

  const speichern = async () => {
    const t = titel.trim()
    const er = erinnerungOption === '' ? null : (erinnerungDatum || null)
    if (t) await onSpeichern(t, klasseId ? parseInt(klasseId) : null, fachId ? parseInt(fachId) : null, faelligkeit || null, er)
    onAbbrechen()
  }

  return (
    <div className="space-y-2 bg-coral-50 dark:bg-ink-800 rounded-2xl p-3 border border-coral-200 dark:border-coral-700/60 shadow-softer animate-pop-in">
      <input
        ref={inputRef}
        className="w-full text-sm bg-transparent outline-none text-ink-800 dark:text-paper-100 placeholder:text-ink-400 dark:placeholder:text-ink-500 border-b border-coral-200 dark:border-ink-700 pb-1 font-medium"
        placeholder="Titel…"
        value={titel}
        onChange={e => setTitel(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') speichern()
          if (e.key === 'Escape') onAbbrechen()
        }}
      />
      {klassen.length > 0 && (
        <select
          className="w-full text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-1"
          value={klasseId}
          onChange={e => { setKlasseId(e.target.value); setFachId('') }}
        >
          <option value="">Keine Klasse</option>
          {klassen.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-ink-500 flex-shrink-0">📅 Fällig:</span>
        <input
          type="date"
          className="flex-1 text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 cursor-pointer"
          value={faelligkeit}
          onChange={e => handleFaelligkeitChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-ink-500 flex-shrink-0">🔔</span>
        <select
          className="flex-1 text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 cursor-pointer border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-0.5"
          value={erinnerungOption}
          onChange={e => handleErinnerungOptionChange(e.target.value)}
        >
          {ERINNERUNG_OPTIONEN.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {erinnerungOption === 'custom' && (
        <div className="flex items-center gap-1.5 pl-3.5">
          <input
            type="date"
            className="flex-1 text-xs bg-transparent outline-none text-ink-700 dark:text-ink-300 cursor-pointer"
            value={erinnerungDatum}
            onChange={e => setErinnerungDatum(e.target.value)}
          />
        </div>
      )}
      {erinnerungOption && erinnerungOption !== 'custom' && erinnerungDatum && (
        <div className="pl-3.5 text-[10px] text-amber-600 dark:text-amber-400">
          {new Date(erinnerungDatum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </div>
      )}
      {faecher.length > 0 && (
        <select
          className="w-full text-xs bg-white dark:bg-ink-700 outline-none text-ink-700 dark:text-ink-300 border border-coral-200 dark:border-ink-700 rounded-lg px-2 py-1 mt-0.5"
          value={fachId}
          onChange={e => setFachId(e.target.value)}
        >
          <option value="">Kein Fach</option>
          {faecher.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <div className="flex gap-1.5 pt-0.5">
        <button
          className="flex-1 text-xs py-1.5 rounded-xl bg-coral-500 text-white hover:bg-coral-600 active:scale-[0.98] transition-all font-semibold shadow-softer"
          onClick={speichern}
        >
          Hinzufügen
        </button>
        <button
          className="text-xs px-2.5 py-1.5 rounded-xl text-ink-500 hover:bg-paper-200 dark:hover:bg-ink-700 transition-colors"
          onClick={onAbbrechen}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default function TodoBoard({ highlightedTodoId, onHighlightCleared }) {
  const { klassen, todos, ladeTodos } = useStore()
  const [neueingabe, setNeueingabe] = useState(false)
  const [erledigtOffen, setErledigtOffen] = useState(false)
  const [flashedId, setFlashedId] = useState(null)
  const itemRefs = useRef({})

  useEffect(() => { ladeTodos() }, [])

  useEffect(() => {
    if (!highlightedTodoId) return
    const todo = todos.find(t => t.id === highlightedTodoId)
    if (!todo) return
    setFlashedId(highlightedTodoId)
    setTimeout(() => {
      itemRefs.current[highlightedTodoId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 80)
    const t = setTimeout(() => { setFlashedId(null); onHighlightCleared?.() }, 1800)
    return () => clearTimeout(t)
  }, [highlightedTodoId])

  const todoErstellen = async (titel, klasseId, fachId, faelligkeit, erinnerung) => {
    await window.api.todos?.create({ titel, klasseId, fachId, faelligkeit, erinnerung })
    await ladeTodos()
  }

  const todoToggle = async (id) => {
    await window.api.todos?.toggleErledigt(id)
    await ladeTodos()
  }

  const todoLoeschen = async (id) => {
    await window.api.todos?.delete(id)
    await ladeTodos()
  }

  const todoBearbeiten = async (id, { titel, faelligkeit, erinnerung, fachId }) => {
    await window.api.todos?.update(id, { titel, fachId, faelligkeit, erinnerung })
    await ladeTodos()
  }

  const offen = todos
    .filter(t => !t.erledigt)
    .sort((a, b) => {
      if (!a.faelligkeit && !b.faelligkeit) return 0
      if (!a.faelligkeit) return 1
      if (!b.faelligkeit) return -1
      return a.faelligkeit.localeCompare(b.faelligkeit)
    })
  const alleErledigt = todos.filter(t => t.erledigt)

  // Fächer pro Klasse für Edit-Modus laden (lazy)
  const [klasseFaecher, setKlasseFaecher] = useState({})
  const ladeFaecher = async (klasseId) => {
    if (!klasseId || klasseFaecher[klasseId]) return klasseFaecher[klasseId] ?? []
    const f = await window.api.faecher.getAll(klasseId)
    setKlasseFaecher(prev => ({ ...prev, [klasseId]: f }))
    return f
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white dark:bg-ink-900">

      {/* Panel-Header — analog zu TerminePanel */}
      <div className="px-4 py-3 border-b border-paper-200 dark:border-ink-800 flex items-center justify-between flex-shrink-0">
        <span className="text-sm font-bold text-ink-800 dark:text-paper-100 flex items-center gap-2">
          <span aria-hidden>✏️</span> ToDos
        </span>
        <button
          className="text-ink-500 hover:text-coral-600 dark:hover:text-coral-300 w-7 h-7 flex items-center justify-center rounded-xl hover:bg-coral-50 dark:hover:bg-coral-900/30 transition-all active:scale-95"
          onClick={() => setNeueingabe(v => !v)}
          title="ToDo hinzufügen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-3 space-y-1.5">
          {neueingabe && (
            <NeueingabeForm
              klassen={klassen}
              faecher={[]}
              onSpeichern={todoErstellen}
              onAbbrechen={() => setNeueingabe(false)}
            />
          )}

          {offen.length === 0 && !neueingabe && (
            <div className="text-center py-8 text-ink-400">
              <div className="text-3xl mb-2">🌿</div>
              <p className="text-xs">Keine offenen ToDos — gute Arbeit!</p>
            </div>
          )}

          {offen.map(todo => (
            <TodoKarte
              key={todo.id}
              todo={todo}
              klassen={klassen}
              faecher={klasseFaecher[todo.klasse_id] ?? []}
              onToggle={todoToggle}
              onDelete={todoLoeschen}
              onEditFull={async (id, data) => {
                await ladeFaecher(todo.klasse_id)
                await todoBearbeiten(id, data)
              }}
              flashRef={el => { itemRefs.current[todo.id] = el }}
              flashed={flashedId === todo.id}
            />
          ))}

          {/* Erledigt */}
          {alleErledigt.length > 0 && (
            <div className="border-t border-paper-200 dark:border-ink-800 pt-1.5 mt-1.5">
              <button
                className="w-full text-left text-[11px] text-ink-500 hover:text-ink-700 dark:hover:text-ink-300 py-1 flex items-center gap-1 transition-colors"
                onClick={() => setErledigtOffen(o => !o)}
              >
                <span>{erledigtOffen ? '▾' : '▸'}</span>
                Erledigt ({alleErledigt.length})
              </button>
              {erledigtOffen && (
                <div className="space-y-1.5 mt-1">
                  {alleErledigt.map(todo => (
                    <TodoKarte
                      key={todo.id}
                      todo={todo}
                      klassen={klassen}
                      onToggle={todoToggle}
                      onDelete={todoLoeschen}
                      onEditFull={todoBearbeiten}
                      flashRef={el => { itemRefs.current[todo.id] = el }}
                      flashed={flashedId === todo.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
