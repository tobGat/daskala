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
    klasse = 'text-zinc-400 dark:text-zinc-500'
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


function TodoKarte({ todo, faecher = [], onToggle, onDelete, onEditFull, kontextLabel }) {
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

  if (editModus) {
    return (
      <div className="space-y-1.5 bg-zinc-800 rounded-lg p-2.5 border border-indigo-700/60">
        <input
          ref={titelInputRef}
          className="w-full text-sm bg-transparent outline-none text-zinc-100 placeholder:text-zinc-500 border-b border-zinc-700 pb-1"
          value={editTitel}
          onChange={e => setEditTitel(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') speichernEdit()
            if (e.key === 'Escape') setEditModus(false)
          }}
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 flex-shrink-0">Fällig:</span>
          <input
            type="date"
            className="flex-1 text-xs bg-transparent outline-none text-zinc-400 cursor-pointer"
            value={editFaelligkeit}
            onChange={e => handleFaelligkeitChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-500 flex-shrink-0">🔔</span>
          <select
            className="flex-1 text-xs bg-zinc-800 outline-none text-zinc-400 cursor-pointer"
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
              className="flex-1 text-xs bg-transparent outline-none text-zinc-400 cursor-pointer"
              value={editErinnerungDatum}
              onChange={e => setEditErinnerungDatum(e.target.value)}
            />
          </div>
        )}
        {editErinnerungOption && editErinnerungOption !== 'custom' && editErinnerungDatum && (
          <div className="pl-3.5 text-[10px] text-amber-500 dark:text-amber-400">
            {new Date(editErinnerungDatum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
          </div>
        )}
        {faecher.length > 0 && (
          <select
            className="w-full text-xs bg-zinc-800 outline-none text-zinc-400 border-t border-zinc-700 pt-1.5 mt-0.5"
            value={editFachId}
            onChange={e => setEditFachId(e.target.value)}
          >
            <option value="">Kein Fach</option>
            {faecher.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <div className="flex gap-1.5 pt-0.5">
          <button
            className="flex-1 text-xs py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
            onClick={speichernEdit}
          >
            Speichern
          </button>
          <button
            className="text-xs px-2 py-1 rounded-md text-zinc-500 hover:bg-zinc-700 transition-colors"
            onClick={() => setEditModus(false)}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`group flex items-start gap-2 p-2.5 rounded-lg bg-zinc-800 border border-zinc-700/60 ${todo.erledigt ? 'opacity-40' : ''}`}>
      <button
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          todo.erledigt
            ? 'bg-indigo-500 border-indigo-500 text-white'
            : 'border-zinc-600 hover:border-indigo-400 hover:bg-indigo-950/40'
        }`}
        onClick={() => onToggle(todo.id)}
      >
        {!!todo.erledigt && (
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-zinc-200 leading-snug ${todo.erledigt ? 'line-through' : ''}`}>
          {todo.titel}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {kontextLabel && (
            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-zinc-700 text-zinc-400">
              {kontextLabel}
            </span>
          )}
          {todo.fach_name && (
            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-indigo-900/50 text-indigo-400">
              {todo.fach_name}
            </span>
          )}
          {faelligkeit && (
            <span className={`text-[10px] font-medium ${faelligkeit.klasse}`}>
              ✓ {faelligkeit.text}
            </span>
          )}
          {erinnerung && (
            <span className="text-[10px] font-medium text-amber-500 dark:text-amber-400"
              title={`Erinnerung: ${todo.erinnerung}`}>
              🔔 {erinnerung.text}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 mt-0.5">
        {!todo.erledigt && (
          <button
            className="text-zinc-600 hover:text-zinc-300 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
            onClick={startEdit}
            title="Bearbeiten"
          >
            ✎
          </button>
        )}
        <button
          className="text-zinc-600 hover:text-red-400 text-xs w-5 h-5 flex items-center justify-center rounded transition-colors"
          onClick={() => onDelete(todo.id)}
          title="Löschen"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function NeueingabeForm({ faecher, onSpeichern, onAbbrechen }) {
  const [titel, setTitel] = useState('')
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

  const erinnerung = erinnerungOption === '' ? null : (erinnerungDatum || null)

  const speichern = async () => {
    const t = titel.trim()
    const er = erinnerungOption === '' ? null : (erinnerungDatum || null)
    console.log('[TodoBoard] speichern:', { titel: t, faelligkeit, erinnerungOption, erinnerungDatum, er })
    if (t) await onSpeichern(t, fachId ? parseInt(fachId) : null, faelligkeit || null, er)
    onAbbrechen()
  }

  return (
    <div className="space-y-1.5 bg-zinc-800 rounded-lg p-2.5 border border-indigo-700/60">
      <input
        ref={inputRef}
        className="w-full text-sm bg-transparent outline-none text-zinc-100 placeholder:text-zinc-500"
        placeholder="Titel…"
        value={titel}
        onChange={e => setTitel(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') speichern()
          if (e.key === 'Escape') onAbbrechen()
        }}
      />
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 flex-shrink-0">Fällig:</span>
        <input
          type="date"
          className="flex-1 text-xs bg-transparent outline-none text-zinc-400 cursor-pointer"
          value={faelligkeit}
          onChange={e => handleFaelligkeitChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-zinc-500 flex-shrink-0">🔔</span>
        <select
          className="flex-1 text-xs bg-zinc-800 outline-none text-zinc-400 cursor-pointer"
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
            className="flex-1 text-xs bg-transparent outline-none text-zinc-400 cursor-pointer"
            value={erinnerungDatum}
            onChange={e => setErinnerungDatum(e.target.value)}
          />
        </div>
      )}
      {erinnerungOption && erinnerungOption !== 'custom' && erinnerungDatum && (
        <div className="pl-3.5 text-[10px] text-amber-500 dark:text-amber-400">
          {new Date(erinnerungDatum + 'T00:00:00').toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
        </div>
      )}
      {faecher.length > 0 && (
        <select
          className="w-full text-xs bg-zinc-800 outline-none text-zinc-400 border-t border-zinc-700 pt-1.5 mt-0.5"
          value={fachId}
          onChange={e => setFachId(e.target.value)}
        >
          <option value="">Kein Fach</option>
          {faecher.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <div className="flex gap-1.5 pt-0.5">
        <button
          className="flex-1 text-xs py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors font-medium"
          onClick={speichern}
        >
          Hinzufügen
        </button>
        <button
          className="text-xs px-2 py-1 rounded-md text-zinc-500 hover:bg-zinc-700 transition-colors"
          onClick={onAbbrechen}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function TodoListe({ todos, faecher = [], onToggle, onDelete, onEditFull }) {
  const offen = todos.filter(t => !t.erledigt)
  return (
    <>
      {offen.map(todo => (
        <TodoKarte
          key={todo.id}
          todo={todo}
          faecher={faecher}
          onToggle={onToggle}
          onDelete={onDelete}
          onEditFull={onEditFull}
        />
      ))}
    </>
  )
}

export default function TodoBoard() {
  const { klassen, todos, ladeTodos } = useStore()
  const [klasseFaecher, setKlasseFaecher] = useState({})
  const [aufgeklappteKlasse, setAufgeklappteKlasse] = useState(null)
  const [neueingabeKolumne, setNeueingabeKolumne] = useState(null)
  const [erledigtOffen, setErledigtOffen] = useState(false)

  useEffect(() => { ladeTodos() }, [])

  const ladeFaecher = async (klasseId) => {
    if (klasseFaecher[klasseId]) return
    const f = await window.api.faecher.getAll(klasseId)
    setKlasseFaecher(prev => ({ ...prev, [klasseId]: f }))
  }

  const todoErstellen = async (kolumneId, titel, fachId, faelligkeit, erinnerung) => {
    const klasseId = kolumneId === 'allgemein' ? null : kolumneId
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

  const toggleKlasse = (klasseId) => {
    setAufgeklappteKlasse(prev => prev === klasseId ? null : klasseId)
    setNeueingabeKolumne(null)
  }

  const startNeueingabe = async (kolumneId, e) => {
    e?.stopPropagation()
    if (kolumneId !== 'allgemein') await ladeFaecher(kolumneId)
    setNeueingabeKolumne(kolumneId)
  }

  const allgemeinTodos = todos.filter(t => !t.klasse_id)
  const allgemeinOffen = allgemeinTodos.filter(t => !t.erledigt)
  const alleErledigt = todos.filter(t => t.erledigt)
  const klassenMap = Object.fromEntries(klassen.map(k => [k.id, k.name]))

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-zinc-800">

      {/* Panel-Header */}
      <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">ToDos</span>
      </div>

      {/* Allgemein – immer ausgeklappt */}
      <div className="flex-shrink-0 border-b border-zinc-800">
        <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400">Allgemein</span>
          {allgemeinOffen.length > 0 && (
            <span className="text-xs bg-zinc-700 text-zinc-400 rounded-full px-1.5 font-medium">
              {allgemeinOffen.length}
            </span>
          )}
        </div>
        <div className="px-3 space-y-2 max-h-56 overflow-y-auto">
          {neueingabeKolumne === 'allgemein' && (
            <NeueingabeForm
              faecher={[]}
              onSpeichern={(t, f, fa, er) => todoErstellen('allgemein', t, f, fa, er)}
              onAbbrechen={() => setNeueingabeKolumne(null)}
            />
          )}
          <TodoListe
            todos={allgemeinTodos}
            onToggle={todoToggle}
            onDelete={todoLoeschen}
            onEditFull={todoBearbeiten}
          />
        </div>
        {neueingabeKolumne !== 'allgemein' && (
          <button
            className="w-full text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 py-1.5 transition-colors text-left px-3 flex items-center gap-1 border-t border-zinc-800/60 mt-1"
            onClick={e => startNeueingabe('allgemein', e)}
          >
            <span className="text-base leading-none">+</span> Hinzufügen
          </button>
        )}
      </div>

      {/* Klassen-Accordion */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
        {klassen.map(k => {
          const ktodos = todos.filter(t => t.klasse_id === k.id)
          const offen = ktodos.filter(t => !t.erledigt)
          const isOpen = aufgeklappteKlasse === k.id
          const faecher = klasseFaecher[k.id] ?? []

          return (
            <div key={k.id}>
              <div
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
                onClick={() => toggleKlasse(k.id)}
              >
                <div className="flex items-center gap-1.5">
                  {k.farbe && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: k.farbe }} />
                  )}
                  <span className="text-sm font-medium text-zinc-300">{k.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {offen.length > 0 && (
                    <span className="text-xs bg-indigo-900/50 text-indigo-400 rounded-full px-1.5 font-medium">
                      {offen.length}
                    </span>
                  )}
                  <span className="text-zinc-600 text-[10px]">{isOpen ? '▾' : '▸'}</span>
                </div>
              </div>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2 bg-zinc-950/40">
                  {neueingabeKolumne === k.id && (
                    <NeueingabeForm
                      faecher={faecher}
                      onSpeichern={(t, f, fa, er) => todoErstellen(k.id, t, f, fa, er)}
                      onAbbrechen={() => setNeueingabeKolumne(null)}
                    />
                  )}
                  <TodoListe
                    todos={ktodos}
                    faecher={faecher}
                    onToggle={todoToggle}
                    onDelete={todoLoeschen}
                    onEditFull={todoBearbeiten}
                  />
                  {neueingabeKolumne !== k.id && (
                    <button
                      className="w-full text-xs text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 py-1 transition-colors text-left flex items-center gap-1 rounded-lg px-1.5"
                      onClick={e => startNeueingabe(k.id, e)}
                    >
                      <span className="text-base leading-none">+</span> Hinzufügen
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Globaler Erledigt-Block */}
      {alleErledigt.length > 0 && (
        <div className="border-t border-zinc-800 flex-shrink-0">
          <div
            className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-zinc-800 transition-colors select-none"
            onClick={() => setErledigtOffen(o => !o)}
          >
            <span className="text-xs font-semibold text-zinc-500">Erledigt</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs bg-zinc-700 text-zinc-500 rounded-full px-1.5 font-medium">{alleErledigt.length}</span>
              <span className="text-zinc-600 text-[10px]">{erledigtOffen ? '▾' : '▸'}</span>
            </div>
          </div>
          {erledigtOffen && (
            <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto bg-zinc-950/40">
              {alleErledigt.map(todo => (
                <TodoKarte
                  key={todo.id}
                  todo={todo}
                  onToggle={todoToggle}
                  onDelete={todoLoeschen}
                  onEditFull={todoBearbeiten}
                  kontextLabel={todo.klasse_id ? klassenMap[todo.klasse_id] : 'Allgemein'}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
