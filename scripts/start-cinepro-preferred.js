"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

// VixSrc returned a valid source alongside Icefy in real Swifly logs, while
// Icefy's TikTok CDN segments intermittently returned HTTP 403. Keep Icefy
// available as a resolver fallback, but make VixSrc the deterministic first
// playback choice unless the user explicitly overrides these values.
process.env.CINEPRO_PROVIDER_ALLOWLIST = process.env.CINEPRO_PROVIDER_ALLOWLIST || "vixsrc,icefy";
process.env.CINEPRO_PROVIDER_ORDER = process.env.CINEPRO_PROVIDER_ORDER || "vixsrc,icefy";

console.log(`[cinepro] Provider preference: ${process.env.CINEPRO_PROVIDER_ORDER}`);
require("./start-cinepro.js");
