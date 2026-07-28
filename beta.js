(() => {
  "use strict";

  const { client, getCurrentUser } = window.colegioLibreApi;
  const STORAGE_KEY = "colegiolibre-beta-tasks-v1";
  const language = document.documentElement.dataset.language === "en" ? "en" : "es";

  const copy = {
    es: {
      badge: "Programa beta",
      eyebrow: "Ayudanos a mejorar",
      title: "Probá ColegioLibre desde tu celular",
      intro: "Completá estas pruebas como usarías normalmente la aplicación. Si algo falla o resulta confuso, reportalo al final.",
      progressLabel: "Tu progreso",
      tasksEyebrow: "Recorrido recomendado",
      tasksTitle: "10 pruebas importantes",
      reset: "Reiniciar",
      feedbackEyebrow: "Tu experiencia",
      feedbackTitle: "Contanos qué pasó",
      typeLabel: "Tipo de comentario",
      selectOption: "Seleccioná una opción",
      typeBug: "Encontré un error",
      typeConfusing: "Algo fue confuso",
      typeSuggestion: "Tengo una sugerencia",
      typePositive: "Algo me gustó",
      pageLabel: "¿Dónde ocurrió?",
      selectPage: "Seleccioná la página",
      pageLogin: "Registro o inicio de sesión",
      pageSchool: "Selección del colegio",
      pageProduct: "Detalle de producto",
      pagePublish: "Publicar o editar",
      pageFavorites: "Favoritos",
      pageMessages: "Mensajes",
      pageProfile: "Perfil",
      pageInstall: "Instalación de la app",
      pageOther: "Otra parte",
      ratingLabel: "Calificación general",
      descriptionLabel: "¿Qué pasó o qué mejorarías?",
      stepsLabel: "Pasos para repetir el problema",
      optional: "(opcional)",
      privacy: "No incluyas contraseñas, códigos, DNI, direcciones ni conversaciones privadas.",
      submit: "Enviar comentario",
      open: "Abrir",
      completed: "¡Recorrido completo! Ya podés enviar tu opinión.",
      remaining: (count) => `${count} prueba${count === 1 ? "" : "s"} pendiente${count === 1 ? "" : "s"}.`,
      sending: "Enviando comentario…",
      success: "¡Gracias! Recibimos tu comentario correctamente.",
      missingTable: "Primero hay que ejecutar el archivo SQL de la beta en Supabase.",
      error: "No pudimos enviar el comentario. Probá nuevamente.",
      resetConfirm: "¿Querés reiniciar todas las pruebas?"
    },
    en: {
      badge: "Beta program",
      eyebrow: "Help us improve",
      title: "Test ColegioLibre from your phone",
      intro: "Complete these tasks as you would normally use the app. If something fails or feels confusing, report it below.",
      progressLabel: "Your progress",
      tasksEyebrow: "Recommended journey",
      tasksTitle: "10 important tests",
      reset: "Reset",
      feedbackEyebrow: "Your experience",
      feedbackTitle: "Tell us what happened",
      typeLabel: "Feedback type",
      selectOption: "Choose an option",
      typeBug: "I found a bug",
      typeConfusing: "Something was confusing",
      typeSuggestion: "I have a suggestion",
      typePositive: "I liked something",
      pageLabel: "Where did it happen?",
      selectPage: "Choose the page",
      pageLogin: "Sign up or sign in",
      pageSchool: "School selection",
      pageProduct: "Product details",
      pagePublish: "List or edit",
      pageFavorites: "Saved products",
      pageMessages: "Messages",
      pageProfile: "Profile",
      pageInstall: "App installation",
      pageOther: "Another area",
      ratingLabel: "Overall rating",
      descriptionLabel: "What happened or what would you improve?",
      stepsLabel: "Steps to reproduce the issue",
      optional: "(optional)",
      privacy: "Do not include passwords, codes, ID numbers, addresses or private conversations.",
      submit: "Send feedback",
      open: "Open",
      completed: "Journey completed! You can now send your feedback.",
      remaining: (count) => `${count} test${count === 1 ? "" : "s"} remaining.`,
      sending: "Sending feedback…",
      success: "Thank you! We received your feedback.",
      missingTable: "The beta SQL file must be run in Supabase first.",
      error: "We couldn't send your feedback. Please try again.",
      resetConfirm: "Reset all tests?"
    }
  }[language];

  const tasks = [
    {
      title: { es: "Instalá la aplicación", en: "Install the app" },
      description: { es: "Agregala a la pantalla de inicio y abrila desde el icono.", en: "Add it to your home screen and open it from the icon." },
      href: "index.html"
    },
    {
      title: { es: "Creá una cuenta o iniciá sesión", en: "Create an account or sign in" },
      description: { es: "Comprobá que los mensajes y errores sean claros.", en: "Check that messages and errors are clear." },
      href: "login.html"
    },
    {
      title: { es: "Buscá y elegí tu colegio", en: "Find and choose your school" },
      description: { es: "Probá por nombre conocido y por dirección.", en: "Try its familiar name and its address." },
      href: "index.html"
    },
    {
      title: { es: "Explorá productos y categorías", en: "Explore products and categories" },
      description: { es: "Usá búsqueda, condición, categoría y alcance.", en: "Use search, condition, category and scope." },
      href: "index.html#productos"
    },
    {
      title: { es: "Abrí el detalle de un producto", en: "Open a product detail" },
      description: { es: "Revisá fotos, datos, vendedor y botones.", en: "Review photos, details, seller and actions." },
      href: "index.html#productos"
    },
    {
      title: { es: "Guardá y eliminá un favorito", en: "Save and remove a favorite" },
      description: { es: "Confirmá que aparezca correctamente en Favoritos.", en: "Confirm it appears correctly under Saved." },
      href: "favoritos.html"
    },
    {
      title: { es: "Publicá un producto de prueba", en: "Create a test listing" },
      description: { es: "Completá campos, fotos y vista previa.", en: "Complete fields, photos and preview." },
      href: "publicar.html"
    },
    {
      title: { es: "Editá, pausá y reactivá", en: "Edit, pause and reactivate" },
      description: { es: "Probá el menú de una publicación propia.", en: "Test the menu on one of your listings." },
      href: "perfil.html"
    },
    {
      title: { es: "Iniciá una conversación", en: "Start a conversation" },
      description: { es: "Mandá un mensaje desde otra cuenta si es posible.", en: "Send a message from another account if possible." },
      href: "mensajes.html"
    },
    {
      title: { es: "Probá apariencia e idioma", en: "Test appearance and language" },
      description: { es: "Revisá modo claro, oscuro, español e inglés.", en: "Check light mode, dark mode, Spanish and English." },
      href: "index.html"
    }
  ];

  const elements = {
    completed: document.getElementById("completed-count"),
    form: document.getElementById("beta-feedback-form"),
    progress: document.getElementById("progress-bar"),
    progressMessage: document.getElementById("progress-message"),
    ratingOptions: document.getElementById("rating-options"),
    reset: document.getElementById("reset-tasks"),
    status: document.getElementById("feedback-status"),
    submit: document.getElementById("feedback-submit"),
    taskList: document.getElementById("beta-task-list")
  };

  let completedTasks = loadCompletedTasks();

  applyCopy();
  renderRatings();
  renderTasks();
  elements.reset.addEventListener("click", resetTasks);
  elements.form.addEventListener("submit", submitFeedback);

  function applyCopy() {
    document.querySelectorAll("[data-copy]").forEach((element) => {
      const value = copy[element.dataset.copy];
      if (typeof value === "string") element.textContent = value;
    });
    document.querySelectorAll("[data-placeholder-es]").forEach((element) => {
      element.placeholder = language === "en"
        ? element.dataset.placeholderEn
        : element.dataset.placeholderEs;
    });
  }

  function renderRatings() {
    elements.ratingOptions.innerHTML = Array.from({ length: 10 }, (_, index) => {
      const value = index + 1;
      return `
        <label>
          <input type="radio" name="rating" value="${value}" required />
          <span>${value}</span>
        </label>
      `;
    }).join("");
  }

  function renderTasks() {
    elements.taskList.innerHTML = tasks.map((task, index) => {
      const checked = completedTasks.includes(index);
      return `
        <article class="beta-task${checked ? " is-complete" : ""}">
          <input
            type="checkbox"
            id="beta-task-${index}"
            data-task-index="${index}"
            ${checked ? "checked" : ""}
            aria-label="${task.title[language]}"
          />
          <label for="beta-task-${index}">
            <strong>${task.title[language]}</strong>
            <p>${task.description[language]}</p>
          </label>
          <a href="${task.href}">${copy.open}</a>
        </article>
      `;
    }).join("");

    elements.taskList.querySelectorAll("[data-task-index]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const index = Number(checkbox.dataset.taskIndex);
        completedTasks = checkbox.checked
          ? [...new Set([...completedTasks, index])]
          : completedTasks.filter((item) => item !== index);
        saveCompletedTasks();
        renderTasks();
      });
    });
    updateProgress();
  }

  function updateProgress() {
    const total = completedTasks.length;
    const remaining = tasks.length - total;
    elements.completed.textContent = String(total);
    elements.progress.style.width = `${(total / tasks.length) * 100}%`;
    elements.progressMessage.textContent = remaining === 0 ? copy.completed : copy.remaining(remaining);
  }

  function loadCompletedTasks() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(stored)
        ? stored.filter((value) => Number.isInteger(value) && value >= 0 && value < tasks.length)
        : [];
    } catch {
      return [];
    }
  }

  function saveCompletedTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(completedTasks));
  }

  function resetTasks() {
    if (!window.confirm(copy.resetConfirm)) return;
    completedTasks = [];
    saveCompletedTasks();
    renderTasks();
  }

  function getDeviceInfo() {
    return {
      user_agent: navigator.userAgent.slice(0, 500),
      language: navigator.language,
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screen: `${window.screen.width}x${window.screen.height}`,
      standalone:
        window.matchMedia("(display-mode: standalone)").matches ||
        navigator.standalone === true
    };
  }

  async function submitFeedback(event) {
    event.preventDefault();
    elements.submit.disabled = true;
    setStatus(copy.sending);

    const user = await getCurrentUser(true);
    const data = new FormData(elements.form);
    const payload = {
      user_id: user?.id || null,
      feedback_type: document.getElementById("feedback-type").value,
      rating: Number(data.get("rating")),
      page_path: document.getElementById("feedback-page").value,
      description: document.getElementById("feedback-description").value.trim(),
      reproduction_steps: document.getElementById("feedback-steps").value.trim() || null,
      completed_tasks: completedTasks,
      device_info: getDeviceInfo()
    };

    const { error } = await client.from("beta_feedback").insert(payload);
    elements.submit.disabled = false;

    if (error) {
      const missing = error.code === "42P01" || /beta_feedback|schema cache/i.test(error.message || "");
      setStatus(missing ? copy.missingTable : copy.error, "error");
      return;
    }

    elements.form.reset();
    renderRatings();
    setStatus(copy.success, "success");
  }

  function setStatus(message, state = "") {
    elements.status.textContent = message;
    elements.status.dataset.state = state;
  }
})();
