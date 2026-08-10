// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Kern-Domäne: Wochen-Planung (stunden_planung) inkl. Entfall/Vorrücken.
// Async DbPort; keine weiteren Abhängigkeiten (ferienZeitraeume ist Argument).

async function get(db, stundenplanId, wocheDatum) {
  return db.selectOne('SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?', [stundenplanId, wocheDatum])
}

async function getWoche(db, wocheDatum) {
  return db.select('SELECT * FROM stunden_planung WHERE woche_datum = ?', [wocheDatum])
}

async function save(db, stundenplanId, wocheDatum, titel, inhalt, musizieren, hueText, hueFristDatum, link) {
  await db.execute(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET
        titel = excluded.titel, inhalt = excluded.inhalt, musizieren = excluded.musizieren,
        hue_text = excluded.hue_text, hue_frist_datum = excluded.hue_frist_datum, link = excluded.link
    `, [stundenplanId, wocheDatum, titel, inhalt, musizieren ? 1 : 0, hueText ?? null, hueFristDatum ?? null, link ?? null])
  return true
}

async function getHueWoche(db, wocheDatum) {
  const d = new Date(wocheDatum + 'T00:00:00')
  const sonntag = new Date(d)
  sonntag.setDate(d.getDate() + 6)
  const sonntagStr = `${sonntag.getFullYear()}-${String(sonntag.getMonth() + 1).padStart(2, '0')}-${String(sonntag.getDate()).padStart(2, '0')}`
  const rows = await db.select(`
      SELECT sp.*, s.wochentag AS quell_wochentag, s.stunde_id, s.fach_id
      FROM stunden_planung sp
      JOIN stundenplan s ON s.id = sp.stundenplan_id
      WHERE sp.hue_frist_datum >= ? AND sp.hue_frist_datum <= ?
        AND sp.hue_text IS NOT NULL AND sp.hue_text != ''
    `, [wocheDatum, sonntagStr])
  // Wochentag aus dem Fristdatum ableiten (1=Mo..5=Fr) und den passenden Slot finden
  const out = []
  for (const row of rows) {
    const fristDate = new Date(row.hue_frist_datum + 'T00:00:00')
    const fristWochentag = fristDate.getDay() === 0 ? 7 : fristDate.getDay() // 1=Mo..7=So
    const zielSlot = await db.selectOne('SELECT stunde_id FROM stundenplan WHERE fach_id = ? AND wochentag = ? LIMIT 1', [row.fach_id, fristWochentag])
    out.push({
      ...row,
      wochentag: fristWochentag,
      stunde_id: zielSlot?.stunde_id ?? row.stunde_id,
    })
  }
  return out
}

async function checkMusizieren(db, wocheDatum, klasseId, excludeStundenplanId) {
  const row = await db.selectOne(`
      SELECT spl.id FROM stunden_planung spl
      JOIN stundenplan sp ON spl.stundenplan_id = sp.id
      JOIN faecher f ON sp.fach_id = f.id
      WHERE spl.woche_datum = ?
        AND f.klasse_id = ?
        AND spl.musizieren = 1
        AND spl.stundenplan_id != ?
        AND LOWER(f.name) LIKE '%musik%'
    `, [wocheDatum, klasseId, excludeStundenplanId])
  return !!row
}

async function setEntfall(db, stundenplanId, wocheDatum, vorruecken, ferienZeitraeume) {
  // Entfall-Eintrag erstellen/aktualisieren
  await db.execute(`
      INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, entfall)
      VALUES (?, ?, '', '', 1)
      ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET entfall = 1
    `, [stundenplanId, wocheDatum])

  if (vorruecken) {
    // Vorrücken: Planungen ab dem Entfall-Slot um je eine Stunde IN DIE ZUKUNFT schieben.
    // Ferien-Tage werden dabei übersprungen.
    const slot = await db.selectOne('SELECT * FROM stundenplan WHERE id = ?', [stundenplanId])
    if (!slot) return true

    const alleSlots = await db.select(`
        SELECT sp.id, sp.wochentag, sz.stunde as stunde_nr
        FROM stundenplan sp
        JOIN stundenzeiten sz ON sz.id = sp.stunde_id
        WHERE sp.fach_id = ?
        ORDER BY sp.wochentag, sz.stunde
      `, [slot.fach_id])

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

    const entfallPlanung = await db.selectOne(
      'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?', [stundenplanId, wocheDatum])
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

      const planning = await db.selectOne(
        'SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ? AND entfall = 0', [alleSlots[nextIdx].id, nextWeek])

      slots.push({ slotId: alleSlots[nextIdx].id, weekDatum: nextWeek, planning: planning ?? null })

      if (!planning) break // Erster leerer Slot → Ende der Kette

      curIdx = nextIdx
      curWeek = nextWeek
    }

    // Planungen verschieben: Jeder Slot bekommt die Planung des vorherigen Slots.
    if (slots.length >= 2) {
      await db.transaction(async (tx) => {
        for (let i = slots.length - 1; i >= 1; i--) {
          const ziel = slots[i]       // Ziel-Slot (weiter in der Zukunft)
          const quelle = slots[i - 1] // Quell-Slot (näher an der Gegenwart)

          if (quelle.planning && (quelle.planning.titel || quelle.planning.inhalt || quelle.planning.hue_text || quelle.planning.link)) {
            const p = quelle.planning
            await tx.execute(`
                INSERT INTO stunden_planung (stundenplan_id, woche_datum, titel, inhalt, musizieren, hue_text, hue_frist_datum, link, entfall)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                ON CONFLICT(stundenplan_id, woche_datum) DO UPDATE SET
                  titel = excluded.titel, inhalt = excluded.inhalt, musizieren = excluded.musizieren,
                  hue_text = excluded.hue_text, hue_frist_datum = excluded.hue_frist_datum,
                  link = excluded.link, entfall = 0
              `, [ziel.slotId, ziel.weekDatum, p.titel, p.inhalt, p.musizieren, p.hue_text, p.hue_frist_datum, p.link])
          } else {
            await tx.execute('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ? AND entfall = 0', [ziel.slotId, ziel.weekDatum])
          }
        }
        await tx.execute(`
            UPDATE stunden_planung SET titel = '', inhalt = '', musizieren = 0,
              hue_text = NULL, hue_frist_datum = NULL, link = NULL, entfall = 1
            WHERE stundenplan_id = ? AND woche_datum = ?
          `, [stundenplanId, wocheDatum])
      })
    }
  }
  return true
}

async function removeEntfall(db, stundenplanId, wocheDatum) {
  // Entfall aufheben – wenn keine anderen Inhalte vorhanden sind, Eintrag löschen
  const existing = await db.selectOne('SELECT * FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?', [stundenplanId, wocheDatum])
  if (existing && !existing.titel && !existing.inhalt && !existing.hue_text && !existing.link) {
    await db.execute('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?', [stundenplanId, wocheDatum])
  } else {
    await db.execute('UPDATE stunden_planung SET entfall = 0 WHERE stundenplan_id = ? AND woche_datum = ?', [stundenplanId, wocheDatum])
  }
  return true
}

async function remove(db, stundenplanId, wocheDatum) {
  await db.execute('DELETE FROM stunden_planung WHERE stundenplan_id = ? AND woche_datum = ?', [stundenplanId, wocheDatum])
  return true
}

async function getVorhandeneWochen(db) {
  const rows = await db.select('SELECT DISTINCT woche_datum FROM stunden_planung ORDER BY woche_datum')
  return rows.map((r) => r.woche_datum)
}

module.exports = { get, getWoche, save, getHueWoche, checkMusizieren, setEntfall, removeEntfall, remove, getVorhandeneWochen }
