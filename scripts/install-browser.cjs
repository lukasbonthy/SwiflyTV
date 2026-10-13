'use strict';

// Use the same environment/cache as server.js on Windows and Linux.
require('dotenv').config();
require('../lib/browser-runtime').configureBrowserEnvironment();
const { spawnSync } = require('node:child_process');
const cli = require('node:path').join(require('node:path').dirname(require.resolve('playwright-core/package.json')), 'cli.js');
const result = spawnSync(process.execPath, [cli, 'install', 'chromium'], {
  stdio: 'inherit', env: process.env
});
if (result.error) console.error('Chromium installation could not start. Run npm install and retry.');
process.exit(result.status ?? 1);
