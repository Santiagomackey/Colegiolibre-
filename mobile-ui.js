(() => {
  "use strict";

  const NAV_PAGES = new Set([
    "/",
    "/producto",
    "/publicar",
    "/perfil",
    "/favoritos",
    "/mensajes",
    "/colegio",
    "/perfil-publico",
    "/busco",
    "/explorar",
    "/apuntes",
    "/materia",
    "/curso", "/compra", "/pedidos", "/mas", "/ayuda", "/seguridad",
    "/terminos", "/privacidad", "/productos-prohibidos"
  ]);

  const icons = {
    home: '<path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/>',
    heart: '<path d="M12 20.4 4.9 13.5a4.9 4.9 0 0 1 7-7l.1 1 .9-1a4.9 4.9 0 0 1 7 7Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    message: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8 9h8M8 13h5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
  };

  const lastSegment = window.location.pathname.split("/").filter(Boolean).pop() || "";
  const currentFile = !lastSegment || lastSegment === "index.html"
    ? "/"
    : `/${lastSegment.replace(/\.html$/i, "")}`;
  if (!NAV_PAGES.has(currentFile)) return;

  function getNavigationLabels() {
    return document.documentElement.dataset.language === "en"
    ? {
        home: "Home",
        favorites: "Favorites",
        publish: "Sell",
        messages: "Messages",
        more: "More",
        nav: "Main navigation"
      }
    : {
        home: "Inicio",
        favorites: "Favoritos",
        publish: "Publicar",
        messages: "Mensajes",
        more: "Más",
        nav: "Navegación principal"
      };
  }

  const activeByPage = {
    "/": "home",
    "/favoritos": "favorites",
    "/publicar": "publish",
    "/mensajes": "messages",
    "/perfil": "more",
    "/mas": "more",
    "/ayuda": "more",
    "/seguridad": "more",
    "/terminos": "more",
    "/privacidad": "more",
    "/productos-prohibidos": "more",
    "/busco": "home", "/compra": "more", "/pedidos": "more"
  };

  const links = [
    { href: "/", icon: "home", key: "home" },
    { href: "/favoritos", icon: "heart", key: "favorites", requiresAuth: true },
    { href: "/publicar", icon: "plus", key: "publish", primary: true, requiresAuth: true },
    { href: "/mensajes", icon: "message", key: "messages", requiresAuth: true },
    { href: "/mas", icon: "menu", key: "more" }
  ];

  function updateNavigationLabels() {
    const nav = document.querySelector(".cl-mobile-nav");
    if (!nav) return;
    const labels = getNavigationLabels();
    nav.setAttribute("aria-label", labels.nav);
    nav.querySelectorAll("[data-mobile-nav-key]").forEach(link => {
      const label = labels[link.dataset.mobileNavKey];
      link.querySelector("span").textContent = label;
      link.setAttribute("aria-label", label);
      if (link.dataset.mobileNavKey === "publish") link.setAttribute("title", label);
    });
  }

  window.addEventListener("colegiolibre:languagechange", updateNavigationLabels);

  function createNavigation() {
    if (document.querySelector(".cl-mobile-nav")) return;

    const labels = getNavigationLabels();
    const nav = document.createElement("nav");
    nav.className = "cl-mobile-nav";
    nav.setAttribute("data-no-translate", "");
    nav.setAttribute("aria-label", labels.nav);

    links.forEach((item) => {
      const link = document.createElement("a");
      link.className = `cl-mobile-nav__item${item.primary ? " cl-mobile-nav__item--publish" : ""}`;
      link.href = item.href;
      link.dataset.mobileNavKey = item.key;
      if (item.primary) link.setAttribute("title", labels[item.key]);
      link.setAttribute("aria-label", labels[item.key]);
      if (item.requiresAuth) link.dataset.requiresAuth = "";
      if (activeByPage[currentFile] === item.key) link.setAttribute("aria-current", "page");

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      svg.innerHTML = icons[item.icon];

      const text = document.createElement("span");
      text.textContent = labels[item.key];

      link.append(svg, text);
      nav.appendChild(link);
    });

    document.body.appendChild(nav);
    document.body.dataset.mobileNav = "true";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createNavigation, { once: true });
  } else {
    createNavigation();
  }
})();
