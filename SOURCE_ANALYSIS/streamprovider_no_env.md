# StreamProvider no-env build

Forced StreamProvider m3u8 defaults inside server.js and reduced render.yaml to a minimal Docker service.
The build ignores old Render env clutter unless `SWIFLY_NO_ENV_MODE=false` is set.
