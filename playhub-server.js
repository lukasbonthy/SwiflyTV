"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");

const app = express();
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const SITE_NAME = process.env.SITE_NAME || "Swifly Play";
const publicDir = path.join(__dirname, "playhub");

app.disable("x-powered-by");
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: "100kb" }));
app.use(
  express.static(publicDir, {
    extensions: ["html"],
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  })
);

app.get("/api/config", (_req, res) => {
  res.json({ siteName: SITE_NAME });
});

app.get("/api/status", (_req, res) => {
  res.json({
    status: "ok",
    app: "swifly-play",
    version: "1.0.0",
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error("[swifly-play] request failed", error);
  res.status(500).json({ status: "error", message: "Something went wrong." });
});

app.listen(PORT, HOST, () => {
  console.log(`[swifly-play] ${SITE_NAME} running at http://${HOST}:${PORT}`);
});
