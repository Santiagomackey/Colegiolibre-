(function () {

const defaultContent = {
  condition: "Usado",
  location: "Caballito, CABA",
  price: 15000,
  title: "Matemática 3 - Santillana"
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
    title: "Datos de los apuntes"
  },
  Cuadernos: {
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
const conditionInputs = Array.from(document.querySelectorAll('input[name="estado"]'));

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
  currentUser: null,
  editingProduct: null,
  hasCompleted: false,
  isEditMode: Boolean(editProductId),
  isReady: false
};

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
  return `publicar.html${window.location.search}`;
}

async function ensurePublishAccess() {
  const destination = getPublishDestination();
  const { data: authData, error: authError } =
    await window.colegioLibreSupabase.auth.getUser();

  if (authError) {
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
  pageSubtitle.textContent =
    `La publicación aparecerá en ${profile.school_name || "tu colegio"} y también podrá encontrarse por zona.`;
  return true;
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
  document.title = "ColegioLibre | Editar publicación";
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
  schoolYearSelect.value =
    product.school_year !== null && product.school_year !== undefined
      ? String(product.school_year)
      : "";
  subjectSelect.value = product.subject || "";
  subcategorySelect.value = product.subcategory || "";
  sizeSelect.value = product.size || "";
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

  const matchingCondition =
    conditionInputs.find((input) => input.value === product.condition) ||
    conditionInputs.find((input) => input.value === defaultContent.condition);
  if (matchingCondition) {
    matchingCondition.checked = true;
  }

  clearObjectUrls();
  imageSlots.length = 0;
  if (product.image_url) {
    imageSlots.push({
      file: null,
      isExisting: true,
      url: product.image_url
    });
  }

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
    window.location.href = "perfil.html?view=favorites";
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

  conditionInputs.forEach((input) => {
    input.addEventListener("change", updatePreview);
  });

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
  uploadTiles.forEach((tile) => {
    tile.addEventListener("click", (event) => {
      const removeIndex = event.target.closest("[data-remove-index]")?.getAttribute("data-remove-index");

      if (removeIndex !== undefined) {
        event.stopPropagation();
        removeImageAt(Number(removeIndex));
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
}
function bindCategoryFields() {
  categorySelect.addEventListener("change", updateCategoryFields);
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

  resetDynamicFieldValues();
  dynamicProductFields.hidden = !config;
  academicFieldsRow.hidden = !config?.academic;
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
    updatePreview();
    return;
  }

  dynamicFieldsTitle.textContent = config.title;

  if (config.academic) {
    schoolLevelSelect.disabled = false;
    schoolYearSelect.disabled = false;
    schoolLevelSelect.required = true;
    schoolYearSelect.required = true;
  }

  if (config.subject) {
    setSelectOptions(subjectSelect, "Seleccioná la materia", subjectOptions);
    subjectSelect.disabled = false;
    subjectSelect.required = true;
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
    return `$${defaultContent.price.toLocaleString("es-AR")}`;
  }

  return `$${Number(value).toLocaleString("es-AR")}`;
}

function getSelectedCondition() {
  return conditionInputs.find((input) => input.checked)?.value || defaultContent.condition;
}

function getFinalLocation() {
  if (locationSelect.value === "otro") {
    return otherLocationInput.value.trim() || "Ubicación personalizada";
  }

  return locationSelect.value || defaultContent.location;
}

function updatePreview() {
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
    subjectSelect.value,
    subcategorySelect.value,
    config?.academic && schoolLevelSelect.value
      ? schoolLevelSelect.value
      : null,
    config?.academic && schoolYearSelect.value
      ? `${schoolYearSelect.value}.º`
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
    <span class="sr-only">Foto cargada ${index + 1}</span>
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
      <span>Subí hasta 6 fotos o arrastrá y soltá aquí</span>
    `;
    return;
  }

  tile.innerHTML = `
    <svg class="icon"><use href="#icon-plus"></use></svg>
    <span class="sr-only">Agregar foto ${index + 1}</span>
  `;
}

function renderUploads() {
  uploadTiles.forEach((tile, index) => {
    const slot = imageSlots[index];

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
  const incomingFiles = Array.from(files)
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, 6 - imageSlots.length);

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
  document.querySelector("#estado-usado").checked = true;
  titleInput.value = "";
  priceInput.value = "";
  categorySelect.value = "";
  updateCategoryFields();
  locationSelect.value = "";
  otherLocationInput.hidden = true;
  otherLocationInput.value = "";
  descriptionInput.value = "";
  clearObjectUrls();
  imageSlots.length = 0;
  renderUploads();
  updateDescriptionCounter();
  updatePreview();
}

async function uploadMainImage() {
  if (!imageSlots[0]?.file) return null;

  const file = imageSlots[0].file;
  const fileExt = file.name.split(".").pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `products/${fileName}`;

  const { error } = await window.colegioLibreSupabase.storage
    .from("product-images")
    .upload(filePath, file);

  if (error) {
    console.error(error);
    throw new Error("No se pudo subir la imagen.");
  }

  const { data } = window.colegioLibreSupabase.storage
    .from("product-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
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
    const categoryConfig = categoryFieldConfig[category] || null;
    const schoolLevel = categoryConfig?.academic
      ? schoolLevelSelect.value
      : "No corresponde";
    const schoolYear =
      categoryConfig?.academic && schoolYearSelect.value
        ? Number(schoolYearSelect.value)
        : null;
    const subject = categoryConfig?.subject
      ? subjectSelect.value
      : null;
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

    if (categoryConfig?.academic && (!schoolLevel || !schoolYear)) {
      showToast("Seleccioná el nivel y el año o grado.");
      return;
    }

    if (categoryConfig?.subject && !subject) {
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

    if (authError) {
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

    let imageUrl = imageSlots[0]?.isExisting
      ? imageSlots[0].url
      : null;

    if (imageSlots[0]?.file) {
      imageUrl = await uploadMainImage();
    }

    const nowIso = new Date().toISOString();

    const editableProductFields = {
      title: title,
      category: category,
      condition: getSelectedCondition(),
      price: priceValue,
      description: descriptionInput.value.trim(),
      image_url: imageUrl,

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
          .select("id")
          .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      if (!updatedProduct) {
        throw new Error("No tenés permiso para editar esta publicación.");
      }

      publishState.hasCompleted = true;
      showToast("¡Publicación actualizada correctamente!");

      window.setTimeout(() => {
        window.location.href = "perfil.html";
      }, 900);
      return;
    }

    const product = {
      ...editableProductFields,
      school: profile.school_name || null,
      school_code: profile.school_code || null,
      school_name: profile.school_name || null,
      seller_name:
        profile.name ||
        "Usuario ColegioLibre",

      user_id: user.id,
      zone: profile.zone_code || null,
      zone_code: profile.zone_code || null,
      country: "Argentina",
      status: "available",
      views: 0,
      created_at: nowIso
    };

    console.log("Producto que se enviará:", product);

    const { error: insertError } =
      await window.colegioLibreSupabase
        .from("products")
        .insert(product);

    if (insertError) {
      throw insertError;
    }

    publishState.hasCompleted = true;
    showToast("¡Producto publicado correctamente!");

    window.setTimeout(() => {
      window.location.href =
        `colegio.html?code=${encodeURIComponent(profile.school_code)}`;
    }, 1000);
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
