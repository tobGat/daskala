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
      { h: 'Zentrale Schüler:innen-Verwaltung' },
      'Der Button „Schüler:innen" (neben „Dashboard") öffnet eine klassenübergreifende Gesamtliste aller Schüler:innen des Schuljahrs – mit Merkmalen (Lernschwäche/Legasthenie/SPF), Klassen- und Fächer-Zuordnung. Vor- und Nachname stehen in eigenen Spalten; ein Klick auf die Überschrift „Vorname", „Nachname" oder „Klassen" sortiert die Liste (nochmal klicken kehrt die Richtung um; „Klassen" sortiert nach der Stammklasse). Standardmäßig ist nach Klasse aufsteigend sortiert; deine zuletzt gewählte Sortierung bleibt bis zum Neustart erhalten. Oben filterst du nach Klasse und nach Merkmalen (LS/LEG/SPF). Die Tabelle dient der Ansicht; ein Klick auf den Namen öffnet das Leistungsprofil. Zum Ändern klickst du „✎ Bearbeiten" am Zeilenende – ein eigenes Fenster bündelt Name, Merkmale, Klassen- und Fächer-Zuordnung sowie die Stammdaten und speichert alles auf einmal. Auch den Avatar änderst du dort (Klick auf das Avatar-Bild oben links) – ausschließlich hier.',
      'Schüler:innen können mehreren Klassen angehören. So lassen sich klassenübergreifende Gruppen bilden: Lege ein Fach mit „Auswahl" statt „Ganze Klasse" an und wähle Personen aus beliebigen Klassen (im Auswahl-Dialog nach Klasse gruppiert, mit Live-Suche). Personen werden global gespeichert und der bei der Anlage gewählten Klasse als Stammklasse zugeordnet.',
      'Fächer je Person: Im Bearbeiten-Fenster ordnest du die Person – nach Klasse gruppiert – einzelnen „Auswahl"-Fächern zu oder entfernst sie wieder; „ganze Klasse"-Fächer sind automatisch enthalten und daher nicht abwählbar. In der Tabelle zeigt die Spalte „Fächer" kompakt die ersten Fächer plus „+N".',
      'SPF je Fach: Ein Kind hat sonderpädagogischen Förderbedarf nicht zwingend in allen Fächern. Im Bearbeiten-Fenster öffnest du in der SPF-Zeile über „ändern" ein eigenes Auswahl-Fenster und hakst dort genau die Fächer an, in denen SPF gilt (Schnell-Schalter „Alle" / „Keine"). Der SPF-Badge erscheint dann nur in diesen Fächern (z. B. in der Notentabelle). SPF wird deshalb zentral hier gepflegt, nicht mehr im klassenspezifischen Schüler:innen-Modal.',
      'Stammdaten: Im Bearbeiten-Fenster erfasst du je Person Geburtsdatum, Adresse (Straße, PLZ, Ort), Telefon, E-Mail, Notfallnummer, Erziehungs- und Abholberechtigte sowie Anmerkungen. Erfasste Kontaktdaten erscheinen kompakt oben im Detail-/Leistungsprofil. Klassen- und Fächer-Zuordnung wählst du – wie SPF – über ein eigenes Auswahl-Fenster (Button „ändern").',
      'Tabellen-Spalten: Über „Spalten ▾" oben rechts hakst du an, welche Informationen die Tabelle zeigt – Merkmale, Klassen, Fächer sowie einzelne Stammdaten (Telefon, Adresse, Notfallnummer, …). Standardmäßig sichtbar sind Vorname, Nachname, Merkmale, Klassen, Telefon und Adresse. Mit ▲/▼ ordnest du die Spalten (oben = weiter links) – auch Vor- und Nachname lassen sich so tauschen; sie bleiben aber immer sichtbar. Die Auswahl bleibt bis zum Neustart erhalten. Im Bearbeiten-Fenster stehen Merkmale, SPF, Klassen und Fächer geordnet untereinander; Klassen und Fächer wählst du – wie SPF – über ein eigenes Fenster.',
      'Neue Schüler:innen anlegen (nur zentral): Über den Button „+ Hinzufügen" in der Schüler:innen-Verwaltung legst du Personen an – einzeln (mit Enter zügig hintereinander) oder per CSV-/Excel-Import; dabei wählst du die Stammklasse. Das Schüler:innen-Modal in der Klassenansicht legt keine neuen Personen mehr an: Unter „Hinzufügen" fügst du per Live-Suche vorhandene Schüler:innen hinzu – tippe einen Namen oder eine Klasse, es werden nur Treffer gelistet. Auch Merkmale u. Ä. bearbeitest du dort nicht mehr direkt; „✎ Bearbeiten" öffnet dasselbe Fenster wie die zentrale Verwaltung.',
      { h: 'Sortierung der Liste' },
      'Oben in der Notentabelle wählst du pro Klasse, wie die Liste sortiert wird: nach Vorname, nach Nachname oder Manuell. Bei „Manuell" bringst du die Reihenfolge über „↕ Reihenfolge bearbeiten" selbst in Ordnung – im Bearbeitungsmodus ziehst du die Einträge per Drag-&-Drop an die gewünschte Stelle. Die Sortierung gilt überall, wo die Klassenliste erscheint (z. B. in der Notentabelle).',
      { h: 'Avatare' },
      'Jede:r Schüler:in erhält automatisch einen Avatar aus dem Namen. Über den Avatar-Editor lassen sich Gesicht, Frisur, Farben und Accessoires anpassen.',
      { tipp: 'Die Avatare werden ohne Internet erzeugt (DiceBear „lorelei", CC0) und funktionieren komplett offline.' },
      { h: 'Leistungsprofil' },
      'Ein Klick auf eine:n Schüler:in öffnet das Profil: links alle Fächer mit farbig hervorgehobenen Semester-/Zeugnisnoten (grün 1 bis rot 5), rechts die Details samt Leistungsdiagramm (Schularbeiten/Tests mit Datum und Thema). Über „PDF" exportierst du das Profil.',
    ],
  },
  {
    id: 'noten', titel: 'Noten eintragen', bloecke: [
      'In der Notentabelle legst du Spalten an (Schaltfläche „+" bzw. Spalte hinzufügen). Jede Spalte gehört zu einer Kategorie:',
      { ul: [
        'SA – Schularbeit (Note 1–5)',
        'T – Test (Note 1–5)',
        'Individuell – frei benennbare Bewertung (Note 1–5)',
        'MA – Mitarbeit (Bonus/Malus): zweistufig als + / − oder ↗ / ↘, dreistufig als + / ~ / − oder vierstufig als Smiley-Skala (😄 😞)',
        'HÜ – Hausübung (✓ gemacht / ✗ nicht gemacht / — nicht gewertet)',
      ] },
      'Beim Anlegen einer Mitarbeits-Spalte wählst du die Bewertungsskala: „+ / −", „↗ / ↘" (nur eine andere Darstellung von + / −, gleiche Bewertung), „+ / ~ / −" (dreistufig mit neutraler Mittelstufe ~ = Note 3) oder „Smileys" mit vier Stufen – 😄 sehr fröhlich, 🙂 mäßig fröhlich, 🙁 mäßig traurig, 😞 sehr traurig. Eine neue MA-Spalte übernimmt die zuletzt gewählte Variante. Bei Smiley-Spalten öffnet ein Klick auf die Zelle ein kleines Auswahlfeld; bei den übrigen Skalen schaltet ein Klick zur nächsten Stufe weiter.',
      'Einzelne Mitarbeitsleistungen werden nicht einzeln benotet. Laut § 4 Abs. 2 LBVO entsteht aus allen Aufzeichnungen eine einzige Mitarbeitsnote (Gesamtbeurteilung). Diese Mitarbeitsnote zählt wie SA/Test/Individuell als vollwertige, note-bildende Kategorie mit eigener Gewichtung („Mitarbeit") – so bekommt auch ein Fach ohne Schularbeiten/Tests eine belastbare Zeugnisnote. Auch die Hausübungen fließen in dieselbe Mitarbeitsnote ein (siehe „Benotung verstehen").',
      'Die Symbole der Mitarbeit lassen sich je Spalte frei wählen. „+ / −" und „↗ / ↘" sind nur die Vorgaben der zweistufigen Skala – du kannst sie durch zwei eigene Symbole ersetzen (Wertung nach Position: erstes = positiv, zweites = negativ). Bei der dreistufigen Skala legst du drei eigene Symbole fest (Reihenfolge positiv → neutral → negativ), bei der 4-stufigen vier (z. B. +, +~, -~, -). Die Reihenfolge ist immer positiv → negativ, die Wertung ergibt sich aus der Position. Beim Anlegen zeigt jede Bewertungsvariante beim Überfahren einen kurzen Info-Tooltip.',
      'Der graue Strich „—" bei einer Hausübung bedeutet „nicht gewertet / entfällt" (z. B. entschuldigt oder dispensiert): Er fließt bewusst nicht in die Note ein und zählt auch nicht zur HÜ-Quote – anders als eine leere Zelle steht er als sichtbarer Vermerk.',
      'Klicke in eine Zelle und tippe die Note bzw. das Symbol. Änderungen lassen sich rückgängig machen (Strg+Z).',
      'Per Rechtsklick auf einen Spaltenkopf sortierst du die Spalten „Nach Kategorie" (gruppiert nach SA, Test, MA …) oder wieder „Chronologisch" (nach Datum).',
      'Bei Schularbeiten, Tests und Individuell-Spalten kannst du ein Thema hinterlegen (z. B. „Bruchrechnen"). Es erscheint als Tooltip am Spaltenkopf und im Leistungsdiagramm des Schüler:innen-Profils.',
      { tipp: 'Semester 1 lässt sich einklappen, um in Semester 2 mehr Platz zu haben.' },
    ],
  },
  {
    id: 'benotung', titel: 'Benotung verstehen', bloecke: [
      'Daskala berechnet aus allen Aufzeichnungen automatisch eine durchgehende Zeugnisnote (ZN).',
      { h: 'Gewichtung' },
      'Die Note bilden SA, Test, Individuell und die Mitarbeit – nach einer Gewichtung, die du global (Einstellungen) und pro Fach (Rechtsklick → Gewichtung) festlegst. Die Mitarbeit hat dabei einen eigenen Anteil wie Schularbeit, Test und Individuell.',
      { h: 'Neuere Leistungen stärker gewichten (§ 20 LBVO)' },
      'Innerhalb einer Kategorie (SA, Test, Individuell) kannst du neuere Leistungen stärker gewichten als frühere – so verlangt es § 20 LBVO („zuletzt erreichter Leistungsstand"). Über den Rezenz-Faktor (Einstellungen → Benotung) legst du fest, wie viel stärker die neueste Note zählt: 1,0 = alle gleich (reiner Durchschnitt), 2,0 = neueste zählt doppelt so stark wie die älteste. Sortiert wird chronologisch über das ganze Jahr (nach Datum, semesterübergreifend). Beim ersten Start und nach dem einführenden Update wirst du einmalig gebeten, diesen Faktor festzulegen. Der globale Wert ist der Standard – im Zeugnisnoten-Detail (Klick auf die ZN) kannst du den Faktor zusätzlich pro Schüler:in oder für die ganze Klasse feinjustieren (siehe unten).',
      { h: 'Die Mitarbeitsnote (§ 4 Abs. 2 LBVO)' },
      'Einzelne Mitarbeitsleistungen werden nicht einzeln benotet. Aus allen Aufzeichnungen entsteht eine einzige Mitarbeitsnote – der Durchschnitt der Teil-Einschätzungen. Bei reinem + / − entspricht das dem Verhältnis positiver zu negativer Einträge: ausgeglichen ergibt Note 3, nur „+" ergibt 1, nur „−" ergibt 5. Die dreistufige Skala steuert mit „~" die Mitte (Note 3) bei; die Smileys zählen intensitätsgewichtet (😄/😞 stärker als 🙂/🙁). Für jede Skala (2-, 3- und 4-stufig) lassen sich beim Erstellen einer Mitarbeitsspalte eigene Symbole festlegen; gewertet wird nach Position (z. B. 2-stufig: erstes Symbol positiv, zweites negativ).',
      'Auch die Hausübungen fließen in dieselbe Mitarbeitsnote ein: ✓ zählt positiv (wie Note 1), ✗ negativ (wie Note 5), „—" wird nicht gewertet. Hausübung ist also kein getrennter Einfluss mehr und hat kein eigenes Gewicht. Die fertige Mitarbeitsnote geht anschließend mit ihrem Gewichtungsanteil („Mitarbeit") in die Zeugnisnote ein – wie Schularbeit, Test und Individuell.',
      'Als Gesamtbeurteilung (§ 4 Abs. 2) kannst du die Mitarbeitsnote im Zeugnisnoten-Detail (Klick auf die ZN) auch manuell festlegen – sie überschreibt dann den berechneten Durchschnitt und fließt so in die Zeugnisnote ein. Ein Klick auf „Berechnet" stellt den Durchschnitt wieder her. So lässt sich auch ganz ohne einzelne + / − eine Mitarbeitsnote vergeben.',
      'Fehlt jede Mitarbeit und Hausübung, obwohl Noten (SA/Test/Individuell) vorhanden sind, erscheint ein Hinweis (⚠): Laut § 3 LBVO dürfen schriftliche Leistungen nicht die alleinige Grundlage der Beurteilung sein. Die berechnete Note bleibt als Vorschlag sichtbar. Den Hinweis kannst du in den Einstellungen abschalten.',
      { h: 'Eine durchgehende Zeugnisnote (ZN)' },
      'Es gibt keine getrennten Semesternoten mehr. Die ZN wird laufend aus allen Aufzeichnungen des ganzen Jahres (beide Semester) berechnet und im Kopf ganzjährig als „ZN*" geführt – das Sternchen weist darauf hin, dass es ein vorläufiger, bis zum Schuljahresende fortgeschriebener Stand ist. Am Schuljahresende ist dieser Wert die Zeugnisnote. Die Semester-Umschaltung (S1/S2) dient weiterhin nur der Gliederung der Aufzeichnungsspalten. Eine Semestergewichtung gibt es nicht mehr; die Rezenz (§ 20) läuft durchgehend übers Jahr.',
      { h: 'Zeugnisnote-Detail (Klick auf die ZN)' },
      'Ein Klick auf eine Zeugnisnote öffnet ein Detail-Fenster. Oben siehst du die Zeugnisnote samt Aufschlüsselung (welche Kategorie mit welchem Schnitt und Gewicht einfließt); jede Änderung aktualisiert die Vorschau sofort. Darunter kannst du die einzelnen Schularbeiten, Tests und individuellen Leistungen ansehen und ändern (nach Kategorie gruppiert, standardmäßig eingeklappt). Mitarbeit und Hausübungen werden hier nicht einzeln bearbeitet – stattdessen legst du die Mitarbeitsnote bei Bedarf direkt fest (siehe „Die Mitarbeitsnote"). Die Zeugnisnote selbst kannst du manuell überschreiben und wieder auf „Berechnet" zurücksetzen. Ein Klick auf die Prozentwerte in der Aufschlüsselung öffnet den Gewichtungs-Editor – so passt du die Gewichtung (SA/Test/Individuell/Mitarbeit) direkt an. Außerdem stellst du hier den Rezenz-Faktor (§ 20) mit einem Schieberegler ein – ein Liniendiagramm zeigt über den Winkel, wie stark neuere Leistungen zählen. Erst mit „Speichern" werden die Änderungen übernommen; hast du Gewichtung oder Rezenz-Faktor verändert, fragt Daskala, ob das nur für diese:n Schüler:in oder für die ganze Klasse gelten soll.',
      { h: 'Zwischennote' },
      'Liegt eine Note genau zwischen zwei Stufen (z. B. 2,5), wird die Kommastelle ausgegraut angezeigt. Im Zeugnisnoten-Detail (Klick auf die ZN) wählst du dann die bessere oder schlechtere Note.',
      { h: 'Differenzierte Beurteilung (AHS/ST)' },
      'Stellst du ein Fach auf „AHS/ST" um, wird pro Schüler:in ein Niveau geführt; die Berechnung erfolgt intern differenziert und wird korrekt auf die angezeigte Note umgerechnet.',
      'Im Schüler:innen-Profil zeigt das Leistungsdiagramm Niveau-Wechsel (AHS↔ST) als farbig hinterlegte Bereiche (grün AHS / gelb ST) mit Wechsel-Markierung; jeder Schularbeits-/Test-Punkt trägt Datum und Thema.',
    ],
  },
  {
    id: 'kompetenzen', titel: 'Kompetenzen (Assistent & Netzdiagramm)', bloecke: [
      'Im Leistungsprofil kannst du pro Fach den Kompetenzstand einer:s Schüler:in mit einem Assistenten erfassen und die Entwicklung als Netzdiagramm verfolgen. Der Bereich erscheint im Profil beim jeweiligen Fach – aktuell für Deutsch (Kompetenzraster der Schulstufen 1–8).',
      { h: 'Assistent starten' },
      'Öffne das Profil einer:s Schüler:in (Klick auf den Namen), wähle links das Fach (Deutsch) und klicke im Abschnitt „Kompetenzen" auf „+ Assistent starten". Im ersten Schritt legst du Datum und optional einen Titel fest und wählst die Schulstufe (beim ersten Mal; danach ist sie für dieses Fach fixiert, damit die Achsen vergleichbar bleiben).',
      'Danach führt dich der Assistent durch die Kompetenzbereiche des Rasters. Je Bereich wählst du ein Niveau von 0 bis 3 (0 = noch nicht erfasst; 1/2/3 = die Niveaustufen der Schulstufe). Die einzelnen Teilkompetenzen kannst du je Bereich als Hilfe einblenden; eine Notiz ist optional. Zum Abschluss speicherst du – ein Durchlauf ergibt eine „Erhebung" zu diesem Zeitpunkt.',
      { h: 'Netzdiagramm & Verlauf' },
      'Das Netzdiagramm zeigt die Niveaus aller Bereiche auf einen Blick. Mit dem Zeitstrahl-Schieber darunter wählst du den Erhebungszeitpunkt; das Diagramm wechselt animiert auf den jeweiligen Stand. So wird die Entwicklung über das Schuljahr sichtbar.',
      'Du kannst den Assistenten beliebig oft pro Jahr durchlaufen (z. B. je Semester). Einzelne Erhebungen lassen sich in der Liste unter dem Diagramm wieder löschen.',
      { tipp: 'Für andere Fächer als Deutsch sind noch keine Raster hinterlegt – dort erscheint der Kompetenzen-Bereich vorerst nicht.' },
    ],
  },
  {
    id: 'jahresplanung', titel: 'Jahresplanung & Materialien', bloecke: [
      'In der Jahresplanung gliederst du das Schuljahr in Abschnitte und ziehst sie per Drag-&-Drop in den Kalender.',
      { h: 'Abschnitte' },
      'Über „+ Neuer Abschnitt" legst du Titel, Farbe, Inhalt, Lernziele und Kompetenzen (Lehrplan) an. Ein Klick auf einen Abschnitt öffnet das Bearbeiten-Modal. Fährst du mit der Maus über einen Abschnitt, wird der Kalender leicht abgeblendet und ein großer Tooltip zeigt mittig die Details (Zeitraum, Inhalt, Lernziele, Kompetenzen).',
      'Den Zeitraum setzt du wahlweise über die Felder „Beginn" und „Ende" im Bearbeiten-Modal oder direkt im Kalender: Abschnitt an einen Tag ziehen zum Einplanen und an den beiden Rändern (Anfang wie Ende) breiter oder schmaler ziehen.',
      { h: 'Materialien' },
      'Zu jedem Abschnitt kannst du Dokumente (werden in einen echten Ordner kopiert) und Links (mit Anzeigename/Beschreibung) hinterlegen. Der Wurzelordner wird beim ersten Mal abgefragt und ist in den Einstellungen änderbar.',
      { ul: [
        'Struktur auf der Festplatte: Schuljahr / Klasse / Fach / Abschnitt',
        'Auch manuell in den Ordner gelegte Dateien erscheinen in der App',
        '„Ordner öffnen" öffnet den Abschnitts-Ordner im Explorer',
        '„Exportieren" erzeugt die gesamte Jahresplanung als ODT-Dokument (Tabelle im Querformat): Spalten Zeitraum, Inhalt, Zielsetzungen, Kompetenzen und Materialien je Abschnitt – bearbeitbar in Word, LibreOffice usw.',
      ] },
      { tipp: 'Benennst du eine Klasse, ein Fach oder einen Abschnitt um, wird der zugehörige Ordner automatisch mit umbenannt.' },
    ],
  },
  {
    id: 'detailplanung', titel: 'Detailplanung (Unterrichtsplanung pro Woche)', bloecke: [
      'Ergänzend zur Jahresplanung kannst du jede einzelne Unterrichtsstunde Woche für Woche vorbereiten – mit Titel, Inhalt, Hausübung und Link. Die Detailplanung liegt im eigenen Klassen-Tab „Planung", neben der Notentabelle.',
      { h: 'Aktivieren' },
      'Der Tab „Planung" ist standardmäßig ausgeblendet. Du schaltest ihn unter Einstellungen → „Module" über das Häkchen „Unterrichtsplanung aktivieren" ein – damit werden „Planung" (Klassenplanung) und „Jahresplan" als Klassen-Tabs verfügbar. Den Stundenplan im Dashboard betrifft das nicht; er bleibt unabhängig davon sichtbar. Schaltest du das Modul wieder aus, verschwinden die beiden Tabs.',
      { h: 'Aufbau: Wochen-Spalten je Fach' },
      'Die Planung zeigt pro Fach eine Spalte mit den Wochen untereinander. Jede Woche trägt einen Kopf „KW … · Montag – Freitag"; darunter stehen die einzelnen Stunden dieses Fachs als Karten. Grundlage sind die Stunden aus deinem Stundenplan – ist für die Klasse nichts eingetragen, meldet der Bereich „Keine Stunden im Stundenplan für diese Klasse". Fällt ein Jahresplanungs-Abschnitt in eine Woche, erscheint sein Titel (mit Farbpunkt) direkt unter dem KW-Kopf, damit du beim Vorbereiten siehst, was laut Jahresplanung gerade dran ist.',
      'Über die farbigen Fach-Pillen oben blendest du einzelne Fächer ein oder aus (ein Klick schaltet um). Bei mehr als zwei Fächern gibt es zusätzlich „+ Alle" bzw. „− Reduzieren", um alle Fächer zu zeigen oder wieder nur das erste.',
      { h: 'Eine Stunde planen' },
      'Ein Klick auf eine Stundenkarte öffnet das Planungs-Fenster. Noch nicht geplante Karten sind gestrichelt und zeigen „(keine Planung)". Im Fenster erfasst du für genau diese Woche:',
      { ul: [
        '„Titel der Stunde…" als Überschrift der Karte',
        'den Inhalt („Unterrichtsinhalt, Materialien, Ziele…") mit einer kleinen Markdown-Leiste (Fett, Kursiv, Trennlinie, Aufzählung)',
        'eine „Hausübung" (optional); mit Text erscheint zusätzlich die Abgabe-Frist: „Nächste Stunde", „Übernächste" oder ein freies „Datum"',
        '„Link / Dateipfad" (optional) – wahlweise per 📂 eine Datei wählen und mit ↗ öffnen',
      ] },
      'Liegt für die Woche ein Jahresplanungs-Abschnitt vor, wird er oben im Fenster als Referenz eingeblendet. Bei Musik-Fächern gibt es zusätzlich das Häkchen „Musizieren"; hat die Klasse einen Teams-Link hinterlegt, führt „Teams ↗" direkt hinein. Mit „Speichern" übernimmst du die Planung, „Löschen" entfernt sie für diese Woche wieder. Auf der Karte erscheinen danach Titel, die erste Inhaltszeile und – falls gesetzt – ein „HÜ"-Hinweis.',
      { h: 'Parallelklassen als Referenz einblenden' },
      'Unterrichtest du dasselbe Fach in mehreren Klassen, kannst du deren Planung zum Vergleich daneben einblenden. Über „+ Parallel" im Spaltenkopf öffnest du eine Liste der gleichnamigen Fächer anderer Klassen und hakst beliebig viele an; jede erscheint als eigene Referenzspalte (mit „(Ref.)" markiert). So siehst du auf einen Blick, wie weit du in der Parallelklasse schon bist, und planst die aktuelle Klasse entsprechend. Die aktive Zahl steht dann als „… Parallel" am Knopf; „Alle ausblenden" oder das ✕ an der Referenzspalte blendet sie wieder aus. Passen nicht alle Spalten nebeneinander, wird der Bereich horizontal scrollbar.',
      { h: 'Export & mehr Wochen' },
      '„↓ DOCX" im Spaltenkopf exportiert die Planung des Fachs als Word-Dokument – im Auswahlmenü wählst du den Umfang: „4 Wochen", „8 Wochen", „12 Wochen" oder „Alle". Standardmäßig werden acht Wochen angezeigt; über „Mehr Wochen" am Spaltenende lädst du jeweils vier weitere nach.',
      { tipp: 'Die Jahresplanung liefert den roten Faden übers Jahr, die Detailplanung die konkrete Stunde. Über die eingeblendeten Abschnitts-Titel im KW-Kopf greifen beide ineinander.' },
    ],
  },
  {
    id: 'vorlagen', titel: 'Vorlagen (Fach-Planungen)', bloecke: [
      'Vorlagen sind Jahresplanungen für Fächer: Du planst ein Fach einmal (Abschnitte + Materialien) und wendest diese Planung anschließend auf beliebig viele bestehende Fächer an – auch über mehrere Klassen hinweg (z. B. „Musikplanung 1. Klasse" auf Musik in 1a, 1b und 1c gleichzeitig).',
      { ul: [
        '„Vorlagen" (Tab-Leiste) schaltet in den Vorlagenmodus – erkennbar am grünen Leuchtrahmen',
        'Vorlagen werden hier als Fächer in Vorlagen-Gruppen angelegt und samt Jahresplanung + Materialien bearbeitet',
        'Das „Importieren"-Fenster ist auch im Vorlagenmodus verfügbar – inkl. „Aus Datei (KI-Planung)" mit „JSON-Datei wählen" und „↓ JSON-Vorlage herunterladen", um Vorlagen-Planungen per Chatbot-JSON zu befüllen',
        '„Planung auf Fächer anwenden": Ziel-Fächer über Klassen hinweg auswählen (Komfort: „Alle gleichnamigen Fächer wählen")',
        'Anhängen (ergänzt die Abschnitte) oder Ersetzen (löscht die bestehende Ziel-Planung vorher); optional Termine und Materialien mitkopieren',
        '„Vorlagenmodus beenden" kehrt zu den echten Klassen zurück',
      ] },
      'Standardmäßig werden die Termine gestrippt – jede Ziel-Klasse platziert die Abschnitte auf ihrem eigenen Kalender. Im Vorlagenmodus geht es ausschließlich um die Jahresplanung; Schüler:innen werden dort nicht verwaltet.',
    ],
  },
  {
    id: 'ki', titel: 'Jahresplanung mit KI', bloecke: [
      'Du kannst eine Jahresplanung mit Hilfe eines Chatbots (z. B. ChatGPT oder Claude) erstellen lassen und sie anschließend importieren.',
      { ul: [
        'Einstellungen → „KI-Unterstützung" → „Anleitung für Chatbot exportieren (.md)": speichert eine Anleitungsdatei mit Ausgabeschema und Kontext (Schuljahr, Ferien/Feiertage, Farbpalette, deine Klassen & Fächer).',
        'Diese .md-Datei einem Chatbot geben. Er fragt zuerst nach Fach, Inhalten, Schwerpunkten und Materialien (Dateien kannst du im Chat hochladen) und erstellt daraus die Planung.',
        'Die vom Chatbot gelieferte JSON als Datei speichern.',
        'In der Jahresplanung das Ziel-Fach wählen → „Importieren" → „Aus Datei (KI-Planung)" → die JSON wählen. Die Abschnitte werden angehängt.',
        'Alternativ dort „↓ JSON-Vorlage herunterladen": speichert eine leere Beispiel-Datei im richtigen Format – zum selbst Ausfüllen oder als Muster für den Chatbot.',
      ] },
      { tipp: 'Die Datumsangaben lassen sich nach dem Import im Kalender frei anpassen; ohne Datum bleiben Abschnitte „nicht eingeplant", bis du sie platzierst.' },
    ],
  },
  {
    id: 'dashboard', titel: 'Dashboard: ToDos & Termine', bloecke: [
      'Neben dem Stundenplan hältst du im Dashboard (Button „Dashboard") zwei Merklisten: rechts das „ToDos"-Panel, darunter die „Termine". Beide lassen sich am Rand breiter bzw. höher ziehen.',
      { h: 'ToDos' },
      'Über das „+" im Panel-Kopf (Tooltip „ToDo hinzufügen") legst du im Fenster „Neues Todo" einen Eintrag an. Pflicht ist nur der „Titel" (z. B. „Hefte korrigieren"); optional ordnest du eine „Klasse" und – sobald eine Klasse gewählt ist – ein „Fach" zu, setzt ein „Fällig"-Datum und eine „Erinnerung".',
      'Als Erinnerung stehen relativ zum Fälligkeitstag „Am Fälligkeitstag", „1 Tag davor", „3 Tage davor" und „1 Woche davor" bereit; mit „Eigenes Datum …" wählst du im Feld „Erinnerungsdatum" einen freien Tag, „Keine Erinnerung" schaltet sie ab. Ein Klick auf den runden Punkt links am ToDo hakt es ab; erledigte Einträge sammeln sich durchgestrichen und eingeklappt unter „Erledigt (Anzahl)". Offene ToDos sind nach Fälligkeit sortiert und tragen kleine Marker: Klassen- und Fach-Tag, 📅 mit „Heute", „Morgen", dem Datum oder – bei Überfälligkeit – der Zahl der überfälligen Tage (rot), sowie 🔔 für die Erinnerung. Beim Überfahren erscheinen „✎" (Bearbeiten) und „✕" (Löschen).',
      { h: 'Termine' },
      'Über das „+" im Termine-Kopf (Tooltip „Termin hinzufügen") öffnest du „Neuer Termin". Neben „Titel" (z. B. „Elternabend") und „Datum" wählst du optional eine „Klasse" und legst über die Umschalter die Zeit fest:',
      { ul: [
        '„Uhrzeit": ein „Von"-Feld und – erst wenn „Von" gesetzt ist – ein optionales „Bis"-Feld.',
        '„Unterrichtsstunde": die Auswahl „Stunde wählen…" mit deinen Stunden (z. B. „2. Stunde") samt Beginnzeit.',
        '„Notiz" (optional) ergänzt einen kurzen Hinweis.',
      ] },
      'Die Liste zeigt zuerst die kommenden Termine – mit Datum plus Stunde bzw. Uhrzeit (inkl. Bis-Zeit), Klassen-Tag und Notiz; bereits vergangene stehen ausgegraut und eingeklappt unter „Vergangene (Anzahl)". Auch hier bearbeitest bzw. löschst du einen Termin über „✎" und „✕".',
      { h: 'Badges am Wochentag' },
      'Fällige ToDos, ToDo-Erinnerungen und Termine erscheinen zusätzlich direkt unter dem jeweiligen Wochentag im Stundenplan: ein rotes „✓ …" am Fälligkeitstag, ein oranges „🔔 …" am Erinnerungstag und ein Termin als „◆ …" (mit Stunde bzw. Uhrzeit vorangestellt). Ein Klick auf ein Badge springt zum passenden Eintrag im ToDos- bzw. Termine-Panel und hebt ihn kurz hervor.',
      { tipp: 'Ordnest du ToDos und Termine einer Klasse zu, färben sich Karte und Tag in der Klassenfarbe – so erkennst du auf einen Blick, wozu ein Eintrag gehört.' },
    ],
  },
  {
    id: 'stundenplan', titel: 'Stundenplan & Ferien', bloecke: [
      'Der Stundenplan ist im Dashboard sichtbar. Über „Bearbeiten" pflegst du die Stunden und – kompakt im selben Screen – die Stunden-/Pausenzeiten.',
      'Im Bearbeitungsmodus verschiebst du Stunden per Drag & Drop in einen anderen Slot; ziehst du eine Stunde auf einen bereits belegten Slot, werden die beiden getauscht. Eine hinterlegte Wochen-Planung wandert dabei mit.',
      'Beim Belegen einer Stunde legst du unter „Wiederholung" den Wochen-Rhythmus fest: jede Woche, alle 2 Wochen (14-tägig), alle 3 oder 4 Wochen oder einen individuellen Abstand. Die aktuell angezeigte Woche gilt dabei als Woche, in der die Stunde stattfindet – daraus ergibt sich der Rhythmus. Die Stunde erscheint nur in den betreffenden Wochen; im Bearbeitungsmodus siehst du aussetzende Wochen ausgegraut, damit der Slot nicht versehentlich doppelt belegt wird. Eine 14-tägige o. ä. Stunde ist im Plan mit einem kleinen Kürzel („14-tg." bzw. „/N Wo.") gekennzeichnet.',
      'Rechtsklick auf eine Stunde → „Entfall": Im Untermenü wählst du „ersatzlos" oder „Durch Supplierung ersetzen" – Letzteres öffnet direkt den Dialog zum Anlegen einer Supplierstunde.',
      'Über „PDF exportieren" hast du zwei Möglichkeiten: „Stundenplan exportieren" erzeugt den Wochenplan als optisch aufbereitete PDF im Querformat – ideal zum Ausdrucken und Aufhängen (mit Farb-Legende der Klassen). „Planung exportieren" gibt die notierten/geplanten Unterrichtsinhalte ausgewählter Wochen als PDF aus.',
      { h: 'Ferien' },
      'Wählst du in den Einstellungen dein Bundesland, werden die österreichischen Schulferien und Feiertage automatisch berechnet und im Kalender angezeigt. Eigene Ferien/Feiertage kannst du zusätzlich pflegen.',
      { h: 'Wettervorschau' },
      'Aktivierst du die Wettervorschau in den Einstellungen (eigener Bereich „Wettervorschau", standardmäßig aus), zeigt der Stundenplan neben jedem Wochentag ein kleines Wettersymbol samt Temperatur (Vorhersage für die aktuelle und kommende Tage) – praktisch z. B. zur Planung von Exkursionen. Der Ort richtet sich nach dem Bundesland; für genauere Werte lässt sich ein konkreter Ort wählen. Optional werden Vormittag, Mittag und Abend getrennt angezeigt – oder ein kleines, transparentes Symbol rechts oben in jeder Stundenzelle mit der Prognose für genau diese Uhrzeit.',
    ],
  },
  {
    id: 'sitzplan', titel: 'Sitzplan', bloecke: [
      'Im Tab „Sitzplan" baust du die Sitzordnung deiner Klasse nach und trägst direkt am Platz Mitarbeit und Hausübung des heutigen Tages ein. Der Sitzplan gehört zum aktuell gewählten Fach – wähle also zuerst Klasse und Fach; ohne Fach erscheint der Hinweis „Bitte Fach auswählen".',
      { h: 'Tische anlegen und anordnen' },
      'Über „Bearbeiten" schaltest du in den Bearbeitungsmodus (aktiv zeigt der Knopf „✓ Bearbeiten"). Erst dann erscheinen die Werkzeuge. Solange noch kein Tisch angelegt ist, laden „+ Einzeltisch" und „+ Doppeltisch" zum Start ein.',
      { ul: [
        'Hinzufügen: „+ Einzeltisch" (ein Platz) oder „+ Doppeltisch" (zwei Plätze) – der neue Tisch erscheint in der Mitte.',
        'Verschieben: Tisch mit der Maus ziehen.',
        'Duplizieren: Strg + Ziehen – eine gestrichelte Vorschau zeigt die Kopie, beim Loslassen wird sie angelegt.',
        'Gruppe markieren: auf leeren Bereich ziehen (Auswahlrechteck); ausgewählte Tische verschiebst du dann gemeinsam.',
        'Drehen: der Knopf „⟳" (Tooltip „Um 90° drehen") dreht einen Doppeltisch in 90°-Schritten; die Namensschilder bleiben dabei aufrecht. Ein Einzeltisch ist quadratisch – hier gibt es keinen Dreh-Knopf.',
        'Löschen: der rote Knopf „✕" am Tisch.',
      ] },
      'Position und Drehung werden je Fach gespeichert. Die Toolbar erinnert dich an die Gesten: „Ziehen = verschieben · Strg+Ziehen = duplizieren · Ziehen auf leerem Bereich = Gruppe markieren".',
      { h: 'Schüler:innen an Plätze setzen' },
      'Ohne Bearbeitungsmodus weist du Personen zu: Rechtsklick auf einen Platz öffnet die Liste der Fach-Schüler:innen (leere Plätze zeigen den Hinweis „Leer – Rechtsklick zum Zuweisen"). Mit „— Kein Schüler:in —" räumst du einen Platz wieder frei. Sitzt die gewählte Person bereits woanders, fragt Daskala unter „Schon platziert" nach – mit „Verschieben" wandert sie vom alten auf den neuen Platz, „Abbrechen" lässt alles unverändert.',
      { h: 'Schnell-Eintrag für heute' },
      'Ein Klick auf einen belegten Platz (außerhalb des Bearbeitungsmodus) öffnet ein kleines Eingabefeld für den heutigen Tag: bei „MA" tippst du „+" oder „−", bei „HÜ" „✓" oder „✗". Der aktive Wert ist farbig hervorgehoben; Daskala legt dafür bei Bedarf automatisch die passende Spalte mit dem heutigen Datum an. So erfasst du Mitarbeit und Hausübung direkt vom Sitzplan aus, ohne in die Notentabelle zu wechseln.',
      { tipp: 'Die Kurzleiste oben blendet je nach Modus die passenden Hinweise ein – im Bearbeitungsmodus die Tisch-Gesten, sonst „Rechtsklick → Schüler:in · Klick → Eintrag".' },
    ],
  },
  {
    id: 'kv', titel: 'Klassenvorstand (KV)', bloecke: [
      'Der KV-Bereich bündelt die typischen Klassenvorstands-Aufgaben: einen Jahresplaner, eine wöchentliche Routine und Frühwarnungen („Trigger"). Die Funktion ist mit „Beta" gekennzeichnet und befindet sich noch in Erprobung – Aufbau und Details können sich also noch ändern.',
      { h: 'KV aktivieren' },
      'Der KV-Bereich erscheint erst, wenn du mindestens eine Klasse als KV-Klasse markierst: Rechtsklick auf einen Klassen-Tab → „Als KV-Klasse markieren" (📜). Danach taucht oben in der Tab-Leiste die Schaltfläche „KV" (mit „Beta"-Kennzeichnung) auf. Über „KV-Markierung entfernen" (per Rechtsklick) nimmst du die Markierung wieder zurück. Bist du für mehrere Klassen KV, wählst du im KV-Bereich oben die gewünschte Klasse aus. Innerhalb des KV-Bereichs wechselst du zwischen den drei Unterbereichen „Jahresplaner" (📅), „Wochenroutine" (🗓️) und „Trigger" (⚠️).',
      { h: 'Jahresplaner' },
      'Der Jahresplaner zeigt pro Schulmonat eine Karte mit den anstehenden Aufgaben; der aktuelle Monat ist hervorgehoben. Oben schaltest du zwischen „Offen" und „Erledigt" um – ein Monat wandert erst dann zu „Erledigt", wenn alle seine Aufgaben (samt Sub-Aufgaben) abgehakt sind. Ein Zähler rechts zeigt, wie viele Aufgaben insgesamt erledigt sind.',
      { ul: [
        'Neue Aufgabe: „+" auf der Monatskarte öffnet „Neue Jahresaufgabe" mit Titel, Monat, Kategorie (🗂️ Organisation, 📋 Dokumentation, 👨‍👩‍👧 Elternarbeit, 🤝 Konferenz), optionaler Beschreibung und optionalem „Rechtsbezug" (z. B. „§ 19 Abs. 4 SchUG").',
        'Erledigen: Klick auf das Kästchen hakt die Aufgabe ab (mit Erledigungsdatum).',
        'Sub-Aufgaben: über „+sub" gliederst du eine Aufgabe in Teilschritte; ein Fortschritts-Badge zeigt „erledigt/gesamt".',
        'Notiz: über „+ Notiz" hinterlegst du je Aufgabe eine kurze Notiz (📝).',
        'Bearbeiten/Löschen: „✎" öffnet die Vorlage; dort änderst oder löschst du sie (Löschen entfernt auch die zugehörigen Häkchen und Notizen).',
      ] },
      { h: 'Wochenroutine' },
      'Die Wochenroutine ist ein Raster: Zeilen sind wiederkehrende Wochenaufgaben, Spalten die Kalenderwochen (einige zurück, einige voraus); die aktuelle KW ist hervorgehoben. Ein Klick auf eine Zelle schaltet „erledigt" um, ein Rechtsklick öffnet ein Notizfeld für diese Woche (eine hinterlegte Notiz zeigt 📝). Auch hier lässt sich je Aufgabe ein „Rechtsbezug" hinterlegen. Über „Neue Wochenaufgabe…" legst du weitere Zeilen an, „✎" bearbeitet die Vorlage.',
      { h: 'Trigger (Frühwarnungen)' },
      'Der Trigger-Bereich sammelt Hinweise, die dein Eingreifen brauchen – etwa „Frühwarnung", „Fehlstunden ≥ 15", „Fehlstunden ≥ 30", „Vorfall" oder „Offener Rückruf". Viele davon entstehen automatisch aus den KV-Daten der Schüler:innen (z. B. beim Überschreiten von Fehlstunden-Schwellen, bei einem Vorfall oder bei einem länger offenen Rückruf). Die Liste ist nach Dringlichkeit gruppiert (🚨 Kritisch, ⚠️ Warnung, ℹ️ Info) und in „Offen" und „Archiv" geteilt.',
      { ul: [
        'Reagieren: „Reagieren & Erledigen" öffnet ein Pflichtfeld „Was wurde getan?"; mit „Abgehakt ✓" wandert der Trigger ins Archiv.',
        'Archiv: unter „Archiv" siehst du die erledigten Trigger samt deiner dokumentierten Reaktion.',
        'Löschen: über „✕" entfernst du einen Trigger ganz.',
      ] },
      { h: 'KV-Daten je Schüler:in' },
      'Öffnest du bei einer KV-Klasse das Leistungsprofil einer Schülerin oder eines Schülers, findest du dort den Abschnitt „KV-Daten" mit Fehlstunden, Aktenvermerken, Elternkontakten und der Trigger-Historie.',
      { ul: [
        'Fehlstunden: „+ Eintragen" erfasst Datum, Stunden, Status („Entschuldigt"/„Unentschuldigt") und Grund. Das Konto summiert entschuldigt, unentschuldigt und gesamt und färbt die unentschuldigten Stunden nach den Schwellen 5, 15 und 30 – ab 30 mit dem Hinweis „Verständigung gem. § 45 SchUG". Unentschuldigte Stunden ab 15 bzw. 30 erzeugen automatisch einen Trigger.',
        'Aktenvermerke: „+ Neu" legt einen Vermerk an – mit Datum, Typ (⚠️ Vorfall, 💬 Gespräch mit Eltern, 🗣️ Gespräch mit Schüler:in, 👁️ Beobachtung, 🎯 Erziehungsmaßnahme), Titel, Beschreibung sowie optional Zeugen und Folgemaßnahme. Beim Typ „Vorfall" entsteht automatisch ein Trigger.',
        'Elternkontakte: „+ Neu" protokolliert einen Kontakt mit Datum, Art (☎️ Telefon, ✉️ Mail, 🤝 Persönlich, 📅 Elternsprechtag), Initiator (KV oder Eltern), Thema und Inhalt. Ist „Rückruf offen (noch zu erledigen)" gesetzt, erzeugt ein länger offener Rückruf nach einigen Tagen automatisch einen Trigger; mit „✓ Als erledigt markieren" schließt du ihn ab.',
        'Trigger-Historie: listet die für diese:n Schüler:in erzeugten Trigger (offen wie archiviert).',
      ] },
      { tipp: 'Da der KV-Bereich noch in Entwicklung ist, lohnt sich ein Blick ins Änderungsprotokoll (Changelog) nach Updates – Aufbau und Funktionen können sich hier noch weiterentwickeln.' },
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
      'Archivierte Schuljahre findest du unter Einstellungen → „Archiv". Von dort exportierst du ein abgeschlossenes Jahr vollständig als Tabelle (ODS) oder als PDF (Notenübersicht aller Klassen und Fächer).',
      'Das zuletzt archivierte Jahr lässt sich dort auch „wiederherstellen": Es wird wieder zum aktuellen Schuljahr, das derzeit aktuelle Jahr wandert dafür ins Archiv – es wird nichts gelöscht. So nimmst du einen versehentlichen Jahreswechsel zurück.',
      'Nicht mehr benötigte Archive kannst du unter „Archiv" endgültig löschen (mit allen Klassen, Fächern, Schüler:innen und Noten dieses Jahres).',
      { tipp: 'Kalender und Ferienberechnung stellen sich automatisch auf das aktive Schuljahr um.' },
    ],
  },
  {
    id: 'sichern', titel: 'Sichern & Exportieren', bloecke: [
      'Deine Daten liegen in einer lokalen Datenbank. Für Sicherheit und Weitergabe gibt es mehrere Wege (Einstellungen → Datei/Datensicherung):',
      { ul: [
        'Backup erstellen / JSON-Export',
        '„Öffnen…" / „Speichern unter…" für die Datenbankdatei',
        'Noten-Exporte: pro Fach als ODS-Tabelle; die Gesamtübersicht aller Klassen und Fächer als ODS und als PDF (A4 quer)',
      ] },
      { h: 'Automatische Sicherung' },
      'Aktiviere „Automatische Sicherung bei jedem Start" und wähle einen Zielordner (z. B. USB-Stick oder Cloud-Ordner). Daskala legt dort sparsam Kopien ab: höchstens einmal pro Tag und nur, wenn sich seit der letzten Sicherung etwas geändert hat. Wie viele Sicherungen aufbewahrt werden (Standard: 10), stellst du daneben ein – ältere werden automatisch gelöscht, es sammeln sich also keine Massen an Dateien an.',
      'Ist keine automatische Sicherung aktiv, erinnert dich die App nach einigen Tagen ohne Sicherung mit einem Hinweis oben im Fenster. Vor jedem Update wird zusätzlich automatisch gesichert.',
      { h: 'Wiederherstellen' },
      'Über „Wiederherstellen…" (Einstellungen → Datensicherung) siehst du alle vorhandenen Sicherungen mit Datum und Art und spielst eine davon mit einem Klick zurück. Deine aktuellen Daten werden dabei zuerst automatisch gesichert, dann durch die gewählte Sicherung ersetzt; anschließend startet die App neu.',
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
      { h: 'Feedback' },
      'Über „💬 Feedback" (oben in den Einstellungen) kannst du deine Meinung, Ideen oder Probleme direkt loswerden – der Bogen öffnet dein Mailprogramm mit vorausgefülltem Text. Ohne Mailprogramm einfach „Text kopieren" und die Nachricht selbst senden.',
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
