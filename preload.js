const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('api', {
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
    create: (data) => invoke('klassen:create', data),
    delete: (id) => invoke('klassen:delete', id),
    rename: (id, name) => invoke('klassen:rename', id, name),
    setFarbe: (id, farbe) => invoke('klassen:setFarbe', id, farbe),
  },

  faecher: {
    getAll: (klasseId) => invoke('faecher:getAll', klasseId),
    create: (data) => invoke('faecher:create', data),
    delete: (id) => invoke('faecher:delete', id),
    rename: (id, name) => invoke('faecher:rename', id, name),
    setFarbe: (id, farbe) => invoke('faecher:setFarbe', id, farbe),
    updateGewichtung: (id, data) => invoke('faecher:updateGewichtung', id, data),
    resetGewichtung: (id) => invoke('faecher:resetGewichtung', id),
  },

  schueler: {
    getAll: (klasseId) => invoke('schueler:getAll', klasseId),
    create: (data) => invoke('schueler:create', data),
    delete: (id) => invoke('schueler:delete', id),
    update: (id, data) => invoke('schueler:update', id, data),
    reorder: (updates) => invoke('schueler:reorder', updates),
    importBatch: (klasseId, list) => invoke('schueler:importBatch', klasseId, list),
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

  zeugnisnoten: {
    getAll: (fachId) => invoke('zeugnisnoten:getAll', fachId),
    berechne: (fachId, schuelerId, semester) => invoke('zeugnisnoten:berechne', fachId, schuelerId, semester),
    berechneFach: (fachId) => invoke('zeugnisnoten:berechneFach', fachId),
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
  },

  stundenplan: {
    getAll: () => invoke('stundenplan:getAll'),
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

  stundenPlanung: {
    get: (stundenplanId, wocheDatum) => invoke('stundenPlanung:get', stundenplanId, wocheDatum),
    getWoche: (wocheDatum) => invoke('stundenPlanung:getWoche', wocheDatum),
    save: (stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link) => invoke('stundenPlanung:save', stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link),
    delete: (stundenplanId, wocheDatum) => invoke('stundenPlanung:delete', stundenplanId, wocheDatum),
    getVorhandeneWochen: () => invoke('planung:getVorhandeneWochen'),
    checkMusizieren: (wocheDatum, klasseId, excludeStundenplanId) => invoke('stundenPlanung:checkMusizieren', wocheDatum, klasseId, excludeStundenplanId),
    getHueWoche: (wocheDatum) => invoke('stundenPlanung:getHueWoche', wocheDatum),
  },

  onedrive: {
    getInfo: () => invoke('onedrive:getInfo'),
  },

  backup: {
    create: () => invoke('backup:create'),
    getList: () => invoke('backup:getList'),
  },

  db: {
    saveAs: () => invoke('db:saveAs'),
    open:   () => invoke('db:open'),
  },

  undo: {
    execute:    () => invoke('undo:execute'),
    redo:       () => invoke('undo:redo'),
    state:      () => invoke('undo:state'),
    onApplied:  (cb) => ipcRenderer.on('undo:applied', cb),
    offApplied: (cb) => ipcRenderer.removeListener('undo:applied', cb),
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
    assignSchueler: (sitzplatzId, schuelerId) => invoke('sitzplan:assignSchueler', sitzplatzId, schuelerId),
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
    importVonFach:     (quellId, zielId)       => invoke('jahresplanung:importVonFach', quellId, zielId),
  },
})
