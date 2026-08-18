// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Schüler:innen (Personen) + n:m-Klassenmitgliedschaft über klassen_schueler.
// `schueler.klasse_id` bleibt in Phase 1 als „Stammklasse" (KV/Anzeige/Export); die Mitgliedschaft
// (reihenfolge/aktiv pro Klasse) lebt in klassen_schueler. Async DbPort.
// deps = { berechneAlleFuerFach } (für getLeistungsProfil + setKlassen/Neuberechnung).

const { neueUuid } = require('../db/uuid')

// Mitglieder EINER Klasse (inkl. klassenübergreifend zugeordneter Personen). Sortierung aus klassen.
async function getAll(db, klasseId) {
  const modus = (await db.selectOne('SELECT sortierung FROM klassen WHERE id = ?', [klasseId]))?.sortierung || 'nachname'
  // ORDER-BY aus fester Whitelist (keine Nutzereingabe → sichere Interpolation).
  const order = modus === 'vorname'
    ? 's.vorname COLLATE NOCASE, s.nachname COLLATE NOCASE'
    : modus === 'manuell'
      ? 'ks.reihenfolge, s.nachname COLLATE NOCASE, s.vorname COLLATE NOCASE'
      : 's.nachname COLLATE NOCASE, s.vorname COLLATE NOCASE'
  // ks.reihenfolge überschreibt s.reihenfolge (gleicher Aliasname, spätere Spalte gewinnt).
  return db.select(`
    SELECT s.*, ks.reihenfolge AS reihenfolge, ks.ist_stammklasse AS ist_stammklasse
    FROM schueler s
    JOIN klassen_schueler ks ON ks.schueler_id = s.id
    WHERE ks.klasse_id = ? AND ks.aktiv = 1 AND s.aktiv = 1
    ORDER BY ${order}
  `, [klasseId])
}

// Alle Personen eines Schuljahrs (über die Klassen-Mitgliedschaften), mit Klassen- und Fächer-Zuordnung.
// Basis der zentralen Schüler:innen-Verwaltung. Rückgabe je Person: + klassen[] + faecher[].
async function getAllImSchuljahr(db, schuljahrId) {
  const personen = await db.select(`
    SELECT DISTINCT s.* FROM schueler s
    JOIN klassen_schueler ks ON ks.schueler_id = s.id
    JOIN klassen k ON k.id = ks.klasse_id
    WHERE k.schuljahr_id = ? AND s.aktiv = 1 AND ks.aktiv = 1
    ORDER BY s.nachname COLLATE NOCASE, s.vorname COLLATE NOCASE
  `, [schuljahrId])
  if (!personen.length) return []

  const mitglied = await db.select(`
    SELECT ks.schueler_id, k.id AS klasse_id, k.name AS klasse_name, k.farbe AS klasse_farbe, ks.ist_stammklasse
    FROM klassen_schueler ks
    JOIN klassen k ON k.id = ks.klasse_id
    WHERE k.schuljahr_id = ? AND ks.aktiv = 1
    ORDER BY k.reihenfolge, k.name
  `, [schuljahrId])

  // Fach-Zugehörigkeit (Roster): alle_schueler=1 → über klassen_schueler; Gruppen → über fach_schueler.
  const faecherRows = await db.select(`
    SELECT ks.schueler_id, f.id AS fach_id, f.name AS fach_name, k.name AS klasse_name
    FROM faecher f JOIN klassen k ON k.id = f.klasse_id
    JOIN klassen_schueler ks ON ks.klasse_id = f.klasse_id AND ks.aktiv = 1
    WHERE k.schuljahr_id = ? AND f.alle_schueler = 1
    UNION
    SELECT fs.schueler_id, f.id, f.name, k.name
    FROM faecher f JOIN klassen k ON k.id = f.klasse_id
    JOIN fach_schueler fs ON fs.fach_id = f.id
    WHERE k.schuljahr_id = ? AND f.alle_schueler = 0
  `, [schuljahrId, schuljahrId])

  // SPF pro Fach: welche Fächer hat die Person mit sonderpäd. Förderbedarf markiert.
  const spfRows = await db.select(`
    SELECT sfs.schueler_id, sfs.fach_id
    FROM schueler_fach_spf sfs
    JOIN faecher f ON f.id = sfs.fach_id
    JOIN klassen k ON k.id = f.klasse_id
    WHERE k.schuljahr_id = ?
  `, [schuljahrId])

  const klassenVon = {}
  for (const m of mitglied) (klassenVon[m.schueler_id] ??= []).push({ id: m.klasse_id, name: m.klasse_name, farbe: m.klasse_farbe, ist_stammklasse: m.ist_stammklasse })
  const faecherVon = {}
  for (const f of faecherRows) (faecherVon[f.schueler_id] ??= []).push({ id: f.fach_id, name: f.fach_name, klasse_name: f.klasse_name })
  const spfVon = {}
  for (const r of spfRows) (spfVon[r.schueler_id] ??= []).push(r.fach_id)

  return personen.map((s) => ({ ...s, klassen: klassenVon[s.id] ?? [], faecher: faecherVon[s.id] ?? [], spf_faecher: spfVon[s.id] ?? [] }))
}

// Differenzierte alle_schueler-Fächer einer Klasse mit Niveau-Default 'AHS' seeden (idempotent).
async function seedeNiveauFuerKlasse(tx, klasseId, schuelerId) {
  const diffFaecher = await tx.select("SELECT id FROM faecher WHERE klasse_id = ? AND alle_schueler = 1 AND benotungssystem = 'differenziert'", [klasseId])
  for (const f of diffFaecher) {
    await tx.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [f.id, schuelerId, 'AHS'])
    await tx.execute(`
      INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
      SELECT ?, ?, 'AHS', '1900-01-01'
      WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
    `, [f.id, schuelerId, f.id, schuelerId])
  }
}

async function create(db, { klasseId, vorname, nachname, fachIds = [] }) {
  // Atomar (analog importBatch): sonst bliebe bei Abbruch nach INSERT schueler eine verwaiste
  // Person ohne Mitgliedschaft zurück, die in keinem Roster (jetzt über klassen_schueler) erscheint.
  let schuelerId
  await db.transaction(async (tx) => {
    const maxR = (await tx.selectOne('SELECT MAX(reihenfolge) as m FROM klassen_schueler WHERE klasse_id = ?', [klasseId]))?.m ?? 0
    const info = await tx.execute('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, uuid) VALUES (?, ?, ?, ?, ?)', [klasseId, vorname, nachname, maxR + 1, neueUuid()])
    schuelerId = info.lastInsertRowid
    // Person global anlegen + der (aktiven) Klasse als Stammklasse zuordnen.
    await tx.execute('INSERT INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse) VALUES (?, ?, ?, 1, 1)', [klasseId, schuelerId, maxR + 1])
    // In gewählte Fächer aufnehmen: manuelle Fächer bekommen einen fach_schueler-Eintrag,
    // „alle Schüler:innen"-Fächer schließen neue automatisch ein (nichts zu tun).
    if (Array.isArray(fachIds) && fachIds.length) {
      for (const fid of fachIds) {
        const fach = await tx.selectOne('SELECT alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?', [fid, klasseId])
        if (!fach) continue
        if (!fach.alle_schueler) await tx.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fid, schuelerId])
        if (fach.benotungssystem === 'differenziert') {
          await tx.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fid, schuelerId, 'AHS'])
          await tx.execute(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        SELECT ?, ?, ?, '1900-01-01'
        WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
      `, [fid, schuelerId, 'AHS', fid, schuelerId])
        }
      }
    }
  })
  return schuelerId
}

// Person global „löschen" (Soft-Delete): verschwindet aus allen Klassen/Rostern, Daten bleiben.
// Auch alle Mitgliedschaften deaktivieren, damit die Person konsistent aus jedem Fach-Roster fällt.
async function remove(db, id) {
  await db.transaction(async (tx) => {
    await tx.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [id])
    await tx.execute('UPDATE klassen_schueler SET aktiv = 0 WHERE schueler_id = ?', [id])
  })
  return true
}

// Person aus EINER Klasse entfernen (Mitgliedschaft löschen; Noten bleiben, da fach-basiert).
// War es die Stammklasse und es bleiben andere Klassen → Stammklasse umhängen; bleibt keine
// Mitgliedschaft → Person deaktivieren (entspricht dem alten „Löschen" bei Einzelklassen).
async function entferneAusKlasse(db, schuelerId, klasseId) {
  // Atomar: sonst könnte ein Abbruch nach dem DELETE die Stammklasse verlieren, während
  // schueler.klasse_id noch auf die entfernte Klasse zeigt (Invariante „genau eine Stammklasse").
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM klassen_schueler WHERE klasse_id = ? AND schueler_id = ?', [klasseId, schuelerId])
    const rest = await tx.select('SELECT klasse_id FROM klassen_schueler WHERE schueler_id = ? AND aktiv = 1', [schuelerId])
    if (!rest.length) {
      await tx.execute('UPDATE schueler SET aktiv = 0 WHERE id = ?', [schuelerId])
      return
    }
    const person = await tx.selectOne('SELECT klasse_id FROM schueler WHERE id = ?', [schuelerId])
    if (person && person.klasse_id === klasseId) {
      const neu = rest[0].klasse_id
      await tx.execute('UPDATE schueler SET klasse_id = ? WHERE id = ?', [neu, schuelerId])
      await tx.execute('UPDATE klassen_schueler SET ist_stammklasse = 1 WHERE schueler_id = ? AND klasse_id = ?', [schuelerId, neu])
    }
  })
  return true
}

// Klassen-Mitgliedschaften einer Person auf genau `klasseIds` setzen (zentrale Verwaltung).
async function setKlassen(db, deps, schuelerId, klasseIds) {
  const ids = [...new Set((klasseIds || []).map(Number).filter(Boolean))]
  if (!ids.length) return false // eine Person muss mindestens einer Klasse angehören
  const person = await db.selectOne('SELECT klasse_id FROM schueler WHERE id = ?', [schuelerId])
  if (!person) return false
  const current = new Set((await db.select('SELECT klasse_id FROM klassen_schueler WHERE schueler_id = ?', [schuelerId])).map((r) => r.klasse_id))
  const toAdd = ids.filter((k) => !current.has(k))
  const toRemove = [...current].filter((k) => !ids.includes(k))
  await db.transaction(async (tx) => {
    for (const k of toAdd) {
      const maxR = (await tx.selectOne('SELECT MAX(reihenfolge) as m FROM klassen_schueler WHERE klasse_id = ?', [k]))?.m ?? 0
      await tx.execute('INSERT OR IGNORE INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse) VALUES (?, ?, ?, 1, 0)', [k, schuelerId, maxR + 1])
      await tx.execute('UPDATE klassen_schueler SET aktiv = 1 WHERE klasse_id = ? AND schueler_id = ?', [k, schuelerId]) // falls zuvor inaktiv
      await seedeNiveauFuerKlasse(tx, k, schuelerId)
    }
    // Neue Zuordnung → Person (falls zuvor global soft-gelöscht) wieder aktivieren, sonst bliebe sie
    // trotz aktiver Mitgliedschaft aus allen Rostern ausgeblendet (Roster filtern s.aktiv=1).
    if (toAdd.length) await tx.execute('UPDATE schueler SET aktiv = 1 WHERE id = ?', [schuelerId])
    for (const k of toRemove) {
      await tx.execute('DELETE FROM klassen_schueler WHERE klasse_id = ? AND schueler_id = ?', [k, schuelerId])
    }
    // Genau eine Stammklasse = schueler.klasse_id; wenn diese entfernt wurde, auf ids[0] umhängen.
    const stamm = ids.includes(person.klasse_id) ? person.klasse_id : ids[0]
    if (stamm !== person.klasse_id) await tx.execute('UPDATE schueler SET klasse_id = ? WHERE id = ?', [stamm, schuelerId])
    await tx.execute('UPDATE klassen_schueler SET ist_stammklasse = 0 WHERE schueler_id = ?', [schuelerId])
    await tx.execute('UPDATE klassen_schueler SET ist_stammklasse = 1 WHERE schueler_id = ? AND klasse_id = ?', [schuelerId, stamm])
  })
  // Neue Klassen: Zeugnisnoten der (alle_schueler-)Fächer für die neue Person berechnen.
  for (const k of toAdd) {
    const faecher = await db.select('SELECT id FROM faecher WHERE klasse_id = ?', [k])
    for (const f of faecher) await deps.berechneAlleFuerFach(f.id)
  }
  return true
}

// Auswahl-Fach-Mitgliedschaften (fach_schueler) einer Person anpassen (zentrale Verwaltung).
// add/remove betreffen NUR Gruppen-Fächer (alle_schueler=0); „ganze Klasse"-Fächer laufen über die
// Klassen-Mitgliedschaft und werden ignoriert. Betroffene Fächer werden neu berechnet.
async function setFaecher(db, deps, schuelerId, { add = [], remove = [] } = {}) {
  const betroffen = new Set()
  await db.transaction(async (tx) => {
    for (const fid of add) {
      const fach = await tx.selectOne('SELECT alle_schueler, benotungssystem FROM faecher WHERE id = ?', [fid])
      if (!fach || fach.alle_schueler) continue // nur Gruppen-Fächer sind einzeln zuordenbar
      await tx.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fid, schuelerId])
      if (fach.benotungssystem === 'differenziert') {
        await tx.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fid, schuelerId, 'AHS'])
        await tx.execute(`
          INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
          SELECT ?, ?, 'AHS', '1900-01-01'
          WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
        `, [fid, schuelerId, fid, schuelerId])
      }
      betroffen.add(fid)
    }
    for (const fid of remove) {
      const fach = await tx.selectOne('SELECT alle_schueler FROM faecher WHERE id = ?', [fid])
      if (!fach || fach.alle_schueler) continue
      await tx.execute('DELETE FROM fach_schueler WHERE fach_id = ? AND schueler_id = ?', [fid, schuelerId])
      betroffen.add(fid)
    }
  })
  for (const fid of betroffen) await deps.berechneAlleFuerFach(fid)
  return true
}

// SPF (sonderpäd. Förderbedarf) pro Fach setzen: die Fach-Menge exakt auf `fachIds` bringen.
// schueler.spf bleibt als Summen-Flag (1, falls in ≥1 Fach). SPF beeinflusst keine Noten.
async function setSpfFaecher(db, schuelerId, fachIds) {
  const ids = [...new Set((fachIds || []).map(Number).filter(Boolean))]
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM schueler_fach_spf WHERE schueler_id = ?', [schuelerId])
    for (const fid of ids) await tx.execute('INSERT OR IGNORE INTO schueler_fach_spf (schueler_id, fach_id) VALUES (?, ?)', [schuelerId, fid])
    await tx.execute('UPDATE schueler SET spf = ? WHERE id = ?', [ids.length ? 1 : 0, schuelerId])
  })
  return true
}

// Stammdaten-Felder (Kontakt/Notfall/Berechtigte). Free-Text; leer → NULL.
const STAMMDATEN_FELDER = ['geburtsdatum', 'strasse', 'plz', 'ort', 'telefon', 'email', 'notfallnummer', 'erziehungsberechtigte', 'abholberechtigte', 'anmerkungen']

async function setStammdaten(db, id, data) {
  const wert = (v) => { const s = v == null ? '' : String(v).trim(); return s === '' ? null : s }
  await db.execute(
    `UPDATE schueler SET ${STAMMDATEN_FELDER.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...STAMMDATEN_FELDER.map((f) => wert(data ? data[f] : null)), id],
  )
  return true
}

async function update(db, id, data) {
  await db.execute(`UPDATE schueler SET vorname = ?, nachname = ?,
      lernschwaeche = CASE WHEN ? IS NOT NULL THEN ? ELSE lernschwaeche END,
      legasthenie   = CASE WHEN ? IS NOT NULL THEN ? ELSE legasthenie   END,
      spf           = CASE WHEN ? IS NOT NULL THEN ? ELSE spf           END
      WHERE id = ?`,
  [
    data.vorname, data.nachname,
    data.lernschwaeche ?? null, data.lernschwaeche ?? null,
    data.legasthenie ?? null, data.legasthenie ?? null,
    data.spf ?? null, data.spf ?? null,
    id,
  ])
  return true
}

// Avatar (JSON-Config) setzen; null = zurück auf Auto-aus-Name
async function setAvatar(db, id, avatar) {
  await db.execute('UPDATE schueler SET avatar = ? WHERE id = ?', [avatar ?? null, id])
  return true
}

// Reihenfolge PRO Klasse (auf der Mitgliedschaft). updates = [{ id: schuelerId, reihenfolge }].
async function reorder(db, klasseId, updates) {
  await db.transaction(async (tx) => {
    for (const { id, reihenfolge } of updates) await tx.execute('UPDATE klassen_schueler SET reihenfolge = ? WHERE klasse_id = ? AND schueler_id = ?', [reihenfolge, klasseId, id])
  })
  return true
}

async function importBatch(db, klasseId, list, fachIds = []) {
  // Gewählte Fächer (nur gültige der Klasse) einmal auflösen.
  const faecher = []
  for (const fid of (Array.isArray(fachIds) ? fachIds : [])) {
    const f = await db.selectOne('SELECT id, alle_schueler, benotungssystem FROM faecher WHERE id = ? AND klasse_id = ?', [fid, klasseId])
    if (f) faecher.push(f)
  }
  await db.transaction(async (tx) => {
    const maxReihenfolge = (await tx.selectOne('SELECT MAX(reihenfolge) as m FROM klassen_schueler WHERE klasse_id = ?', [klasseId]))?.m ?? 0
    let i = 0
    for (const s of list) {
      const reihenfolge = maxReihenfolge + i + 1
      const info = await tx.execute('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, uuid) VALUES (?, ?, ?, ?, ?)', [klasseId, s.vorname, s.nachname, reihenfolge, neueUuid()])
      i++
      const sid = info.lastInsertRowid
      await tx.execute('INSERT INTO klassen_schueler (klasse_id, schueler_id, reihenfolge, aktiv, ist_stammklasse) VALUES (?, ?, ?, 1, 1)', [klasseId, sid, reihenfolge])
      if (faecher.length) {
        for (const fach of faecher) {
          if (!fach.alle_schueler) await tx.execute('INSERT OR IGNORE INTO fach_schueler (fach_id, schueler_id) VALUES (?, ?)', [fach.id, sid])
          if (fach.benotungssystem === 'differenziert') {
            await tx.execute('INSERT OR IGNORE INTO schueler_niveau (fach_id, schueler_id, niveau) VALUES (?, ?, ?)', [fach.id, sid, 'AHS'])
            await tx.execute(`
        INSERT INTO schueler_niveau_historie (fach_id, schueler_id, niveau, gueltig_ab)
        SELECT ?, ?, ?, '1900-01-01'
        WHERE NOT EXISTS (SELECT 1 FROM schueler_niveau_historie WHERE fach_id = ? AND schueler_id = ?)
      `, [fach.id, sid, 'AHS', fach.id, sid])
          }
        }
      }
    }
  })
  return true
}

async function getLeistungsProfil(db, deps, schuelerId) {
  const schueler = await db.selectOne('SELECT * FROM schueler WHERE id = ?', [schuelerId])
  if (!schueler) return null
  // Phase 1: Fächer über die Stammklasse (schueler.klasse_id). Phase 2 generalisiert auf alle Klassen.
  const faecher = await db.select(`
      SELECT f.* FROM faecher f
      WHERE f.klasse_id = ?
        AND (f.alle_schueler = 1
             OR EXISTS (SELECT 1 FROM fach_schueler fs WHERE fs.fach_id = f.id AND fs.schueler_id = ?))
      ORDER BY f.reihenfolge
    `, [schueler.klasse_id, schuelerId])

  // Zeugnisnoten aktuell berechnen (S1, S2 und Endnote), damit das Profil immer aktuelle Werte zeigt
  for (const fach of faecher) await deps.berechneAlleFuerFach(fach.id)

  const zeugnisnoten = await db.select('SELECT * FROM zeugnisnoten WHERE schueler_id = ?', [schuelerId])
  const eintraege = await db.select(`
      SELECT e.wert, e.kommentar, s.kategorie, s.datum, s.kuerzel, s.notiz, s.semester, s.fach_id, s.reihenfolge
      FROM eintraege e
      JOIN spalten s ON e.spalte_id = s.id
      WHERE e.schueler_id = ? AND e.wert IS NOT NULL
      ORDER BY s.fach_id, s.semester, s.reihenfolge
    `, [schuelerId])
  const notizen = await db.select(`
      SELECT n.schueler_id, n.fach_id, n.text, f.name AS fach_name FROM notizen n
      JOIN faecher f ON n.fach_id = f.id
      WHERE n.schueler_id = ? AND n.text IS NOT NULL AND n.text != ''
    `, [schuelerId])
  // Aktuelles Niveau je Fach (für korrekte Rückrechnung differenzierter Noten im Export)
  const niveaus = {}
  ;(await db.select('SELECT fach_id, niveau FROM schueler_niveau WHERE schueler_id = ?', [schuelerId]))
    .forEach((r) => { niveaus[r.fach_id] = r.niveau })
  // Niveau-Historie je Fach (für die Darstellung von AHS/ST-Wechseln im Leistungsdiagramm)
  const niveauHistorie = {}
  ;(await db.select(`SELECT fach_id, niveau, gueltig_ab FROM schueler_niveau_historie
      WHERE schueler_id = ? ORDER BY fach_id, gueltig_ab DESC, id DESC`, [schuelerId]))
    .forEach((r) => { (niveauHistorie[r.fach_id] ??= []).push({ niveau: r.niveau, gueltig_ab: r.gueltig_ab }) })
  return { schueler, faecher, zeugnisnoten, eintraege, notizen, niveaus, niveauHistorie }
}

module.exports = { getAll, getAllImSchuljahr, create, remove, entferneAusKlasse, setKlassen, setFaecher, setSpfFaecher, setStammdaten, update, setAvatar, reorder, importBatch, getLeistungsProfil }
