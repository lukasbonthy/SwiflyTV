# Account recovery and a clearer SwiflyTV

The owner reports being asked to recreate an account and losing their saved data after deployment. They request an import button, an easier site throughout, a simple Studio with optional advanced controls, and polished themes including Halloween. This is an implementation request; routine design choices below are the implementer's decisions, not new user approvals.

## Approach and constraints

Extend the existing Express/vanilla JavaScript app. A new framework, replacement account system, or new database would introduce migration risks without addressing the missing recovery interface. Keep all player, AI form, library, social, Study, device and appearance capabilities. Existing PostgreSQL storage remains authoritative for identity and synced library data. Do not invent live deployment diagnostics or promise recovery of deleted server data.

The work has three independent parts: explicit account backup/recovery, Studio simplification/themes, and a route-by-route usability review. Keep changes scoped to these, use existing UI tokens, real handlers and native controls. No paid services or dependencies. Existing data is never silently claimed by a different account, overwritten, or deleted to make a migration appear successful.

## Account backup and recovery

Add visible **Import account data**, **Export backup**, and **Recover browser data** actions on Account, with an obvious entry from Settings and sign-in help. Import offers a file picker, validates a bounded SwiflyTV backup, displays actual counts and destination profile/account, then merges only after an explicit click. Profile metadata, saved/favorite titles, folders, exact watched history and resume positions are supported; profile appearance and Study browser data may be included using their existing strict validators. Backups exclude passwords, cookies, sessions, Trakt tokens, private messages and room credentials. Imports cannot authenticate a user or restore server identity/social relationships.

Use a versioned, allowlisted backup schema, safe text/IDs/URLs, numeric limits, duplicate handling and deliberate profile mapping. Merge preserves current records, favors newer real progress/history, and leaves existing preferences authoritative on conflicts. Preview/cancel do not write. Guard owner/profile changes and stale previews. Browser storage failure rolls back; a failed remote sync keeps the source and an honest retry state. Recovery sources remain available after import. Ordinary account activation must archive data successfully before removing the active cache and must not silently discard it when storage is full. Retain credential-free legacy data, not old plaintext account passwords.

Recover only the current verified owner's cache and explicit guest/legacy sources; don't expose other verified accounts' private partitions. Recreated accounts can import a portable backup explicitly. Where older local data cannot be safely attributed, explain the limitation and offer the file flow instead of guessing ownership. Keep live persistence diagnosis separate from the confirmed missing recovery button and destructive merge behavior.

## Studio

Default to a useful **Simple** view, with themes first, readable section names, concrete explanations and a visible optional **Advanced controls** toggle. Hide technical HEX inputs, material tuning, per-pixel controls and JSON editors in Simple mode without deleting inputs, resetting their values, changing AI fields, or breaking Save/Cancel. Remember the mode locally as an editor preference, not as a theme/account field. Keyboard tab selection and TV/mobile navigation must skip hidden controls. Any deep link to an advanced panel must explain or reveal it safely.

Add a curated theme gallery with distinct, high quality mini previews: original Swifly, Halloween, winter/holiday, and a small set of coordinated everyday looks. Halloween should use a warm pumpkin accent, dark aubergine canvas and subtle violet/amber light, with restrained original CSS decoration. No external theme assets required, no emoji wallpaper, particles or unbounded animation. Curated themes change appearance fields only, preserve user accessibility/device settings and navigation/library choices, support reversible preview and explicit Save, and persist across routes/reload. High contrast, reduced motion/transparency and TV policy win. Named looks and theme file import/export remain available.

## Site review

Review every user-facing route family: Welcome, Home, Movies, Series, Discover/Trending, Search/AI, genres/languages, cast, details/episodes, player, downloads, List/Favorites/Continue, Account, profiles/manage, Settings, Friends/Social/Watch Rooms/Party, Study, Kids, sign-in/up and utility player. Record findings and concrete changes in a route matrix. Improve direct labels, orientation/back links, empty/error/recovery states and important next actions. Keep signup minimal. Avoid identical help banners on every page, competing top-level navigation, or decorative copy that obscures what a button does.

## Acceptance

Prove real merge/recovery/export using browser localStorage and the authenticated state API. Cover duplicate imports, cancellation, malicious/oversized payloads, storage failures, concurrent account changes and server errors. Prove Simple/Advanced and all existing controls, themes, Save/Cancel, reload and keyboard/touch behavior. Browse actual served route families with deterministic external catalog fixtures, at phone and desktop sizes; check accessible labels, errors, no horizontal overflow and failed local assets. Run the full existing test suite and meaningful integrated acceptance, then publish a reviewable GitHub change with exact verification and recovery limits. A production merge/deploy follows current user authorization, not an invented success claim.
