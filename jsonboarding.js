(() => {
  "use strict";

  const SEARCH_DELAY_MS = 320;
  const MIN_SEARCH_LENGTH = 2;
  const MAX_RESULTS = 18;
  const SAFE_DESTINATIONS = new Set([
    "index.html",
    "perfil.html",
    "publicar.html",
    "mensajes.html",
    "favoritos.html",
    "colegio.html"
  ]);

  let selectedOnboardingSchool = null;
  let onboardingUser = null;
  let onboardingProfile = null;
  let pendingDestination = "";
  let searchTimer = null;
  let searchRequestId = 0;
  let eventsBound = false;

  const byId = (id) => document.getElementById(id);

  function getSafeDestination(rawValue) {
    if (!rawValue) return "";

    try {
      const url = new URL(rawValue, window.location.href);
      const currentOrigin = window.location.origin;

      if (currentOrigin !== "null" && url.origin !== currentOrigin) return "";

      const page = url.pathname.split("/").filter(Boolean).pop() || "index.html";
      if (!SAFE_DESTINATIONS.has(page)) return "";

      return `${page}${url.search}`;
    } catch (_error) {
      return "";
    }
  }

  function getRequestedDestination(options = {}) {
    const params = new URLSearchParams(window.location.search);
    return (
      getSafeDestination(options.next) ||
      getSafeDestination(params.get("next")) ||
      ""
    );
  }

  async function initOnboarding(options = {}) {
    const client = window.colegioLibreSupabase;
    const modal = byId("onboarding-modal");

    if (!client) {
      console.error("No se encontró el cliente de Supabase.");
      return { required: false, user: null };
    }

    if (!modal) {
      return { required: false, user: null };
    }

    const { data, error: userError } = await client.auth.getUser();
    const user = data?.user || null;

    const missingSession =
      userError?.name === "AuthSessionMissingError" ||
      String(userError?.message || "").toLowerCase().includes("session missing");

    if (userError && !missingSession) {
      console.error("No se pudo comprobar la sesión:", userError);
      return { required: false, user: null };
    }

    if (!user) {
      hideOnboarding();
      return { required: false, user: null };
    }

    /* Defensa adicional: jamás mostrar la configuración del perfil si el
       proveedor todavía no confirmó el correo. */
    if (!user.email_confirmed_at && !user.confirmed_at) {
      await client.auth.signOut();
      hideOnboarding();
      window.location.replace("login.html?verification=required");
      return { required: false, user: null };
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("No se pudo comprobar el perfil:", profileError);
      return { required: false, user };
    }

    if (profile?.school_code && !options.force) {
      hideOnboarding();
      return { profile, required: false, user };
    }

    onboardingUser = user;
    onboardingProfile = profile || null;
    pendingDestination = getRequestedDestination(options);
    bindOnboardingEvents();
    prefillOnboardingForm();
    showOnboarding();

    return { profile, required: true, user };
  }

  function prefillOnboardingForm() {
    const nameInput = byId("onboarding-name");
    const levelSelect = byId("onboarding-school-level");
    const metadataLevel = onboardingUser?.user_metadata?.school_level || "";

    if (nameInput && !nameInput.value) {
      nameInput.value =
        onboardingProfile?.name ||
        onboardingUser?.user_metadata?.name ||
        "";
    }

    if (levelSelect && !levelSelect.value) {
      const savedLevel = onboardingProfile?.school_level || metadataLevel;
      const hasOption = [...levelSelect.options].some(
        (option) => option.value === savedLevel
      );
      levelSelect.value = hasOption ? savedLevel : "";
    }
  }

  function showOnboarding() {
    const modal = byId("onboarding-modal");
    const nameInput = byId("onboarding-name");

    modal.hidden = false;
    document.body.classList.add("has-blocking-modal");
    window.setTimeout(() => nameInput?.focus(), 40);
  }

  function hideOnboarding() {
    const onboardingModal = byId("onboarding-modal");
    const schoolModal = byId("school-modal");

    if (onboardingModal) onboardingModal.hidden = true;
    if (schoolModal) schoolModal.hidden = true;
    document.body.classList.remove("has-blocking-modal");
  }

  function bindOnboardingEvents() {
    if (eventsBound) return;

    const form = byId("onboarding-form");
    const openSearch = byId("open-school-search");
    const closeSearch = byId("close-school-search");
    const schoolInput = byId("school-search-input");
    const schoolModal = byId("school-modal");
    const nameInput = byId("onboarding-name");
    const levelSelect = byId("onboarding-school-level");

    if (
      !form ||
      !openSearch ||
      !closeSearch ||
      !schoolInput ||
      !schoolModal ||
      !nameInput ||
      !levelSelect
    ) {
      console.error("Faltan elementos del onboarding en el HTML.");
      return;
    }

    eventsBound = true;

    openSearch.addEventListener("click", openSchoolSearch);
    closeSearch.addEventListener("click", closeSchoolSearch);

    nameInput.addEventListener("input", () => {
      nameInput.setAttribute("aria-invalid", "false");
      setOnboardingMessage("", "");
    });

    levelSelect.addEventListener("change", () => {
      levelSelect.setAttribute("aria-invalid", "false");
      setOnboardingMessage("", "");
    });

    schoolInput.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(
        () => searchSchools(schoolInput.value),
        SEARCH_DELAY_MS
      );
    });

    schoolInput.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      byId("school-results")?.querySelector(".school-result")?.focus();
    });

    schoolModal.addEventListener("click", (event) => {
      if (event.target === schoolModal) closeSchoolSearch();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !schoolModal.hidden) {
        closeSchoolSearch();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveOnboardingProfile();
    });
  }

  function openSchoolSearch() {
    const schoolModal = byId("school-modal");
    const schoolInput = byId("school-search-input");

    schoolModal.hidden = false;
    schoolInput.value = selectedOnboardingSchool?.name || "";
    renderSearchHint(
      selectedOnboardingSchool
        ? "Podés elegir otro colegio o volver."
        : "Buscá por nombre, siglas o dirección. También podés agregar la localidad."
    );

    window.setTimeout(() => {
      schoolInput.focus();
      schoolInput.select();
    }, 40);
  }

  function closeSchoolSearch() {
    byId("school-modal").hidden = true;
    searchRequestId += 1;
    window.clearTimeout(searchTimer);
    byId("open-school-search")?.focus();
  }

  async function searchSchools(rawQuery) {
    const query = String(rawQuery || "").trim();
    const requestId = ++searchRequestId;

    if (query.length < MIN_SEARCH_LENGTH) {
      renderSearchHint("Escribí al menos 2 letras para buscar.");
      return;
    }

    setSchoolSearchState("loading", "Buscando en el padrón oficial…");

    try {
      const schools = await window.colegioLibreApi.searchSchools(query, MAX_RESULTS);

      if (requestId !== searchRequestId) return;
      renderSchoolResults(schools);
    } catch (error) {
      console.error("No se pudieron buscar colegios:", error);
      setSchoolSearchState(
        "error",
        "No pudimos buscar colegios en este momento. Probá nuevamente."
      );
    }
  }

  function renderSchoolResults(schools) {
    const results = byId("school-results");
    results.replaceChildren();

    if (!schools.length) {
      setSchoolSearchState(
        "empty",
        "No lo encontramos con ese nombre. Probá con la dirección del colegio y su localidad."
      );
      return;
    }

    const fragment = document.createDocumentFragment();

    schools.forEach((school) => {
      const button = document.createElement("button");
      const title = document.createElement("strong");
      const location = document.createElement("span");

      button.className = "school-result";
      button.type = "button";
      button.dataset.schoolId = school.school_id || "";

      title.textContent = preferredSchoolName(school);
      location.textContent = formatSchoolLocation(school);

      button.append(title, location);
      button.addEventListener("click", () => selectSchool(school));
      fragment.append(button);
    });

    results.append(fragment);
  }

  function selectSchool(school) {
    selectedOnboardingSchool = {
      id: school.school_id || school.id,
      code: school.code,
      cue: school.cue || null,
      name: preferredSchoolName(school),
      official_name: school.official_name || school.name || "",
      province: school.province || "",
      city: school.city || "",
      zone_code: school.zone_code || school.city || school.province || "",
      address: school.address || "",
      education_levels: school.education_levels || []
    };

    const codeInput = byId("onboarding-school-code");
    const schoolButton = byId("open-school-search");
    if (codeInput) codeInput.value = selectedOnboardingSchool.code || "";
    schoolButton?.setAttribute("aria-invalid", "false");

    updateSelectedSchoolPreview(selectedOnboardingSchool);
    setOnboardingMessage("", "");
    closeSchoolSearch();
  }

  function validateOnboardingForm() {
    const nameInput = byId("onboarding-name");
    const levelSelect = byId("onboarding-school-level");
    const schoolButton = byId("open-school-search");
    const name = String(nameInput?.value || "").trim();
    const schoolLevel = String(levelSelect?.value || "").trim();

    nameInput?.setAttribute("aria-invalid", "false");
    levelSelect?.setAttribute("aria-invalid", "false");
    schoolButton?.setAttribute("aria-invalid", "false");

    if (name.length < 2) {
      nameInput?.setAttribute("aria-invalid", "true");
      setOnboardingMessage("Ingresá tu nombre.", "error");
      nameInput?.focus();
      return null;
    }

    if (!schoolLevel) {
      levelSelect?.setAttribute("aria-invalid", "true");
      setOnboardingMessage("Seleccioná tu nivel escolar.", "error");
      levelSelect?.focus();
      return null;
    }

    if (!selectedOnboardingSchool?.id || !selectedOnboardingSchool?.code) {
      schoolButton?.setAttribute("aria-invalid", "true");
      setOnboardingMessage("Buscá y seleccioná tu colegio.", "error");
      openSchoolSearch();
      return null;
    }

    return { name, schoolLevel };
  }

  async function saveProfileWithCompatibility(profile, schoolLevel) {
    const profileWithLevel = { ...profile, school_level: schoolLevel };
    let response = await window.colegioLibreSupabase
      .from("profiles")
      .upsert(profileWithLevel, { onConflict: "id" });

    if (
      response.error &&
      /school_level|column.*does not exist/i.test(response.error.message || "")
    ) {
      response = await window.colegioLibreSupabase
        .from("profiles")
        .upsert(profile, { onConflict: "id" });
    }

    return response;
  }

  async function saveOnboardingProfile() {
    const submitButton = byId("onboarding-submit");
    const formValues = validateOnboardingForm();

    if (!onboardingUser) {
      setOnboardingMessage("Tu sesión venció. Volvé a iniciar sesión.", "error");
      return;
    }

    if (!formValues) return;

    setSubmitBusy(submitButton, true);
    setOnboardingMessage("Comprobando el colegio…", "loading");

    const { data: school, error: schoolError } =
      await window.colegioLibreSupabase
        .from("schools")
        .select(
          "id, code, cue, name, display_name, community_code, province, city, zone_code, address, is_active"
        )
        .eq("id", selectedOnboardingSchool.id)
        .eq("is_active", true)
        .maybeSingle();

    if (schoolError || !school) {
      console.error("No se pudo verificar el colegio:", schoolError);
      selectedOnboardingSchool = null;
      updateSelectedSchoolPreview(null);
      setSubmitBusy(submitButton, false);
      setOnboardingMessage(
        "Ese colegio ya no está disponible. Seleccioná otro.",
        "error"
      );
      return;
    }

    setOnboardingMessage("Guardando tu perfil…", "loading");

    const profile = {
      id: onboardingUser.id,
      name: formValues.name,
      school_code: school.community_code || school.code,
      school_name: school.display_name || school.name,
      zone_code: school.zone_code || school.city || school.province || null
    };

    const { error: saveError } = await saveProfileWithCompatibility(
      profile,
      formValues.schoolLevel
    );

    if (saveError) {
      console.error("No se pudo guardar el perfil:", saveError);
      setSubmitBusy(submitButton, false);
      setOnboardingMessage(
        "No se pudo guardar tu perfil. Probá nuevamente.",
        "error"
      );
      return;
    }

    const { error: metadataError } =
      await window.colegioLibreSupabase.auth.updateUser({
        data: {
          name: formValues.name,
          school_level: formValues.schoolLevel
        }
      });

    if (metadataError) {
      console.warn("El perfil se guardó, pero no sus metadatos:", metadataError);
    }

    const completedProfile = {
      ...profile,
      account_status: "active"
    };

    window.dispatchEvent(
      new CustomEvent("colegiolibre:profile-ready", {
        detail: { destination: pendingDestination, profile: completedProfile }
      })
    );

    setOnboardingMessage("¡Listo! Ya podés usar ColegioLibre.", "success");
    window.setTimeout(() => {
      const destination = getPostOnboardingDestination(
        pendingDestination,
        completedProfile
      );

      if (destination && destination !== "index.html") {
        window.location.assign(destination);
      } else {
        window.location.assign("index.html");
      }
    }, 650);
  }

  function getPostOnboardingDestination(destination, profile) {
    const safeDestination = getSafeDestination(destination);
    if (safeDestination?.startsWith("colegio.html")) {
      const schoolCode = String(profile?.school_code || "").trim();
      return schoolCode
        ? `colegio.html?code=${encodeURIComponent(schoolCode)}`
        : "index.html";
    }

    return safeDestination || "index.html";
  }

  function updateSelectedSchoolPreview(school) {
    const preview = byId("selected-school-preview");
    const button = byId("open-school-search");
    const buttonText = byId("school-picker-text");

    if (!school) {
      preview.hidden = true;
      preview.replaceChildren();
      button?.classList.remove("has-selection");
      if (buttonText) buttonText.textContent = "Buscar y seleccionar mi colegio";
      return;
    }

    const name = document.createElement("strong");
    const location = document.createElement("span");

    name.textContent = school.name;
    location.textContent = formatSchoolLocation(school);

    preview.replaceChildren(name, location);
    preview.hidden = false;
    button?.classList.add("has-selection");
    if (buttonText) buttonText.textContent = "Cambiar colegio";
  }

  function renderSearchHint(text) {
    setSchoolSearchState("hint", text);
  }

  function setSchoolSearchState(kind, text) {
    const results = byId("school-results");
    const message = document.createElement("p");

    message.className = `school-empty school-empty--${kind}`;
    message.textContent = text;
    results.replaceChildren(message);
  }

  function setOnboardingMessage(text, kind) {
    const message = byId("onboarding-message");
    message.textContent = text;
    message.dataset.state = kind || "";
  }

  function setSubmitBusy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = isBusy ? "Guardando…" : "Continuar";
  }

  function formatSchoolLocation(school) {
    const values = [school.city, school.province]
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    return [...new Set(values)].join(" · ") || "Argentina";
  }

  function preferredSchoolName(school) {
    const searchable = [
      school?.display_name,
      school?.name,
      school?.official_name,
      school?.short_name,
      school?.aliases,
      school?.code,
      school?.address
    ].join(" ").toLocaleLowerCase("es");

    if (searchable.includes("eccleston")) return "Eccleston School";

    const locationNames = new Set(
      [school?.city, school?.province, school?.zone_code]
        .map((value) => String(value || "").trim().toLocaleLowerCase("es"))
        .filter(Boolean)
    );
    const candidates = [
      school?.display_name,
      school?.name,
      school?.official_name,
      school?.short_name
    ];
    return candidates.find((candidate) => {
      const value = String(candidate || "").trim();
      return value && !locationNames.has(value.toLocaleLowerCase("es"));
    }) || "Colegio sin nombre";
  }

  window.initOnboarding = initOnboarding;
})();
