// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
import React from 'react'

// Änderungsprotokoll – neueste Version oben.
// WICHTIG: `version` muss der veröffentlichten App-Version entsprechen. Beim
// nächsten Release oben einen neuen Eintrag ergänzen.
export const CHANGELOG = [
  {
    version: '1.6.0',
    datum: '2026-08-21',
    punkte: [
      'Zentrale Schüler:innen-Verwaltung: Der neue Button „Schüler:innen" (neben „Dashboard") zeigt alle Schüler:innen des Schuljahrs auf einen Blick – mit Merkmalen (Lernschwäche/Legasthenie/SPF), Klassen- und Fächer-Zuordnung. Die Tabelle dient der Ansicht; bearbeitet wird über „✎ Bearbeiten" am Zeilenende in einem eigenen Fenster (Name, Merkmale, Klassen- und Fächer-Zuordnung gebündelt).',
      'Klassenübergreifende Gruppen: Schüler:innen können jetzt mehreren Klassen angehören. Lege ein Fach mit „Auswahl" an und stelle die Gruppe aus Schüler:innen beliebiger Klassen zusammen (im Dialog nach Klasse gruppiert). Neu angelegte Personen werden global gespeichert und automatisch der aktuellen Klasse zugeordnet.',
      'Sicheres Löschen: Beim Löschen einer Klasse bleiben Schüler:innen erhalten, die noch anderen Klassen angehören – nur ihre Zuordnung zu dieser Klasse entfällt. Endgültig gelöscht werden nur Personen, die ausschließlich in dieser Klasse waren.',
      'Fächer je Person: Im Bearbeiten-Fenster lassen sich einzelne „Auswahl"-Fächer (nach Klasse gruppiert) an- und abwählen; „ganze Klasse"-Fächer ergeben sich automatisch aus der Klassenzugehörigkeit. Die Fächer-Spalte in der Tabelle ist kompakt (erste Fächer + „+N").',
      'SPF je Fach: Sonderpädagogischer Förderbedarf gilt jetzt fachbezogen. Im Bearbeiten-Fenster wählst du, in welchen Fächern ein Kind SPF hat – der SPF-Badge erscheint dann nur in diesen Fächern (z. B. in der Notentabelle). Bestehende SPF-Kennzeichnungen werden auf alle Fächer der Stammklasse übernommen und können danach verfeinert werden.',
      'Tabelle in der Schüler:innen-Verwaltung: Vor- und Nachname stehen jetzt in eigenen Spalten; per Klick auf die Überschrift „Vorname", „Nachname" oder „Klassen" wird sortiert (auf-/absteigend; Klassen nach Stammklasse). Zusätzlich lässt sich oben nach Klasse und nach Merkmalen (LS/LEG/SPF) filtern.',
      'Live-Suche bei der Schülerauswahl: Beim Anlegen/Bearbeiten eines Fachs (Modus „Auswahl") filtert ein Suchfeld die Schüler:innen sofort. Das Fachnamen-Feld reagiert dabei wieder flüssig, auch bei vielen Schüler:innen.',
      'Sortierung durchgängig: Zusätzlich zu einer Klasse zugeordnete Schüler:innen erscheinen in der Notentabelle jetzt ebenfalls nach dem eingestellten Modus (Vor-/Nachname bzw. manuell) – nicht mehr nur am Ende.',
      'Standard-Sortierung & Merken: Die Schüler:innen-Verwaltung ist standardmäßig nach Klasse aufsteigend sortiert; die zuletzt gewählte Sortierung bleibt bis zum Neustart erhalten.',
      'Stammdaten je Schüler:in: Im Bearbeiten-Fenster erfasst du zentral Geburtsdatum, Adresse (Straße, PLZ, Ort), Telefon, E-Mail, Notfallnummer, Erziehungs- und Abholberechtigte sowie Anmerkungen. Erfasste Kontaktdaten erscheinen kompakt im Detail-/Leistungsprofil.',
      'Aufgeräumtes Bearbeiten-Fenster: Merkmale, SPF, Klassen und Fächer stehen jetzt geordnet untereinander (gleiche Ausrichtung, „ändern" rechts). Klassen und Fächer wählst du – wie SPF – in einem eigenen Auswahl-Fenster. Den Avatar änderst du über das Avatar-Bild oben links – und ausschließlich hier (aus Klassenliste und Detail-Profil wurde die direkte Avatar-Bearbeitung entfernt).',
      'Spalten wählen & anordnen: Über „Spalten ▾" in der Schüler:innen-Verwaltung blendest du ein, welche Informationen die Tabelle anzeigt (Merkmale, Klassen, Fächer sowie Stammdaten wie Telefon, Adresse, Notfallnummer …), und änderst mit ▲/▼ ihre Reihenfolge. Standardmäßig sichtbar: Vorname, Nachname, Merkmale, Klassen, Telefon und Adresse. Auch Vor- und Nachname lassen sich per ▲/▼ verschieben (bleiben aber immer sichtbar). Die Auswahl bleibt bis zum Neustart erhalten.',
      'Anlegen zentralisiert: Neue Schüler:innen werden ausschließlich in der zentralen „Schüler:innen"-Verwaltung angelegt (einzeln oder per CSV-/Excel-Import, mit Wahl der Stammklasse). Das Schüler:innen-Modal in der Klassenansicht dient nur noch dazu, bereits vorhandene Personen der Klasse hinzuzufügen.',
      'Klassen-Modal aufgeräumt: Merkmale u. Ä. lassen sich dort nicht mehr direkt umschalten – „✎ Bearbeiten" öffnet dasselbe Fenster wie die zentrale Verwaltung (Name, Merkmale, Klassen, Fächer, SPF, Stammdaten). Vorhandene Schüler:innen fügst du per Live-Suche hinzu: getippte Zeichen filtern sofort, es werden nur Treffer (Name oder Klasse) gelistet.',
      'Archiv wiederherstellen genauer: Beim Zurückholen eines archivierten Schuljahres werden nur die Schüler:innen wieder aktiv, die zum Zeitpunkt des Jahreswechsels aktiv waren – unterjährig entfernte Schüler:innen bleiben entfernt und werden nicht mehr versehentlich wiederbelebt.',
      'Schneller: Die Neuberechnung der Zeugnisnoten eines Fachs lädt Aufzeichnungen und Einstellungen jetzt gebündelt statt einzeln – spürbar flotter bei großen Klassen und vielen Spalten. Das Leistungsprofil berechnet nur noch die geöffnete Person neu.',
      'Detailplanung mit mehreren Parallelklassen: Über „+ Parallel" lassen sich jetzt beliebig viele Parallelklassen gleichzeitig als Spalten einblenden (z. B. Deutsch 1a neben 1b und 1c). Die Spalten behalten eine lesbare Mindestbreite; passen nicht alle nebeneinander, kann man horizontal scrollen.',
      'Jahresplanung-Import: Im „Importieren"-Fenster gibt es unter „Aus Datei (KI-Planung)" nun „↓ JSON-Vorlage herunterladen" – eine leere Beispiel-Datei im richtigen Format zum selbst Ausfüllen oder als Muster für einen Chatbot.',
    ],
  },
  {
    version: '1.5.0',
    datum: '2026-08-16',
    punkte: [
      'Zeugnisnote-Detail: Ein Klick auf eine Zeugnisnote öffnet ein Fenster mit der Aufschlüsselung der Note. Schularbeiten, Tests und individuelle Leistungen kannst du dort ansehen und ändern (nach Kategorie gruppiert) – die Zeugnisnote-Vorschau aktualisiert sich sofort. Die Zeugnisnote lässt sich manuell überschreiben und wieder auf die Berechnung zurücksetzen.',
      'Mitarbeitsnote als Gesamtbeurteilung (§ 4 Abs. 2 LBVO): Im Zeugnisnote-Detail kannst du die Mitarbeitsnote direkt festlegen, statt einzelne + / − und ✓ / ✗ zu bearbeiten. Die manuelle Note überschreibt den berechneten Durchschnitt und fließt in die Zeugnisnote ein; „Berechnet" stellt den Durchschnitt wieder her.',
      'Rezenz-Faktor pro Schüler:in (§ 20 LBVO): Im Zeugnisnote-Detail stellst du mit einem Schieberegler ein, wie stark neuere Leistungen zählen – ein Liniendiagramm zeigt über den Winkel der Linie die Wirkung. Beim Speichern wählst du, ob der Faktor nur für diese:n Schüler:in oder für die ganze Klasse gelten soll. Der globale Wert (Einstellungen) bleibt Standard.',
      'Gewichtung im Zeugnisnote-Detail anpassen: Ein Klick auf die Prozentwerte in der Aufschlüsselung öffnet den Gewichtungs-Editor (SA/Test/Individuell/Mitarbeit). Beim Speichern wählst du – wie beim Rezenz-Faktor – ob die Gewichtung nur für diese:n Schüler:in oder für die ganze Klasse gilt.',
      'Eigene Symbole jetzt auch bei der 2-stufigen Mitarbeit: Beim Erstellen einer Mitarbeitsspalte lassen sich – wie bei 3- und 4-stufig – eigene Symbole festlegen (Wertung nach Position: erstes = positiv, zweites = negativ). Standard bleibt + / − bzw. ↗ / ↘.',
    ],
  },
  {
    version: '1.4.0',
    datum: '2026-08-16',
    punkte: [
      'Mitarbeit neu (§ 4 Abs. 2 LBVO): Aus Bonus/Malus + Hausübung wird eine einzige Mitarbeitsnote berechnet (Verhältnis positiv/negativ, ausgeglichen = 3) und mit eigenem Anteil in die Note eingerechnet. Neue 3-stufige Skala + / ~ / − mit eigenen Symbolen. Die separate benotete Mitarbeitsnote (1–5) und die Einfluss-Deckelung entfallen.',
    ],
  },
  {
    version: '1.3.2',
    datum: 'August 2026',
    punkte: [
      'Schüler:innen-Namen lassen sich jetzt auch nachträglich bearbeiten: In der Schüler:innen-Verwaltung („Liste") öffnet ein Klick auf ✎ die Felder für Vor- und Nachname. Der geänderte Name erscheint sofort überall (Notentabelle, Sitzplan, Exporte).',
    ],
  },
  {
    version: '1.3.1',
    datum: 'August 2026',
    punkte: [
      'Behoben: Bei der Mitarbeitsnote gewählte eigene Symbole (statt der Ziffern 1–5) wurden nicht gespeichert – jetzt bleiben sie erhalten.',
      'Behoben: Der Hinweis „Keine Mitarbeit erfasst" (§ 3 LBVO) erschien fälschlich, wenn die Mitarbeit über Smileys bzw. eigene Symbole erfasst wurde; außerdem passt die Rechenherleitung im Tooltip nun wieder exakt zur angezeigten Zeugnisnote.',
      'Der § 3-Hinweis berücksichtigt jetzt nur echte Mitarbeit (Mitarbeits-Symbole oder benotete Mitarbeit) – eine bloße Hausübung unterdrückt ihn nicht mehr. Ohne jede Mitarbeit/Note bildet eine reine Hausübung keine Zeugnisnote.',
      'Behoben: Bei differenzierten Fächern (AHS/ST) konnten Klassenschnitt und Detailwerte außerhalb von 1–5 liegen; die Note bleibt jetzt sauber im gültigen Bereich.',
      'Genauere Rundung der Zeugnisnote: Ergebnisse werden nicht mehr fälschlich als „Zwischennote" (x,5) markiert.',
      'Beim Einträge-Speichern und beim Update (Übernahme manueller Semesternoten, Neuberechnung aller laufenden Schuljahre) wurde die Datensicherheit verbessert.',
      'Einstellungen: klarere Beschreibung der maximalen Verschiebung durch Mitarbeit und Hausübung.',
    ],
  },
  {
    version: '1.3.0',
    datum: 'August 2026',
    punkte: [
      'Eine durchgehende Zeugnisnote: Statt getrennter Semesternoten (SN 1/SN 2) und einer daraus gemischten Endnote gibt es jetzt eine einzige Note, die laufend aus allen Aufzeichnungen des ganzen Jahres berechnet wird. Am Ende von Semester 1 ist sie ein vorläufiger Zwischenstand (im Kopf mit „ZN*" markiert). Die frühere Semestergewichtung entfällt.',
      'Neuere Leistungen stärker gewichten (§ 20 LBVO): Über einen einstellbaren Rezenz-Faktor zählt der zuletzt erreichte Leistungsstand stärker als frühere Leistungen – durchgehend übers ganze Jahr. Beim ersten Start bzw. nach dem Update legst du den Faktor einmalig fest.',
      'Mitarbeitsnote: Mitarbeit kann jetzt als echte Note (Skala 1–5) mit eigener Gewichtung geführt werden – niveau-fähig (AHS/ST). Damit entsteht auch in Fächern ohne Schularbeiten/Tests eine belastbare Zeugnisnote. Die bekannte symbolische Mitarbeit (+/−, ↗/↘, Smileys) bleibt weiterhin Bonus/Malus.',
      'Eigene Symbole: Bei der 4-stufigen Mitarbeit lassen sich die Smileys je Spalte durch eigene Symbole ersetzen; ebenso bei der neuen Note-Skala (fünf frei wählbare Symbole für die Noten 1–5).',
      'Mitarbeit-Hinweis (§ 3 LBVO): Fehlt jede Mitarbeit/Hausübung, obwohl Noten vorhanden sind, weist ein Hinweis darauf hin, dass schriftliche Leistungen nicht die alleinige Beurteilungsgrundlage sein dürfen (abschaltbar).',
      'Der maximale Einfluss von Mitarbeit und Hausübung lässt sich nun bis zu 4 Noten erhöhen (zuvor 1,5).',
      'Spalten-Dialog: Die Bewertungsvariante „Note" ist farblich abgesetzt, und beim Überfahren der Varianten erscheint eine kurze Info.',
    ],
  },
  {
    version: '1.2.1',
    datum: 'August 2026',
    punkte: [
      'Behoben: Die App ließ sich nach dem Update auf 1.2.0 nicht mehr öffnen (ein Paketierungsfehler ließ interne Programmteile im Installationspaket fehlen). 1.2.1 startet wieder normal – alle Daten bleiben unverändert erhalten.',
    ],
  },
  {
    version: '1.2.0',
    datum: 'August 2026',
    punkte: [
      'Archiv: Das zuletzt archivierte Schuljahr lässt sich unter Einstellungen → „Archiv" wiederherstellen – es wird wieder zum aktuellen Jahr, das derzeit aktuelle wandert dafür ins Archiv. So nimmst du einen versehentlichen Jahreswechsel zurück, ohne dass etwas verloren geht.',
      'Archiv: Nicht mehr benötigte archivierte Schuljahre können endgültig gelöscht werden (mit allen Klassen, Fächern, Schüler:innen und Noten).',
      'Behoben: Der PDF- und ODS-Export eines Archivs enthält wieder alle Schüler:innen und Noten (zuvor blieb der Export eines abgeschlossenen Jahres leer).',
      'Behoben: Beim Jahreswechsel übernimmt jedes neue Fach nun das Benotungssystem des Vorgängerfachs, und die App startet automatisch im 1. Semester.',
      'Behoben: Beim Umschalten des Benotungssystems bleibt das aktuell gewählte Fach aktiv (kein Sprung auf den ersten Tab mehr).',
    ],
  },
  {
    version: '1.0.72',
    datum: 'August 2026',
    punkte: [
      'Mitarbeit: Neben + / − und den Smileys gibt es jetzt eine Pfeil-Darstellung ↗ / ↘ – rein optisch, die Bewertung bleibt gleich. Die Skala wählst du weiterhin je Spalte; eine neue MA-Spalte übernimmt die zuletzt verwendete Variante.',
      'Einstellungen: Unter „Erweitert – Einfluss je Stufe" lässt sich jetzt für jede Mitarbeits-Stufe (Aufwärts, Abwärts und die vier Smileys) einzeln festlegen, wie stark ein Eintrag die Note verschiebt. Die Standardwerte entsprechen dem bisherigen Verhalten.',
    ],
  },
  {
    version: '1.0.71',
    datum: 'August 2026',
    punkte: [
      'Mitarbeit: Beim Anlegen einer MA-Spalte lässt sich jetzt eine vierstufige Smiley-Skala wählen – 😄 sehr fröhlich (+0,1), 🙂 mäßig fröhlich (+0,05), 🙁 mäßig traurig (−0,05), 😞 sehr traurig (−0,1). Die klassische zweistufige Bewertung (+ / −) bleibt unverändert; bestehende Spalten sind weiterhin zweistufig.',
      'Klarstellung zur Deckelung: Alle Mitarbeits-Einträge werden zu einer Rohsumme addiert und erst danach auf die maximale Verschiebung begrenzt – viele Minus bleiben „im Minus", bis genug Plus die Rohsumme wieder über die Grenze hebt.',
    ],
  },
  {
    version: '1.0.70',
    datum: 'Juli 2026',
    punkte: [
      'Behoben: Bei einer Neuinstallation konnten im ersten Programmlauf einzelne Angaben fehlschlagen – Termine mit Unterrichtsstunde bzw. Bis-Uhrzeit, Details von Supplierstunden sowie KV-Unteraufgaben. Diese Felder stehen nun ab dem ersten Start korrekt zur Verfügung.',
      'Unter der Haube: umfangreiches automatisiertes Testnetz für die Datenbank-Schnittstelle – mehr Sicherheit bei künftigen Änderungen.',
    ],
  },
  {
    version: '1.0.68',
    datum: 'Juli 2026',
    punkte: [
      'Stundenplan: Beim Belegen einer Stunde lässt sich jetzt ein Wochen-Rhythmus wählen – jede Woche, alle 2 Wochen (14-tägig), alle 3 oder 4 Wochen oder ein individueller Abstand. Die Stunde erscheint nur in den betreffenden Wochen; im Bearbeitungsmodus werden aussetzende Wochen ausgegraut angezeigt.',
      '„PDF exportieren" bietet nun zwei Möglichkeiten: „Stundenplan exportieren" erzeugt den Wochenplan als optisch aufbereitete PDF im Querformat (zum Ausdrucken und Aufhängen), „Planung exportieren" wie bisher die Unterrichtsinhalte ausgewählter Wochen.',
      'Stundenplan: Rechtsklick auf „Entfall" öffnet ein Untermenü – „ersatzlos" oder „Durch Supplierung ersetzen" (öffnet direkt den Dialog für eine Supplierstunde).',
      'Dashboard: Das Infofeld heißt jetzt „ToDos" (statt „offen"); ToDo/Termin-Zahlen erscheinen im korrekten Singular/Plural (1 ToDo, 2 ToDos / 1 Termin, 2 Termine).',
    ],
  },
  {
    version: '1.0.67',
    datum: 'Juli 2026',
    punkte: [
      'Stundenplan: Im Bearbeitungsmodus lassen sich Stunden per Drag & Drop in einen anderen Slot ziehen. Ziehst du eine Stunde auf einen bereits belegten Slot, werden die beiden getauscht – hinterlegte Wochenplanung wandert mit.',
      'Termine und ToDos werden jetzt in einem übersichtlichen Dialog erstellt und bearbeitet – statt in den gedrängten Feldern der Seitenleiste.',
      'Neu: Archiv in den Einstellungen. Abgeschlossene (archivierte) Schuljahre lassen sich dort vollständig als ODS-Tabelle oder PDF exportieren. Der bisherige Archiv-Button in der Kopfzeile entfällt.',
      'Alle Tabellen-Exporte erfolgen jetzt als OpenDocument-Tabelle (ODS) inklusive Zeugnisnote (ZN). Die Standard-Dateinamen enthalten Klasse/Fach bzw. Schuljahr und das Exportdatum (z. B. „export_noten_1a_Deutsch_27-04-2026.ods").',
      'Notentabelle: „Schüler:innen" und „Export" sind in die Fach-Toolbar gewandert (an die Stelle des früheren „+ Spalte"-Buttons); neue Spalten legst du weiterhin über das „+"-Feld in der Tabelle an. Der Klassenschnitt steht jetzt ganz rechts.',
      'Differenzierte Fächer (AHS/ST): Der Klassenschnitt wird getrennt nach AHS und ST angezeigt, da die Noten auf unterschiedlichen Skalen liegen.',
      'Der „Vorlagen"-Bereich wird nur noch angezeigt, wenn das Planungsmodul aktiv ist.',
      'Klassenvorstand (KV) ist als „Beta" gekennzeichnet. Ein Klick auf eine Klasse verlässt den KV-Bereich nun zuverlässig.',
      'Aufgeräumt: die Schuljahr-Auswahl in der oberen Leiste wurde entfernt.',
    ],
  },
  {
    version: '1.0.66',
    datum: 'Juli 2026',
    punkte: [
      'Notentabelle: Spalten lassen sich per Rechtsklick auf den Spaltenkopf wahlweise „nach Kategorie" oder wieder „chronologisch" (nach Datum) sortieren.',
      'Hausübungen haben jetzt einen dritten Zustand „—" (nicht gewertet / entfällt): ein sichtbarer Vermerk ohne Einfluss auf die Note – im Unterschied zu einer leeren Zelle.',
      'Differenzierte Fächer (AHS/ST): Im Leistungsdiagramm des Schüler:innen-Profils werden Niveau-Wechsel dargestellt – farbig hinterlegte Bereiche (grün AHS / gelb ST) mit Wechsel-Markierung. An jedem Schularbeits-/Test-Punkt stehen zudem Datum und Thema (das Thema gibst du beim Anlegen der SA-/Test-Spalte ein).',
      'Schüler:innen-Profil: Semester- und Zeugnisnoten je Fach sind mit einem farbigen Kästchen hervorgehoben (grün 1 bis rot 5).',
      'Korrektur: Im Schüler:innen-Profil wurden Semester-/Zeugnisnoten differenzierter Fächer falsch (auf der internen Skala) angezeigt – sie erscheinen jetzt korrekt auf dem aktuellen Niveau.',
      'Behoben: Der Avatar-Editor zeigte vor dem ersten Speichern ein anderes Gesicht als die App; der Avatar wird im PDF-Export nun vollständig dargestellt; das Popup zur manuellen Zeugnisnote erscheint wieder vollständig im Vordergrund.',
    ],
  },
  {
    version: '1.0.65',
    datum: 'Juli 2026',
    punkte: [
      'Neu: Jahresplanung mit KI. In den Einstellungen unter „KI-Unterstützung" exportierst du eine Anleitung für einen Chatbot (z. B. ChatGPT oder Claude). Dieser fragt nach Fach, Inhalten, Schwerpunkten und Materialien und erstellt daraus eine Planung, die du beim gewünschten Fach über „Importieren → Aus Datei" übernimmst.',
      'Jahresplanungs-Abschnitte haben jetzt zusätzlich ein Feld für Kompetenzen (Lehrplan) – sichtbar im Tooltip und im Export.',
      'Der Export der Jahresplanung erfolgt jetzt als ODT-Dokument (Tabelle im Querformat: Zeitraum, Inhalt, Zielsetzungen, Kompetenzen, Materialien) – bearbeitbar in Word, LibreOffice und Co.',
      'Beim Überfahren eines Abschnitts erscheinen die Details in einem großen, zweispaltigen Tooltip mittig über dem leicht abgeblendeten Kalender.',
      'Das Fenster zum Bearbeiten eines Abschnitts ist größer und zweispaltig; die Textfelder wachsen mit dem Inhalt mit.',
    ],
  },
  {
    version: '1.0.64',
    datum: 'Juli 2026',
    punkte: [
      'Vorlagen neu gedacht: Eine Fach-Jahresplanung lässt sich jetzt direkt auf ein oder mehrere bestehende Fächer anwenden – auch über mehrere Klassen gleichzeitig (z. B. „Musikplanung 1. Klasse" auf Musik in 1a, 1b und 1c). Die bisherige „Klasse aus Vorlage erstellen"-Funktion entfällt dafür.',
      'Jahresplanung: Abschnitte haben jetzt ein eigenes Feld für Lernziele.',
      'Jahresplanung: Beim Überfahren eines Abschnitts erscheint ein großer Tooltip mit Zeitraum, Inhalt und Lernzielen.',
      'PDF-/Word-Export der Jahresplanung: je Abschnitt jetzt mit gut sichtbarem Zeitraum (Beginn/Ende), Inhalt, Lernzielen und Materiallisten.',
    ],
  },
  {
    version: '1.0.63',
    datum: 'Juli 2026',
    punkte: [
      'Klassen-Reiter oben lassen sich jetzt per Drag-&-Drop in die gewünschte Reihenfolge ziehen.',
      'Sitzplan: Tische lassen sich im Bearbeitungsmodus mit ⟳ um 90° drehen – die Namensschilder der Kinder bleiben dabei aufrecht und lesbar.',
      'Sitzplan: Ein Kind kann nicht mehr versehentlich doppelt platziert werden. Setzt du es auf einen neuen Platz, wird gefragt, ob es dorthin verschoben werden soll.',
      'Fehler behoben: Das Verschieben von Tischen im Sitzplan konnte (vor allem unter Linux) zu Abstürzen führen.',
    ],
  },
  {
    version: '1.0.62',
    datum: 'Juli 2026',
    punkte: [
      'Schüler:innen-Listen lassen sich jetzt pro Klasse sortieren: nach Vorname, nach Nachname oder manuell. Bei „Manuell" bringst du die Reihenfolge per Drag-&-Drop selbst in Ordnung. Die Sortierung wählst du oben in der Notentabelle.',
      'Neu in den Einstellungen: Anzeige der App-Version und ein Button „Auf Updates prüfen".',
    ],
  },
  {
    version: '1.0.61',
    datum: 'Juli 2026',
    punkte: [
      'Fehler behoben: Ein Fach mit bereits erfassten Noten oder Notenspalten lässt sich jetzt zuverlässig löschen – die zugehörigen Notendaten werden dabei sauber mitentfernt.',
      'Mehr Stabilität und Sicherheit im Hintergrund: robustere Datenbank-Aktualisierung und aussagekräftigere Fehlerprotokolle bei Problemen.',
      'App-Sperre: klarer Hinweis in den Einstellungen, dass der PIN ein Sichtschutz und keine Verschlüsselung ist.',
    ],
  },
  {
    version: '1.0.59',
    datum: 'Juli 2026',
    punkte: [
      'Wettervorschau im Stundenplan – mit genauer Ortssuche, optionaler Anzeige nach Tageszeiten (Vormittag/Mittag/Abend) und einem kleinen Symbol samt Temperatur direkt in jeder Stundenzelle.',
      'Datensicherung deutlich verbessert: automatische Sicherung in einen Ordner (sparsam – nur bei Änderungen, Anzahl wählbar), Erinnerung ans Sichern und automatische Sicherung vor jedem Update.',
      'Sicherungen lassen sich jetzt direkt in der App wiederherstellen (mit Datum und Art zur Auswahl).',
      'App-Sperre mit PIN (Strg + L) – blendet die Inhalte bei Abwesenheit aus.',
      'Beim Anlegen von Schüler:innen können gleich die Fächer gewählt werden; mit Enter speichern und flüssig den nächsten Namen eintippen.',
      'Nach Updates werden die Neuerungen in diesem Fenster angezeigt.',
      'Einstellungen übersichtlicher in einklappbare Bereiche gegliedert.',
      'Daskala gibt es jetzt auch für Linux (AppImage, deb, rpm).',
      'Dashboard aufgeräumt.',
    ],
  },
]

// Versionsvergleich „a > b" → >0, gleich → 0, „a < b" → <0.
export function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d
  }
  return 0
}

export default function ChangelogModal({ versionen, onClose }) {
  const eintraege = versionen && versionen.length ? versionen : CHANGELOG.slice(0, 1)
  return (
    <div className="modal-overlay" style={{ zIndex: 140 }} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex items-center gap-2">
            <span>🎉</span> Was ist neu
          </h2>
          <button className="text-ink-400 hover:text-ink-600 text-xl" onClick={onClose}>✕</button>
        </div>
        <p className="text-xs text-ink-400 dark:text-ink-500 mb-5">Danke fürs Aktualisieren! Das hat sich geändert:</p>

        <div className="space-y-6">
          {eintraege.map(v => (
            <section key={v.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-sm font-semibold text-coral-600 dark:text-coral-400">Version {v.version}</span>
                {v.datum && <span className="text-[11px] text-ink-400">{v.datum}</span>}
              </div>
              <ul className="space-y-1.5">
                {v.punkte.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700 dark:text-paper-200">
                    <span className="text-coral-500 flex-shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-6">
          <button className="btn-primary w-full" onClick={onClose}>Verstanden</button>
        </div>
      </div>
    </div>
  )
}
