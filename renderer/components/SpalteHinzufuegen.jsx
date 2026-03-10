import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'

const KATEGORIEN = [
  { id: 'MA', label: 'Mitarbeit', kuerzel: 'MA', farbe: 'bg-green-100 text-green-800' },
  { id: 'HÜ', label: 'Hausübung', kuerzel: 'HÜ', farbe: 'bg-blue-100 text-blue-800' },
  { id: 'T', label: 'Test', kuerzel: 'T', farbe: 'bg-purple-100 text-purple-800' },
  { id: 'SA', label: 'Schularbeit', kuerzel: 'SA', farbe: 'bg-orange-100 text-orange-800' },
  { id: 'CUSTOM', label: 'Individuell', kuerzel: '', farbe: 'bg-gray-100 text-gray-800' },
]

export default function SpalteHinzufuegen({ onClose }) {
  const { aktivesFach, aktiveSemester, ladeSpalten, refreshZeugnisnoten } = useStore()

  const [kategorie, setKategorie] = useState('MA')
  const [kuerzel, setKuerzel] = useState('MA')
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const kat = KATEGORIEN.find(k => k.id === kategorie)
    if (kat && kat.id !== 'CUSTOM') {
      setKuerzel(kat.kuerzel)
    }
  }, [kategorie])

  const handleSpeichern = async () => {
    if (!kuerzel.trim()) return
    if (!aktivesFach) return
    setLoading(true)
    try {
      await window.api.spalten.create({
        fachId: aktivesFach.id,
        semester: aktiveSemester,
        kategorie,
        kuerzel: kuerzel.trim(),
        datum: datum || null,
      })
      await ladeSpalten()
      await refreshZeugnisnoten()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-5">Spalte hinzufügen</h2>

        {/* Kategorie-Auswahl */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategorie</label>
          <div className="grid grid-cols-2 gap-2">
            {KATEGORIEN.map(kat => (
              <button
                key={kat.id}
                className={`px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors border-2
                  ${kategorie === kat.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                    : 'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                onClick={() => setKategorie(kat.id)}
              >
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-2 ${kat.farbe}`}>{kat.kuerzel || 'IND'}</span>
                {kat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Kürzel */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Kürzel {kategorie !== 'CUSTOM' && <span className="text-gray-400 font-normal">(anpassbar)</span>}
          </label>
          <input
            className="input"
            value={kuerzel}
            onChange={e => setKuerzel(e.target.value)}
            placeholder="z.B. SA, T, MA"
            maxLength={10}
          />
        </div>

        {/* Datum */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Datum</label>
          <input
            className="input"
            type="date"
            value={datum}
            onChange={e => setDatum(e.target.value)}
          />
        </div>

        {/* Semester */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Semester</label>
          <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded">
            Semester {aktiveSemester} (aktuell)
          </span>
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary flex-1" onClick={handleSpeichern} disabled={loading || !kuerzel.trim()}>
            {loading ? 'Speichern…' : 'Hinzufügen'}
          </button>
        </div>
      </div>
    </div>
  )
}
