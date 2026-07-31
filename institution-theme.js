(function () {
  "use strict";

  var STORAGE_KEY = "colegiolibre_institution_theme_v1";
  var storedPortalCode =
    window.sessionStorage.getItem("colegiolibre_active_school_portal") || "";
  var portal = window.ColegioLibreInstitution || {
    enabled: Boolean(storedPortalCode),
    code: storedPortalCode,
    schoolCode: storedPortalCode ? storedPortalCode.toUpperCase() : "",
    schoolName: storedPortalCode.replace(/[-_]+/g, " "),
    schoolMatch: storedPortalCode.replace(/[-_]+/g, " ")
  };
  if (!portal.enabled || !portal.code) return;
  var activeSchoolRecord = null;
  var defaults = {
    id: portal.code || "eccleston",
    code: portal.schoolCode || "ECCLESTON",
    name: portal.schoolName || "Instituto Sara Chamberlain de Eccleston",
    shortName: portal.code === "eccleston"
      ? "Eccleston"
      : (portal.schoolName || "Mi colegio"),
    primary: "#0b2e6b",
    accent: "#f4c430",
    logo: portal.code === "eccleston" ? "./images/eccleston-mark.svg" : "",
    logoBackground: "#0b2e6b",
    logoScale: 145,
    logoX: 0,
    logoY: 0
  };

  function schoolToConfig(school) {
    if (!school) return null;
    var name =
      school.display_name ||
      school.name ||
      school.official_name ||
      defaults.name;
    return {
      id: String(school.code || portal.code || defaults.id).toLowerCase(),
      code: String(school.code || portal.schoolCode || defaults.code).toUpperCase(),
      name: name,
      shortName: school.short_name || school.display_name || name,
      primary: school.primary_color || defaults.primary,
      accent: school.accent_color || school.secondary_color || defaults.accent,
      logo: school.logo_url || defaults.logo,
      logoBackground: school.logo_background || school.primary_color || defaults.logoBackground,
      logoScale: Number(school.logo_scale || defaults.logoScale),
      logoX: Number(school.logo_x || 0),
      logoY: Number(school.logo_y || 0)
    };
  }

  async function resolveInstitutionConfig() {
    var api = window.colegioLibreApi;
    if (api && typeof api.getSchoolByCode === "function") {
      try {
        activeSchoolRecord = await api.getSchoolByCode(portal.schoolCode);
        var databaseConfig = schoolToConfig(activeSchoolRecord);
        if (databaseConfig) {
          portal.code = databaseConfig.id;
          portal.schoolCode = databaseConfig.code;
          portal.schoolName = databaseConfig.name;
          portal.schoolMatch = databaseConfig.name;
          return databaseConfig;
        }
      } catch (error) {
        console.warn("No se pudo cargar la identidad institucional:", error);
      }
    }

    return readConfig();
  }

  async function canEditInstitution() {
    var api = window.colegioLibreApi;
    var client = window.colegioLibreSupabase;
    if (!api || !client) return false;

    try {
      if (typeof api.isAdminUser === "function" && await api.isAdminUser()) {
        return true;
      }
      var user = await api.getCurrentUser();
      if (!user) return false;
      var result = await client
        .from("school_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("school_code", portal.schoolCode)
        .eq("is_active", true)
        .maybeSingle();
      return Boolean(result.data && !result.error);
    } catch (_error) {
      return false;
    }
  }

  var presets = {
    eccleston: {
      name: "Instituto Sara Chamberlain de Eccleston",
      shortName: "Eccleston",
      primary: "#0b2e6b",
      accent: "#f4c430"
    },
    ort: {
      name: "ORT Argentina",
      shortName: "ORT",
      primary: "#1765a7",
      accent: "#f39b32"
    },
    northlands: {
      name: "Colegio Northlands",
      shortName: "Northlands",
      primary: "#174633",
      accent: "#d5b65f"
    },
    ilse: {
      name: "Instituto Libre de Segunda Enseñanza",
      shortName: "ILSE",
      primary: "#6f1d31",
      accent: "#d8b45c"
    },
    custom: {
      name: "Mi colegio",
      shortName: "Mi colegio",
      primary: "#0b2e6b",
      accent: "#67c23a"
    }
  };

  function readConfig() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.id && saved.id !== defaults.id) return Object.assign({}, defaults);
      var config = Object.assign({}, defaults, saved, {
        id: defaults.id,
        shortName: defaults.shortName
      });
      if (!config.logo && defaults.logo) config.logo = defaults.logo;
      return config;
    } catch (_) {
      return Object.assign({}, defaults);
    }
  }

  function hexToRgb(hex) {
    var value = String(hex || "").replace("#", "");
    if (value.length === 3) value = value.split("").map(function (x) { return x + x; }).join("");
    var number = parseInt(value, 16);
    if (Number.isNaN(number)) return "11, 46, 107";
    return [number >> 16, (number >> 8) & 255, number & 255].join(", ");
  }

  function mixWithWhite(hex, amount) {
    var rgb = hexToRgb(hex).split(",").map(Number);
    return "#" + rgb.map(function (value) {
      var mixed = Math.round(value + (255 - value) * amount);
      return mixed.toString(16).padStart(2, "0");
    }).join("");
  }

  function darken(hex, amount) {
    var rgb = hexToRgb(hex).split(",").map(Number);
    return "#" + rgb.map(function (value) {
      return Math.max(0, Math.round(value * (1 - amount))).toString(16).padStart(2, "0");
    }).join("");
  }

  function initials(name) {
    return String(name || "Colegio")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part[0]; })
      .join("")
      .toUpperCase();
  }

  function brandNode(config) {
    if (config.logo) {
      var img = document.createElement("img");
      img.src = config.logo;
      img.alt = "Logo de " + config.name;
      return img;
    }
    var mark = document.createElement("span");
    mark.className = "cl-school-monogram";
    mark.textContent = initials(config.name);
    return mark;
  }

  function ensureStrip(config) {
    var strip = document.querySelector(".cl-institution-strip");
    if (!strip) {
      strip = document.createElement("div");
      strip.className = "cl-institution-strip";
      document.body.insertBefore(strip, document.body.firstChild);
    }
    strip.replaceChildren();
    strip.appendChild(brandNode(config));
    var text = document.createElement("span");
    text.innerHTML = "Comunidad de <strong></strong> <small>· impulsada por ColegioLibre</small>";
    text.querySelector("strong").textContent = config.name;
    strip.appendChild(text);
    var generalLink = document.createElement("a");
    generalLink.className = "cl-general-link";
    generalLink.href = "/";
    generalLink.textContent = "Ir a ColegioLibre Argentina ↗";
    strip.appendChild(generalLink);
  }

  function identityMark(config, className) {
    var holder = document.createElement("span");
    holder.className = className;
    if (config.logo) {
      holder.classList.add("has-image");
      holder.style.backgroundImage =
        'url("' + String(config.logo).replace(/"/g, "%22") + '")';
      holder.setAttribute("role", "img");
      holder.setAttribute("aria-label", "Logo de " + config.name);
    } else {
      holder.textContent = initials(config.name);
    }
    return holder;
  }

  function updateHeaderIdentity(config) {
    document.querySelectorAll(".site-header .brand").forEach(function (brand) {
      brand.classList.add("cl-branded");
      var lockup = brand.querySelector(".cl-school-lockup");
      if (!lockup) {
        lockup = document.createElement("span");
        lockup.className = "cl-school-lockup";
        brand.appendChild(lockup);
      }
      lockup.replaceChildren();
      lockup.appendChild(identityMark(config, "cl-school-lockup-logo"));
      var copy = document.createElement("span");
      copy.className = "cl-school-lockup-copy";
      copy.innerHTML = "<small>MARKETPLACE OFICIAL</small><strong></strong><span>con tecnología de ColegioLibre</span>";
      copy.querySelector("strong").textContent = config.shortName || config.name;
      lockup.appendChild(copy);
      brand.setAttribute("aria-label", "Inicio de la comunidad de " + config.name);
    });
  }

  function updateHeroIdentity(config) {
    var heroCopy = document.querySelector(".hero-copy");
    if (heroCopy) {
      var badge = heroCopy.querySelector(".cl-hero-school-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "cl-hero-school-badge";
        heroCopy.insertBefore(badge, heroCopy.firstChild);
      }
      badge.replaceChildren();
      badge.appendChild(brandNode(config));
      var badgeText = document.createElement("span");
      badgeText.textContent = "Exclusivo para familias de " + (config.shortName || config.name);
      badge.appendChild(badgeText);
    }

    var heroPanel = document.querySelector(".hero-panel");
    if (heroPanel) {
      var signature = heroPanel.querySelector(".cl-school-signature");
      if (!signature) {
        signature = document.createElement("div");
        signature.className = "cl-school-signature";
        heroPanel.appendChild(signature);
      }
      signature.replaceChildren();
      signature.appendChild(brandNode(config));
      var signatureText = document.createElement("span");
      signatureText.textContent = "Comunidad verificada · " + (config.shortName || config.name);
      signature.appendChild(signatureText);
    }
  }

  function makePortalSchoolOnly(config) {
    var scopeSelector = document.querySelector(".scope-selector");
    if (!scopeSelector) return;

    var dot = document.createElement("span");
    dot.className = "cl-school-only-dot";
    dot.textContent = "✓";

    var copy = document.createElement("span");
    var title = document.createElement("strong");
    title.textContent = "Solo " + (config.shortName || config.name);
    var detail = document.createElement("small");
    detail.textContent = "Productos publicados por familias verificadas del colegio.";
    copy.appendChild(title);
    copy.appendChild(detail);

    scopeSelector.classList.add("cl-school-only-scope");
    scopeSelector.replaceChildren(dot, copy);
  }

  function enhanceInstitutionHomepage(config) {
    document.title = (config.shortName || config.name) + " Marketplace | ColegioLibre";
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.href = window.location.origin + "/colegio/" + encodeURIComponent(portal.code);
    }
    var description = document.querySelector('meta[name="description"]');
    if (description) {
      description.content =
        "El marketplace exclusivo de " + config.name + " para comprar, vender e intercambiar materiales escolares.";
    }

    var heroTitle = document.querySelector(".hero-copy h1");
    var heroText = document.querySelector(".hero-copy > p");
    if (heroTitle) {
      heroTitle.innerHTML =
        "Lo que ya no usás<br><span>le sirve a alguien del <em>cole.</em></span>";
    }
    if (heroText) {
      heroText.textContent =
        "Comprá y vendé libros, uniformes y materiales dentro de una comunidad que ya conocés.";
    }

    var primaryCta = document.querySelector(".hero-cta-row .cta-button");
    var secondaryCta = document.querySelector(".hero-cta-row .text-link");
    if (primaryCta) primaryCta.textContent = "Explorar " + (config.shortName || config.name);
    if (secondaryCta) {
      secondaryCta.href = "publicar.html";
      secondaryCta.childNodes[0].nodeValue = "Publicar un producto ";
    }

    var heroCopy = document.querySelector(".hero-copy");
    if (heroCopy && !heroCopy.querySelector(".cl-community-proof")) {
      var proof = document.createElement("div");
      proof.className = "cl-community-proof";
      proof.innerHTML =
        '<span class="cl-proof-faces" aria-hidden="true"><i>5°</i><i>4°</i><i>3°</i></span>' +
        '<span><strong>Hecho para nuestra comunidad</strong><small>Más confianza, menos distancia.</small></span>';
      heroCopy.appendChild(proof);
    }

    var trustSection = document.querySelector(".trust-section .container");
    if (trustSection && !trustSection.querySelector(".cl-trust-heading")) {
      var trustHeading = document.createElement("div");
      trustHeading.className = "cl-trust-heading";
      trustHeading.innerHTML =
        '<span>UNA COMUNIDAD, TODO MÁS SIMPLE</span>' +
        '<strong>Comprar dentro del colegio cambia todo.</strong>';
      trustSection.insertBefore(trustHeading, trustSection.firstChild);
    }

    var productsSection = document.querySelector(".products-section .container");
    if (productsSection && !productsSection.querySelector(".cl-market-note")) {
      var note = document.createElement("div");
      note.className = "cl-market-note";
      note.innerHTML =
        '<span class="cl-market-note__icon">' + initials(config.name).slice(0, 1) + '</span>' +
        '<span><strong>Marketplace cerrado de <span data-institution-short></span></strong>' +
        '<small>Solo ves publicaciones asociadas al colegio. Tu cuenta y tus mensajes siguen siendo los mismos de ColegioLibre.</small></span>';
      productsSection.insertBefore(note, productsSection.firstChild);
    }

    var marketplaceTitle = document.querySelector("#category-marketplace-title");
    var marketplaceKicker = document.querySelector(
      ".category-marketplace-heading .section-kicker"
    );
    if (marketplaceKicker) marketplaceKicker.textContent =
      "Todo " + (config.shortName || config.name) + ", en un lugar";
    if (marketplaceTitle) marketplaceTitle.textContent = "Encontrá exactamente lo que necesitás";

    var stepsCopy = document.querySelector(".steps-copy");
    if (stepsCopy) {
      var stepsKicker = stepsCopy.querySelector(".section-kicker");
      var stepsTitle = stepsCopy.querySelector("h2");
      var stepsText = stepsCopy.querySelector("p:last-child");
      if (stepsKicker) stepsKicker.textContent = "De familia a familia";
      if (stepsTitle) stepsTitle.textContent = "Publicar lleva minutos. Reutilizar dura años.";
      if (stepsText) {
        stepsText.textContent =
          "Una forma más cercana, económica y sustentable de circular materiales dentro de " +
          (config.shortName || config.name) + ".";
      }
    }

    var footerCopy = document.querySelector(".footer-medium-brand p");
    if (footerCopy) {
      footerCopy.textContent =
        "La comunidad de " + (config.shortName || config.name) +
        " para comprar, vender e intercambiar materiales escolares, impulsada por ColegioLibre.";
    }
  }

  function applyConfig(config) {
    var root = document.documentElement;
    root.style.setProperty("--institution-primary", config.primary);
    root.style.setProperty("--institution-accent", config.accent);
    root.style.setProperty("--institution-logo-bg", config.logoBackground || config.primary);
    root.style.setProperty("--institution-logo-scale", (config.logoScale || 145) / 100);
    root.style.setProperty("--institution-logo-size", (config.logoScale || 145) + "%");
    root.style.setProperty("--institution-logo-x", (config.logoX || 0) + "%");
    root.style.setProperty("--institution-logo-y", (config.logoY || 0) + "%");
    root.style.setProperty("--institution-soft", mixWithWhite(config.primary, .92));
    root.style.setProperty("--institution-primary-rgb", hexToRgb(config.primary));
    root.style.setProperty("--color-primary", config.primary);
    root.style.setProperty("--color-primary-deep", darken(config.primary, .22));
    root.style.setProperty("--color-primary-soft", mixWithWhite(config.primary, .91));
    root.style.setProperty("--color-accent-green", config.accent);
    root.style.setProperty("--color-accent-green-deep", darken(config.accent, .16));
    root.style.setProperty("--shadow-card-strong", "0 36px 95px rgba(" + hexToRgb(config.primary) + ", .18)");
    document.body.classList.add("institution-themed");
    document.body.dataset.institution = config.id || "custom";
    ensureStrip(config);
    updateHeaderIdentity(config);
    updateHeroIdentity(config);
    makePortalSchoolOnly(config);
    enhanceInstitutionHomepage(config);
    document.querySelectorAll("[data-institution-name]").forEach(function (node) {
      node.textContent = config.name;
    });
    document.querySelectorAll("[data-institution-short]").forEach(function (node) {
      node.textContent = config.shortName || config.name;
    });
    document.dispatchEvent(new CustomEvent("colegiolibre:institution-change", { detail: config }));
  }

  function panelMarkup() {
    return [
      '<button class="cl-inst-trigger" type="button" aria-label="Personalizar para mi colegio">',
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.1h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z"/></svg>',
      '<span>Editar identidad</span></button>',
      '<div class="cl-inst-overlay" role="dialog" aria-modal="true" aria-labelledby="cl-inst-title">',
      '<section class="cl-inst-panel"><header class="cl-inst-panel-header"><div><span class="cl-inst-kicker">PANEL DE IDENTIDAD</span><h2 id="cl-inst-title">Personalizá <span data-panel-school></span></h2><p>Los cambios se aplican para toda la comunidad.</p></div><button type="button" data-cl-close aria-label="Cerrar">×</button></header>',
      '<form class="cl-inst-form">',
      '<input name="preset" type="hidden" value="eccleston">',
      '<div class="cl-inst-workspace">',
      '<aside class="cl-inst-preview-column"><span class="cl-inst-section-label">VISTA PREVIA EN VIVO</span><div class="cl-inst-preview"><div class="cl-inst-preview-top"><span data-preview-mark>CL</span><span>Comunidad de <b data-preview-name>Eccleston</b></span></div><div class="cl-inst-preview-body"><div class="cl-inst-preview-lockup"><span data-preview-large-mark>CL</span><span><small>MARKETPLACE OFICIAL</small><strong data-preview-short>Eccleston</strong><em>con tecnología de ColegioLibre</em></span></div><div class="cl-inst-preview-hero"><small>EXCLUSIVO PARA NUESTRAS FAMILIAS</small><strong>Lo que ya no usás le sirve a alguien del cole.</strong><i></i></div></div></div><p class="cl-inst-preview-help">La vista previa muestra cómo quedarán el encabezado y los colores principales.</p></aside>',
      '<div class="cl-inst-controls"><section class="cl-inst-control-section"><span class="cl-inst-section-label">INFORMACIÓN</span><label class="cl-inst-field">Nombre visible<input name="name" maxlength="80" required></label></section>',
      '<section class="cl-inst-control-section"><span class="cl-inst-section-label">COLORES</span><div class="cl-inst-colors"><label class="cl-inst-field">Principal<span class="cl-inst-color-control"><input name="primary" type="color"></span></label><label class="cl-inst-field">Acento<span class="cl-inst-color-control"><input name="accent" type="color"></span></label><label class="cl-inst-field">Fondo del logo<span class="cl-inst-color-control"><input name="logoBackground" type="color"></span></label></div></section>',
      '<section class="cl-inst-control-section"><span class="cl-inst-section-label">LOGO DEL COLEGIO</span><div class="cl-inst-upload"><span class="cl-inst-upload-preview" data-logo-preview></span><label><strong>Elegir archivo</strong><small>PNG o SVG con transparencia funciona mejor</small><input name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><button type="button" data-logo-remove>Quitar</button></div>',
      '<div class="cl-inst-logo-controls"><label>Zoom <output data-zoom-output>145%</output><input name="logoScale" type="range" min="70" max="240" step="5"></label><div><label>Horizontal<input name="logoX" type="range" min="-40" max="40" step="1"></label><label>Vertical<input name="logoY" type="range" min="-40" max="40" step="1"></label></div><p>Si el logo se ve pequeño o desaparece, aumentá el zoom y elegí un fondo que contraste.</p></div></section></div>',
      '</div>',
      '<div class="cl-inst-actions"><button class="cl-inst-button" type="button" data-cl-reset>Restaurar identidad</button><button class="cl-inst-button cl-inst-button--primary" type="submit">Guardar cambios</button></div><div class="cl-inst-saved" role="status">✓ Identidad guardada y aplicada.</div>',
      '</form></section></div>'
    ].join("");
  }

  function bindPanel(config) {
    var host = document.createElement("div");
    host.innerHTML = panelMarkup();
    while (host.firstChild) document.body.appendChild(host.firstChild);

    var trigger = document.querySelector(".cl-inst-trigger");
    var overlay = document.querySelector(".cl-inst-overlay");
    var panel = document.querySelector(".cl-inst-panel");
    var form = document.querySelector(".cl-inst-form");
    var preset = form.elements.preset;
    var name = form.elements.name;
    var primary = form.elements.primary;
    var accent = form.elements.accent;
    var logoBackground = form.elements.logoBackground;
    var logoScale = form.elements.logoScale;
    var logoX = form.elements.logoX;
    var logoY = form.elements.logoY;
    var logoInput = form.elements.logo;
    var logoPreview = form.querySelector("[data-logo-preview]");
    var saved = form.querySelector(".cl-inst-saved");
    var workingLogo = config.logo || "";
    var workingLogoFile = null;
    panel.querySelector("[data-panel-school]").textContent =
      config.shortName || config.name;

    function renderLogoPreview() {
      logoPreview.replaceChildren();
      logoPreview.appendChild(brandNode({ name: name.value, logo: workingLogo }));
    }

    function preview() {
      document.documentElement.style.setProperty("--institution-primary", primary.value);
      document.documentElement.style.setProperty("--institution-accent", accent.value);
      document.documentElement.style.setProperty("--institution-soft", mixWithWhite(primary.value, .92));
      document.documentElement.style.setProperty("--institution-logo-bg", logoBackground.value);
      document.documentElement.style.setProperty("--institution-logo-scale", Number(logoScale.value) / 100);
      document.documentElement.style.setProperty("--institution-logo-x", logoX.value + "%");
      document.documentElement.style.setProperty("--institution-logo-y", logoY.value + "%");
      form.querySelector("[data-preview-name]").textContent = name.value || "Mi colegio";
      form.querySelector("[data-preview-short]").textContent =
        config.shortName || defaults.shortName;
      form.querySelector("[data-zoom-output]").textContent = logoScale.value + "%";
      [form.querySelector("[data-preview-mark]"), form.querySelector("[data-preview-large-mark]")].forEach(function (mark) {
        mark.replaceChildren();
        mark.appendChild(brandNode({ name: name.value, logo: workingLogo }));
      });
      renderLogoPreview();
    }

    function fill(next) {
      preset.value = next.id || "custom";
      name.value = next.name || "";
      primary.value = next.primary || defaults.primary;
      accent.value = next.accent || defaults.accent;
      logoBackground.value = next.logoBackground || next.primary || defaults.logoBackground;
      logoScale.value = next.logoScale || defaults.logoScale;
      logoX.value = next.logoX || 0;
      logoY.value = next.logoY || 0;
      workingLogo = next.logo || "";
      preview();
    }

    fill(config);

    trigger.addEventListener("click", function () {
      overlay.classList.add("is-open");
      document.body.style.overflow = "hidden";
    });

    function close() {
      overlay.classList.remove("is-open");
      document.body.style.overflow = "";
      applyConfig(readConfig());
    }

    overlay.querySelector("[data-cl-close]").addEventListener("click", close);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });
    panel.addEventListener("click", function (event) { event.stopPropagation(); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay.classList.contains("is-open")) close();
    });

    preset.addEventListener("change", function () {
      var selected = presets[preset.value] || presets.custom;
      name.value = selected.name;
      primary.value = selected.primary;
      accent.value = selected.accent;
      workingLogo = "";
      preview();
    });
    name.addEventListener("input", preview);
    primary.addEventListener("input", preview);
    accent.addEventListener("input", preview);
    logoBackground.addEventListener("input", preview);
    logoScale.addEventListener("input", preview);
    logoX.addEventListener("input", preview);
    logoY.addEventListener("input", preview);
    form.querySelector("[data-logo-remove]").addEventListener("click", function () {
      workingLogo = "";
      workingLogoFile = null;
      logoInput.value = "";
      preview();
    });
    logoInput.addEventListener("change", function () {
      var file = logoInput.files && logoInput.files[0];
      if (!file) return;
      if (file.size > 1500000) {
        window.alert("El logo debe pesar menos de 1,5 MB.");
        logoInput.value = "";
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        workingLogoFile = file;
        workingLogo = String(reader.result || "");
        preview();
      };
      reader.readAsDataURL(file);
    });

    form.querySelector("[data-cl-reset]").addEventListener("click", function () {
      localStorage.removeItem(STORAGE_KEY);
      fill(config);
      applyConfig(config);
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      var submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = "Guardando…";

      var persistedLogo = workingLogo;
      if (workingLogoFile && window.colegioLibreSupabase) {
        try {
          var extension = String(workingLogoFile.name || "logo.png")
            .split(".")
            .pop()
            .replace(/[^a-z0-9]/gi, "")
            .toLowerCase() || "png";
          var logoPath =
            String(portal.code || "school") + "/logo-" + Date.now() + "." + extension;
          var uploadResult = await window.colegioLibreSupabase.storage
            .from("school-branding")
            .upload(logoPath, workingLogoFile, {
              cacheControl: "3600",
              contentType: workingLogoFile.type,
              upsert: true
            });
          if (!uploadResult.error) {
            var publicResult = window.colegioLibreSupabase.storage
              .from("school-branding")
              .getPublicUrl(logoPath);
            persistedLogo = publicResult.data.publicUrl;
          }
        } catch (uploadError) {
          console.warn("No se pudo subir el logo institucional:", uploadError);
        }
      }

      var next = {
        id: portal.code || defaults.id,
        code: portal.schoolCode || defaults.code,
        name: name.value.trim() || defaults.name,
        shortName: config.shortName || defaults.shortName,
        primary: primary.value,
        accent: accent.value,
        logo: persistedLogo,
        logoBackground: logoBackground.value,
        logoScale: Number(logoScale.value),
        logoX: Number(logoX.value),
        logoY: Number(logoY.value)
      };

      var databaseSaved = false;
      if (window.colegioLibreSupabase && portal.schoolCode) {
        var updateResult = await window.colegioLibreSupabase
          .from("schools")
          .update({
            display_name: next.name,
            short_name: next.shortName,
            primary_color: next.primary,
            accent_color: next.accent,
            logo_url: next.logo || null,
            logo_background: next.logoBackground,
            logo_scale: next.logoScale,
            logo_x: next.logoX,
            logo_y: next.logoY,
            updated_at: new Date().toISOString()
          })
          .eq("code", portal.schoolCode)
          .select("code")
          .maybeSingle();
        databaseSaved = Boolean(updateResult.data && !updateResult.error);
        if (updateResult.error) {
          console.error("No se pudo guardar la identidad institucional:", updateResult.error);
        }
      }

      if (!databaseSaved) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
      } else {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      }

      workingLogo = persistedLogo;
      workingLogoFile = null;
      applyConfig(next);
      saved.classList.add("is-visible");
      saved.textContent = databaseSaved
        ? "✓ Identidad guardada para toda la comunidad."
        : "✓ Vista guardada en este dispositivo. Falta habilitar el guardado institucional.";
      submitButton.disabled = false;
      submitButton.textContent = "Guardar cambios";
      window.setTimeout(function () { saved.classList.remove("is-visible"); }, 2200);
      window.setTimeout(close, 850);
    });
  }

  async function init() {
    var config = await resolveInstitutionConfig();
    applyConfig(config);
    var isPortalSurface = /(?:^|\/)(?:index|colegio)\.html$/i.test(window.location.pathname);
    if (isPortalSurface && await canEditInstitution()) {
      bindPanel(config);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
