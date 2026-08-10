// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
//
// Phase 2: DbPort-Adapter (platform/electron/db-better-sqlite3.js).
// Prüft select/selectOne/execute/transaction (Commit, Rollback, verschachtelte
// Savepoints) sowie Cache-Invalidierung nach DB-Neuöffnen.
// Ausführen:  npm run test:core  (nur unter ELECTRON_RUN_AS_NODE=1 electron)

const { test } = require('node:test')
const assert = require('node:assert')
const Database = require('better-sqlite3')
const { createDbAdapter } = require('../../platform/electron/db-better-sqlite3.js')

function frisch() {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  return db
}

test('select/selectOne/execute', async () => {
  const db = frisch()
  const p = createDbAdapter(() => db)
  const info = await p.execute('INSERT INTO t (v) VALUES (?)', ['a'])
  assert.strictEqual(Number(info.lastInsertRowid), 1)
  assert.strictEqual(info.changes, 1)
  assert.strictEqual((await p.selectOne('SELECT v FROM t WHERE id=?', [1])).v, 'a')
  assert.strictEqual((await p.select('SELECT * FROM t')).length, 1)
  assert.strictEqual(await p.selectOne('SELECT * FROM t WHERE id=?', [99]), null)
  db.close()
})

test('transaction: Commit schreibt, Rollback verwirft', async () => {
  const db = frisch()
  const p = createDbAdapter(() => db)
  await p.transaction(async (tx) => { await tx.execute('INSERT INTO t (v) VALUES (?)', ['b']) })
  assert.strictEqual((await p.select('SELECT * FROM t')).length, 1)
  await assert.rejects(p.transaction(async (tx) => {
    await tx.execute('INSERT INTO t (v) VALUES (?)', ['c'])
    throw new Error('boom')
  }))
  assert.strictEqual((await p.select('SELECT * FROM t')).length, 1)
  db.close()
})

test('verschachtelte Transaktion: innerer Savepoint rollt zurück, äußerer committed', async () => {
  const db = frisch()
  const p = createDbAdapter(() => db)
  await p.transaction(async (tx) => {
    await tx.execute('INSERT INTO t (v) VALUES (?)', ['d'])
    await assert.rejects(tx.transaction(async (tx2) => {
      await tx2.execute('INSERT INTO t (v) VALUES (?)', ['e'])
      throw new Error('inner')
    }))
  })
  const vals = (await p.select('SELECT v FROM t ORDER BY id')).map((r) => r.v).join(',')
  assert.strictEqual(vals, 'd')
  db.close()
})

test('reopen: neue Verbindung wird erkannt, Statement-Cache invalidiert', async () => {
  let db = frisch()
  const p = createDbAdapter(() => db)
  await p.execute('INSERT INTO t (v) VALUES (?)', ['alt'])
  db.close()
  db = frisch()
  await p.execute('INSERT INTO t (v) VALUES (?)', ['neu'])
  const rows = await p.select('SELECT v FROM t')
  assert.strictEqual(rows.length, 1)
  assert.strictEqual(rows[0].v, 'neu')
  db.close()
})
