// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Mobiles `window.api` (Capacitor-Spike). Ersetzt die Electron-IPC-Brücke:
// statt renderer → IPC → main.js ruft der WebView die Kern-Domänen direkt auf,
// mit dem Capacitor-DbPort + mobilen kernDeps. Abgebildet ist der Pfad für
// Klassenliste + Notentabelle (Spike-Ziel); nicht abgebildete Methoden liefern
// einen protokollierenden No-op zurück, damit die App nicht abstürzt.

import einstellungenDomain from '../../core/domain/einstellungen'
import schuljahreDomain from '../../core/domain/schuljahre'
import klassenDomain from '../../core/domain/klassen'
import faecherDomain from '../../core/domain/faecher'
import schuelerDomain from '../../core/domain/schueler'
import notizenDomain from '../../core/domain/notizen'
import spaltenDomain from '../../core/domain/spalten'
import eintraegeDomain from '../../core/domain/eintraege'
import zeugnisnotenDomain from '../../core/domain/zeugnisnoten'
import niveauDomain from '../../core/domain/niveau'
import rezenzDomain from '../../core/domain/rezenz'
import maNoteDomain from '../../core/domain/maNote'
import kompetenzenDomain from '../../core/domain/kompetenzen'
import gewichtungDomain from '../../core/domain/gewichtung'
import todosDomain from '../../core/domain/todos'
import termineDomain from '../../core/domain/termine'
import customFerienDomain from '../../core/domain/customFerien'
import stundenzeitenDomain from '../../core/domain/stundenzeiten'
import stundenplanDomain from '../../core/domain/stundenplan'
import stundenPlanungDomain from '../../core/domain/stundenplanung'
import supplierstundenDomain from '../../core/domain/supplierstunden'
import jahresplanungDomain from '../../core/domain/jahresplanung'
import kvRoutine from '../../core/domain/kv/routine'
import { createMobileKernDeps } from './kern-deps'
import { fachOdsMobil } from './export-mobile'

export function createMobileApi(dbPort) {
  const deps = createMobileKernDeps(dbPort)
  // Nicht abgebildete Lese-/Schreib-Methode → leeres Array (array-sicher: .find/.map/
  // .forEach laufen ins Leere; Property-Zugriff ergibt undefined statt Absturz).
  const stub = (label) => async (...args) => { console.warn('[mobile-api:stub]', label, args); return [] }
  // Event-Abos (onX(cb)) müssen SYNCHRON eine Abmelde-Funktion liefern, kein Promise.
  const onStub = (label) => (...args) => { console.warn('[mobile-api:stub]', label, args); return () => {} }
  // Domänen-Proxy: unbekannte Methode → passender No-op statt Absturz.
  const dp = (name, impl) => new Proxy(impl, {
    get: (t, k) => {
      if (typeof k !== 'string' || k in t) return t[k]
      return k.startsWith('on') ? onStub(`${name}.${k}`) : stub(`${name}.${k}`)
    },
  })

  const api = {
    einstellungen: dp('einstellungen', {
      get: (s) => einstellungenDomain.get(dbPort, s),
      set: (s, w) => einstellungenDomain.set(dbPort, s, w),
      getAll: () => einstellungenDomain.getAll(dbPort),
    }),
    gewichtungGlobal: dp('gewichtungGlobal', {
      getAll: () => gewichtungDomain.getAll(dbPort),
      update: (k, g) => gewichtungDomain.update(dbPort, deps, k, g),
    }),
    schuljahre: dp('schuljahre', {
      getAll: () => schuljahreDomain.getAll(dbPort),
      create: (b) => schuljahreDomain.create(dbPort, b),
      letztesArchivWiederherstellen: () => schuljahreDomain.letztesArchivWiederherstellen(dbPort),
      loeschen: (id) => schuljahreDomain.loeschen(dbPort, deps, id),
    }),
    klassen: dp('klassen', {
      getAll: (sjId) => klassenDomain.getAll(dbPort, sjId),
      getVorlagen: () => klassenDomain.getVorlagen(dbPort),
      create: (d) => klassenDomain.create(dbPort, d),
      rename: (id, n) => klassenDomain.rename(dbPort, deps, id, n),
      setFarbe: (id, f) => klassenDomain.setFarbe(dbPort, id, f),
      setSortierung: (id, m) => klassenDomain.setSortierung(dbPort, id, m),
      reorder: (u) => klassenDomain.reorder(dbPort, u),
      getDeleteStats: (id) => klassenDomain.getDeleteStats(dbPort, deps, id),
      delete: (id) => klassenDomain.remove(dbPort, deps, id),
    }),
    faecher: dp('faecher', {
      getAll: (kId) => faecherDomain.getAll(dbPort, kId),
      getAllImSchuljahr: (sjId) => faecherDomain.getAllImSchuljahr(dbPort, sjId),
      getSchuelerIds: (fId) => faecherDomain.getSchuelerIds(dbPort, deps, fId),
      create: (d) => faecherDomain.create(dbPort, deps, d),
      setBenotungssystem: (id, s) => faecherDomain.setBenotungssystem(dbPort, deps, id, s),
      // Gewichtung pro Fach (SA/Test/Individuell/Mitarbeit); Mitarbeit = gewichtung_ma.
      updateGewichtung: (id, data) => faecherDomain.updateGewichtung(dbPort, deps, id, data),
      resetGewichtung: (id) => faecherDomain.resetGewichtung(dbPort, deps, id),
    }),
    schueler: dp('schueler', {
      getAll: (kId) => schuelerDomain.getAll(dbPort, kId),
      create: (d) => schuelerDomain.create(dbPort, d),
      update: (id, d) => schuelerDomain.update(dbPort, id, d),
      importBatch: (kId, list, fachIds) => schuelerDomain.importBatch(dbPort, kId, list, fachIds),
      getLeistungsProfil: (id) => schuelerDomain.getLeistungsProfil(dbPort, deps, id),
    }),
    notizen: dp('notizen', {
      get: (sId, fId) => notizenDomain.get(dbPort, sId, fId),
      set: (sId, fId, text) => notizenDomain.set(dbPort, deps, sId, fId, text),
    }),
    verlauf: dp('verlauf', {
      get: (sId, fId) => eintraegeDomain.verlaufGet(dbPort, sId, fId),
    }),
    export: dp('export', {
      // ODS-Noten-Export: im WebView erzeugt + per Web-Share geteilt (statt Node-FS).
      fachOds: (fId) => fachOdsMobil(dbPort, fId),
    }),
    spalten: dp('spalten', {
      getAll: (fId) => spaltenDomain.getAll(dbPort, fId),
      create: (d) => spaltenDomain.create(dbPort, d),
      update: (id, d) => spaltenDomain.update(dbPort, deps, id, d),
      delete: (id) => spaltenDomain.remove(dbPort, id),
      toggleEingeklappt: (id) => spaltenDomain.toggleEingeklappt(dbPort, id),
      setEingeklappt: (ids, w) => spaltenDomain.setEingeklappt(dbPort, ids, w),
    }),
    eintraege: dp('eintraege', {
      getAll: (fId) => eintraegeDomain.getAll(dbPort, fId),
      set: (sp, sc, w) => eintraegeDomain.set(dbPort, deps, sp, sc, w),
      setKommentar: (sp, sc, k) => eintraegeDomain.setKommentar(dbPort, sp, sc, k),
    }),
    zeugnisnoten: dp('zeugnisnoten', {
      getAll: (fId) => zeugnisnotenDomain.getAll(dbPort, fId),
      berechneFach: (fId) => zeugnisnotenDomain.berechneFach(dbPort, deps, fId),
      // Eine durchgehende Jahresnote (Slot semester=3) – kein semester-Parameter mehr.
      setManuell: (f, s, n) => zeugnisnotenDomain.setManuell(dbPort, deps, f, s, n),
      clearManuell: (f, s) => zeugnisnotenDomain.clearManuell(dbPort, deps, f, s),
      // Neuberechnung aller nicht-archivierten Schuljahre (spiegelt main.js: noten:rechneAllesNeu)
      // – genutzt vom Rezenz-Setup, den Einstellungen und dem einmaligen App-Recompute.
      rechneAllesNeu: async () => {
        const sj = await dbPort.select('SELECT id FROM schuljahre WHERE archiviert = 0')
        for (const s of sj) await deps.berechneAlleFuerSchuljahr(s.id)
        return true
      },
    }),
    niveau: dp('niveau', {
      get: (fId) => niveauDomain.get(dbPort, fId),
      getHistorie: (fId) => niveauDomain.getHistorie(dbPort, fId),
      set: (f, s, n, d) => niveauDomain.set(dbPort, deps, f, s, n, d),
      deleteHistorie: (f, s, g) => niveauDomain.deleteHistorie(dbPort, deps, f, s, g),
    }),
    rezenz: dp('rezenz', {
      get: (fId) => rezenzDomain.get(dbPort, fId),
      set: (f, s, faktor) => rezenzDomain.set(dbPort, deps, f, s, faktor),
      setKlasse: (f, faktor) => rezenzDomain.setKlasse(dbPort, deps, f, faktor),
    }),
    maNote: dp('maNote', {
      get: (fId) => maNoteDomain.get(dbPort, fId),
      set: (f, s, note) => maNoteDomain.set(dbPort, deps, f, s, note),
    }),
    kompetenzbereiche: dp('kompetenzbereiche', {
      getAll: (fId) => kompetenzenDomain.bereicheGetAll(dbPort, fId),
    }),
    schuelerKompetenzen: dp('schuelerKompetenzen', {
      getAll: (fId) => kompetenzenDomain.schuelerGetAll(dbPort, fId),
      set: (kb, s, n, no) => kompetenzenDomain.schuelerSet(dbPort, kb, s, n, no),
    }),
    todos: dp('todos', {
      getAll: (sjId) => todosDomain.getAll(dbPort, sjId),
      create: (d) => todosDomain.create(dbPort, d),
      update: (id, d) => todosDomain.update(dbPort, id, d),
      delete: (id) => todosDomain.remove(dbPort, id),
      toggleErledigt: (id) => todosDomain.toggleErledigt(dbPort, id),
    }),
    termine: dp('termine', {
      getAll: (sjId) => termineDomain.getAll(dbPort, sjId),
      create: (d) => termineDomain.create(dbPort, d),
      update: (id, d) => termineDomain.update(dbPort, id, d),
      delete: (id) => termineDomain.remove(dbPort, id),
    }),
    customFerien: dp('customFerien', {
      getAll: (sjId) => customFerienDomain.getAll(dbPort, sjId),
      save: (sjId, f) => customFerienDomain.save(dbPort, sjId, f),
    }),
    stundenzeiten: dp('stundenzeiten', {
      getAll: () => stundenzeitenDomain.getAll(dbPort),
      update: (id, d) => stundenzeitenDomain.update(dbPort, id, d),
      create: () => stundenzeitenDomain.create(dbPort),
      delete: (id) => stundenzeitenDomain.remove(dbPort, id),
      saveAll: (rows) => stundenzeitenDomain.saveAll(dbPort, deps, rows),
    }),
    stundenplan: dp('stundenplan', {
      getAll: () => stundenplanDomain.getAll(dbPort),
      getByKlasse: (kId) => stundenplanDomain.getByKlasse(dbPort, kId),
      getParallelFach: (kId, fachName) => stundenplanDomain.getParallelFach(dbPort, kId, fachName),
      create: (d) => stundenplanDomain.create(dbPort, d),
      update: (id, d) => stundenplanDomain.update(dbPort, id, d),
      delete: (id) => stundenplanDomain.remove(dbPort, id),
      verschieben: (id, wt, sid) => stundenplanDomain.verschieben(dbPort, id, wt, sid),
    }),
    stundenPlanung: dp('stundenPlanung', {
      get: (spId, wd) => stundenPlanungDomain.get(dbPort, spId, wd),
      getWoche: (wd) => stundenPlanungDomain.getWoche(dbPort, wd),
      getHueWoche: (wd) => stundenPlanungDomain.getHueWoche(dbPort, wd),
      getVorhandeneWochen: () => stundenPlanungDomain.getVorhandeneWochen(dbPort),
      checkMusizieren: (wd, kId, exSpId) => stundenPlanungDomain.checkMusizieren(dbPort, wd, kId, exSpId),
      save: (spId, wd, titel, inhalt, musizieren, hueText, hueFrist, link) => stundenPlanungDomain.save(dbPort, spId, wd, titel, inhalt, musizieren, hueText, hueFrist, link),
      setEntfall: (spId, wd, vor, ferien) => stundenPlanungDomain.setEntfall(dbPort, spId, wd, vor, ferien),
      removeEntfall: (spId, wd) => stundenPlanungDomain.removeEntfall(dbPort, spId, wd),
      delete: (spId, wd) => stundenPlanungDomain.remove(dbPort, spId, wd),
    }),
    supplierstunden: dp('supplierstunden', {
      getWoche: (wd) => supplierstundenDomain.getWoche(dbPort, wd),
      create: (d) => supplierstundenDomain.create(dbPort, d),
      update: (id, d) => supplierstundenDomain.update(dbPort, id, d),
      delete: (id) => supplierstundenDomain.remove(dbPort, id),
    }),
    jahresplanung: dp('jahresplanung', {
      getAll: (fId) => jahresplanungDomain.getAll(dbPort, fId),
      create: (d) => jahresplanungDomain.create(dbPort, deps, d),
      update: (id, d) => jahresplanungDomain.update(dbPort, deps, id, d),
      delete: (id) => jahresplanungDomain.remove(dbPort, id),
      swap: (a, b) => jahresplanungDomain.swap(dbPort, a, b),
    }),
    kv: dp('kv', {
      pruefeOffeneRueckrufe: () => kvRoutine.pruefeOffeneRueckrufe(dbPort, deps),
    }),
    sperre: dp('sperre', {
      status: async () => ({ aktiv: false, gesperrt: false }),
    }),
    // App-Version: skalarer Wert – der []-Fallback würde beim Changelog-Vergleich in
    // einstellungen.set(...) als Parameter landen (SQLite kann [] nicht binden).
    app: dp('app', {
      version: async () => '1.2.1',
    }),
  }

  // Top-Level-Proxy: unbekannte Domäne → leerer Proxy (liefert No-ops).
  return new Proxy(api, {
    get: (t, k) => (typeof k === 'string' && !(k in t)) ? dp(String(k), {}) : t[k],
  })
}
