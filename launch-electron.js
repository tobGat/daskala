// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Tobias Gatterbauer
// This file is part of Daskala. See the LICENSE file for the full GPL-3.0 text.
// Launcher that removes ELECTRON_RUN_AS_NODE before spawning Electron
// This is needed when ELECTRON_RUN_AS_NODE=1 is set in the system environment (e.g. git bash)
const { spawn } = require('child_process')
const path = require('path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const electronExe = require('electron')
const proc = spawn(electronExe, ['.'], {
  env,
  stdio: 'inherit',
  cwd: __dirname,
})

proc.on('exit', (code) => process.exit(code || 0))
