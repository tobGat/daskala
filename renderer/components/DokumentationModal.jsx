// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React, { useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// Benutzer-Dokumentation. WICHTIG: Bei neuen/geänderten Funktionen bitte den
// passenden Abschnitt hier mitpflegen, damit die Doku aktuell bleibt.
// Blocktypen: 'text' (String) | { h: '…' } Zwischenüberschrift |
//             { ul: […] } Liste | { tipp: '…' } Hinweisbox
// ─────────────────────────────────────────────────────────────────────────────
const DOKU = [
  {
    id: 'start', titel: 'Erste Schritte', bloecke: [
      'Daskala ist dein digitales Notenbuch. Alle Daten bleiben lokal auf deinem Gerät – es ist keine Internetverbindung nötig.',
      { h: 'Grundaufbau' },
      'Die Struktur ist immer: Schuljahr → Klasse → Fach → Schüler:innen & Noten. Ganz oben wählst du die Klasse, darunter das Fach.',
      { ul: [
        'Klasse anlegen (Tab-Leiste oben, „+")',
        'Fach hinzufügen (Fach-Leiste, „+ Fach")',
        'Schüler:innen erfassen (Schaltfläche „Schüler:innen")',
        'Noten-Spalten anlegen und Noten eintragen',
      ] },
      { tipp: 'Fast alles lässt sich per Rechtsklick anpassen (Klassen, Fächer, Spalten) und per Doppelklick umbenennen.' },
    ],
  },
  {
    id: 'klassen', titel: 'Klassen & Fächer', bloecke: [
      'Klassen und Fächer verwaltest du über die beiden Tab-Leisten ganz oben.',
      { ul: [
        'Umbenennen: Doppelklick auf den Tab',
        'Farbe, Teams-Link, KV-Markierung: Rechtsklick auf die Klasse',
        'Klasse duplizieren: Rechtsklick → „Klasse duplizieren…" (wahlweise mit Schüler:innen und/oder Jahresplanung)',
        'Fach-Optionen (Gewichtung, Benotungssystem, Schüler-Auswahl): Rechtsklick auf das Fach',
      ] },
      { h: 'Fach-spezifische Schüler:innen (Gruppen)' },
      'Beim Anlegen eines Fachs kannst du wählen, ob alle Schüler:innen der Klasse übernommen werden oder nur eine Auswahl (z. B. für Religion/Ethik oder Sprachgruppen).',
    ],
  },
  {
    id: 'schueler', titel: 'Schüler:innen', bloecke: [
      'Über „Schüler:innen" verwaltest du die Klassenliste – einzeln, per Text oder per CSV-/Excel-Import.',
      { h: 'Avatare' },
      'Jede:r Schüler:in erhält automatisch einen Avatar aus dem Namen. Über den Avatar-Editor lassen sich Gesicht, Frisur, Farben und Accessoires anpassen.',
      { tipp: 'Die Avatare werden ohne Internet erzeugt (DiceBear „lorelei", CC0) und funktionieren komplett offline.' },
    ],
  },
  {
    id: 'noten', titel: 'Noten eintragen', bloecke: [
      'In der Notentabelle legst du Spalten an (Schaltfläche „+" bzw. Spalte hinzufügen). Jede Spalte gehört zu einer Kategorie:',
      { ul: [
        'SA – Schularbeit (Note 1–5)',
        'T – Test (Note 1–5)',
        'Individuell – frei benennbare Bewertung (Note 1–5)',
        'MA – Mitarbeit (+ / −)',
        'HÜ – Hausübung (✓ / ✗)',
      ] },
      'Klicke in eine Zelle und tippe die Note bzw. das Symbol. Änderungen lassen sich rückgängig machen (Strg+Z).',
      { tipp: 'Semester 1 lässt sich einklappen, um in Semester 2 mehr Platz zu haben.' },
    ],
  },
  {
    id: 'benotung', titel: 'Benotung verstehen', bloecke: [
      'Daskala berechnet aus den Einträgen automatisch die Semester- und Zeugnisnoten.',
      { h: 'Gewichtung' },
      'Die Note bilden nur SA, Test und Individuell – nach einer Gewichtung, die du global (Einstellungen) und pro Fach (Rechtsklick → Gewichtung) festlegst.',
      { h: 'Einfluss von Mitarbeit & Hausübung' },
      'MA und HÜ sind keine eigenen Noten, sondern verschieben die Note leicht (Bonus/Malus). MA und HÜ wirken unabhängig voneinander; ihre maximale Verschiebung („Deckelung") stellst du global und pro Fach getrennt ein.',
      { h: 'SN & ZN' },
      'Pro Semester entsteht eine Semesternote (SN 1, SN 2); daraus wird die Zeugnisnote (ZN). Deren Gewichtung (Anteil von SN 1) legst du in den Einstellungen fest.',
      { h: 'Zwischennote' },
      'Liegt eine Note genau zwischen zwei Stufen (z. B. 2,5), wird die Kommastelle ausgegraut angezeigt und du wählst per Klick die bessere oder schlechtere Note.',
      { h: 'Differenzierte Beurteilung (AHS/ST)' },
      'Stellst du ein Fach auf „AHS/ST" um, wird pro Schüler:in ein Niveau geführt; die Berechnung erfolgt intern differenziert und wird korrekt auf die angezeigte Note umgerechnet.',
    ],
  },
  {
    id: 'jahresplanung', titel: 'Jahresplanung & Materialien', bloecke: [
      'In der Jahresplanung gliederst du das Schuljahr in Abschnitte und ziehst sie per Drag-&-Drop in den Kalender.',
      { h: 'Abschnitte' },
      'Über „+ Neuer Abschnitt" legst du Titel, Farbe und Inhalt an. Ein Klick auf einen Abschnitt öffnet das Bearbeiten-Modal.',
      { h: 'Materialien' },
      'Zu jedem Abschnitt kannst du Dokumente (werden in einen echten Ordner kopiert) und Links (mit Anzeigename/Beschreibung) hinterlegen. Der Wurzelordner wird beim ersten Mal abgefragt und ist in den Einstellungen änderbar.',
      { ul: [
        'Struktur auf der Festplatte: Schuljahr / Klasse / Fach / Abschnitt',
        'Auch manuell in den Ordner gelegte Dateien erscheinen in der App',
        '„Ordner öffnen" öffnet den Abschnitts-Ordner im Explorer',
        '„Exportieren" erzeugt die gesamte Jahresplanung inkl. Materiallisten als PDF',
      ] },
      { tipp: 'Benennst du eine Klasse, ein Fach oder einen Abschnitt um, wird der zugehörige Ordner automatisch mit umbenannt.' },
    ],
  },
  {
    id: 'vorlagen', titel: 'Vorlagenklassen', bloecke: [
      'Mit Vorlagenklassen planst du ein Fach einmal (Abschnitte + Materialien) und erstellst daraus beliebig oft echte Klassen.',
      { ul: [
        '„Vorlagen" (Tab-Leiste) schaltet in den Vorlagenmodus – erkennbar am grünen Leuchtrahmen',
        'Vorlage samt Jahresplanung und Materialien anlegen',
        '„Klasse aus Vorlage erstellen": eine oder mehrere Klassen auf einmal (Namensliste), wahlweise inkl. Planung',
        '„Vorlagenmodus beenden" kehrt zu den echten Klassen zurück',
      ] },
    ],
  },
  {
    id: 'stundenplan', titel: 'Stundenplan & Ferien', bloecke: [
      'Der Stundenplan ist im Dashboard sichtbar. Über „Bearbeiten" pflegst du die Stunden und – kompakt im selben Screen – die Stunden-/Pausenzeiten.',
      { h: 'Ferien' },
      'Wählst du in den Einstellungen dein Bundesland, werden die österreichischen Schulferien und Feiertage automatisch berechnet und im Kalender angezeigt. Eigene Ferien/Feiertage kannst du zusätzlich pflegen.',
      { h: 'Wettervorschau' },
      'Ist ein Bundesland eingestellt, zeigt der Stundenplan neben jedem Wochentag ein kleines Wettersymbol samt Tageshöchsttemperatur (Vorhersage für die aktuelle und kommende Tage) – praktisch z. B. zur Planung von Exkursionen. Für genauere Werte lässt sich in den Einstellungen ein konkreter Ort wählen; optional werden Vormittag, Mittag und Abend getrennt angezeigt.',
    ],
  },
  {
    id: 'schuljahr', titel: 'Neues Schuljahr', bloecke: [
      'Am Jahresende startest du über Einstellungen → „Klassen vorrücken / Neues Schuljahr beginnen" ein neues Schuljahr.',
      { ul: [
        'Du wählst, welche Klassen und Fächer vorgerückt werden',
        'Pro Schüler:in: „bleibt" oder „scheidet aus"',
        'Das alte Schuljahr wird archiviert und schreibgeschützt',
      ] },
      { tipp: 'Kalender und Ferienberechnung stellen sich automatisch auf das aktive Schuljahr um.' },
    ],
  },
  {
    id: 'sichern', titel: 'Sichern & Exportieren', bloecke: [
      'Deine Daten liegen in einer lokalen Datenbank. Für Sicherheit und Weitergabe gibt es mehrere Wege (Einstellungen → Datei/Datensicherung):',
      { ul: [
        'Backup erstellen / JSON-Export',
        '„Öffnen…" / „Speichern unter…" für die Datenbankdatei',
        'Noten-Exporte als Excel und PDF (pro Fach oder gesamt)',
      ] },
      { h: 'Automatische Sicherung' },
      'Aktiviere „Automatische Sicherung bei jedem Start" und wähle einen Zielordner (z. B. USB-Stick oder Cloud-Ordner). Daskala legt dann höchstens einmal pro Tag automatisch eine Kopie dort ab.',
      'Ist keine automatische Sicherung aktiv, erinnert dich die App nach einigen Tagen ohne Sicherung mit einem Hinweis oben im Fenster. Vor jedem Update wird zusätzlich automatisch gesichert.',
      { tipp: 'Erstelle vor größeren Änderungen (z. B. Schuljahreswechsel) ein Backup – oder aktiviere gleich die automatische Sicherung.' },
      { h: 'App zurücksetzen' },
      'In den Einstellungen ganz unten (Gefahrenzone) kannst du die App vollständig zurücksetzen. Dabei werden alle Daten unwiderruflich gelöscht – der Vorgang ist mehrfach abgesichert, und vorher wird automatisch eine Sicherheitskopie angelegt.',
    ],
  },
  {
    id: 'sperre', titel: 'App-Sperre', bloecke: [
      'Damit bei kurzer Abwesenheit niemand (z. B. Kinder) auf deine Daten zugreift, kannst du die App mit einem PIN sperren.',
      { ul: [
        'Aktivieren in den Einstellungen → App-Sperre: PIN festlegen (mindestens 4 Ziffern).',
        'Sperren mit Strg + L (Mac: Cmd + L) oder über den Knopf „Jetzt sperren".',
        'Im gesperrten Zustand sind alle Inhalte unkenntlich (verschwommen); nur mit dem PIN geht es weiter.',
      ] },
      { tipp: 'Der PIN schützt vor Blicken und Zugriff im Vorbeigehen – für echten Datenschutz sperre zusätzlich deinen Rechner.' },
    ],
  },
  {
    id: 'lizenz', titel: 'Über Daskala', bloecke: [
      'Daskala ist freie Software unter der GNU GPL-3.0 (Open Source). Du darfst die App kostenlos nutzen, weitergeben und verändern; weitergegebene Varianten müssen ebenfalls offen bleiben.',
      'Details in den Dateien LICENSE und THIRD-PARTY-NOTICES.txt.',
      { h: 'Updates' },
      'Beim Start prüft Daskala automatisch auf eine neuere Version und lädt sie im Hintergrund. Sobald ein Update bereit ist, kannst du es über „Jetzt neu starten" sofort installieren – andernfalls wird es beim nächsten Beenden übernommen. Vor jeder Installation legt Daskala automatisch eine Sicherung deiner Daten an. Nach dem Update zeigt ein kurzes Fenster die wichtigsten Neuerungen.',
    ],
  },
  {
    id: 'impressum', titel: 'Impressum', bloecke: [
      'Angaben gemäß österreichischem Medien- und E-Commerce-Recht (kleine Offenlegung).',
      { h: 'Für den Inhalt verantwortlich' },
      'Tobias Gatterbauer',
      'Brucknerweg 10, 4780 Schärding',
      'Lindenweg 4, 4783 Wernstein am Inn',
      'E-Mail: t.gatterbauer@proton.me',
      { h: 'Art des Angebots' },
      'Nicht-kommerzielles, kostenloses Open-Source-Projekt (GNU GPL-3.0), ohne Gewinnabsicht.',
    ],
  },
  {
    id: 'datenschutz', titel: 'Datenschutz', bloecke: [
      'Daskala ist auf Datensparsamkeit ausgelegt und funktioniert vollständig offline.',
      { ul: [
        'Alle Inhalte (Klassen, Noten, Materialien, Notizen) werden ausschließlich lokal auf deinem Gerät gespeichert.',
        'Es werden keine personenbezogenen Daten an Server oder Dritte übertragen – kein Tracking, keine Analyse, keine Werbung.',
        'Zur Update-Prüfung wird beim Start GitHub kontaktiert (reine Versionsabfrage, ohne personenbezogene Daten).',
        'Für die Wettervorschau im Stundenplan wird open-meteo.com abgefragt – übermittelt werden nur die Koordinaten des eingestellten Orts (bzw. der Landeshauptstadt deines Bundeslands), keine personenbezogenen Daten. Ohne Bundesland/Ort erfolgt keine Abfrage. Die Ortssuche fragt zusätzlich den Geocoding-Dienst von open-meteo.com mit deinem Suchbegriff ab.',
        'Backups liegen lokal bzw. am von dir gewählten Speicherort.',
      ] },
      { h: 'Verantwortlichkeit' },
      'Für die in der App verarbeiteten personenbezogenen Daten (z. B. Schülernoten) ist die Schule bzw. die jeweilige Lehrkraft datenschutzrechtlich verantwortlich. Der Entwickler erhält oder verarbeitet keine dieser Daten.',
      { tipp: 'Bewahre Datenbank und Backups sicher auf und gib das Gerät bzw. den Speicherort nicht unbefugt weiter.' },
    ],
  },
]

function Block({ b }) {
  if (typeof b === 'string') return <p className="text-sm text-ink-700 dark:text-paper-200 leading-relaxed mb-2.5">{b}</p>
  if (b.h) return <h4 className="text-sm font-semibold text-ink-800 dark:text-paper-100 mt-4 mb-1.5">{b.h}</h4>
  if (b.ul) return (
    <ul className="mb-2.5 space-y-1">
      {b.ul.map((it, i) => (
        <li key={i} className="text-sm text-ink-700 dark:text-paper-200 leading-relaxed flex gap-2">
          <span className="text-coral-500 flex-shrink-0 mt-0.5">•</span><span>{it}</span>
        </li>
      ))}
    </ul>
  )
  if (b.tipp) return (
    <div className="mb-2.5 flex gap-2 rounded-lg bg-coral-50/70 dark:bg-coral-900/20 border border-coral-100 dark:border-coral-900/40 px-3 py-2">
      <span aria-hidden className="flex-shrink-0">💡</span>
      <span className="text-xs text-ink-600 dark:text-paper-300 leading-relaxed">{b.tipp}</span>
    </div>
  )
  return null
}

export default function DokumentationModal({ onClose }) {
  const secRefs = useRef({})
  const scrollTo = (id) => {
    const el = secRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-4xl w-full flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white">📖 Dokumentation</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 text-sm w-7 h-7 flex items-center justify-center">✕</button>
        </div>

        <div className="flex gap-5 flex-1 min-h-0">
          {/* Inhaltsverzeichnis */}
          <nav className="hidden sm:flex flex-col gap-0.5 w-44 flex-shrink-0 overflow-y-auto pr-1 border-r border-paper-100 dark:border-ink-800">
            {DOKU.map(s => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className="text-left text-xs px-2 py-1.5 rounded-md text-ink-600 dark:text-ink-300 hover:bg-paper-100 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-paper-100 transition-colors"
              >
                {s.titel}
              </button>
            ))}
          </nav>

          {/* Inhalt */}
          <div className="flex-1 overflow-y-auto pr-1 -mr-1 min-w-0">
            {DOKU.map(s => (
              <section key={s.id} ref={el => { secRefs.current[s.id] = el }} className="mb-6 scroll-mt-2">
                <h3 className="text-base font-bold text-coral-700 dark:text-coral-300 mb-2 pb-1 border-b border-paper-100 dark:border-ink-800">
                  {s.titel}
                </h3>
                {s.bloecke.map((b, i) => <Block key={i} b={b} />)}
              </section>
            ))}
            <p className="text-[11px] text-ink-400 text-center pt-2 pb-1">
              Daskala – Digitales Notenbuch · diese Dokumentation wird laufend gepflegt.
            </p>
          </div>
        </div>

        <div className="pt-4 mt-2 border-t border-paper-100 dark:border-ink-800">
          <button className="btn-primary w-full text-sm" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  )
}
