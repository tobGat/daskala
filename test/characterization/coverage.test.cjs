// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Abdeckungs-Wächter (Phase 0, „no silent caps").
//
// Stellt sicher, dass JEDER registrierte IPC-Kanal entweder charakterisiert
// (read-/write-channels) ODER hier mit Grund ausgeschlossen ist. Ein neuer,
// nicht abgesicherter Kanal lässt diesen Test fehlschlagen – so bleibt beim
// Kern-Umbau kein Kanal ungeschützt.
//
// Ausschlüsse: Kanäle, die nicht mit dem Datenmodell interagieren, sondern mit
// Dialog/Dateisystem/System/Netzwerk/Export – für die Datenintegrität des
// Umbaus nicht relevant. Sowie ein dokumentierter Spezialfall.

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { createHarness } = require('../helpers/harness.cjs')

const EXCLUDED = {
  // Export: erzeugt Dateien über Dialog/printToPDF
  'export:toJson': 'export', 'export:fachOds': 'export', 'export:planungPdf': 'export',
  'export:stundenplanPdf': 'export', 'export:jahresplanungOdt': 'export',
  'export:fachPlanungDocx': 'export', 'export:allSchuelerOds': 'export',
  'export:allSchuelerPdf': 'export', 'export:archivPdf': 'export', 'export:archivOds': 'export',
  'schueler:exportProfilPDF': 'export',
  // Materialien: Dateisystem/Explorer
  'materialien:waehleRoot': 'fs', 'materialien:list': 'fs', 'materialien:dateienHinzufuegen': 'fs',
  'materialien:linkHinzufuegen': 'fs', 'materialien:metaSetzen': 'fs', 'materialien:entfernen': 'fs',
  'materialien:oeffnen': 'fs', 'materialien:ordnerOeffnen': 'fs',
  // Backup: Dateisystem
  'backup:create': 'fs', 'backup:getList': 'fs', 'backup:liste': 'fs', 'backup:wiederherstellen': 'fs',
  'backup:status': 'fs', 'backup:jetzt': 'fs', 'backup:waehleOrdner': 'dialog',
  'backup:setAutomatisch': 'fs', 'backup:ordnerZuruecksetzen': 'fs', 'backup:snooze': 'fs',
  // Sperre: Authentifizierung (separat abzusichern)
  'sperre:status': 'auth', 'sperre:setPin': 'auth', 'sperre:deaktivieren': 'auth',
  'sperre:pruefe': 'auth', 'sperre:setGesperrt': 'auth',
  // Dialog / Datei / DB-Datei
  'db:saveAs': 'dialog', 'db:open': 'dialog', 'dialog:openFile': 'dialog',
  'dialog:saveFile': 'dialog', 'datei:speichereText': 'dialog', 'import:schuelerFromFile': 'fs',
  'jahresplanung:importVonDatei': 'fs',
  // System / Netzwerk
  'shell:open': 'system', 'app:clipboard': 'system', 'app:reset': 'system', 'app:version': 'system',
  'update:installieren': 'system', 'wetter:getWoche': 'netzwerk', 'wetter:sucheOrt': 'netzwerk',
  // Spezialfall: umfangreicher Schuljahreswechsel – eigener Test geplant (Phase 1)
  'jahresabschluss:neuesSchuljahr': 'spezialfall-todo',
}

const kanaeleAus = (datei) => [...fs.readFileSync(path.join(__dirname, datei), 'utf8')
  .matchAll(/channel:\s*'([^']+)'/g)].map((m) => m[1])

test('Kanal-Abdeckung: jeder Kanal charakterisiert oder ausgeschlossen', async () => {
  const h = await createHarness()
  try {
    const alle = [...h.handlers.keys()]
    const covered = new Set([...kanaeleAus('read-channels.test.cjs'), ...kanaeleAus('write-channels.test.cjs')])

    const fehlend = alle.filter((c) => !covered.has(c) && !(c in EXCLUDED))
    assert.deepStrictEqual(fehlend, [], `Nicht abgedeckt und nicht ausgeschlossen: ${fehlend.join(', ')}`)

    // Ausschlussliste darf keine toten Einträge enthalten.
    const veraltet = Object.keys(EXCLUDED).filter((c) => !h.handlers.has(c))
    assert.deepStrictEqual(veraltet, [], `Ausschluss zeigt auf nicht existierende Kanäle: ${veraltet.join(', ')}`)
  } finally {
    h.cleanup()
  }
})
