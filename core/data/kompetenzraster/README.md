# Kompetenzraster als JSON für Daskala

## Status Deutsch: alle 8 Schulstufen vollständig

| Schulstufe | Kompetenzbereiche | Teilkompetenzen | Niveauschema |
|---|---|---|---|
| 1 | Recht-Schreiben/Sprachbetrachtung, Verfassen von Texten, Lesen, Zuhören, Sprechen | 21 | 1 Niveau |
| 2 | wie oben | 32 | 1 Niveau |
| 3 | wie oben | 43 | 3 Niveaus |
| 4 | wie oben | 45 | 3 Niveaus |
| 5 | Zuhören, Sprechen, Lesen, Schreiben | 43 | 3 Niveaus |
| 6 | wie oben | 42 | Standard + Standard AHS |
| 7 | wie oben | 43 | Standard + Standard AHS |
| 8 | wie oben | 43 | Standard + Standard AHS |

Alle Dateien stammen aus vom Nutzer hochgeladenen Original-PDFs und wurden direkt von der Festplatte gelesen (nicht über Websuche), daher vollständig statt fragmentarisch.

Bei den 1. bis 4. Schulstufen ist "Lesen" mit "Lesefertigkeit" statt "Grundfertigkeiten" als erste Kategorie benannt, weil das Original-PDF das so führt; ab der 5. Schulstufe heißt die Kategorie durchgängig "Grundfertigkeiten". Einzelne items in Schulstufe 3/4 haben `null` bei niveau1/2/3, wenn das Original-PDF für diese Teilkompetenz nur 1-2 statt 3 Niveaus ausweist (manche Zeilen sind erst ab Niveau 2 oder 3 definiert).

## Andere Fächer

Noch nicht extrahiert. eeducation.at (Hauptquelle für fast alle Fächer außer Deutsch) blockiert automatisierten Zugriff komplett. PDFs bitte direkt hochladen, dann werden sie im selben Format extrahiert.

## JSON-Struktur

- fach, schulstufe, schultyp, lehrplanbezug, quelle, status
- niveaustufen (nur bei Schulstufen mit 3-Niveau-Schema ohne Standard/AHS-Split)
- kompetenzbereiche[] -> kategorien[] -> items[]
  - bei 1-Niveau-Schulstufen (1, 2): items sind einfache Strings
  - bei 3-Niveau-Schulstufen ohne Standard/AHS-Split (3, 4, 5): items sind Objekte {niveau1, niveau2, niveau3}, teils mit null wo im Original nicht alle 3 Niveaus ausgewiesen sind
  - bei Standard/Standard-AHS-Split (6, 7, 8): items sind Objekte {text, text_standard} (text_standard nur wenn abweichend vom AHS-Wortlaut; siehe hinweis_leistungsniveau in den jeweiligen Dateien)
