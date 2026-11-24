(() => {
  "use strict";
  const loader = document.createElement("div");
  loader.className = "cl-app-loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-label", "Abriendo Colestores");
  loader.innerHTML = `<div class="cl-app-loader__content"><img class="cl-app-loader__logo" src="images/colestores-logo.svg" alt="Colestores"><span class="cl-app-loader__bar" aria-hidden="true"></span></div>`;
  document.documentElement.appendChild(loader);
  const started = performance.now();
  const close = () => {
    const wait = Math.max(0, 700 - (performance.now() - started));
    window.setTimeout(() => {
      loader.classList.add("is-leaving");
      window.setTimeout(() => loader.remove(), 320);
    }, wait);
  };
  if (document.readyState === "complete") close();
  else window.addEventListener("load", close, { once: true });
  window.setTimeout(close, 2400);
})();
