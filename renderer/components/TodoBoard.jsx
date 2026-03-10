import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore'

function faelligkeitAnzeige(faelligkeit) {
  if (!faelligkeit) return null
  const heute = new Date()
  heute.setHours(0, 0, 0, 0)
  const datum = new Date(faelligkeit + 'T00:00:00')
  const diffTage = Math.round((datum - heute) / 86400000)

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
    text = datum.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit' })
    klasse = 'text-zinc-400 dark:text-zinc-500'
  }
  return { text, klasse }
}

function TodoKarte({ todo, onToggle, onDelete, onEdit }) {
  const [bearbeiten, setBearbeiten] = useState(false)
  const [titel, setTitel] = useState(todo.titel)
  const inputRef = useRef(null)

  const speichern = async () => {
    const neu = titel.trim()
    if (neu && neu !== todo.titel) {
      await onEdit(todo.id, neu)
    } else {
      setTitel(todo.titel)
    }
    setBearbeiten(false)
  }

  const faelligkeit = faelligkeitAnzeige(todo.faelligkeit)

  return (
    <div className={`group flex items-start gap-2 p-2.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 ${todo.erledigt ? 'opacity-50' : ''}`}>
      <button
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
          todo.erledigt
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'border-zinc-300 dark:border-zinc-600 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
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
        {bearbeiten ? (
          <input
            ref={inputRef}
            className="w-full text-sm bg-transparent outline-none border-b border-indigo-400 text-zinc-800 dark:text-zinc-200"
            value={titel}
            onChange={e => setTitel(e.target.value)}
            onBlur={speichern}
            onKeyDown={e => {
              if (e.key === 'Enter') speichern()
              if (e.key === 'Escape') { setTitel(todo.titel); setBearbeiten(false) }
            }}
            autoFocus
          />
        ) : (
          <p
            className={`text-sm text-zinc-800 dark:text-zinc-200 leading-snug cursor-text ${todo.erledigt ? 'line-through' : ''}`}
            onDoubleClick={() => !todo.erledigt && setBearbeiten(true)}
            title="Doppelklick zum Bearbeiten"
          >
            {todo.titel}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {todo.fach_name && (
            <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
              {todo.fach_name}
            </span>
          )}
          {faelligkeit && (
            <span className={`text-[10px] font-medium ${faelligkeit.klasse}`}>
              ⏰ {faelligkeit.text}
            </span>
          )}
        </div>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 text-zinc-300 dark:text-zinc-600 hover:text-red-400 dark:hover:text-red-400 transition-all text-xs mt-0.5 flex-shrink-0"
        onClick={() => onDelete(todo.id)}
        title="Löschen"
      >
        ✕
      </button>
    </div>
  )
}

function TodoSpalte({ kolumne, todos, klasseFaecher, onLadeFaecher, onNeu, onToggle, onDelete, onEdit, eingeklappt, setEingeklappt }) {
  const [neueingabe, setNeueingabe] = useState(false)
  const [neuerTitel, setNeuerTitel] = useState('')
  const [neuerFachId, setNeuerFachId] = useState('')
  const [neueFaelligkeit, setNeueFaelligkeit] = useState('')
  const inputRef = useRef(null)

  const offen = todos.filter(t => !t.erledigt)
  const erledigt = todos.filter(t => t.erledigt)

  const startNeu = async () => {
    if (kolumne.id !== 'allgemein') await onLadeFaecher(kolumne.id)
    setNeueingabe(true)
    setNeuerTitel('')
    setNeuerFachId('')
    setNeueFaelligkeit('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const speichern = async () => {
    const t = neuerTitel.trim()
    if (t) {
      await onNeu(kolumne.id, t, neuerFachId ? parseInt(neuerFachId) : null, neueFaelligkeit || null)
    }
    setNeueingabe(false)
  }

  const faecher = kolumne.id !== 'allgemein' ? (klasseFaecher[kolumne.id] ?? []) : []

  if (eingeklappt) {
    return (
      <div
        className="flex flex-col items-center bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-2 flex-shrink-0 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700/50 transition-colors"
        style={{ width: 36, maxHeight: 'calc(100vh - 100px)' }}
        onClick={() => setEingeklappt(false)}
        title={`${kolumne.name} aufklappen`}
      >
        {offen.length > 0 && (
          <span className="text-xs bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center font-medium mb-2 flex-shrink-0">
            {offen.length > 9 ? '9+' : offen.length}
          </span>
        )}
        <span
          className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mt-1"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
        >
          {kolumne.name}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-64 bg-zinc-100 dark:bg-zinc-800/50 rounded-xl p-3 flex-shrink-0" style={{ maxHeight: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-zinc-800 dark:text-zinc-200">{kolumne.name}</h3>
        <div className="flex items-center gap-1.5">
          {offen.length > 0 && (
            <span className="text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-full px-1.5 py-0.5 font-medium">
              {offen.length}
            </span>
          )}
          <button
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors text-xs leading-none p-0.5 rounded"
            onClick={() => setEingeklappt(true)}
            title="Spalte einklappen"
          >
            ‹‹
          </button>
        </div>
      </div>

      {/* Neuer Todo – oben */}
      {neueingabe ? (
        <div className="mb-2 space-y-1.5 bg-white dark:bg-zinc-800 rounded-lg p-2.5 border border-indigo-200 dark:border-indigo-800/60">
          <input
            ref={inputRef}
            className="w-full text-sm bg-transparent outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
            placeholder="Titel…"
            value={neuerTitel}
            onChange={e => setNeuerTitel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') speichern()
              if (e.key === 'Escape') setNeueingabe(false)
            }}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-400 flex-shrink-0">Fällig:</span>
            <input
              type="date"
              className="flex-1 text-xs bg-transparent outline-none text-zinc-600 dark:text-zinc-400 cursor-pointer"
              value={neueFaelligkeit}
              onChange={e => setNeueFaelligkeit(e.target.value)}
            />
          </div>
          {faecher.length > 0 && (
            <select
              className="w-full text-xs bg-transparent outline-none text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-700 pt-1.5 mt-0.5"
              value={neuerFachId}
              onChange={e => setNeuerFachId(e.target.value)}
            >
              <option value="">Kein Fach</option>
              {faecher.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
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
              className="text-xs px-2 py-1 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              onClick={() => setNeueingabe(false)}
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <button
          className="mb-2 w-full text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg py-1.5 transition-colors text-left px-2 flex items-center gap-1"
          onClick={startNeu}
        >
          <span className="text-base leading-none">+</span> Hinzufügen
        </button>
      )}

      {/* Todo-Liste */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {offen.map(todo => (
          <TodoKarte key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
        ))}

        {erledigt.length > 0 && (
          <div>
            <div className="text-xs text-zinc-400 dark:text-zinc-600 mt-3 mb-1.5 flex items-center gap-1.5">
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
              Erledigt ({erledigt.length})
              <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
            </div>
            <div className="space-y-2">
              {erledigt.map(todo => (
                <TodoKarte key={todo.id} todo={todo} onToggle={onToggle} onDelete={onDelete} onEdit={onEdit} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const LS_KEY = 'todo-spalten-eingeklappt'

function ladeEingeklapptState(kolumnen) {
  try {
    const gespeichert = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
    const state = {}
    kolumnen.forEach(k => {
      const id = String(k.id)
      // Default: allgemein offen (false), Klassen-Spalten eingeklappt (true)
      state[id] = id in gespeichert ? gespeichert[id] : k.id !== 'allgemein'
    })
    return state
  } catch {
    const state = {}
    kolumnen.forEach(k => { state[String(k.id)] = k.id !== 'allgemein' })
    return state
  }
}

export default function TodoBoard() {
  const { klassen, aktuellesSchuljahr } = useStore()
  const [todos, setTodos] = useState([])
  const [klasseFaecher, setKlasseFaecher] = useState({})
  const [eingeklapptState, setEingeklapptState] = useState({})

  const ladeTodos = async () => {
    if (!aktuellesSchuljahr) return
    const daten = await window.api.todos?.getAll(aktuellesSchuljahr.id)
    if (daten) setTodos(daten)
  }

  useEffect(() => {
    ladeTodos()
  }, [aktuellesSchuljahr?.id])

  const kolumnen = [
    { id: 'allgemein', name: 'Allgemein' },
    ...klassen.map(k => ({ id: k.id, name: k.name })),
  ]

  useEffect(() => {
    setEingeklapptState(ladeEingeklapptState(kolumnen))
  }, [klassen.length])

  const setEingeklappt = (kolumneId, wert) => {
    setEingeklapptState(prev => {
      const neu = { ...prev, [String(kolumneId)]: wert }
      try { localStorage.setItem(LS_KEY, JSON.stringify(neu)) } catch {}
      return neu
    })
  }

  const ladeFaecher = async (klasseId) => {
    if (klasseFaecher[klasseId]) return
    const f = await window.api.faecher.getAll(klasseId)
    setKlasseFaecher(prev => ({ ...prev, [klasseId]: f }))
  }

  const todoErstellen = async (kolumneId, titel, fachId, faelligkeit) => {
    const klasseId = kolumneId === 'allgemein' ? null : kolumneId
    await window.api.todos?.create({ titel, klasseId, fachId, faelligkeit })
    await ladeTodos()
  }

  const todoToggle = async (id) => {
    await window.api.todos?.toggleErledigt(id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, erledigt: t.erledigt ? 0 : 1 } : t))
  }

  const todoLoeschen = async (id) => {
    await window.api.todos?.delete(id)
    setTodos(prev => prev.filter(t => t.id !== id))
  }

  const todoBearbeiten = async (id, titel) => {
    const todo = todos.find(t => t.id === id)
    await window.api.todos?.update(id, { titel, fachId: todo?.fach_id ?? null, faelligkeit: todo?.faelligkeit ?? null })
    setTodos(prev => prev.map(t => t.id === id ? { ...t, titel } : t))
  }

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
      <div className="flex gap-4 h-full">
        {kolumnen.map(kolumne => {
          const kolumneTodos = kolumne.id === 'allgemein'
            ? todos.filter(t => t.klasse_id === null || t.klasse_id === undefined)
            : todos.filter(t => t.klasse_id === kolumne.id)

          return (
            <TodoSpalte
              key={kolumne.id}
              kolumne={kolumne}
              todos={kolumneTodos}
              klasseFaecher={klasseFaecher}
              onLadeFaecher={ladeFaecher}
              onNeu={todoErstellen}
              onToggle={todoToggle}
              onDelete={todoLoeschen}
              onEdit={todoBearbeiten}
              eingeklappt={!!eingeklapptState[String(kolumne.id)]}
              setEingeklappt={(wert) => setEingeklappt(kolumne.id, wert)}
            />
          )
        })}
      </div>
    </div>
  )
}
