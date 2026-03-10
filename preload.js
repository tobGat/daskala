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

  stundenPlanung: {
    get: (stundenplanId, wocheDatum) => invoke('stundenPlanung:get', stundenplanId, wocheDatum),
    getWoche: (wocheDatum) => invoke('stundenPlanung:getWoche', wocheDatum),
    save: (stundenplanId, wocheDatum, titel, inhalt) => invoke('stundenPlanung:save', stundenplanId, wocheDatum, titel, inhalt),
    delete: (stundenplanId, wocheDatum) => invoke('stundenPlanung:delete', stundenplanId, wocheDatum),
    getVorhandeneWochen: () => invoke('planung:getVorhandeneWochen'),
  },

  onedrive: {
    getInfo: () => invoke('onedrive:getInfo'),
  },

  backup: {
    create: () => invoke('backup:create'),
    getList: () => invoke('backup:getList'),
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
})
