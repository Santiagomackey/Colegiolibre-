(function () {

const defaultContent = {
  condition: "Usado",
  location: "Zona de tu colegio",
  price: null,
  title: "Título del producto"
};

const subjectOptions = [
  "Matemática",
  "Lengua y Literatura",
  "Inglés",
  "Historia",
  "Geografía",
  "Biología",
  "Física",
  "Química",
  "Economía",
  "Francés",
  "Otra"
];

const categoryFieldConfig = {
  Libros: {
    academic: true,
    subject: true,
    title: "Datos del libro"
  },
  Apuntes: {
    academic: true,
    subject: true,
    optionLabel: "Tipo de material",
    options: ["Apunte", "Resumen", "Guía de estudio", "Examen / Prueba", "Trabajo práctico", "Otro"],
    title: "Datos del material"
  },
  Cuadernos: {
    subject: true,
    optionalSubject: true,
    optionLabel: "Tipo de cuaderno",
    options: ["Rayado", "Cuadriculado", "Liso", "Carpeta", "Repuesto de hojas", "Otro"],
    title: "Datos del cuaderno"
  },
  "Útiles": {
    optionLabel: "Tipo de útil",
    options: ["Escritura", "Geometría", "Arte", "Organización", "Cartuchera", "Otro"],
    title: "Datos del útil"
  },
  Mochilas: {
    sizeLabel: "Tamaño",
    sizes: ["Chica", "Mediana", "Grande"],
    title: "Datos de la mochila"
  },
  "Tecnología": {
    optionLabel: "Tipo de tecnología",
    options: ["Calculadora", "Tablet", "Notebook", "Accesorio", "Otro"],
    title: "Datos del producto tecnológico"
  },
  Uniformes: {
    optionLabel: "Prenda",
    options: ["Remera", "Chomba", "Buzo", "Campera", "Pantalón", "Pollera", "Short", "Calzado", "Otro"],
    sizeLabel: "Talle",
    sizes: ["4", "6", "8", "10", "12", "14", "16", "XS", "S", "M", "L", "XL", "XXL", "Otro"],
    title: "Datos del uniforme"
  },
  Otros: {
    optionLabel: "Tipo de producto",
    options: ["Material deportivo", "Instrumento", "Accesorio escolar", "Otro"],
    title: "Datos del producto"
  }
};

const form = document.querySelector("#publish-form");
const titleInput = document.querySelector("#titulo");
const categorySelect = document.querySelector("#categoria");
const dynamicProductFields = document.querySelector("#dynamic-product-fields");
const dynamicFieldsTitle = document.querySelector("#dynamic-fields-title");
const academicFieldsRow = document.querySelector("#academic-fields-row");
const schoolLevelSelect = document.querySelector("#nivel-escolar");
const schoolYearSelect = document.querySelector("#anio-escolar");
const subjectSelect = document.querySelector("#materia");
const subjectFieldGroup = document.querySelector("#subject-field-group");
const subcategoryFieldGroup = document.querySelector("#subcategory-field-group");
const subcategoryFieldLabel = document.querySelector("#subcategory-field-label");
const subcategorySelect = document.querySelector("#subcategoria");
const sizeFieldGroup = document.querySelector("#size-field-group");
const sizeFieldLabel = document.querySelector("#size-field-label");
const sizeSelect = document.querySelector("#talle-producto");
const priceInput = document.querySelector("#precio");
const locationSelect = document.querySelector("#ubicacion");
const otherLocationInput = document.querySelector("#ubicacion-otro");
const descriptionInput = document.querySelector("#descripcion");
const conditionSelect = document.querySelector("#estado-producto");

const previewTitle = document.querySelector("#preview-title-text");
const previewPrice = document.querySelector("#preview-price");
const previewLocation = document.querySelector("#preview-location-text");
const previewCondition = document.querySelector("#preview-condition");
const previewSize = document.querySelector("#preview-size");
const previewDetails = document.querySelector("#preview-details");
const previewImage = document.querySelector("#preview-image");
const previewArt = document.querySelector("#preview-art");
const descriptionCounter = document.querySelector("#descripcion-counter");

const fileInput = document.querySelector("#fotos");
const cameraInput = document.querySelector("#foto-camara");
const cameraTrigger = document.querySelector("#camera-trigger");
const uploadTiles = Array.from(document.querySelectorAll(".upload-tile"));
const uploadTrigger = document.querySelector("#upload-trigger");
const cancelButton = document.querySelector("#cancelar");
const submitButton = document.querySelector("#submit-product");
const toast = document.querySelector("#toast");
const pageHeading = document.querySelector("#publicar-titulo");
const pageSubtitle = document.querySelector("#publicar-subtitulo");

const imageSlots = [];
const publishParams = new URLSearchParams(window.location.search);
const editProductId = publishParams.get("edit")?.trim() || "";
const requestedCategory = publishParams.get("category")?.trim() || "";
const requestedSchoolCode = (
  publishParams.get("school") || ""
)
  .trim()
  .toUpperCase();
const publishState = {
  currentProfile: null,
  currentSchool: null,
  defaultLocation: "",
  currentUser: null,
  editingProduct: null,
  hasCompleted: false,
  isEditMode: Boolean(editProductId),
  isReady: false
};

function isMissingSessionError(error) {
  const name = String(error?.name || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    name === "AuthSessionMissingError" ||
    message.includes("auth session missing") ||
    message.includes("session missing")
  );
}

async function moderateSavedProduct(productId) {
  const { data } = await window.colegioLibreSupabase.auth.getSession();
  const accessToken = data?.session?.access_token;

  if (!accessToken) {
    return {
      decision: "manual_review",
      reason: "La publicación quedó guardada y será revisada."
    };
  }

  try {
    const response = await fetch("/api/moderate-product", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ productId })
    });
    const contentType = response.headers.get("content-type") || "";
    const result = contentType.includes("application/json")
      ? await response.json()
      : null;

    if (!response.ok) {
      throw new Error(result?.error || "La revisión automática no respondió.");
    }

    return result;
  } catch (error) {
    console.warn("La publicación quedó en revisión manual:", error);
    return {
      decision: "manual_review",
      reason: "No pudimos completar la revisión automática. La publicación quedó guardada para revisión."
    };
  }
}

function moderationMessage(result, isEditMode) {
  if (result?.decision === "approved") {
    return isEditMode
      ? "Cambios aprobados. La publicación ya está disponible."
      : "¡Publicación aprobada y disponible!";
  }

  if (result?.decision === "rejected") {
    return `No pudimos publicar este producto: ${
      result.reason || "no cumple las reglas de ColeGo."
    }`;
  }

  return result?.reason || "La publicación quedó en revisión.";
}

initPublishPage().catch(handleInitializationError);

async function initPublishPage() {
  bindPreviewEvents();
  bindUploadEvents();
  bindFormEvents();
  bindCategoryFields();
  applyRequestedCategory();
  document.querySelectorAll(".search-bar").forEach((searchForm) => {
    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = searchForm.querySelector('input[type="search"]');
      const term = input?.value.trim();
      const url = term ? `index.html?search=${encodeURIComponent(term)}` : "index.html";
      window.location.href = url;
    });
  });
  bindHeaderNavigation();
  updateDescriptionCounter();
  updatePreview();
  renderUploads();
  window.addEventListener("beforeunload", clearObjectUrls);

  setFormBusy(true, "Comprobando cuenta...");
  const hasAccess = await ensurePublishAccess();
  if (!hasAccess) return;

  if (publishState.isEditMode) {
    await initializeEditMode();
    return;
  }

  publishState.isReady = true;
  setFormBusy(false);
}

function getPublishDestination() {
  return `/publicar${window.location.search}`;
}

async function ensurePublishAccess() {
  const destination = getPublishDestination();
  const { data: authData, error: authError } =
    await window.colegioLibreSupabase.auth.getUser();

  if (authError && !isMissingSessionError(authError)) {
    throw authError;
  }

  const user = authData?.user || null;

  if (!user) {
    window.location.replace(
      `login.html?next=${encodeURIComponent(destination)}`
    );
    return false;
  }

  const { data: profile, error: profileError } =
    await window.colegioLibreSupabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (!profile?.school_code) {
    window.location.replace(
      `index.html?onboarding=1&next=${encodeURIComponent(destination)}`
    );
    return false;
  }

  if (window.colegioLibreApi.isAccountRestricted(profile)) {
    showToast("Tu cuenta no está habilitada para publicar.");
    window.setTimeout(() => {
      window.location.replace("perfil.html");
    }, 900);
    return false;
  }

  const profileSchoolCode = String(profile.school_code).trim().toUpperCase();

  if (
    requestedSchoolCode &&
    requestedSchoolCode !== profileSchoolCode
  ) {
    showToast(
      "Solo podés publicar dentro del colegio asociado a tu cuenta."
    );
    window.setTimeout(() => {
      window.location.replace(
        `colegio.html?code=${encodeURIComponent(profileSchoolCode)}`
      );
    }, 1300);
    return false;
  }

  publishState.currentUser = user;
  publishState.currentProfile = profile;
  publishState.currentSchool =
    await window.colegioLibreApi.getSchoolByCode(profile.school_code);
  configureLocationOptions(profile, publishState.currentSchool);
  const publicationContext =
    `La publicación aparecerá en ${profile.school_name || "tu colegio"} y también podrá encontrarse por zona.`;
  pageSubtitle.textContent =
    window.colegioLibrePreferences?.language === "en"
      ? window.colegioLibrePreferences.translate(publicationContext)
      : publicationContext;
  return true;
}

function configureLocationOptions(profile, school) {
  const isEnglish =
    document.documentElement.dataset.language === "en" ||
    window.colegioLibrePreferences?.language === "en";
  const values = [];
  const addLocation = (value, label) => {
    const cleanValue = String(value || "").trim();
    if (
      !cleanValue ||
      /^(zona no especificada|sin ubicación)$/i.test(cleanValue) ||
      values.some((item) => item.value.toLowerCase() === cleanValue.toLowerCase())
    ) {
      return;
    }
    values.push({ value: cleanValue, label });
  };

  addLocation(
    school?.zone_code || profile?.zone_code,
    `${isEnglish ? "Your school area" : "Zona de tu colegio"}: ${school?.zone_code || profile?.zone_code || ""}`
  );
  addLocation(
    school?.city,
    `${isEnglish ? "Town or city" : "Localidad"}: ${school?.city || ""}`
  );
  addLocation(
    school?.province,
    `${isEnglish ? "Province" : "Provincia"}: ${school?.province || ""}`
  );

  if (!values.length) {
    addLocation(
      profile?.school_name,
      `${isEnglish ? "Near" : "Cerca de"} ${profile?.school_name || (isEnglish ? "your school" : "tu colegio")}`
    );
  }

  locationSelect.innerHTML = "";
  values.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    locationSelect.appendChild(option);
  });

  const customOption = document.createElement("option");
  customOption.value = "otro";
  customOption.textContent = isEnglish ? "Another location" : "Otra ubicación";
  locationSelect.appendChild(customOption);

  publishState.defaultLocation = values[0]?.value || "";
  locationSelect.value = publishState.defaultLocation || "otro";
  otherLocationInput.hidden = locationSelect.value !== "otro";
  updatePreview();
}

function applyRequestedCategory() {
  if (publishState.isEditMode || !requestedCategory) return;

  const hasRequestedCategory = Array.from(categorySelect.options).some(
    (option) => option.value === requestedCategory
  );

  if (hasRequestedCategory) {
    categorySelect.value = requestedCategory;
    updateCategoryFields();
  }
}

async function initializeEditMode() {
  setFormBusy(true, "Cargando publicación...");

  const { data: product, error } = await window.colegioLibreSupabase
    .from("products")
    .select("*")
    .eq("id", editProductId)
    .eq("user_id", publishState.currentUser.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!product) {
    showToast("No encontramos una publicación tuya con ese ID.");
    window.setTimeout(() => {
      window.location.href = "perfil.html";
    }, 1200);
    return;
  }

  publishState.editingProduct = product;
  publishState.isReady = true;
  populateFormForEditing(product);
  configureEditModeUi();
  setFormBusy(false);
}

function configureEditModeUi() {
  document.title = "ColeGo | Editar publicación";
  pageHeading.textContent = "Editá tu publicación";
  pageSubtitle.textContent = "Actualizá la información de tu material y guardá los cambios.";
  submitButton.textContent = "Guardar cambios";
  cancelButton.textContent = "Cancelar edición";
}

function populateFormForEditing(product) {
  titleInput.value = product.title || "";
  categorySelect.value = product.category || "";
  updateCategoryFields();
  schoolLevelSelect.value = product.school_level || "";
  syncSchoolYear();
  schoolYearSelect.value =
    product.school_year !== null && product.school_year !== undefined
      ? String(product.school_year)
      : "";
  subjectSelect.value = product.subject || "";
  subcategorySelect.value = product.subcategory || "";
  sizeSelect.value = product.size || "";
  document.getElementById("book-edition").value = product.book_edition || "";
  document.getElementById("book-isbn").value = product.isbn || "";
  priceInput.value = product.price ?? "";
  descriptionInput.value = product.description || "";

  const matchingLocation = Array.from(locationSelect.options).some(
    (option) => option.value === product.location
  );
  const customLocation = product.custom_location || "";

  if (customLocation || (product.location && !matchingLocation)) {
    locationSelect.value = "otro";
    otherLocationInput.value = customLocation || product.location;
    otherLocationInput.hidden = false;
  } else {
    locationSelect.value = product.location || "";
    otherLocationInput.value = "";
    otherLocationInput.hidden = true;
  }

  conditionSelect.value = product.condition || defaultContent.condition;
  if (!conditionSelect.value) conditionSelect.value = defaultContent.condition;

  clearObjectUrls();
  imageSlots.length = 0;
  const existingImages = [
    product.image_url,
    ...(Array.isArray(product.image_urls) ? product.image_urls : [])
  ]
    .filter(Boolean)
    .filter((url, index, values) => values.indexOf(url) === index)
    .slice(0, 6);

  existingImages.forEach((url) => {
    imageSlots.push({
      file: null,
      isExisting: true,
      url
    });
  });

  updateDescriptionCounter();
  updatePreview();
  renderUploads();
}

function handleInitializationError(error) {
  console.error("Error cargando la publicación:", error);
  publishState.isReady = false;
  setFormBusy(true, "No se pudo cargar");
  showToast(error?.message || "No se pudo cargar la publicación.");
}

function bindHeaderNavigation() {
  const headerButtons = Array.from(document.querySelectorAll(".header-action"));
  headerButtons[0]?.addEventListener("click", () => {
    window.location.href = "mensajes.html";
  });
  headerButtons[1]?.addEventListener("click", () => {
    window.location.href = "favoritos.html";
  });
  headerButtons[2]?.addEventListener("click", () => {
    window.location.href = "perfil.html";
  });
}

function bindPreviewEvents() {
  titleInput.addEventListener("input", updatePreview);
  priceInput.addEventListener("input", updatePreview);
  descriptionInput.addEventListener("input", () => {
    updateDescriptionCounter();
    updatePreview();
  });

  conditionSelect.addEventListener("change", updatePreview);

  locationSelect.addEventListener("change", () => {
    const isOther = locationSelect.value === "otro";
    otherLocationInput.hidden = !isOther;

    if (!isOther) {
      otherLocationInput.value = "";
    }

    updatePreview();
  });

  otherLocationInput.addEventListener("input", updatePreview);
}

function bindUploadEvents() {
  uploadTiles.forEach((tile, index) => {
    tile.addEventListener("click", (event) => {
      const removeIndex = event.target.closest("[data-remove-index]")?.getAttribute("data-remove-index");

      if (removeIndex !== undefined) {
        event.stopPropagation();
        removeImageAt(Number(removeIndex));
        return;
      }

      if (imageSlots[index] && index > 0) {
        imageSlots.unshift(imageSlots.splice(index, 1)[0]);
        renderUploads();
        return;
      }
      fileInput.value = "";
      fileInput.click();
    });
  });

  uploadTrigger.addEventListener("dragover", (event) => {
    event.preventDefault();
    uploadTrigger.classList.add("is-dragover");
  });

  uploadTrigger.addEventListener("dragleave", () => {
    uploadTrigger.classList.remove("is-dragover");
  });

  uploadTrigger.addEventListener("drop", (event) => {
    event.preventDefault();
    uploadTrigger.classList.remove("is-dragover");

    const files = Array.from(event.dataTransfer?.files || []).filter((file) =>
      file.type.startsWith("image/")
    );

    if (files.length) {
      setImages(files);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files?.length) {
      setImages(fileInput.files);
    }
  });

  cameraInput?.addEventListener("change", () => {
    if (cameraInput.files?.length) {
      setImages(cameraInput.files);
      cameraInput.value = "";
    }
  });

  cameraTrigger?.addEventListener("click", async () => {
    cameraTrigger.disabled = true;
    try {
      const nativePhoto = await window.colegioLibreNative?.takePhoto?.();
      if (nativePhoto instanceof File) {
        setImages([nativePhoto]);
        return;
      }
      cameraInput.value = "";
      cameraInput.click();
    } catch (error) {
      if (error?.message !== "USER_CANCELLED") {
        showToast("No pudimos abrir la cámara. Podés elegir una foto de la galería.");
      }
    } finally {
      cameraTrigger.disabled = false;
    }
  });
}
function syncSchoolYear() {
  const level = schoolLevelSelect.value;
  const label = level === "Primaria" ? "Grado" : level === "Secundaria" ? "Año" : "Año o grado";
  document.querySelector('label[for="anio-escolar"]').textContent = label;
  schoolYearSelect.disabled = !level;
  schoolYearSelect.closest(".field-group").hidden = !level;
  if (!level) schoolYearSelect.value = "";
  Array.from(schoolYearSelect.options).forEach(option => {
    option.textContent = option.value ? option.value + ".º" + (level === "Primaria" ? " grado" : level === "Secundaria" ? " año" : "") : "Seleccioná una opción";
  });
}
function bindCategoryFields() {
  const desktop = window.matchMedia("(min-width: 601px)");
  const preview = document.querySelector("details.preview-panel");
  const adaptPreview = () => { preview.open = desktop.matches; };
  adaptPreview();
  desktop.addEventListener("change", adaptPreview);
  schoolLevelSelect.addEventListener("change", syncSchoolYear);
  categorySelect.addEventListener("change", () => {
    const level = schoolLevelSelect.value;
    const year = schoolYearSelect.value;
    updateCategoryFields();
    schoolLevelSelect.value = level;
    syncSchoolYear();
    schoolYearSelect.value = year;
    updatePreview();
  });
  [
    schoolLevelSelect,
    schoolYearSelect,
    subjectSelect,
    subcategorySelect,
    sizeSelect
  ].forEach((select) => {
    select.addEventListener("change", updatePreview);
  });

  updateCategoryFields();
}

function setSelectOptions(select, placeholder, options) {
  select.innerHTML = [
    `<option value="">${placeholder}</option>`,
    ...options.map(
      (option) => `<option value="${option}">${option}</option>`
    )
  ].join("");
}

function resetDynamicFieldValues() {
  schoolLevelSelect.value = "";
  schoolYearSelect.value = "";
  subjectSelect.value = "";
  subcategorySelect.value = "";
  sizeSelect.value = "";
}

function updateCategoryFields() {
  const config = categoryFieldConfig[categorySelect.value] || null;

  document.getElementById("book-fields").hidden = categorySelect.value !== "Libros";
  resetDynamicFieldValues();
  dynamicProductFields.hidden = !config;
  academicFieldsRow.hidden = false;
  subjectFieldGroup.hidden = !config?.subject;
  subcategoryFieldGroup.hidden = !Array.isArray(config?.options);
  sizeFieldGroup.hidden = !Array.isArray(config?.sizes);

  [
    schoolLevelSelect,
    schoolYearSelect,
    subjectSelect,
    subcategorySelect,
    sizeSelect
  ].forEach((select) => {
    select.disabled = true;
    select.required = false;
  });

  if (!config) {
    schoolLevelSelect.disabled = false;
    syncSchoolYear();
    updatePreview();
    return;
  }

  dynamicFieldsTitle.textContent = config.title;

  schoolLevelSelect.disabled = false;
  schoolLevelSelect.required = Boolean(config.academic);
  schoolYearSelect.required = Boolean(config.academic);
  syncSchoolYear();

  if (config.subject) {
    setSelectOptions(subjectSelect, config.optionalSubject ? "Sin materia" : "Seleccioná la materia", subjectOptions);
    subjectSelect.disabled = false;
    subjectSelect.required = !config.optionalSubject;
  }

  if (Array.isArray(config.options)) {
    subcategoryFieldLabel.textContent = config.optionLabel;
    setSelectOptions(
      subcategorySelect,
      `Seleccioná: ${config.optionLabel.toLowerCase()}`,
      config.options
    );
    subcategorySelect.disabled = false;
    subcategorySelect.required = true;
  }

  if (Array.isArray(config.sizes)) {
    sizeFieldLabel.textContent = config.sizeLabel;
    setSelectOptions(
      sizeSelect,
      `Seleccioná: ${config.sizeLabel.toLowerCase()}`,
      config.sizes
    );
    sizeSelect.disabled = false;
    sizeSelect.required = true;
  }

  updatePreview();
}

function bindFormEvents() {
  form.addEventListener("submit", handleSubmit);
  cancelButton.addEventListener("click", () => {
    if (publishState.isEditMode) {
      window.location.href = "perfil.html";
      return;
    }

    resetFormState();
    showToast("Se restauró el formulario.");
  });
}

function formatPrice(value) {
  if (!value || Number.isNaN(Number(value))) {
    const locale =
      window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
    return "Precio";
  }

  const locale =
    window.colegioLibrePreferences?.language === "en" ? "en-GB" : "es-AR";
  return `$${Number(value).toLocaleString(locale)}`;
}

function getSelectedCondition() {
  return conditionSelect.value || defaultContent.condition;
}

function getFinalLocation() {
  if (locationSelect.value === "otro") {
    return otherLocationInput.value.trim() || "Ubicación personalizada";
  }

  return locationSelect.value || publishState.defaultLocation || "Zona de tu colegio";
}

function syncPreviewVisibility() {
  document.querySelector("details.preview-panel").hidden = !(imageSlots.length || titleInput.value.trim() || priceInput.value);
}

function updatePreview() {
  syncPreviewVisibility();
  previewTitle.textContent = titleInput.value.trim() || defaultContent.title;
  previewPrice.textContent = formatPrice(priceInput.value);
  previewLocation.textContent = getFinalLocation();

  const conditionValue = getSelectedCondition();
  previewCondition.textContent = conditionValue;
  previewCondition.dataset.condition = conditionValue;

  const config = categoryFieldConfig[categorySelect.value] || null;
  const shouldShowSize = Boolean(config?.sizes && sizeSelect.value);
  previewSize.hidden = !shouldShowSize;
  previewSize.textContent = shouldShowSize
    ? `${config.sizeLabel} ${sizeSelect.value}`
    : "";

  const details = [
    categorySelect.value,
    conditionValue,
    shouldShowSize ? `${config.sizeLabel} ${sizeSelect.value}` : null,
    subjectSelect.value,
    subcategorySelect.value,
    schoolLevelSelect.value
      ? schoolLevelSelect.value
      : null,
    schoolLevelSelect.value && schoolYearSelect.value
      ? schoolYearSelect.selectedOptions[0].textContent
      : null
  ].filter(Boolean);

  previewDetails.textContent = details.join(" · ");
  previewDetails.hidden = !details.length;
}

function updateDescriptionCounter() {
  descriptionCounter.textContent = `${descriptionInput.value.length}/500`;
}

function clearObjectUrls() {
  imageSlots.forEach((slot) => {
    if (slot?.isObjectUrl && slot.url) {
      URL.revokeObjectURL(slot.url);
    }
  });
}

function removeImageAt(index) {
  const removedSlot = imageSlots[index];

  if (removedSlot?.isObjectUrl && removedSlot.url) {
    URL.revokeObjectURL(removedSlot.url);
  }

  imageSlots.splice(index, 1);
  renderUploads();
}

function createTileImage(tile, url, index) {
  tile.classList.add("has-image");
  tile.innerHTML = `
    <img class="upload-thumb" alt="Foto seleccionada ${index + 1}" />
    ${index === 0 ? '<span class="cover-label">Portada</span>' : '<span class="cover-option">Usar de portada</span>'}
    <span class="upload-tile__remove" data-remove-index="${index}" aria-hidden="true">
      <svg class="icon"><use href="#icon-close"></use></svg>
    </span>
  `;
  tile.querySelector(".upload-thumb").src = url;
}

function createEmptyTile(tile, index) {
  tile.classList.remove("has-image");

  if (tile.id === "upload-trigger") {
    tile.innerHTML = `
      <svg class="icon"><use href="#icon-image"></use></svg>
      <span>Agregar foto</span>
    `;
    return;
  }

  tile.innerHTML = `
    <svg class="icon"><use href="#icon-plus"></use></svg>
    <span>Agregar foto</span>
  `;
}

function renderUploads() {
  syncPreviewVisibility();
  uploadTiles.forEach((tile, index) => {
    const slot = imageSlots[index];
    tile.hidden = index > imageSlots.length;
    tile.setAttribute("aria-label", slot ? (index ? "Usar foto " + (index + 1) + " como portada" : "Portada. Agregar fotos") : "Agregar foto");

    if (slot) {
      createTileImage(tile, slot.url, index);
    } else {
      createEmptyTile(tile, index);
    }
  });

  if (imageSlots[0]) {
    previewImage.src = imageSlots[0].url;
    previewImage.hidden = false;
    previewArt.hidden = true;
  } else {
    previewImage.removeAttribute("src");
    previewImage.hidden = true;
    previewArt.hidden = false;
  }
}

function setImages(files) {
  const selectedFiles = Array.from(files);
  const invalidFiles = selectedFiles.filter(
    (file) => !file.type.startsWith("image/") || file.size > 6 * 1024 * 1024
  );
  const incomingFiles = selectedFiles
    .filter(
      (file) => file.type.startsWith("image/") && file.size <= 6 * 1024 * 1024
    )
    .slice(0, 6 - imageSlots.length);

  if (invalidFiles.length) {
    showToast("Algunas imágenes no son válidas o superan los 6 MB.");
  }

  incomingFiles.forEach((file) => {
    imageSlots.push({
      file,
      isObjectUrl: true,
      url: URL.createObjectURL(file)
    });
  });

  renderUploads();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.hidden = true;
  }, 2200);
}

function setFormBusy(isBusy, busyLabel) {
  form.setAttribute("aria-busy", String(isBusy));
  submitButton.disabled = isBusy;
  cancelButton.disabled = isBusy && !publishState.isReady;

  if (isBusy && busyLabel) {
    submitButton.textContent = busyLabel;
    return;
  }

  submitButton.textContent = publishState.isEditMode
    ? "Guardar cambios"
    : "Publicar producto";
}

function resetFormState() {
  form.reset();
  conditionSelect.value = defaultContent.condition;
  titleInput.value = "";
  priceInput.value = "";
  categorySelect.value = "";
  updateCategoryFields();
  locationSelect.value = publishState.defaultLocation || "otro";
  otherLocationInput.hidden = true;
  otherLocationInput.value = "";
  descriptionInput.value = "";
  clearObjectUrls();
  imageSlots.length = 0;
  renderUploads();
  updateDescriptionCounter();
  updatePreview();
}

async function optimizeImage(file) {
  if (!file || !file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84)
    );
    return blob || file;
  } catch (_error) {
    return file;
  }
}

async function uploadImage(file) {
  const optimizedFile = await optimizeImage(file);
  const wasOptimized = optimizedFile !== file;
  const fallbackExtension =
    file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() ||
    "jpg";
  const fileExtension = wasOptimized ? "jpg" : fallbackExtension;
  const contentType = wasOptimized
    ? "image/jpeg"
    : file.type || "application/octet-stream";
  const fileName = `${crypto.randomUUID()}.${fileExtension}`;
  const ownerId = publishState.currentUser?.id;
  if (!ownerId) {
    throw new Error("Tenés que iniciar sesión para subir imágenes.");
  }
  const filePath = `${ownerId}/products/${fileName}`;

  const { error } = await window.colegioLibreSupabase.storage
    .from("product-images")
    .upload(filePath, optimizedFile, {
      cacheControl: "31536000",
      contentType,
      upsert: false
    });

  if (error) {
    console.error(error);
    throw new Error("No se pudo subir la imagen.");
  }

  const { data } = window.colegioLibreSupabase.storage
    .from("product-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

async function uploadProductImages() {
  const urls = [];

  for (const slot of imageSlots.slice(0, 6)) {
    if (slot.isExisting && slot.url) {
      urls.push(slot.url);
      continue;
    }

    if (slot.file) {
      urls.push(await uploadImage(slot.file));
    }
  }

  return urls.filter(Boolean);
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!publishState.isReady || publishState.hasCompleted) {
    showToast("Esperá a que termine de cargar la publicación.");
    return;
  }

  setFormBusy(
    true,
    publishState.isEditMode ? "Guardando cambios..." : "Publicando..."
  );

  try {
    const title = titleInput.value.trim();
    const priceValue = Number(priceInput.value);
    const finalLocation = getFinalLocation();
    const category = categorySelect.value;
    const edition = category === "Libros" ? document.getElementById("book-edition").value.trim() : "";
    const isbn = category === "Libros" ? document.getElementById("book-isbn").value.trim().replace(/[\s-]/g,"").toUpperCase() : "";
    if (isbn && !/^(?:[0-9]{9}[0-9X]|[0-9]{13})$/.test(isbn)) {
      showToast("Revisá el ISBN: tiene que tener 10 o 13 caracteres.");
      document.getElementById("book-isbn").focus();
      return;
    }
    const categoryConfig = categoryFieldConfig[category] || null;
    const schoolLevel = schoolLevelSelect.value || "No corresponde";
    const schoolYear =
      schoolLevelSelect.value && schoolYearSelect.value
        ? Number(schoolYearSelect.value)
        : null;
    const subject = categoryConfig?.subject ? subjectSelect.value || null : null;
    const subcategory = Array.isArray(categoryConfig?.options)
      ? subcategorySelect.value
      : null;
    const productSize = Array.isArray(categoryConfig?.sizes)
      ? sizeSelect.value
      : null;

    if (!title || !category || !priceValue) {
      showToast("Completá título, categoría y precio.");
      return;
    }

    const description = descriptionInput.value.trim();
    if (description.length < 20) {
      showToast("Agregá una descripción de al menos 20 caracteres.");
      descriptionInput.focus();
      return;
    }

    if (categoryConfig?.academic && (!schoolLevelSelect.value || !schoolYear)) {
      showToast("Seleccioná el nivel y el año o grado.");
      return;
    }

    if (categoryConfig?.subject && !categoryConfig.optionalSubject && !subject) {
      showToast("Seleccioná la materia.");
      return;
    }

    if (Array.isArray(categoryConfig?.options) && !subcategory) {
      showToast(`Seleccioná ${categoryConfig.optionLabel.toLowerCase()}.`);
      return;
    }

    if (Array.isArray(categoryConfig?.sizes) && !productSize) {
      showToast(`Seleccioná ${categoryConfig.sizeLabel.toLowerCase()}.`);
      return;
    }

    const { data: authData, error: authError } =
      await window.colegioLibreSupabase.auth.getUser();

    if (authError && !isMissingSessionError(authError)) {
      throw authError;
    }

    const user = authData?.user;

    if (!user) {
      showToast("Tenés que iniciar sesión para publicar.");

      window.setTimeout(() => {
        window.location.href =
          `login.html?next=${encodeURIComponent(getPublishDestination())}`;
      }, 800);

      return;
    }

    publishState.currentUser = user;

    const { data: profile, error: profileError } =
      await window.colegioLibreSupabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      window.location.href =
        `index.html?onboarding=1&next=${encodeURIComponent(getPublishDestination())}`;
      return;
    }

    if (!profile.school_code) {
      window.location.href =
        `index.html?onboarding=1&next=${encodeURIComponent(getPublishDestination())}`;
      return;
    }

    if (window.colegioLibreApi.isAccountRestricted(profile)) {
      showToast("Tu cuenta no está habilitada para publicar.");
      window.setTimeout(() => {
        window.location.href = "perfil.html";
      }, 900);
      return;
    }

    const uploadedImageUrls = await uploadProductImages();
    const imageUrl = uploadedImageUrls[0] || null;

    const nowIso = new Date().toISOString();

    const editableProductFields = {
      title: title,
      category: category,
      condition: getSelectedCondition(),
      price: priceValue,
      description: description,
      book_edition: edition || null,
      isbn: isbn || null,
      image_url: imageUrl,
      image_urls: uploadedImageUrls,

      location:
        finalLocation ||
        profile.zone_code ||
        "Sin ubicación",

      custom_location:
        locationSelect.value === "otro"
          ? otherLocationInput.value.trim()
          : null,

      school_level: schoolLevel,
      school_year: schoolYear,
      subject: subject,
      subcategory: subcategory,
      size: productSize,
      updated_at: nowIso
    };

    if (publishState.isEditMode) {
      const { data: updatedProduct, error: updateError } =
        await window.colegioLibreSupabase
          .from("products")
          .update(editableProductFields)
          .eq("id", editProductId)
          .eq("user_id", user.id)
          .select("id, status, moderation_status")
          .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!updatedProduct) {
        throw new Error("No tenés permiso para editar esta publicación.");
      }

      showToast("Cambios guardados. Estamos revisando la publicación…");
      const moderationResult = await moderateSavedProduct(updatedProduct.id);
      publishState.hasCompleted = true;
      showToast(moderationMessage(moderationResult, true));

      window.setTimeout(() => {
        window.location.href = "perfil.html";
      }, moderationResult?.decision === "approved" ? 900 : 1800);
      return;
    }

    const product = {
      ...editableProductFields,
      school: profile.school_name || null,
      school_code: profile.school_code || null,
      school_name: profile.school_name || null,
      seller_name:
        profile.name ||
        "Usuario ColeGo",

      user_id: user.id,
      zone: profile.zone_code || null,
      zone_code: profile.zone_code || null,
      country: "Argentina",
      status: "paused",
      moderation_status: "pending",
      views: 0,
      created_at: nowIso
    };

    const { data: insertedProduct, error: insertError } =
      await window.colegioLibreSupabase
        .from("products")
        .insert(product)
        .select("id, status, moderation_status")
        .single();

    if (insertError) {
      throw insertError;
    }

    showToast("Producto recibido. Lo estamos revisando…");
    const moderationResult = await moderateSavedProduct(insertedProduct.id);
    publishState.hasCompleted = true;
    showToast(moderationMessage(moderationResult, false));

    window.setTimeout(() => {
      window.location.href =
        moderationResult?.decision !== "approved"
          ? "perfil.html"
          : `colegio.html?code=${encodeURIComponent(profile.school_code)}`;
    }, moderationResult?.decision === "approved" ? 900 : 1800);
  } catch (error) {
    console.error(
      publishState.isEditMode ? "ERROR AL EDITAR:" : "ERROR AL PUBLICAR:",
      error
    );

    showToast(
      error?.message ||
      (publishState.isEditMode
        ? "Error al guardar los cambios."
        : "Error al publicar el producto.")
    );
  } finally {
    if (!publishState.hasCompleted) {
      setFormBusy(false);
    }
  }
}

})();

const demandStatus = document.getElementById("match-demand");
const demandFields = [titleInput, categorySelect, priceInput, sizeSelect,
  document.getElementById("book-isbn"), document.getElementById("book-edition")];
let demandTimer;
let demandRevision = 0;

function refreshMatchDemand() {
  const revision = ++demandRevision;
  clearTimeout(demandTimer);
  demandStatus.hidden = true;
  const [title,category,price,size,isbn,edition] = demandFields.map(field => field.value.trim());
  if (title.length < 3 || !category || !Number.isSafeInteger(Number(price)) || Number(price) <= 0) return;
  demandTimer = setTimeout(async () => {
    try {
      const {data,error} = await window.colegioLibreSupabase.rpc("colego_match_demand",{
        p_title:title,p_category:category,p_price:Number(price),p_size:size || null,
        p_isbn:category === "Libros" ? isbn.replace(/[\s-]/g,"").toUpperCase() || null : null,
        p_edition:category === "Libros" ? edition || null : null
      });
      if (error || revision !== demandRevision) return;
      const result = data?.[0];
      const counts = [result?.school && result.school + " en tu colegio",result?.zone && result.zone + " en tu zona"].filter(Boolean);
      demandStatus.textContent = counts.length ? "Personas buscando un material compatible · " + counts.join(" · ") : "";
      demandStatus.hidden = !counts.length;
    } catch (_) { /* Publication is available even if the demand query fails. */ }
  }, 650);
}
for (const field of demandFields) {
  field.addEventListener("input",refreshMatchDemand);
  field.addEventListener("change",refreshMatchDemand);
}
