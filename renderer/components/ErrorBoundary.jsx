import React from 'react'

// Fängt Render-Fehler in der Oberfläche ab, damit statt eines weißen Bildschirms
// eine verständliche Meldung erscheint. Die Daten liegen in der DB und sind nicht betroffen.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unerwarteter Fehler in der Oberfläche:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="fixed inset-0 bg-paper-50 dark:bg-ink-950 flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-bold text-ink-900 dark:text-paper-100 font-display mb-2">
            Etwas ist schiefgelaufen
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
            Die Ansicht konnte nicht angezeigt werden. Deine Daten sind gespeichert –
            du kannst die App einfach neu laden.
          </p>
          <pre className="text-[11px] text-left text-ink-400 bg-paper-100 dark:bg-ink-900 rounded-lg p-3 mb-4 max-h-32 overflow-auto whitespace-pre-wrap">
            {String(this.state.error?.message ?? this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-coral-600 hover:bg-coral-700 text-white text-sm font-medium"
          >
            App neu laden
          </button>
        </div>
      </div>
    )
  }
}
