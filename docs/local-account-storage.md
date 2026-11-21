# Local account storage

SwiflyTV can run its account, session, library and Movie Nights state on its own disk. A self-hosted single-process install can set `SWIFLY_ACCOUNT_STORE=file` and `SWIFLY_DATA_DIR` to an absolute durable directory. Explicit file mode ignores `DATABASE_URL`.

## Move a running site from PostgreSQL

Use one app instance with a persistent disk. On Render, mount it at `/var/data` and set `SWIFLY_DATA_DIR=/var/data`. Make sure the source database or a complete private export of the `swifly_account_state.data` row is readable. Leave the old database in place for recovery.

Pause signups, account updates, voting and chat for the final copy. From the service runtime shell with the disk mounted, run:

```sh
node scripts/import-account-store.cjs
```

The command uses the existing `DATABASE_URL`. If using a private complete JSON export of the account state instead, provide its local path as the first argument. Keep the export out of Git, static web directories and logs. The importer reads the entire account state, preserves existing credentials and sessions, and refuses to replace an existing `accounts.json`.

After a successful import, set `SWIFLY_ACCOUNT_STORE=file` and remove `DATABASE_URL` once you have secured a private copy for rollback. Redeploy, then test an existing sign-in, an account update, and a Movie Nights vote and chat before reopening writes. File mode on Render rejects an unmounted path or missing account snapshot, so a failed copy cannot silently start an empty account system. Keep backups of `accounts.json` with access restricted to the operator.

If a verification step fails before reopening writes, switch back to the previous backend configuration with the app still in maintenance. After the new store accepts writes, any return to the old database requires reconciling those writes.
