import React, { useEffect } from 'react'
import useStore from '../store/useStore'

// Farbgebung nach Typ – nutzt die App-Palette (mint = Erfolg, rose = Fehler, ink = neutral)
const TYP_STYLE = {
  success: 'bg-mint-600 text-white',
  error:   'bg-rose-600 text-white',
  info:    'bg-ink-800 dark:bg-ink-700 text-white',
}

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const dauer = toast.duration ?? 4000
    if (dauer <= 0) return                 // duration 0 → bleibt bis zum Klick
    const t = setTimeout(() => onDismiss(toast.id), dauer)
    return () => clearTimeout(t)
  }, [toast.id])

  return (
    <div
      role="status"
      onClick={() => onDismiss(toast.id)}
      title="Zum Schließen klicken"
      className={`${TYP_STYLE[toast.type] ?? TYP_STYLE.info}
        flex items-start gap-2 max-w-sm px-4 py-2.5 rounded-xl shadow-pop
        text-sm font-medium whitespace-pre-line cursor-pointer select-none
        animate-slide-up`}
    >
      <span className="flex-1">{toast.message}</span>
      <span className="opacity-60 leading-none text-base">×</span>
    </div>
  )
}

// Fixierter Container unten rechts. Zeigt alle aktiven Toasts.
export default function Toaster() {
  const toasts = useStore(s => s.toasts)
  const dismissToast = useStore(s => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      <div className="flex flex-col gap-2 pointer-events-auto">
        {toasts.map(t => (
          <Toast key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
    </div>
  )
}
