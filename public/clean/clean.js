/* SwiflyTV v151: compact navigation search, with native form submission. */
(function () {
  "use strict";
  function boot() {
    const toggle = document.getElementById("svNavSearchToggle");
    const popup = document.getElementById("svNavSearchPopup");
    const input = document.getElementById("svNavSearchInput");
    if (!toggle || !popup || !input || toggle.dataset.bound) return;
    toggle.dataset.bound = "true";
    function close(restoreFocus) {
      popup.hidden = true; toggle.setAttribute("aria-expanded", "false");
      if (restoreFocus) toggle.focus();
    }
    toggle.addEventListener("click", () => {
      if (!popup.hidden) return close(true);
      popup.hidden = false; toggle.setAttribute("aria-expanded", "true"); input.focus();
    });
    document.addEventListener("click", event => { if (!popup.hidden && !popup.contains(event.target) && !toggle.contains(event.target)) close(false); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !popup.hidden) { event.preventDefault(); close(true); } });
    popup.addEventListener("focusout", () => { setTimeout(() => { if (!popup.contains(document.activeElement) && document.activeElement !== toggle) close(false); }, 0); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
