/*
 * Offline notice for games that need the hub server (share codes, live
 * tables, SSE). Include on any page whose play depends on the server:
 *   <script src="/shared/offline-note.js"></script>
 * Shows a dismissible banner while the device is offline; solo games on the
 * same origin keep working, so the banner just sets expectations.
 */
(function initOfflineNote() {
  "use strict";
  if (typeof document === "undefined") return;

  var banner = null;

  function ensureStyles() {
    if (document.getElementById("offline-note-styles")) return;
    var style = document.createElement("style");
    style.id = "offline-note-styles";
    style.textContent = [
      ".offline-note{position:sticky;top:0;z-index:9998;display:flex;gap:10px;",
      "align-items:center;justify-content:space-between;margin:0 0 10px;",
      "border:1px solid rgba(200,78,78,.45);border-radius:10px;",
      "background:rgba(200,78,78,.14);padding:10px 14px;",
      "font:700 .88rem Inter,ui-sans-serif,system-ui,sans-serif;color:#7a2e2e;}",
      ".offline-note button{border:1px solid rgba(122,46,46,.4);border-radius:6px;",
      "background:transparent;color:#7a2e2e;font:inherit;padding:2px 10px;}",
    ].join("");
    document.head.appendChild(style);
  }

  function show() {
    if (banner || !document.body) return;
    ensureStyles();
    banner = document.createElement("div");
    banner.className = "offline-note";
    banner.setAttribute("role", "status");
    var text = document.createElement("span");
    text.textContent = "You're offline — this game needs the hub server, so share codes and live tables won't connect until you're back online.";
    var dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Got it";
    dismiss.addEventListener("click", function () {
      if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
      banner = null;
    });
    banner.appendChild(text);
    banner.appendChild(dismiss);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function hide() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
  }

  function update() {
    if (navigator.onLine === false) show();
    else hide();
  }

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", update);
  } else {
    update();
  }

  // Register the root service worker so deep links into this game also
  // get offline coverage. Idempotent: browsers dedupe by URL + scope.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }
})();
