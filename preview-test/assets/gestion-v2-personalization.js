(() => {
  "use strict";
  const COLORS = ["#7654c8","#16845b","#7654c8","#d14d55","#d17a20","#168a9a","#c04491","#475467"];
  const $ = (s) => document.querySelector(s);
  function applyColor(color) {
    if (!COLORS.includes(color)) color = COLORS[0];
    document.documentElement.style.setProperty("--blue", color);
    localStorage.setItem("e30_preview_primary_color", color);
    document.querySelectorAll("[data-theme-color]").forEach((button) => {
      const active = button.dataset.themeColor === color;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function go(view) {
    const button = document.querySelector('[data-view="' + view + '"]');
    if (button) button.click();
  }
  function focusAfterView(view, selector) {
    go(view);
    window.setTimeout(() => { const field = $(selector); if (field) field.focus(); }, 80);
  }
  document.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-theme-color]");
    if (swatch) applyColor(swatch.dataset.themeColor);
  });
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (typing) return;
    if (event.key === "Escape") return;
    const key = event.key;
    if (key === "F2") {
      event.preventDefault();
      const primary = $("#new-order");
      const button = primary && !primary.hidden ? primary : $("#home-new-order");
      if (button) button.click();
    } else if (key === "F4") {
      event.preventDefault(); focusAfterView("precios", "#price-search");
    } else if (key === "F8") {
      event.preventDefault(); focusAfterView("clientes", "#client-search");
    } else if (key === "F9") {
      event.preventDefault(); go("caja");
      window.setTimeout(() => { const button = $("#cash-add"); if (button) button.click(); }, 80);
    } else if (key === "?" || (key === "/" && event.shiftKey)) {
      event.preventDefault();
      const notice = $("#notice");
      if (notice) { notice.textContent = "Atajos: F2 nueva orden · F4 buscar precios · F8 buscar clientes · F9 movimiento de caja. No funcionan mientras escribís."; notice.classList.remove("error"); notice.hidden = false; }
    }
  });
  let saved = localStorage.getItem("e30_preview_primary_color");
  // En esta demo, migrar el gris grafito anterior al violeta elegido como identidad inicial.
  if (!saved || saved.toLowerCase() === "#475467") saved = "#7654c8";
  applyColor(COLORS.includes(saved) ? saved : COLORS[0]);
})();