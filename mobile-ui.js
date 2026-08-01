(() => {
  "use strict";

  const NAV_PAGES = new Set([
    "index.html",
    "producto.html",
    "publicar.html",
    "perfil.html",
    "favoritos.html",
    "mensajes.html",
    "colegio.html",
    "perfil-publico.html"
  ]);

  const icons = {
    home: '<path d="m3.5 10 8.5-7 8.5 7"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/>',
    heart: '<path d="M12 20.4 4.9 13.5a4.9 4.9 0 0 1 7-7l.1 1 .9-1a4.9 4.9 0 0 1 7 7Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    message: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8 9h8M8 13h5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a8.5 8.5 0 0 1 15 0"/>'
  };

  const currentFile = window.location.pathname.split("/").pop() || "index.html";
  if (!NAV_PAGES.has(currentFile)) return;

  const language = document.documentElement.dataset.language === "en" ? "en" : "es";
  const labels = language === "en"
    ? {
        home: "Home",
        favorites: "Saved",
        publish: "List",
        messages: "Messages",
        profile: "Profile",
        nav: "Main navigation"
      }
    : {
        home: "Inicio",
        favorites: "Favoritos",
        publish: "Publicar",
        messages: "Mensajes",
        profile: "Perfil",
        nav: "Navegación principal"
      };

  const activeByPage = {
    "index.html": "home",
    "favoritos.html": "favorites",
    "publicar.html": "publish",
    "mensajes.html": "messages",
    "perfil.html": "profile"
  };

  const links = [
    { href: "index.html", icon: "home", key: "home" },
    { href: "favoritos.html", icon: "heart", key: "favorites", requiresAuth: true },
    { href: "publicar.html", icon: "plus", key: "publish", primary: true, requiresAuth: true },
    { href: "mensajes.html", icon: "message", key: "messages", requiresAuth: true },
    { href: "perfil.html", icon: "user", key: "profile", requiresAuth: true }
  ];

  function createNavigation() {
    if (document.querySelector(".cl-mobile-nav")) return;

    const nav = document.createElement("nav");
    nav.className = "cl-mobile-nav";
    nav.setAttribute("aria-label", labels.nav);

    links.forEach((item) => {
      const link = document.createElement("a");
      link.className = `cl-mobile-nav__item${item.primary ? " cl-mobile-nav__item--publish" : ""}`;
      link.href = item.href;
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

    hydrateAccountNavigation(nav);
  }

  async function hydrateAccountNavigation(nav) {
    const profileLink = nav.querySelector('.cl-mobile-nav__item[href="perfil.html"]');
    if (!profileLink) return;

    try {
      const user = await window.colegioLibreApi?.getCurrentUser?.();
      if (user) return;
      profileLink.href = "login.html";
      profileLink.setAttribute("aria-label", language === "en" ? "Sign in" : "Iniciar sesión");
      const label = profileLink.querySelector("span");
      if (label) label.textContent = language === "en" ? "Sign in" : "Ingresar";
    } catch (_error) {
      // Si la sesión todavía no está disponible, el enlace protegido mantiene
      // el comportamiento de redirección existente.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createNavigation, { once: true });
  } else {
    createNavigation();
  }
})();
