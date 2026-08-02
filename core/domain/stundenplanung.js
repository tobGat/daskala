// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Wochen-Planung (stunden_planung) inkl. Entfall/Vorrücken.
// db injiziert; keine weiteren Abhängigkeiten (ferienZeitraeume ist Argument).

function get(db, stundenplanId, wocheDatum) {
  return db.prepare(
    'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
  ).get(stundenplanId, wocheDatum) ?? null
}

function getWoche(db, wocheDatum) {
  return db.prepare('SELECT * FROM stunden_planung WHERE woche_datum = ?').all(wocheDatum)
}

function save(db, stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link) {
  db.prepare(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET
        titel = excluded.titel, inhalt = excluded.inhalt, musizieren = excluded.musizieren,
        hue_text = excluded.hue_text, hue_frist_datum = excluded.hue_frist_datum, link = excluded.link
    `).run(stundenplanId, wocheDatum, titel, inhalt, musizieren ? 1 : 0, hueText ?? null, hueFristDatum ?? null, link ?? null)
  return true
}

function getHueWoche(db, wocheDatum) {
  const d = new Date(wocheDatum + 'T00:00:00')
  const sonntag = new Date(d)
  sonntag.setDate(d.getDate() + 6)
  const sonntagStr = `${sonntag.getFullYear()}-${String(sonntag.getMonth() + 1).padStart(2, '0')}-${String(sonntag.getDate()).padStart(2, '0')}`
  const rows = db.prepare(`
      SELECT sp.*, s.wochentag AS quell_wochentag, s.stunde_id, s.fach_id
      FROM stunden_planung sp
      JOIN stundenplan s ON s.id = sp.stundenplan_id
      WHERE sp.hue_frist_datum >= ? AND sp.hue_frist_datum <= ?
        AND sp.hue_text IS NOT NULL AND sp.hue_text != ''
    `).all(wocheDatum, sonntagStr)
  // Wochentag aus dem Fristdatum ableiten (1=Mo..5=Fr) und den passenden Slot finden
  return rows.map((row) => {
    const fristDate = new Date(row.hue_frist_datum + 'T00:00:00')
    const fristWochentag = fristDate.getDay() === 0 ? 7 : fristDate.getDay() // 1=Mo..7=So
    const zielSlot = db.prepare('SELECT stunde_id FROM stundenplan WHERE fach_id = ? AND wochentag = ? LIMIT 1').get(row.fach_id, fristWochentag)
    return {
      ...row,
      wochentag: fristWochentag,
      stunde_id: zielSlot?.stunde_id ?? row.stunde_id,
    }
  })
}

function checkMusizieren(db, wocheDatum, klasseId, excludeStundenplanId) {
  const row = db.prepare(`
      SELECT spl.id FROM stunden_planung spl
      JOIN stundenplan sp ON spl.stundenplan_id = sp.id
      JOIN faecher f ON sp.fach_id = f.id
      WHERE spl.woche_datum = ?
        AND f.klasse_id = ?
        AND spl.musizieren = 1
        AND spl.stundenplan_id != ?
        AND LOWER(f.name) LIKE '%musik%'
    `).get(wocheDatum, klasseId, excludeStundenplanId)
  return !!row
}

function setEntfall(db, stundenplanId, wocheDatum, vorruecken, ferienZeitraeume) {
  // Entfall-Eintrag erstellen/aktualisieren
  db.prepare(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, entfall)
      VALUES (?, ?, '', '', 1)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET entfall = 1
    `).run(stundenplanId, wocheDatum)

  if (vorruecken) {
    // Vorrücken: Planungen ab dem Entfall-Slot um je eine Stunde IN DIE ZUKUNFT schieben.
    // Ferien-Tage werden dabei übersprungen.
    const slot = db.prepare('SELECT * FROM stundenplan WHERE id = ?').get(stundenplanId)
    if (!slot) return true

    const alleSlots = db.prepare(`
        SELECT sp.id, sp.wochentag, sz.stunde as stunde_nr
        FROM stundenplan sp
        JOIN stundenzeiten sz ON sz.id = sp.stunde_id
        WHERE sp.fach_id = ?
        ORDER BY sp.wochentag, sz.stunde
      `).all(slot.fach_id)

    if (alleSlots.length === 0) return true

    const cancelIdx = alleSlots.findIndex((s) => s.id === stundenplanId)
    if (cancelIdx === -1) return true

    function addWeeks(dateStr, weeks) {
      const d = new Date(dateStr + 'T00:00:00')
      d.setDate(d.getDate() + weeks * 7)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    // Helper: Prüft ob ein bestimmter Wochentag in einer Woche ein Ferientag ist
    function istFerientag(weekDatum, wochentag) {
      if (!ferienZeitraeume || ferienZeitraeume.length === 0) return false
      const d = new Date(weekDatum + 'T00:00:00')
      d.setDate(d.getDate() + (wochentag - 1))
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return ferienZeitraeume.some((f) => dateStr >= f.von && dateStr <= f.bis)
    }

    // Ab dem Entfall-Slot vorwärts wandern und Slots sammeln (Ferien überspringen).
    const slots = [] // { slotId, weekDatum, planning|null }
    let curIdx = cancelIdx
    let curWeek = wocheDatum

    const entfallPlanung = db.prepare(
      'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
    ).get(stundenplanId, wocheDatum)
    slots.push({ slotId: stundenplanId, weekDatum: wocheDatum, planning: entfallPlanung })

    const maxSteps = alleSlots.length * 52
    for (let step = 0; step < maxSteps; step++) {
      const atEndOfCycle = curIdx === alleSlots.length - 1
      const nextIdx = (curIdx + 1) % alleSlots.length
      const nextWeek = atEndOfCycle ? addWeeks(curWeek, 1) : curWeek

      if (istFerientag(nextWeek, alleSlots[nextIdx].wochentag)) {
        curIdx = nextIdx
        curWeek = nextWeek
        continue
      }

      const planning = db.prepare(
        'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ? AND entfall = 0'
      ).get(alleSlots[nextIdx].id, nextWeek)

      slots.push({ slotId: alleSlots[nextIdx].id, weekDatum: nextWeek, planning: planning ?? null })

      if (!planning) break // Erster leerer Slot → Ende der Kette

      curIdx = nextIdx
      curWeek = nextWeek
    }

    // Planungen verschieben: Jeder Slot bekommt die Planung des vorherigen Slots.
    if (slots.length >= 2) {
      const vorrueckTransaction = db.transaction(() => {
        for (let i = slots.length - 1; i >= 1; i--) {
          const ziel = slots[i]       // Ziel-Slot (weiter in der Zukunft)
          const quelle = slots[i - 1] // Quell-Slot (näher an der Gegenwart)

          if (quelle.planning && (quelle.planning.titel || quelle.planning.inhalt || quelle.planning.hue_text || quelle.planning.link)) {
            const p = quelle.planning
            db.prepare(`
                INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link, entfall)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET
                  titel = excluded.titel, inhalt = excluded.inhalt, musizieren = excluded.musizieren,
                  hue_text = excluded.hue_text, hue_frist_datum = excluded.hue_frist_datum,
                  link = excluded.link, entfall = 0
              `).run(ziel.slotId, ziel.weekDatum, p.titel, p.inhalt, p.musizieren, p.hue_text, p.hue_frist_datum, p.link)
          } else {
            db.prepare('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ? AND entfall = 0')
              .run(ziel.slotId, ziel.weekDatum)
          }
        }
        db.prepare(`
            UPDATE stunden_planung SET titel = '', inhalt = '', musizieren = 0,
              hue_text = NULL, hue_frist_datum = NULL, link = NULL, entfall = 1
            WHERE stundenplan_id = ? AND woche_datum = ?
          `).run(stundenplanId, wocheDatum)
      })
      vorrueckTransaction()
    }
  }
  return true
}

function removeEntfall(db, stundenplanId, wocheDatum) {
  // Entfall aufheben – wenn keine anderen Inhalte vorhanden sind, Eintrag löschen
  const existing = db.prepare('SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?').get(stundenplanId, wocheDatum)
  if (existing && !existing.titel && !existing.inhalt && !existing.hue_text && !existing.link) {
    db.prepare('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?').run(stundenplanId, wocheDatum)
  } else {
    db.prepare('UPDATE stunden_planung SET entfall = 0 WHERE stundenplan_id = ? AND woche_datum = ?').run(stundenplanId, wocheDatum)
  }
  return true
}

function remove(db, stundenplanId, wocheDatum) {
  db.prepare(
    'DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?'
  ).run(stundenplanId, wocheDatum)
  return true
}

function getVorhandeneWochen(db) {
  return db.prepare('SELECT DISTINCT woche_datum FROM stunden_planung ORDER BY woche_datum').all().map((r) => r.woche_datum)
}

module.exports = { get, getWoche, save, getHueWoche, checkMusizieren, setEntfall, removeEntfall, remove, getVorhandeneWochen }
