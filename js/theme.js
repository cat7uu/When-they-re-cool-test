// Light/dark theme. Loaded in <head> before the page draws, so the saved
// theme applies straight away (no flash of the wrong colours).
// The choice is stored in this browser only; with no choice saved, the site
// follows the device's light/dark setting.
(function () {
  "use strict";
  const KEY = "earthwire:theme";
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

  function saved() {
    try {
      const v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (_) {
      return null;
    }
  }
  const system = () => (media && media.matches ? "light" : "dark");

  function apply(theme) {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f4f6fb" : "#0b1020";
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      const next = theme === "light" ? "dark" : "light";
      btn.setAttribute("aria-label", `Switch to ${next} mode`);
      btn.title = `Switch to ${next} mode`;
      btn.setAttribute("aria-pressed", String(theme === "light"));
    }
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }

  apply(saved() || system());

  // follow the device setting until the visitor picks a theme themselves
  if (media && media.addEventListener) {
    media.addEventListener("change", () => { if (!saved()) apply(system()); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    apply(root.dataset.theme); // set the button's label
    btn.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY, next); } catch (_) { /* private mode: still switch */ }
      apply(next);
    });
  });
})();
