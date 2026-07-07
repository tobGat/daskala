// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

// Die komplette IPC-Brücke als benanntes Objekt. Dient zugleich als Typquelle:
// renderer/window.d.ts leitet den Typ von window.api per `typeof` daraus ab,
// sodass der Renderer Autovervollständigung über window.api.* bekommt.
const api = {
  einstellungen: {
    get: (schluessel) => invoke('einstellungen:get', schluessel),
    set: (schluessel, wert) => invoke('einstellungen:set', schluessel, wert),
    getAll: () => invoke('einstellungen:getAll'),
  },

  schuljahre: {
    getAll: () => invoke('schuljahre:getAll'),
    create: (bezeichnung) => invoke('schuljahre:create', bezeichnung),
  },

  klassen: {
    getAll: (schuljahrId) => invoke('klassen:getAll', schuljahrId),
    getVorlagen: () => invoke('klassen:getVorlagen'),
    ausVorlage: (data) => invoke('klassen:ausVorlage', data),
    duplizieren: (data) => invoke('klassen:duplizieren', data),
    create: (data) => invoke('klassen:create', data),
    delete: (id) => invoke('klassen:delete', id),
    getDeleteStats: (id) => invoke('klassen:getDeleteStats', id),
    rename: (id, name) => invoke('klassen:rename', id, name),
    setFarbe: (id, farbe) => invoke('klassen:setFarbe', id, farbe),
    setTeamsLink: (id, link) => invoke('klassen:setTeamsLink', id, link),
    setIstKv: (id, istKv) => invoke('klassen:setIstKv', id, istKv),
    setSortierung: (id, modus) => invoke('klassen:setSortierung', id, modus),
  },

  kv: {
    jahresaufgaben: {
      getAlle: (klasseId, schuljahrId) => invoke('kv:jahresaufgaben:getAlle', klasseId, schuljahrId),
      setStatus: (aufgabeId, klasseId, schuljahrId, erledigtAm, notiz) =>
        invoke('kv:jahresaufgaben:setStatus', aufgabeId, klasseId, schuljahrId, erledigtAm, notiz),
      createTemplate: (data) => invoke('kv:jahresaufgaben:createTemplate', data),
      updateTemplate: (id, data) => invoke('kv:jahresaufgaben:updateTemplate', id, data),
      deleteTemplate: (id) => invoke('kv:jahresaufgaben:deleteTemplate', id),
    },
    wochenaufgaben: {
      getAlle: () => invoke('kv:wochenaufgaben:getAlle'),
      getStatusFuerWochen: (klasseId, schuljahrId, wochen) =>
        invoke('kv:wochenaufgaben:getStatusFuerWochen', klasseId, schuljahrId, wochen),
      setStatus: (aufgabeId, klasseId, schuljahrId, kw, jahr, erledigtAm, notiz) =>
        invoke('kv:wochenaufgaben:setStatus', aufgabeId, klasseId, schuljahrId, kw, jahr, erledigtAm, notiz),
      createTemplate: (data) => invoke('kv:wochenaufgaben:createTemplate', data),
      updateTemplate: (id, data) => invoke('kv:wochenaufgaben:updateTemplate', id, data),
      deleteTemplate: (id) => invoke('kv:wochenaufgaben:deleteTemplate', id),
    },
    trigger: {
      getAlle: (klasseId, opts) => invoke('kv:trigger:getAlle', klasseId, opts),
      getAlleFuerSchueler: (schuelerId) => invoke('kv:trigger:getAlleFuerSchueler', schuelerId),
      reagieren: (id, reaktion) => invoke('kv:trigger:reagieren', id, reaktion),
      create: (data) => invoke('kv:trigger:create', data),
      delete: (id) => invoke('kv:trigger:delete', id),
    },
    aktenvermerke: {
      getAlleFuerKlasse: (klasseId) => invoke('kv:aktenvermerke:getAlleFuerKlasse', klasseId),
      getAlleFuerSchueler: (schuelerId) => invoke('kv:aktenvermerke:getAlleFuerSchueler', schuelerId),
      create: (data) => invoke('kv:aktenvermerke:create', data),
      update: (id, data) => invoke('kv:aktenvermerke:update', id, data),
      delete: (id) => invoke('kv:aktenvermerke:delete', id),
    },
    elternkontakte: {
      getAlleFuerSchueler: (schuelerId) => invoke('kv:elternkontakte:getAlleFuerSchueler', schuelerId),
      getOffeneFuerKlasse: (klasseId) => invoke('kv:elternkontakte:getOffeneFuerKlasse', klasseId),
      create: (data) => invoke('kv:elternkontakte:create', data),
      update: (id, data) => invoke('kv:elternkontakte:update', id, data),
      setErledigt: (id, erledigt) => invoke('kv:elternkontakte:setErledigt', id, erledigt),
      delete: (id) => invoke('kv:elternkontakte:delete', id),
    },
    fehlstunden: {
      getAlleFuerSchueler: (schuelerId, schuljahrId) =>
        invoke('kv:fehlstunden:getAlleFuerSchueler', schuelerId, schuljahrId),
      create: (data) => invoke('kv:fehlstunden:create', data),
      update: (id, data) => invoke('kv:fehlstunden:update', id, data),
      delete: (id) => invoke('kv:fehlstunden:delete', id),
    },
    pruefeOffeneRueckrufe: () => invoke('kv:pruefeOffeneRueckrufe'),
  },

  faecher: {
    getAll: (klasseId) => invoke('faecher:getAll', klasseId),
    create: (data) => invoke('faecher:create', data),
    delete: (id) => invoke('faecher:delete', id),
    rename: (id, name) => invoke('faecher:rename', id, name),
    setFarbe: (id, farbe) => invoke('faecher:setFarbe', id, farbe),
    updateGewichtung: (id, data) => invoke('faecher:updateGewichtung', id, data),
    resetGewichtung: (id) => invoke('faecher:resetGewichtung', id),
    setBenotungssystem: (id, system) => invoke('faecher:setBenotungssystem', id, system),
    getSchuelerIds: (fachId) => invoke('faecher:getSchuelerIds', fachId),
    setSchueler: (fachId, data) => invoke('faecher:setSchueler', fachId, data),
  },

  niveau: {
    get: (fachId) => invoke('niveau:get', fachId),
    set: (fachId, schuelerId, niveau, datum) => invoke('niveau:set', fachId, schuelerId, niveau, datum),
    getHistorie: (fachId) => invoke('niveau:getHistorie', fachId),
    deleteHistorie: (fachId, schuelerId, gueltigAb) => invoke('niveau:deleteHistorie', fachId, schuelerId, gueltigAb),
  },

  schueler: {
    getAll: (klasseId) => invoke('schueler:getAll', klasseId),
    create: (data) => invoke('schueler:create', data),
    delete: (id) => invoke('schueler:delete', id),
    update: (id, data) => invoke('schueler:update', id, data),
    setAvatar: (id, avatar) => invoke('schueler:setAvatar', id, avatar),
    reorder: (updates) => invoke('schueler:reorder', updates),
    importBatch: (klasseId, list, fachIds) => invoke('schueler:importBatch', klasseId, list, fachIds),
    getLeistungsProfil: (id) => invoke('schueler:getLeistungsProfil', id),
    exportProfilPDF: (data) => invoke('schueler:exportProfilPDF', data),
  },

  spalten: {
    getAll: (fachId) => invoke('spalten:getAll', fachId),
    create: (data) => invoke('spalten:create', data),
    delete: (id) => invoke('spalten:delete', id),
    update: (id, data) => invoke('spalten:update', id, data),
    toggleEingeklappt: (id) => invoke('spalten:toggleEingeklappt', id),
    setEingeklappt: (ids, wert) => invoke('spalten:setEingeklappt', ids, wert),
    sortByKategorie: (fachId, semester) => invoke('spalten:sortByKategorie', fachId, semester),
  },

  eintraege: {
    getAll: (fachId) => invoke('eintraege:getAll', fachId),
    set: (spalteId, schuelerId, wert) => invoke('eintraege:set', spalteId, schuelerId, wert),
    setKommentar: (spalteId, schuelerId, kommentar) => invoke('eintraege:setKommentar', spalteId, schuelerId, kommentar),
  },

  verlauf: {
    get: (schuelerId, fachId) => invoke('verlauf:get', schuelerId, fachId),
  },

  zeugnisnoten: {
    getAll: (fachId) => invoke('zeugnisnoten:getAll', fachId),
    berechne: (fachId, schuelerId, semester) => invoke('zeugnisnoten:berechne', fachId, schuelerId, semester),
    berechneFach: (fachId) => invoke('zeugnisnoten:berechneFach', fachId),
    rechneAllesNeu: () => invoke('noten:rechneAllesNeu'),
    setManuell: (fachId, schuelerId, semester, note) => invoke('zeugnisnoten:setManuell', fachId, schuelerId, semester, note),
    clearManuell: (fachId, schuelerId, semester) => invoke('zeugnisnoten:clearManuell', fachId, schuelerId, semester),
  },

  notizen: {
    get: (schuelerId, fachId) => invoke('notizen:get', schuelerId, fachId),
    set: (schuelerId, fachId, text) => invoke('notizen:set', schuelerId, fachId, text),
  },

  gewichtungGlobal: {
    getAll: () => invoke('gewichtungGlobal:getAll'),
    update: (kategorie, gewichtung) => invoke('gewichtungGlobal:update', kategorie, gewichtung),
  },

  stundenzeiten: {
    getAll: () => invoke('stundenzeiten:getAll'),
    update: (id, data) => invoke('stundenzeiten:update', id, data),
    create: () => invoke('stundenzeiten:create'),
    delete: (id) => invoke('stundenzeiten:delete', id),
    saveAll: (rows) => invoke('stundenzeiten:saveAll', rows),
  },

  stundenplan: {
    getAll: () => invoke('stundenplan:getAll'),
    getByKlasse: (klasseId) => invoke('stundenplan:getByKlasse', klasseId),
    getParallelFach: (klasseId, fachName) => invoke('stundenplan:getParallelFach', klasseId, fachName),
    create: (data) => invoke('stundenplan:create', data),
    delete: (id) => invoke('stundenplan:delete', id),
    update: (id, data) => invoke('stundenplan:update', id, data),
  },

  supplierstunden: {
    getWoche: (wocheDatum) => invoke('supplierstunden:getWoche', wocheDatum),
    create:   (data)       => invoke('supplierstunden:create', data),
    delete:   (id)         => invoke('supplierstunden:delete', id),
    update:   (id, data)   => invoke('supplierstunden:update', id, data),
  },

  shell: {
    open: (url) => invoke('shell:open', url),
  },

  kompetenzbereiche: {
    getAll: (fachId) => invoke('kompetenzbereiche:getAll', fachId),
    create: (fachId, titel, beschreibung) => invoke('kompetenzbereiche:create', fachId, titel, beschreibung),
    update: (id, data) => invoke('kompetenzbereiche:update', id, data),
    delete: (id) => invoke('kompetenzbereiche:delete', id),
    reorder: (ids) => invoke('kompetenzbereiche:reorder', ids),
    initVorlagen: (fachId, fachName) => invoke('kompetenzbereiche:initVorlagen', fachId, fachName),
  },

  schuelerKompetenzen: {
    getAll: (fachId) => invoke('schuelerKompetenzen:getAll', fachId),
    set: (kompetenzbereichId, schuelerId, niveau, notiz) => invoke('schuelerKompetenzen:set', kompetenzbereichId, schuelerId, niveau, notiz),
  },

  customFerien: {
    getAll: (schuljahrId) => invoke('customFerien:getAll', schuljahrId),
    save: (schuljahrId, ferien) => invoke('customFerien:save', schuljahrId, ferien),
  },

  stundenPlanung: {
    get: (stundenplanId, wocheDatum) => invoke('stundenPlanung:get', stundenplanId, wocheDatum),
    getWoche: (wocheDatum) => invoke('stundenPlanung:getWoche', wocheDatum),
    save: (stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link) => invoke('stundenPlanung:save', stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link),
    delete: (stundenplanId, wocheDatum) => invoke('stundenPlanung:delete', stundenplanId, wocheDatum),
    setEntfall: (stundenplanId, wocheDatum, vorruecken, ferienZeitraeume) => invoke('stundenPlanung:setEntfall', stundenplanId, wocheDatum, vorruecken, ferienZeitraeume),
    removeEntfall: (stundenplanId, wocheDatum) => invoke('stundenPlanung:removeEntfall', stundenplanId, wocheDatum),
    getVorhandeneWochen: () => invoke('planung:getVorhandeneWochen'),
    checkMusizieren: (wocheDatum, klasseId, excludeStundenplanId) => invoke('stundenPlanung:checkMusizieren', wocheDatum, klasseId, excludeStundenplanId),
    getHueWoche: (wocheDatum) => invoke('stundenPlanung:getHueWoche', wocheDatum),
  },

  backup: {
    create: () => invoke('backup:create'),
    getList: () => invoke('backup:getList'),
    liste: () => invoke('backup:liste'),
    wiederherstellen: (pfad) => invoke('backup:wiederherstellen', pfad),
    status: () => invoke('backup:status'),
    jetzt: () => invoke('backup:jetzt'),
    waehleOrdner: () => invoke('backup:waehleOrdner'),
    setAutomatisch: (an) => invoke('backup:setAutomatisch', an),
    ordnerZuruecksetzen: () => invoke('backup:ordnerZuruecksetzen'),
    snooze: (tage) => invoke('backup:snooze', tage),
  },

  db: {
    saveAs: () => invoke('db:saveAs'),
    open:   () => invoke('db:open'),
  },

  app: {
    reset: () => invoke('app:reset'),
    version: () => invoke('app:version'),
    clipboard: (text) => invoke('app:clipboard', text),
  },

  sperre: {
    status: () => invoke('sperre:status'),
    setPin: (pin) => invoke('sperre:setPin', pin),
    deaktivieren: () => invoke('sperre:deaktivieren'),
    pruefe: (pin) => invoke('sperre:pruefe', pin),
    setGesperrt: (wert) => invoke('sperre:setGesperrt', wert),
  },

  wetter: {
    getWoche: (bundesland, montagDatum) => invoke('wetter:getWoche', bundesland, montagDatum),
    sucheOrt: (query) => invoke('wetter:sucheOrt', query),
  },

  undo: {
    execute:    () => invoke('undo:execute'),
    redo:       () => invoke('undo:redo'),
    state:      () => invoke('undo:state'),
    onApplied:  (cb) => ipcRenderer.on('undo:applied', cb),
    offApplied: (cb) => ipcRenderer.removeListener('undo:applied', cb),
  },

  update: {
    onStatus:     (cb) => { const h = (_e, data) => cb(data); ipcRenderer.on('update:status', h); return () => ipcRenderer.removeListener('update:status', h) },
    installieren: () => invoke('update:installieren'),
    pruefen:      () => invoke('update:pruefen'),
  },

  dialog: {
    openFile: (filters) => invoke('dialog:openFile', filters),
    saveFile: (filters, defaultName) => invoke('dialog:saveFile', filters, defaultName),
  },

  export: {
    toJson: () => invoke('export:toJson'),
    toExcel: (fachId) => invoke('export:toExcel', fachId),
    planungPdf: (wochen, einzeln) => invoke('export:planungPdf', wochen, einzeln),
    allSchuelerExcel: () => invoke('export:allSchuelerExcel'),
    allSchuelerPdf: () => invoke('export:allSchuelerPdf'),
    fachPlanungDocx: (fachId, fachName, klasseName, wochenDaten) => invoke('export:fachPlanungDocx', fachId, fachName, klasseName, wochenDaten),
    jahresplanungPdf: (fachId) => invoke('export:jahresplanungPdf', fachId),
    jahresplanungDocx: (fachId) => invoke('export:jahresplanungDocx', fachId),
  },

  import: {
    schuelerFromFile: (filePath) => invoke('import:schuelerFromFile', filePath),
  },

  jahresabschluss: {
    neuesSchuljahr: (data) => invoke('jahresabschluss:neuesSchuljahr', data),
  },

  todos: {
    getAll: (schuljahrId) => invoke('todos:getAll', schuljahrId),
    create: (data) => invoke('todos:create', data),
    update: (id, data) => invoke('todos:update', id, data),
    delete: (id) => invoke('todos:delete', id),
    toggleErledigt: (id) => invoke('todos:toggleErledigt', id),
  },

  sitzplan: {
    getTische: (fachId) => invoke('sitzplan:getTische', fachId),
    createTisch: (fachId, typ, x, y) => invoke('sitzplan:createTisch', fachId, typ, x, y),
    deleteTisch: (tischId) => invoke('sitzplan:deleteTisch', tischId),
    moveTisch: (tischId, x, y) => invoke('sitzplan:moveTisch', tischId, x, y),
    setRotation: (tischId, rotation) => invoke('sitzplan:setRotation', tischId, rotation),
    assignSchueler: (sitzplatzId, schuelerId) => invoke('sitzplan:assignSchueler', sitzplatzId, schuelerId),
    duplicateTisch: (fachId, sourceTischId, x, y) => invoke('sitzplan:duplicateTisch', fachId, sourceTischId, x, y),
  },


  termine: {
    getAll:  (schuljahrId)   => invoke('termine:getAll', schuljahrId),
    create:  (data)          => invoke('termine:create', data),
    update:  (id, data)      => invoke('termine:update', id, data),
    delete:  (id)            => invoke('termine:delete', id),
  },

  jahresplanung: {
    getAll:            (fachId)                => invoke('jahresplanung:getAll', fachId),
    create:            (data)                  => invoke('jahresplanung:create', data),
    update:            (id, d)                 => invoke('jahresplanung:update', id, d),
    delete:            (id)                    => invoke('jahresplanung:delete', id),
    getFaecherMitPlan: ()                      => invoke('jahresplanung:getFaecherMitPlan'),
    importVonFach:     (quellId, zielId, options) => invoke('jahresplanung:importVonFach', quellId, zielId, options),
    swap:              (idA, idB)              => invoke('jahresplanung:swap', idA, idB),
  },

  materialien: {
    waehleRoot:         ()                  => invoke('materialien:waehleRoot'),
    getRoot:            ()                  => invoke('materialien:getRoot'),
    list:               (abschnittId)       => invoke('materialien:list', abschnittId),
    dateienHinzufuegen: (abschnittId)       => invoke('materialien:dateienHinzufuegen', abschnittId),
    linkHinzufuegen:    (abschnittId, data) => invoke('materialien:linkHinzufuegen', abschnittId, data),
    metaSetzen:         (data)              => invoke('materialien:metaSetzen', data),
    entfernen:          (data)              => invoke('materialien:entfernen', data),
    oeffnen:            (data)              => invoke('materialien:oeffnen', data),
    ordnerOeffnen:      (abschnittId)       => invoke('materialien:ordnerOeffnen', abschnittId),
  },
}

contextBridge.exposeInMainWorld('api', api)

// Nur fürs Editor-Tooling (Typinferenz aus preload). Zur Laufzeit ignoriert Electron das.
if (typeof module !== 'undefined') module.exports = { api }
