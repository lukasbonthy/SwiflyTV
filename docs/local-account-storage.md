# Local account storage

SwiflyTV can run its account, session, library and Movie Nights state on its own disk. A self-hosted single-process install can set `SWIFLY_ACCOUNT_STORE=file` and `SWIFLY_DATA_DIR` to an absolute durable directory. Explicit file mode ignores `DATABASE_URL`.

## Move a running site from PostgreSQL

Use one app instance with a persistent disk. On Render, mount it at `/var/data` and set `SWIFLY_DATA_DIR=/var/data`. Make sure the source database or a complete private export of the `swifly_account_state.data` row is readable. Leave the old database in place for recovery.

For the final copy, put the service in maintenance and set `SWIFLY_ACCOUNT_STORE_READ_ONLY=true` while PostgreSQL is still configured. Wait for that deployment to replace the previous instance. The flag blocks every store write, including jobs and already-connected clients. Keep the freeze active through the copy and backend switch.

From the new service runtime shell with the disk mounted, run:

```sh
node scripts/import-account-store.cjs
```

The command uses the existing `DATABASE_URL`. If using a private complete JSON export of the account state instead, capture it after the source is frozen or reconcile every newer write first. Provide its local path as the first argument. Keep the export out of Git, static web directories and logs. The importer reads the entire account state, preserves existing credentials and sessions, and refuses to replace an existing `accounts.json`.

After a successful import, set `SWIFLY_ACCOUNT_STORE=file` and remove `DATABASE_URL` once you have secured a private copy for rollback. Redeploy with the write freeze still active. Check that the imported file is readable and a previously issued session works. File mode on Render rejects an unmounted path or an incomplete or missing snapshot.

Remove `SWIFLY_ACCOUNT_STORE_READ_ONLY` and verify an account update, a vote, and chat before ending maintenance. Keep backups of `accounts.json` with access restricted to the operator.

If a verification step fails before reopening writes, switch back to the previous backend configuration with the app still in maintenance. After the new store accepts writes, any return to the old database requires reconciling those writes.
