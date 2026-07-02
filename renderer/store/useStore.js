import { create } from 'zustand'

let toastSeq = 0

const useStore = create((set, get) => ({
  // ─── App-Zustand ──────────────────────────────────────────────────────────
  initialized: false,
  erststart: true,
  theme: 'hell',
  currentView: 'stundenplan', // 'stundenplan' | 'notentabelle'

  // ─── Schuljahr ────────────────────────────────────────────────────────────
  schuljahre: [],
  aktuellesSchuljahr: null,

  // ─── Klassen ─────────────────────────────────────────────────────────────
  klassen: [],
  aktiveKlasse: null,

  // ─── KV (Klassenvorstand) ────────────────────────────────────────────────
  aktiveKVKlasse: null,             // separate Auswahl im KV-Bereich
  setAktiveKVKlasse: (klasse) => set({ aktiveKVKlasse: klasse }),

  // ─── Fächer ──────────────────────────────────────────────────────────────
  faecher: [],
  aktivesFach: null,

  // ─── Semester ─────────────────────────────────────────────────────────────
  aktiveSemester: 1,
  semester1Eingeklappt: false,

  // ─── Daten ───────────────────────────────────────────────────────────────
  schueler: [],
  spalten: [],
  eintraege: {},   // { spalte_id_schueler_id: wert }
  kommentare: {},  // { spalte_id_schueler_id: kommentar }
  zeugnisnoten: {}, // { schueler_id_semester: { note_berechnet, note_manuell } }
  niveaus: {},       // { schueler_id: 'AHS'|'ST' } – aktueller Stand für aktives Fach
  niveauHistorie: {}, // { schueler_id: [{ niveau, gueltig_ab }, ...] } – Verlauf, desc nach Datum
  kompetenzbereiche: [],       // [{ id, fach_id, titel, beschreibung, reihenfolge }]
  schuelerKompetenzen: {},     // { kompetenzbereichId_schuelerId: { niveau, notiz, aktualisiert } }
  todos: [],
  termine: [],

  // ─── UI-Zustand ───────────────────────────────────────────────────────────
  detailSchueler: null,  // { id, vorname, nachname }
  contextMenu: null,     // { x, y, items }
  activeModal: null,     // 'spalteHinzufuegen' | 'einstellungen' | 'schuelerHinzufuegen' | 'schuljahrwechsel' | 'gewichtung'
  modalData: null,

  // ─── Toasts / Benachrichtigungen ──────────────────────────────────────────
  toasts: [],  // [{ id, message, type: 'success'|'error'|'info', duration }]
  pushToast: (message, type = 'info', duration = 4000) => {
    const id = ++toastSeq
    set(state => ({ toasts: [...state.toasts, { id, message, type, duration }] }))
    return id
  },
  dismissToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  // ─── Einstellungen ────────────────────────────────────────────────────────
  einstellungen: {},
  gewichtungGlobal: {},

  // ─── Initialisierung ──────────────────────────────────────────────────────
  init: async () => {
    const alle = await window.api.einstellungen.getAll()
    const erststart = alle['erststart_abgeschlossen'] !== '1'
    const theme = alle['theme'] ?? 'hell'

    // Theme anwenden
    if (theme === 'dunkel') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // Gewichtung laden
    const gRows = await window.api.gewichtungGlobal.getAll()
    const gewichtungGlobal = {}
    gRows.forEach(r => { gewichtungGlobal[r.kategorie] = r.gewichtung })

    // Schuljahre laden
    const schuljahre = await window.api.schuljahre.getAll()

    let aktuellesSchuljahr = null
    if (schuljahre.length > 0) {
      const bezeichnung = alle['schuljahr_aktuell']
      aktuellesSchuljahr = schuljahre.find(s => s.bezeichnung === bezeichnung && !s.archiviert)
        ?? schuljahre.find(s => !s.archiviert)
        ?? schuljahre[0]
    }

    const semester = parseInt(alle['semester_aktuell'] ?? '1')

    set({
      initialized: true,
      erststart,
      theme,
      einstellungen: alle,
      gewichtungGlobal,
      schuljahre,
      aktuellesSchuljahr,
      aktiveSemester: semester,
    })

    if (!erststart && aktuellesSchuljahr) {
      await get().ladeKlassen(aktuellesSchuljahr.id)
      await get().ladeTodos()
      await get().ladeTermine()
      // Offene Elternkontakt-Rückrufe beim Start prüfen → erzeugt ggf. KV-Trigger,
      // auch wenn der KV-Bereich in dieser Sitzung nicht geöffnet wird.
      window.api.kv.pruefeOffeneRueckrufe()
        .catch(e => console.error('pruefeOffeneRueckrufe (init):', e))
    }
  },

  // ─── Schuljahr ────────────────────────────────────────────────────────────
  ladeSchuljahrDaten: async (schuljahrId) => {
    const schuljahre = await window.api.schuljahre.getAll()
    const aktuellesSchuljahr = schuljahre.find(s => s.id === schuljahrId) ?? schuljahre[0]
    set({ schuljahre, aktuellesSchuljahr })
    if (aktuellesSchuljahr) {
      await get().ladeKlassen(aktuellesSchuljahr.id)
    }
  },

  setAktuellesSchuljahr: async (schuljahr) => {
    set({ aktuellesSchuljahr: schuljahr, klassen: [], aktiveKlasse: null, faecher: [], aktivesFach: null })
    await get().ladeKlassen(schuljahr.id)
    await get().ladeTodos()
    await get().ladeTermine()
  },

  ladeTodos: async () => {
    const { aktuellesSchuljahr } = get()
    if (!aktuellesSchuljahr) return
    const data = await window.api.todos?.getAll(aktuellesSchuljahr.id) ?? []
    set({ todos: data })
  },

  ladeTermine: async () => {
    const { aktuellesSchuljahr } = get()
    if (!aktuellesSchuljahr) return
    try {
      const data = await window.api.termine.getAll(aktuellesSchuljahr.id)
      set({ termine: data })
    } catch (err) {
      console.error('[store] ladeTermine Fehler:', err)
    }
  },

  // ─── Klassen ─────────────────────────────────────────────────────────────
  ladeKlassen: async (schuljahrId) => {
    const klassen = await window.api.klassen.getAll(schuljahrId)
    const { aktiveKlasse } = get()
    const neueAktive = aktiveKlasse
      ? klassen.find(k => k.id === aktiveKlasse.id) ?? klassen[0]
      : klassen[0]

    set({ klassen })
    if (neueAktive) {
      await get().setAktiveKlasse(neueAktive)
    } else {
      set({ aktiveKlasse: null, faecher: [], aktivesFach: null, schueler: [], spalten: [], eintraege: {}, kommentare: {}, zeugnisnoten: {} })
    }
  },

  setAktiveKlasse: async (klasse) => {
    set({ aktiveKlasse: klasse, faecher: [], aktivesFach: null })
    const [faecher, schueler] = await Promise.all([
      window.api.faecher.getAll(klasse.id),
      window.api.schueler.getAll(klasse.id),
    ])
    const aktivesFach = faecher[0] ?? null
    set({ faecher, schueler })
    if (aktivesFach) {
      await get().setAktivesFach(aktivesFach)
    } else {
      set({ aktivesFach: null, spalten: [], eintraege: {}, kommentare: {}, zeugnisnoten: {} })
    }
  },

  // ─── Fächer ──────────────────────────────────────────────────────────────
  setAktivesFach: async (fach) => {
    set({ aktivesFach: fach })
    await get().ladeFachDaten(fach.id)
  },

  ladeFachDaten: async (fachId) => {
    const { aktivesFach } = get()
    const [spalten, eintraegeArr, zeugnisnotenArr] = await Promise.all([
      window.api.spalten.getAll(fachId),
      window.api.eintraege.getAll(fachId),
      window.api.zeugnisnoten.getAll(fachId),
    ])

    const eintraege = {}
    const kommentare = {}
    eintraegeArr.forEach(e => {
      eintraege[`${e.spalte_id}_${e.schueler_id}`] = e.wert
      if (e.kommentar) kommentare[`${e.spalte_id}_${e.schueler_id}`] = e.kommentar
    })

    const zeugnisnoten = {}
    zeugnisnotenArr.forEach(z => {
      zeugnisnoten[`${z.schueler_id}_${z.semester}`] = {
        note_berechnet: z.note_berechnet,
        note_manuell: z.note_manuell,
        s1_eingerechnet: z.s1_eingerechnet,
      }
    })

    // Niveaus + Historie laden wenn differenziert
    let niveaus = {}
    let niveauHistorie = {}
    const fach = aktivesFach?.id === fachId ? aktivesFach : null
    if (fach?.benotungssystem === 'differenziert') {
      const [n, h] = await Promise.all([
        window.api.niveau.get(fachId),
        window.api.niveau.getHistorie(fachId),
      ])
      niveaus = n
      niveauHistorie = h
    }

    // Kompetenzbereiche + Einstufungen laden
    const [kompetenzbereiche, skArr] = await Promise.all([
      window.api.kompetenzbereiche.getAll(fachId),
      window.api.schuelerKompetenzen.getAll(fachId),
    ])
    const schuelerKompetenzen = {}
    skArr.forEach(sk => {
      schuelerKompetenzen[`${sk.kompetenzbereich_id}_${sk.schueler_id}`] = {
        niveau: sk.niveau,
        notiz: sk.notiz,
        aktualisiert: sk.aktualisiert,
      }
    })

    set({ spalten, eintraege, kommentare, zeugnisnoten, niveaus, niveauHistorie, kompetenzbereiche, schuelerKompetenzen })
  },

  // ─── Einträge setzen ──────────────────────────────────────────────────────
  setEintrag: async (spalteId, schuelerId, wert) => {
    const key = `${spalteId}_${schuelerId}`
    // Optimistisches Update
    set(state => ({
      eintraege: { ...state.eintraege, [key]: wert }
    }))
    await window.api.eintraege.set(spalteId, schuelerId, wert)
    // ZN neu berechnen
    await get().refreshZeugnisnoten()
  },

  setKommentar: async (spalteId, schuelerId, kommentar) => {
    const key = `${spalteId}_${schuelerId}`
    set(state => ({
      kommentare: { ...state.kommentare, [key]: kommentar || undefined }
    }))
    await window.api.eintraege.setKommentar(spalteId, schuelerId, kommentar)
  },

  // ─── Kompetenzen ─────────────────────────────────────────────────────────
  ladeKompetenzen: async () => {
    const { aktivesFach } = get()
    if (!aktivesFach) return
    const [kompetenzbereiche, skArr] = await Promise.all([
      window.api.kompetenzbereiche.getAll(aktivesFach.id),
      window.api.schuelerKompetenzen.getAll(aktivesFach.id),
    ])
    const schuelerKompetenzen = {}
    skArr.forEach(sk => {
      schuelerKompetenzen[`${sk.kompetenzbereich_id}_${sk.schueler_id}`] = {
        niveau: sk.niveau, notiz: sk.notiz, aktualisiert: sk.aktualisiert,
      }
    })
    set({ kompetenzbereiche, schuelerKompetenzen })
  },

  setKompetenzNiveau: async (kompetenzbereichId, schuelerId, niveau, notiz) => {
    const key = `${kompetenzbereichId}_${schuelerId}`
    set(state => ({
      schuelerKompetenzen: {
        ...state.schuelerKompetenzen,
        [key]: { niveau, notiz: notiz ?? state.schuelerKompetenzen[key]?.notiz ?? null, aktualisiert: new Date().toISOString() }
      }
    }))
    await window.api.schuelerKompetenzen.set(kompetenzbereichId, schuelerId, niveau, notiz)
  },

  refreshZeugnisnoten: async () => {
    const { aktivesFach } = get()
    if (!aktivesFach) return
    await window.api.zeugnisnoten.berechneFach(aktivesFach.id)
    const zeugnisnotenArr = await window.api.zeugnisnoten.getAll(aktivesFach.id)
    const zeugnisnoten = {}
    zeugnisnotenArr.forEach(z => {
      zeugnisnoten[`${z.schueler_id}_${z.semester}`] = {
        note_berechnet: z.note_berechnet,
        note_manuell: z.note_manuell,
        s1_eingerechnet: z.s1_eingerechnet,
      }
    })
    set({ zeugnisnoten })
  },

  // ─── Niveaus (AHS/ST) ────────────────────────────────────────────────────
  ladeNiveaus: async () => {
    const { aktivesFach } = get()
    if (!aktivesFach || aktivesFach.benotungssystem !== 'differenziert') {
      set({ niveaus: {}, niveauHistorie: {} })
      return
    }
    const [niveaus, niveauHistorie] = await Promise.all([
      window.api.niveau.get(aktivesFach.id),
      window.api.niveau.getHistorie(aktivesFach.id),
    ])
    set({ niveaus, niveauHistorie })
  },

  // Niveau-Wechsel; datum optional ('YYYY-MM-DD'), default heute
  setNiveau: async (schuelerId, niveau, datum) => {
    const { aktivesFach } = get()
    if (!aktivesFach) return
    const heute = new Date().toISOString().slice(0, 10)
    const gueltigAb = datum || heute
    // Optimistisches Update des aktuellen Stands (nur wenn Wechsel jetzt/früher gilt)
    if (gueltigAb <= heute) {
      set(state => ({
        niveaus: { ...state.niveaus, [schuelerId]: niveau }
      }))
    }
    await window.api.niveau.set(aktivesFach.id, schuelerId, niveau, gueltigAb)
    await get().ladeNiveaus()
    await get().refreshZeugnisnoten()
  },

  deleteNiveauHistorie: async (schuelerId, gueltigAb) => {
    const { aktivesFach } = get()
    if (!aktivesFach) return
    await window.api.niveau.deleteHistorie(aktivesFach.id, schuelerId, gueltigAb)
    await get().ladeNiveaus()
    await get().refreshZeugnisnoten()
  },

  // ─── Spalten ─────────────────────────────────────────────────────────────
  ladeSpalten: async () => {
    const { aktivesFach } = get()
    if (!aktivesFach) return
    const spalten = await window.api.spalten.getAll(aktivesFach.id)
    set({ spalten })
  },

  toggleSpalteEingeklappt: async (spalteId) => {
    await window.api.spalten.toggleEingeklappt(spalteId)
    set(state => ({
      spalten: state.spalten.map(s =>
        s.id === spalteId ? { ...s, eingeklappt: s.eingeklappt ? 0 : 1 } : s
      )
    }))
  },

  setSemester1Eingeklappt: (val) => set({ semester1Eingeklappt: val }),

  // ─── Schüler:innen ────────────────────────────────────────────────────────
  ladeSchueler: async () => {
    const { aktiveKlasse } = get()
    if (!aktiveKlasse) return
    const schueler = await window.api.schueler.getAll(aktiveKlasse.id)
    set({ schueler })
  },

  // ─── UI ──────────────────────────────────────────────────────────────────
  setCurrentView: (view) => set({ currentView: view }),
  setDetailSchueler: (schueler) => set({ detailSchueler: schueler }),
  closeDetail: () => set({ detailSchueler: null }),

  openModal: (modal, data = null) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  setContextMenu: (menu) => set({ contextMenu: menu }),
  closeContextMenu: () => set({ contextMenu: null }),

  // ─── Theme ───────────────────────────────────────────────────────────────
  setTheme: async (theme) => {
    if (theme === 'dunkel') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    set({ theme })
    await window.api.einstellungen.set('theme', theme)
  },

  // ─── Nach Erststart ───────────────────────────────────────────────────────
  erststart_abschliessen: async (schuljahrId, klasseId, fachId) => {
    await window.api.einstellungen.set('erststart_abgeschlossen', '1')

    const schuljahre = await window.api.schuljahre.getAll()
    const aktuellesSchuljahr = schuljahre.find(s => s.id === schuljahrId)
    const klassen = await window.api.klassen.getAll(schuljahrId)
    const aktiveKlasse = klassen.find(k => k.id === klasseId)
    const faecher = await window.api.faecher.getAll(klasseId)
    const aktivesFach = faecher.find(f => f.id === fachId)
    const schueler = await window.api.schueler.getAll(klasseId)
    const spalten = []
    const eintraege = {}
    const zeugnisnoten = {}

    set({
      erststart: false,
      schuljahre,
      aktuellesSchuljahr,
      klassen,
      aktiveKlasse,
      faecher,
      aktivesFach,
      schueler,
      spalten,
      eintraege,
      zeugnisnoten,
      currentView: 'notentabelle',
    })
  },
}))

export default useStore
