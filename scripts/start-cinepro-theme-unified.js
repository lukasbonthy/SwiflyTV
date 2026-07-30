"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const customControlsPath = path.join(root, "scripts", "start-cinepro-custom-controls.js");
const languagesPath = path.join(root, "scripts", "start-cinepro-languages.js");
const originalReadFileSync = fs.readFileSync.bind(fs);
const patchedPaths = new Set();

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`[swifly-theme] Could not find ${label}; source was not modified.`);
  }
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const themeUpgrade = String.raw`
        function mountSwiflyUnifiedTheme(media) {
          var ui = playerShell && playerShell.querySelector(".swiflyPlayerUi");
          if (!ui || !media || ui.dataset.swiflyUnifiedTheme === "true") return;
          ui.dataset.swiflyUnifiedTheme = "true";
          document.body.classList.add("swifly-unified-theme");

          var menu = ui.querySelector(".swiflyUiMenu");
          if (!menu) return;

          var fieldNodes = Array.from(menu.querySelectorAll(".swiflyUiField"));
          var fields = {};
          fieldNodes.forEach(function(field) {
            var select = field.querySelector("select");
            var key = select ? String(select.getAttribute("data-s") || "") : "";
            if (key) fields[key] = { field: field, select: select };
          });

          var definitions = [
            { key: "quality", label: "Quality", hint: "Adaptive streaming", icon: "fa-display" },
            { key: "speed", label: "Speed", hint: "Playback rate", icon: "fa-gauge-high" },
            { key: "audio", label: "Audio", hint: "Spoken language", icon: "fa-language" },
            { key: "cc", label: "Captions", hint: "Subtitles and CC", icon: "fa-closed-captioning" }
          ].filter(function(item) { return fields[item.key]; });

          var nativeHost = document.createElement("div");
          nativeHost.className = "swiflyNativeSettings";
          fieldNodes.forEach(function(field) { nativeHost.appendChild(field); });

          var shell = document.createElement("div");
          shell.className = "swiflySettingsShell";

          var home = document.createElement("section");
          home.className = "swiflySettingsHome";

          var header = document.createElement("header");
          header.className = "swiflySettingsHeader";
          header.innerHTML =
            '<div class="swiflySettingsHeading"><span class="swiflySettingsMark"><i class="fa-solid fa-sliders"></i></span><div><strong>Playback</strong><small>Personalize this stream</small></div></div>' +
            '<button class="swiflySettingsClose" type="button" aria-label="Close playback settings"><i class="fa-solid fa-xmark"></i></button>';

          var list = document.createElement("div");
          list.className = "swiflySettingsList";

          var detail = document.createElement("section");
          detail.className = "swiflySettingsDetail";
          detail.hidden = true;
          detail.innerHTML =
            '<header class="swiflyDetailHeader"><button class="swiflyDetailBack" type="button" aria-label="Back to playback settings"><i class="fa-solid fa-arrow-left"></i></button><div><strong></strong><small>Choose an option</small></div></header>' +
            '<div class="swiflySettingsChoices"></div>';

          home.appendChild(header);
          home.appendChild(list);
          shell.appendChild(home);
          shell.appendChild(detail);
          menu.innerHTML = "";
          menu.appendChild(shell);
          menu.appendChild(nativeHost);
          menu.classList.add("swiflyPremiumMenu");

          var rowByKey = {};
          var activeDefinition = null;
          var detailTitle = detail.querySelector(".swiflyDetailHeader strong");
          var choices = detail.querySelector(".swiflySettingsChoices");

          function selectedText(select) {
            if (!select || select.disabled) return "Unavailable";
            var option = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
            return option ? String(option.textContent || option.label || "").trim() || "Default" : "Default";
          }

          function syncRows() {
            definitions.forEach(function(item) {
              var row = rowByKey[item.key];
              var select = fields[item.key] && fields[item.key].select;
              if (!row || !select) return;
              var disabled = Boolean(select.disabled || !select.options || select.options.length === 0);
              row.disabled = disabled;
              row.classList.toggle("isDisabled", disabled);
              row.setAttribute("aria-disabled", disabled ? "true" : "false");
              var value = row.querySelector(".swiflySettingValue");
              if (value) {
                value.textContent = selectedText(select);
                value.title = value.textContent;
              }
            });
          }

          function showHome() {
            activeDefinition = null;
            detail.hidden = true;
            home.hidden = false;
            shell.classList.remove("showDetail");
          }

          function closeMenu() {
            menu.hidden = true;
            ui.classList.remove("menuOpen");
            showHome();
            if (!media.paused) {
              ui.classList.remove("show");
              playerShell.classList.add("swiflyUiIdle");
            }
          }

          function renderChoices(item) {
            var select = fields[item.key] && fields[item.key].select;
            if (!select) return;
            activeDefinition = item;
            home.hidden = true;
            detail.hidden = false;
            shell.classList.add("showDetail");
            detailTitle.textContent = item.label;
            choices.innerHTML = "";

            Array.from(select.options || []).forEach(function(option, index) {
              var button = document.createElement("button");
              button.type = "button";
              button.className = "swiflyChoice";
              button.dataset.value = String(option.value);
              var isSelected = String(select.value) === String(option.value);
              button.classList.toggle("selected", isSelected);
              button.innerHTML =
                '<span class="swiflyChoiceText"></span>' +
                '<span class="swiflyChoiceCheck"><i class="fa-solid fa-check"></i></span>';
              button.querySelector(".swiflyChoiceText").textContent =
                String(option.textContent || option.label || ("Option " + (index + 1))).trim();
              button.addEventListener("click", function(event) {
                event.preventDefault();
                event.stopPropagation();
                if (select.disabled) return;
                select.value = String(option.value);
                select.dispatchEvent(new Event("change", { bubbles: true }));
                syncRows();
                Array.from(choices.querySelectorAll(".swiflyChoice")).forEach(function(choice) {
                  choice.classList.toggle("selected", choice.dataset.value === String(select.value));
                });
                setTimeout(showHome, 120);
              });
              choices.appendChild(button);
            });

            if (!choices.children.length) {
              var empty = document.createElement("div");
              empty.className = "swiflyChoiceEmpty";
              empty.textContent = "No options are available for this stream.";
              choices.appendChild(empty);
            }
          }

          definitions.forEach(function(item) {
            var row = document.createElement("button");
            row.type = "button";
            row.className = "swiflySettingRow";
            row.dataset.setting = item.key;
            row.innerHTML =
              '<span class="swiflySettingIcon"><i class="fa-solid ' + item.icon + '"></i></span>' +
              '<span class="swiflySettingCopy"><strong></strong><small></small></span>' +
              '<span class="swiflySettingMeta"><span class="swiflySettingValue"></span><i class="fa-solid fa-chevron-right"></i></span>';
            row.querySelector(".swiflySettingCopy strong").textContent = item.label;
            row.querySelector(".swiflySettingCopy small").textContent = item.hint;
            row.addEventListener("click", function(event) {
              event.preventDefault();
              event.stopPropagation();
              if (!row.disabled) renderChoices(item);
            });
            rowByKey[item.key] = row;
            list.appendChild(row);

            var select = fields[item.key].select;
            select.addEventListener("change", syncRows);
            try {
              var observer = new MutationObserver(function() {
                syncRows();
                if (activeDefinition && activeDefinition.key === item.key && !detail.hidden) renderChoices(item);
              });
              observer.observe(select, { childList: true, subtree: true, attributes: true });
            } catch {}
          });

          header.querySelector(".swiflySettingsClose").addEventListener("click", function(event) {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
          });

          detail.querySelector(".swiflyDetailBack").addEventListener("click", function(event) {
            event.preventDefault();
            event.stopPropagation();
            showHome();
          });

          menu.addEventListener("click", function(event) {
            event.stopPropagation();
          });

          try {
            var menuObserver = new MutationObserver(function() {
              if (menu.hidden) showHome();
              else syncRows();
            });
            menuObserver.observe(menu, { attributes: true, attributeFilter: ["hidden"] });
          } catch {}

          if (!document.getElementById("swiflyUnifiedThemeStyle")) {
            var style = document.createElement("style");
            style.id = "swiflyUnifiedThemeStyle";
            style.textContent = [
              "body.swifly-unified-theme .swiflyPlayerUi{opacity:1!important}",
              "body.swifly-unified-theme .swiflyUiTop,body.swifly-unified-theme .swiflyUiBottom,body.swifly-unified-theme .swiflyUiMenu{transition:opacity .2s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility 0s linear 0s}",
              "body.swifly-unified-theme .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiTop{opacity:0;visibility:hidden;transform:translateY(-10px);pointer-events:none;transition-delay:0s,0s,.2s}",
              "body.swifly-unified-theme .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiBottom{opacity:0;visibility:hidden;transform:translate(-50%,14px);pointer-events:none;transition-delay:0s,0s,.2s}",
              "body.swifly-unified-theme .swiflyPlayerUi:not(.show):not(.paused):not(.menuOpen) .swiflyUiCenter{opacity:0;visibility:hidden;pointer-events:none}",
              "body.swifly-unified-theme .swiflyPlayerUi.menuOpen .swiflyUiTop{opacity:1;visibility:visible;transform:none;pointer-events:auto}",
              "body.swifly-unified-theme .swiflyPlayerUi.menuOpen .swiflyUiBottom{opacity:1;visibility:visible;transform:translateX(-50%);pointer-events:auto}",
              "body.swifly-unified-theme .swiflyUiMenu{right:max(12px,calc((100vw - 980px)/2));bottom:67px;width:min(388px,calc(100vw - 24px));padding:0;border:1px solid rgba(255,255,255,.105);border-radius:22px;overflow:hidden;background:radial-gradient(circle at 12% -6%,rgba(255,87,168,.15),transparent 38%),radial-gradient(circle at 96% 0,rgba(124,92,255,.18),transparent 42%),linear-gradient(180deg,rgba(21,22,38,.94),rgba(7,8,16,.975));box-shadow:0 30px 90px rgba(0,0,0,.72),0 0 0 1px rgba(142,96,255,.045),inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(30px) saturate(1.35);transform-origin:bottom right}",
              "body.swifly-unified-theme .swiflyUiMenu[hidden]{display:none}",
              "body.swifly-unified-theme .swiflyUiMenu:not([hidden]){display:block;animation:swiflyMenuIn .18s cubic-bezier(.2,.8,.2,1) both}",
              "body.swifly-unified-theme .swiflyNativeSettings{display:none!important}",
              "body.swifly-unified-theme .swiflySettingsShell{min-height:0}",
              "body.swifly-unified-theme .swiflySettingsHome,body.swifly-unified-theme .swiflySettingsDetail{padding:12px}",
              "body.swifly-unified-theme .swiflySettingsHeader,body.swifly-unified-theme .swiflyDetailHeader{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 4px 11px}",
              "body.swifly-unified-theme .swiflySettingsHeading{display:flex;align-items:center;gap:11px;min-width:0}",
              "body.swifly-unified-theme .swiflySettingsMark{width:38px;height:38px;border:1px solid rgba(255,255,255,.1);border-radius:12px;display:grid;place-items:center;color:#f5efff;background:linear-gradient(145deg,rgba(255,82,164,.22),rgba(123,88,255,.3));box-shadow:0 10px 28px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.08)}",
              "body.swifly-unified-theme .swiflySettingsHeading strong,body.swifly-unified-theme .swiflyDetailHeader strong{display:block;color:#fff;font-size:14px;font-weight:880;letter-spacing:-.015em}",
              "body.swifly-unified-theme .swiflySettingsHeading small,body.swifly-unified-theme .swiflyDetailHeader small{display:block;margin-top:2px;color:rgba(255,255,255,.42);font-size:9.5px;font-weight:720;letter-spacing:.015em}",
              "body.swifly-unified-theme .swiflySettingsClose,body.swifly-unified-theme .swiflyDetailBack{width:34px;height:34px;border:1px solid rgba(255,255,255,.08);border-radius:11px;color:rgba(255,255,255,.72);background:rgba(255,255,255,.035);display:grid;place-items:center;cursor:pointer;transition:.16s}",
              "body.swifly-unified-theme .swiflySettingsClose:hover,body.swifly-unified-theme .swiflyDetailBack:hover{color:#fff;border-color:rgba(173,112,255,.28);background:rgba(140,96,255,.13);transform:translateY(-1px)}",
              "body.swifly-unified-theme .swiflySettingsList{display:grid;gap:6px}",
              "body.swifly-unified-theme .swiflySettingRow{width:100%;min-height:57px;padding:7px 8px;border:1px solid rgba(255,255,255,.065);border-radius:15px;color:#fff;background:linear-gradient(135deg,rgba(255,255,255,.035),rgba(124,92,255,.035));display:grid;grid-template-columns:38px minmax(0,1fr) minmax(90px,auto);align-items:center;gap:10px;text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease,transform .16s ease,box-shadow .16s ease}",
              "body.swifly-unified-theme .swiflySettingRow:hover,body.swifly-unified-theme .swiflySettingRow:focus-visible{border-color:rgba(178,115,255,.32);background:linear-gradient(135deg,rgba(255,82,164,.075),rgba(124,92,255,.1));box-shadow:0 12px 30px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.045);transform:translateY(-1px);outline:none}",
              "body.swifly-unified-theme .swiflySettingRow.isDisabled{opacity:.42;cursor:not-allowed;transform:none}",
              "body.swifly-unified-theme .swiflySettingIcon{width:38px;height:38px;border:1px solid rgba(255,255,255,.085);border-radius:12px;display:grid;place-items:center;color:#f0eaff;background:linear-gradient(145deg,rgba(255,84,164,.15),rgba(124,92,255,.22));box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}",
              "body.swifly-unified-theme .swiflySettingCopy{min-width:0}",
              "body.swifly-unified-theme .swiflySettingCopy strong{display:block;color:rgba(255,255,255,.94);font-size:11.5px;font-weight:830;letter-spacing:-.005em}",
              "body.swifly-unified-theme .swiflySettingCopy small{display:block;margin-top:2px;color:rgba(255,255,255,.38);font-size:9px;font-weight:690}",
              "body.swifly-unified-theme .swiflySettingMeta{min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;color:rgba(255,255,255,.4)}",
              "body.swifly-unified-theme .swiflySettingValue{max-width:152px;padding:6px 9px;border:1px solid rgba(255,255,255,.075);border-radius:999px;color:rgba(255,255,255,.84);background:rgba(4,5,12,.34);font-size:9.5px;font-weight:760;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
              "body.swifly-unified-theme .swiflySettingMeta>i{font-size:9px}",
              "body.swifly-unified-theme .swiflyDetailHeader{justify-content:flex-start;padding-bottom:10px}",
              "body.swifly-unified-theme .swiflySettingsChoices{display:grid;gap:5px;max-height:min(330px,55vh);overflow:auto;padding-right:1px}",
              "body.swifly-unified-theme .swiflyChoice{width:100%;min-height:46px;padding:7px 9px 7px 13px;border:1px solid transparent;border-radius:13px;color:rgba(255,255,255,.78);background:rgba(255,255,255,.028);display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;cursor:pointer;transition:.15s}",
              "body.swifly-unified-theme .swiflyChoice:hover,body.swifly-unified-theme .swiflyChoice:focus-visible{color:#fff;border-color:rgba(178,115,255,.25);background:linear-gradient(135deg,rgba(255,82,164,.07),rgba(124,92,255,.09));outline:none}",
              "body.swifly-unified-theme .swiflyChoice.selected{color:#fff;border-color:rgba(183,119,255,.35);background:linear-gradient(135deg,rgba(255,82,164,.11),rgba(124,92,255,.15));box-shadow:inset 0 1px 0 rgba(255,255,255,.045)}",
              "body.swifly-unified-theme .swiflyChoiceText{min-width:0;font-size:11px;font-weight:760;white-space:normal;overflow-wrap:anywhere}",
              "body.swifly-unified-theme .swiflyChoiceCheck{width:25px;height:25px;border-radius:999px;display:grid;place-items:center;color:transparent;background:transparent;flex:0 0 auto}",
              "body.swifly-unified-theme .swiflyChoice.selected .swiflyChoiceCheck{color:#fff;background:linear-gradient(145deg,#ff58a5,#805cff);box-shadow:0 7px 20px rgba(128,92,255,.28)}",
              "body.swifly-unified-theme .swiflyChoiceEmpty{padding:24px 16px;color:rgba(255,255,255,.45);font-size:10px;text-align:center}",
              "@keyframes swiflyMenuIn{from{opacity:0;transform:translateY(9px) scale(.98)}to{opacity:1;transform:none}}",
              "@media(max-width:720px){body.swifly-unified-theme .swiflyUiMenu{right:6px;bottom:60px;width:calc(100vw - 12px);border-radius:18px}body.swifly-unified-theme .swiflySettingsHome,body.swifly-unified-theme .swiflySettingsDetail{padding:10px}body.swifly-unified-theme .swiflySettingRow{grid-template-columns:36px minmax(0,1fr) minmax(72px,auto);min-height:54px}body.swifly-unified-theme .swiflySettingIcon{width:36px;height:36px}body.swifly-unified-theme .swiflySettingCopy small{display:none}body.swifly-unified-theme .swiflySettingValue{max-width:110px}}",
              "@media(prefers-reduced-motion:reduce){body.swifly-unified-theme .swiflyUiMenu:not([hidden]){animation:none}body.swifly-unified-theme .swiflySettingRow,body.swifly-unified-theme .swiflyChoice{transition:none}}"
            ].join("");
            document.head.appendChild(style);
          }

          playerShell.addEventListener("mouseleave", function() {
            if (!media.paused && menu.hidden) {
              ui.classList.remove("show");
              playerShell.classList.add("swiflyUiIdle");
            }
          });

          media.addEventListener("pause", function() {
            ui.classList.add("show", "paused");
            playerShell.classList.remove("swiflyUiIdle");
          });

          document.addEventListener("keydown", function(event) {
            if (event.key !== "Escape" || menu.hidden) return;
            if (!detail.hidden) {
              event.preventDefault();
              showHome();
              return;
            }
            event.preventDefault();
            closeMenu();
          });

          syncRows();
          console.log("[swifly-theme] Premium two-level playback settings mounted.");
        }

`;

function patchCustomControls(source) {
  source = replaceRequired(
    source,
    /(const injected = String\.raw`\n)/,
    `$1${themeUpgrade}`,
    "custom player injection block",
  );

  source = replaceRequired(
    source,
    /(console\.log\("\[swifly-player\] Custom control interface mounted\."\);)/,
    `mountSwiflyUnifiedTheme(media);\n          $1`,
    "custom player mount log",
  );

  return source;
}

function patchLanguages(source) {
  return replaceRequired(
    source,
    /if \(display && rawFallback && display\.toLowerCase\(\) !== rawFallback\.toLowerCase\(\)\) \{\n\s*return display \+ " · " \+ rawFallback;\n\s*\}/,
    `if (display && rawFallback) {
              var simplified = rawFallback.replace(/\\s*\\[(?:cc|sdh)\\]\\s*$/i, "").trim();
              if (simplified && (simplified.toLowerCase().indexOf(display.toLowerCase()) === 0 || display.toLowerCase().indexOf(simplified.toLowerCase()) === 0)) {
                return rawFallback;
              }
              if (display.toLowerCase() !== rawFallback.toLowerCase()) return display + " · " + rawFallback;
            }`,
    "duplicate language label formatting",
  );
}

fs.readFileSync = function swiflyThemeRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  let resolved = "";
  try { resolved = path.resolve(String(filePath)); } catch {}
  if (patchedPaths.has(resolved)) return result;

  let patcher = null;
  if (resolved === customControlsPath) patcher = patchCustomControls;
  if (resolved === languagesPath) patcher = patchLanguages;
  if (!patcher) return result;

  patchedPaths.add(resolved);
  const source = Buffer.isBuffer(result) ? result.toString("utf8") : String(result);
  const next = patcher(source.replace(/\r\n?/g, "\n"));
  return Buffer.isBuffer(result) ? Buffer.from(next, "utf8") : next;
};

console.log("[swifly-theme] Premium two-level Aurora playback settings enabled.");
require("./start-cinepro-languages-hotfix.js");
