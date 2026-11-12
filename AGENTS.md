# SwiflyTV continuity

- At the start of resumed work, read `docs/SWIFLYTV_STATUS.md`, inspect the working tree, and verify the current remote branch and deployment before repeating changes from an older chat.
- Update that checkpoint before a handoff and after publishing. Record the exact tested code commit, deployment status, remaining work, and relevant verification. Distinguish a documentation-only commit from the running application commit.
- Keep binary assets in files. Transfer them directly through Git or a programmatic upload; never print image Base64, data URLs, entire binary blobs, or encoded asset contents into chat or tool output shown to the model.
- Filter large tool results before displaying them. Return the relevant status, identifiers, hashes, and short error excerpts; keep full test logs in temporary files.
- Use checks appropriate to the actual change. After they pass, broaden or repeat them only for new changes, failures, or unresolved concerns. Preserve completed work instead of restarting the project.
- Report a deployment as complete only after the intended code is live and the changed public behavior or asset has been verified.
