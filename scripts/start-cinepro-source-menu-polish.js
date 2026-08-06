"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const themePath = path.join(root, "scripts", "start-cinepro-theme-unified.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
let patched = false;

function replaceRequired(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    throw new Error(`[swifly-source-menu] Could not find ${label}; refusing a partial menu patch.`);
  }
  return source.replace(needle, replacement);
}

function patchSourceMenu(source) {
  let next = String(source).replace(/\r\n?/g, "\n");

  next = replaceRequired(
    next,
    `            var optionCount = optionNodes.length;
            var optionColumns = Math.min(5, Math.max(1, optionCount));
            var panelWidth = Math.max(170, Math.min(420, optionColumns * 72 + Math.max(0, optionColumns - 1) * 6 + 20));
            choices.style.setProperty("--swifly-option-columns", String(optionColumns));
            menu.style.setProperty("--swifly-option-columns", String(optionColumns));
            menu.style.setProperty("--swifly-option-panel-width", panelWidth + "px");
            detailTitle.textContent = item.label + (optionCount ? " · " + optionCount : "");
            choices.innerHTML = "";
            choices.dataset.optionCount = String(optionCount);`,
    `            var optionCount = optionNodes.length;
            var sourceMenu = item && item.key === "source";
            var optionColumns = sourceMenu ? 1 : Math.min(5, Math.max(1, optionCount));
            var panelWidth = sourceMenu
              ? Math.min(380, Math.max(290, Number(window.innerWidth || 380) - 28))
              : Math.max(170, Math.min(420, optionColumns * 72 + Math.max(0, optionColumns - 1) * 6 + 20));
            choices.style.setProperty("--swifly-option-columns", String(optionColumns));
            menu.style.setProperty("--swifly-option-columns", String(optionColumns));
            menu.style.setProperty("--swifly-option-panel-width", panelWidth + "px");
            choices.dataset.settingKey = String(item.key || "");
            menu.dataset.settingKey = String(item.key || "");
            detailTitle.textContent = item.label + (optionCount ? " · " + optionCount : "");
            choices.innerHTML = "";
            choices.dataset.optionCount = String(optionCount);`,
    "Source-specific option sizing",
  );

  next = replaceRequired(
    next,
    `              button.querySelector(".swiflyChoiceText").textContent =
                String(option.textContent || option.label || ("Option " + (index + 1))).trim();`,
    `              var choiceLabel = String(option.textContent || option.label || ("Option " + (index + 1))).trim();
              var choiceText = button.querySelector(".swiflyChoiceText");
              choiceText.textContent = choiceLabel;
              button.title = choiceLabel;
              if (item && item.key === "source") {
                button.classList.add("swiflySourceChoice");
                var sourceParts = choiceLabel.split(/\\s*·\\s*/).filter(Boolean);
                var sourceMeta = "";
                if (sourceParts.length > 1 && /^(?:auto|unknown|4k|\\d{3,4}p?)$/i.test(sourceParts[sourceParts.length - 1])) {
                  sourceMeta = sourceParts.pop();
                }
                choiceText.textContent = sourceParts.join(" · ") || choiceLabel;
                if (sourceMeta) {
                  var meta = document.createElement("span");
                  meta.className = "swiflyChoiceMeta";
                  meta.textContent = sourceMeta;
                  button.insertBefore(meta, button.querySelector(".swiflyChoiceCheck"));
                }
              }`,
    "readable Source choice labels",
  );

  const cssNeedle =
    '              "body.swifly-unified-theme .swiflyChoiceText{min-width:0;font-size:11px;font-weight:760;white-space:normal;overflow-wrap:anywhere}",';
  const cssReplacement = [
    cssNeedle,
    '              "body.swifly-command-settings.swifly-unified-theme .swiflySettingsChoices[data-setting-key=source]{display:grid!important;grid-template-columns:minmax(0,1fr)!important;width:100%!important;max-width:none!important;gap:6px!important;overflow-x:hidden!important;overflow-y:auto!important}",',
    '              "body.swifly-command-settings.swifly-unified-theme .swiflySourceChoice{width:100%!important;min-width:0!important;min-height:42px!important;display:grid!important;grid-template-columns:minmax(0,1fr) auto 25px!important;align-items:center!important;justify-content:stretch!important;gap:9px!important;padding:7px 9px 7px 12px!important;text-align:left!important}",',
    '              "body.swifly-command-settings.swifly-unified-theme .swiflySourceChoice .swiflyChoiceText{min-width:0!important;font-size:10px!important;font-weight:780!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;overflow-wrap:normal!important}",',
    '              "body.swifly-command-settings.swifly-unified-theme .swiflyChoiceMeta{flex:0 0 auto;padding:4px 7px;border:1px solid rgba(255,255,255,.08);border-radius:999px;color:rgba(255,255,255,.62);background:rgba(0,0,0,.18);font-size:8.5px;font-weight:780;white-space:nowrap}",',
    '              "body.swifly-command-settings.swifly-unified-theme .swiflySettingValue{display:block;max-width:min(170px,42vw)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}",',
    '              "@media(max-width:520px){body.swifly-command-settings.swifly-unified-theme .swiflySourceChoice{grid-template-columns:minmax(0,1fr) auto 23px!important}body.swifly-command-settings.swifly-unified-theme .swiflyChoiceMeta{padding:3px 6px;font-size:8px}body.swifly-command-settings.swifly-unified-theme .swiflySettingValue{max-width:34vw!important}}",',
  ].join("\n");

  next = replaceRequired(next, cssNeedle, cssReplacement, "Source menu CSS insertion point");

  new vm.Script(next, { filename: themePath });
  const upgrade = next.match(/const themeUpgrade = String\.raw`([\s\S]*?)`;\n/);
  if (!upgrade) {
    throw new Error("[swifly-source-menu] Could not extract generated theme payload.");
  }
  new vm.Script(upgrade[1], { filename: "swifly-generated-source-menu.js" });
  return next;
}

function installPatch() {
  fs.readFileSync = function swiflySourceMenuRead(filePath, ...args) {
    const result = originalReadFileSync(filePath, ...args);
    let resolved = "";
    try { resolved = path.resolve(String(filePath)); } catch {}
    if (patched || resolved !== themePath) return result;

    patched = true;
    const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
    const next = patchSourceMenu(source);
    console.log("[swifly-source-menu] Source options now use readable one-column provider rows.");
    return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
  };
}

module.exports = {
  installPatch,
  patchSourceMenu,
};
