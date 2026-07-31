"use strict";

const fs = require("fs");
const path = require("path");
const variantPatch = require("./patch-cinepro-provider-variants.js");

function requireMarker(source, marker) {
  if (!String(source).includes(marker)) {
    throw new Error(`[swifly-provider-variants-qa] Missing marker: ${marker}`);
  }
}

const fixture = `export class SourceService {
    buildResponse(results) {
        const allSourcesMap = new Map();
        const allSubtitlesMap = new Map();
        const allDiagnostics = [];
        results.forEach((r) => {
            r.sources.forEach((source) => {
                try {
                    const urlObj = new URL(source.url);
                    const data = urlObj.searchParams.get('data');
                    if (!data) throw new Error('Missing data parameter in source URL');
                    const proxyData = ProxyService.decodeProxyData(data);
                    if (!allSourcesMap.has(proxyData.url)) {
                        allSourcesMap.set(proxyData.url, source);
                    }
                } catch (error) {
                    if (!allSourcesMap.has(source.url)) {
                        allSourcesMap.set(source.url, source);
                    }
                }
            });
            allDiagnostics.push(...r.diagnostics);
        });
        const uniqueSources = Array.from(allSourcesMap.values());
        const uniqueSubtitles = Array.from(allSubtitlesMap.values());
        return { sources: uniqueSources, subtitles: uniqueSubtitles, diagnostics: allDiagnostics };
    }
}`;

const transformedFixture = variantPatch.patchFrameworkSource(fixture).source;
variantPatch.validateEsmSyntax(transformedFixture);
requireMarker(transformedFixture, variantPatch.PATCH_MARKER);
requireMarker(transformedFixture, "swiflyProviderVariantKey");
requireMarker(transformedFixture, "provider-specific source variant(s)");
requireMarker(transformedFixture, "provider.id || provider.name || 'unknown-provider'");

const sharedUrl = "https://cdn.example/video/master.m3u8";
const icefy = {
  url: "/v1/proxy?data=icefy",
  type: "hls",
  quality: "1080p",
  provider: { id: "icefy", name: "Icefy" },
};
const vixsrc = {
  url: "/v1/proxy?data=vixsrc",
  type: "hls",
  quality: "1080p",
  provider: { id: "vixsrc", name: "VixSrc" },
};

const icefyKey = variantPatch.providerVariantKey(icefy, sharedUrl);
const vixsrcKey = variantPatch.providerVariantKey(vixsrc, sharedUrl);
if (icefyKey === vixsrcKey) {
  throw new Error("[swifly-provider-variants-qa] Different providers sharing a CDN URL were collapsed.");
}

const duplicateIcefyKey = variantPatch.providerVariantKey({ ...icefy }, sharedUrl);
if (icefyKey !== duplicateIcefyKey) {
  throw new Error("[swifly-provider-variants-qa] Exact same-provider duplicate did not retain a stable dedupe key.");
}

const differentQualityKey = variantPatch.providerVariantKey(
  { ...icefy, quality: "720p" },
  sharedUrl,
);
if (icefyKey === differentQualityKey) {
  throw new Error("[swifly-provider-variants-qa] Distinct quality variants were collapsed.");
}

if (fs.existsSync(variantPatch.frameworkSourcePath)) {
  const installed = fs.readFileSync(variantPatch.frameworkSourcePath, "utf8");
  const dryRun = variantPatch.patchFrameworkSource(installed).source;
  variantPatch.validateEsmSyntax(dryRun);
  requireMarker(dryRun, variantPatch.PATCH_MARKER);
}

const launcher = fs.readFileSync(
  path.join(__dirname, "start-cinepro-all-sources-captions.js"),
  "utf8",
);
requireMarker(launcher, 'require("./patch-cinepro-provider-variants.js")');
requireMarker(launcher, "providerVariants.applyProviderVariantPatch();");

console.log("Swifly provider-specific CinePro Source variant QA passed.");
