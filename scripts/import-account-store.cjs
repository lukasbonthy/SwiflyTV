'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {installAccountSnapshot} = require('../lib/account-store');

async function readPostgresSnapshot(connectionString) {
  const {Client} = require('pg');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 8000,
    statement_timeout: 15000,
    ...(process.env.SWIFLY_DB_SSL === 'true' ? {ssl: {rejectUnauthorized: true}} : {})
  });
  try {
    await client.connect();
    const result = await client.query('SELECT data FROM swifly_account_state WHERE id = 1');
    if (!result.rows[0]) {
      throw Object.assign(new Error('No account state found.'), {code: 'account_snapshot_missing'});
    }
    return result.rows[0].data;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  const [backup, ...rest] = process.argv.slice(2);
  const directory = process.env.SWIFLY_DATA_DIR;
  if (rest.length || !directory || !path.isAbsolute(directory) || (!backup && !process.env.DATABASE_URL)) {
    process.stderr.write('Set SWIFLY_DATA_DIR to the absolute data directory and provide DATABASE_URL or a private account snapshot file.\n');
    process.exitCode = 1;
    return;
  }
  const snapshot = backup ? await fs.readFile(backup, 'utf8') : await readPostgresSnapshot(process.env.DATABASE_URL);
  const accountCount = await installAccountSnapshot(directory, snapshot);
  process.stdout.write('Account state imported for ' + accountCount + ' accounts.\n');
}

main().catch(error => {
  const code = typeof error.code === 'string' && /^[a-z0-9_]{1,48}$/i.test(error.code) ? error.code : 'unknown';
  process.stderr.write('Account import failed (' + code + '). Check the source and disk before retrying.\n');
  process.exitCode = 1;
});
