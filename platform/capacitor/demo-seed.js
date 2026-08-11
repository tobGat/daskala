// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Demo-Datensatz für den Capacitor-Spike. Läuft nur, wenn die DB leer ist, und
// legt genug an, um beim ersten Start direkt eine Klasse mit Notentabelle zu sehen
// (Erststart-Assistent wird per Einstellung übersprungen). KEIN Produktionscode –
// dient nur dem Gerätetest.

export async function seedDemoWennLeer(dbPort) {
  const vorhanden = await dbPort.selectOne('SELECT COUNT(*) AS c FROM schuljahre')
  if (vorhanden && vorhanden.c > 0) return false

  const setE = (k, v) => dbPort.execute('INSERT OR REPLACE INTO einstellungen (schluessel, wert) VALUES (?, ?)', [k, v])
  await setE('erststart_abgeschlossen', '1')
  await setE('theme', 'hell')
  await setE('schuljahr_aktuell', '2025/26')
  await setE('semester_aktuell', '1')
  await setE('planung_aktiv', '0')

  const gw = [['SA', 0.35], ['T', 0.25], ['MA', 0.20], ['HÜ', 0.10], ['CUSTOM', 0.10]]
  for (const [k, g] of gw) {
    await dbPort.execute('INSERT OR IGNORE INTO gewichtung_global (kategorie, gewichtung) VALUES (?, ?)', [k, g])
  }

  const sj = (await dbPort.execute("INSERT INTO schuljahre (bezeichnung, archiviert) VALUES ('2025/26', 0)", [])).lastInsertRowid
  const k = (await dbPort.execute('INSERT INTO klassen (schuljahr_id, name, reihenfolge) VALUES (?, ?, ?)', [sj, '1A', 1])).lastInsertRowid
  const f = (await dbPort.execute('INSERT INTO faecher (klasse_id, name, reihenfolge, alle_schueler, benotungssystem) VALUES (?, ?, ?, 1, ?)', [k, 'Deutsch', 1, 'standard'])).lastInsertRowid

  const namen = [['Anna', 'Bauer'], ['Ben', 'Auer'], ['Clara', 'Zimmermann'], ['David', 'Müller'], ['Emma', 'Novak']]
  const sIds = []
  let i = 1
  for (const [v, n] of namen) {
    const id = (await dbPort.execute('INSERT INTO schueler (klasse_id, vorname, nachname, reihenfolge, aktiv) VALUES (?, ?, ?, ?, 1)', [k, v, n, i++])).lastInsertRowid
    sIds.push(id)
  }

  const sa = (await dbPort.execute("INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES (?, 1, 'SA', 'SA1', '2025-10-15', 1)", [f])).lastInsertRowid
  const t1 = (await dbPort.execute("INSERT INTO spalten (fach_id, semester, kategorie, kuerzel, datum, reihenfolge) VALUES (?, 1, 'T', 'T1', '2025-11-20', 2)", [f])).lastInsertRowid
  const notenSa = ['2', '3', '1', '4', '2']
  const notenT = ['3', '2', '2', '3', '1']
  for (let j = 0; j < sIds.length; j++) {
    await dbPort.execute('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)', [sa, sIds[j], notenSa[j]])
    await dbPort.execute('INSERT INTO eintraege (spalte_id, schueler_id, wert) VALUES (?, ?, ?)', [t1, sIds[j], notenT[j]])
  }

  // Stundenzeiten (Standard) + ein paar Stunden im Stundenplan, damit die
  // (mobile) Tagesansicht etwas anzeigt.
  const stunden = [['07:55', '08:40'], ['08:45', '09:30'], ['09:45', '10:30'], ['10:35', '11:20'], ['11:25', '12:10'], ['12:15', '13:00']]
  const stundeIds = []
  for (let s = 0; s < stunden.length; s++) {
    const r = await dbPort.execute('INSERT INTO stundenzeiten (stunde, beginn, ende) VALUES (?, ?, ?)', [s + 1, stunden[s][0], stunden[s][1]])
    stundeIds.push(r.lastInsertRowid)
  }
  // Deutsch (fach f) verteilt über die Woche: Mo 1., Di 2., Mi 1., Do 3., Fr 2. Stunde.
  const slots = [[1, 0], [2, 1], [3, 0], [4, 2], [5, 1]] // [wochentag, stundeIndex]
  for (const [wt, si] of slots) {
    await dbPort.execute('INSERT INTO stundenplan (wochentag, stunde_id, fach_id, wochen_intervall) VALUES (?, ?, ?, 1)', [wt, stundeIds[si], f])
  }
  return true
}
