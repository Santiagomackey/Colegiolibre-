(function () {
  "use strict";

  const client = window.colegioLibreSupabase;

  if (!client?.auth) {
    console.error("No se pudo inicializar Supabase.");
    return;
  }

  const allowedNextPages = new Set([
    "index.html",
    "admin.html",
    "perfil.html",
    "producto.html",
    "publicar.html",
    "favoritos.html",
    "mensajes.html",
    "colegio.html"
  ]);
  const params = new URLSearchParams(window.location.search);

  function resolveNextPage(rawValue) {
    if (!rawValue) return "index.html";

    try {
      const url = new URL(rawValue, window.location.href);
      if (window.location.origin !== "null" && url.origin !== window.location.origin) {
        return "index.html";
      }

      const page = url.pathname.split("/").filter(Boolean).pop() || "index.html";
      if (!allowedNextPages.has(page)) return "index.html";
      return `${page}${url.search}`;
    } catch (_error) {
      return "index.html";
    }
  }

  const nextPage = resolveNextPage(params.get("next"));
  const recoveryRequested =
    params.get("mode") === "recovery" ||
    window.location.hash.includes("type=recovery");

  const elements = {
    standardView: document.querySelector("#standard-auth-view"),
    recoveryView: document.querySelector("#recovery-request-view"),
    updateView: document.querySelector("#password-update-view"),
    tabs: [...document.querySelectorAll(".auth-tab")],
    title: document.querySelector("#auth-title"),
    description: document.querySelector("#auth-description"),
    form: document.querySelector("#auth-form"),
    email: document.querySelector("#auth-email"),
    password: document.querySelector("#auth-password"),
    confirmField: document.querySelector("#confirm-password-field"),
    confirmPassword: document.querySelector("#auth-password-confirm"),
    emailError: document.querySelector("#email-error"),
    passwordError: document.querySelector("#password-error"),
    confirmError: document.querySelector("#password-confirm-error"),
    passwordHealth: document.querySelector("#password-health"),
    strengthLabel: document.querySelector("#password-strength-label"),
    forgotButton: document.querySelector("#forgot-password-btn"),
    submit: document.querySelector("#auth-submit"),
    submitLabel: document.querySelector("#auth-submit .button-label"),
    message: document.querySelector("#auth-message"),
    switchLabel: document.querySelector("#auth-switch-label"),
    switchButton: document.querySelector("#auth-switch-btn"),
    recoveryBack: document.querySelector("#recovery-back-btn"),
    recoveryForm: document.querySelector("#recovery-request-form"),
    recoveryEmail: document.querySelector("#recovery-email"),
    recoveryEmailError: document.querySelector("#recovery-email-error"),
    recoverySubmit: document.querySelector("#recovery-submit"),
    recoveryMessage: document.querySelector("#recovery-message"),
    updateForm: document.querySelector("#password-update-form"),
    newPassword: document.querySelector("#new-password"),
    newPasswordConfirm: document.querySelector("#new-password-confirm"),
    newPasswordError: document.querySelector("#new-password-error"),
    newPasswordConfirmError: document.querySelector("#new-password-confirm-error"),
    updateSubmit: document.querySelector("#password-update-submit"),
    updateMessage: document.querySelector("#password-update-message")
  };

  let mode = "login";
  let busy = false;

  function setMessage(element, text = "", state = "info") {
    if (!element) return;
    element.textContent = text;
    element.dataset.state = state;
    element.hidden = !text;
  }

  function setFieldError(input, errorElement, text = "") {
    const field = input?.closest(".form-field");

    if (errorElement) errorElement.textContent = text;
    if (input) input.setAttribute("aria-invalid", text ? "true" : "false");
    field?.classList.toggle("has-error", Boolean(text));
  }

  function clearStandardErrors() {
    setFieldError(elements.email, elements.emailError);
    setFieldError(elements.password, elements.passwordError);
    setFieldError(elements.confirmPassword, elements.confirmError);
    setMessage(elements.message);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
  }

  function passwordScore(password) {
    if (!password) return 0;

    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password) && /[^a-zA-Z0-9]/.test(password)) score += 1;
    return Math.min(score, 4);
  }

  function updatePasswordStrength() {
    const score = passwordScore(elements.password.value);
    const labels = {
      0: "Usá al menos 8 caracteres.",
      1: "Contraseña débil. Sumá mayúsculas y números.",
      2: "Contraseña aceptable.",
      3: "Contraseña segura.",
      4: "Contraseña muy segura."
    };

    elements.passwordHealth.dataset.strength = String(score);
    elements.strengthLabel.textContent = labels[score];
  }

  function setButtonBusy(button, isBusy) {
    if (!button) return;
    button.disabled = isBusy;
    button.classList.toggle("is-loading", isBusy);
    button.setAttribute("aria-busy", isBusy ? "true" : "false");
  }

  function setStandardBusy(isBusy) {
    busy = isBusy;
    setButtonBusy(elements.submit, isBusy);
    elements.email.disabled = isBusy;
    elements.password.disabled = isBusy;
    elements.confirmPassword.disabled = isBusy || mode !== "register";
    elements.tabs.forEach((tab) => {
      tab.disabled = isBusy;
    });
    elements.switchButton.disabled = isBusy;
    elements.forgotButton.disabled = isBusy;
  }

  function setVisibleView(view) {
    elements.standardView.hidden = view !== "standard";
    elements.recoveryView.hidden = view !== "recovery";
    elements.updateView.hidden = view !== "update";
  }

  function setMode(nextMode, focus = true) {
    if (busy) return;

    mode = nextMode === "register" ? "register" : "login";
    const registering = mode === "register";

    clearStandardErrors();
    elements.form.reset();
    elements.confirmField.classList.toggle("is-reserved-hidden", !registering);
    elements.confirmField.setAttribute("aria-hidden", registering ? "false" : "true");
    elements.confirmPassword.required = registering;
    elements.confirmPassword.disabled = !registering;
    elements.passwordHealth.classList.toggle("is-reserved-hidden", !registering);
    elements.passwordHealth.setAttribute(
      "aria-hidden",
      registering ? "false" : "true"
    );
    elements.forgotButton.hidden = registering;
    elements.password.autocomplete = registering ? "new-password" : "current-password";
    elements.password.placeholder = registering
      ? "Mínimo 8 caracteres"
      : "Ingresá tu contraseña";

    elements.title.textContent = registering ? "Creá tu cuenta" : "Iniciar sesión";
    elements.description.textContent = registering
      ? "Registrate con tu email y elegí una contraseña segura."
      : "Ingresá con tu email y contraseña para continuar.";
    elements.submitLabel.textContent = registering ? "Crear cuenta" : "Iniciar sesión";
    elements.switchLabel.textContent = registering
      ? "¿Ya tenés una cuenta?"
      : "¿Todavía no tenés una cuenta?";
    elements.switchButton.textContent = registering ? "Iniciar sesión" : "Crear cuenta";

    elements.tabs.forEach((tab) => {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });

    updatePasswordStrength();
    if (focus) elements.email.focus();
  }

  function mapAuthError(error, context = "login") {
    const text = String(error?.message || error || "").toLowerCase();

    if (text.includes("invalid login credentials")) {
      return "El email o la contraseña no son correctos.";
    }
    if (text.includes("email not confirmed")) {
      return "Primero confirmá tu email desde el enlace que recibiste.";
    }
    if (
      text.includes("user already registered") ||
      text.includes("already been registered")
    ) {
      return "Ese email ya tiene una cuenta. Probá iniciar sesión.";
    }
    if (text.includes("password") && text.includes("at least")) {
      return "La contraseña debe tener al menos 8 caracteres.";
    }
    if (text.includes("same password")) {
      return "La contraseña nueva debe ser distinta de la anterior.";
    }
    if (text.includes("rate limit") || text.includes("too many requests")) {
      return "Hiciste varios intentos seguidos. Esperá unos minutos y probá de nuevo.";
    }
    if (
      text.includes("failed to fetch") ||
      text.includes("network") ||
      text.includes("supabase no está disponible")
    ) {
      return "No pudimos conectarnos. Revisá tu internet e intentá nuevamente.";
    }
    if (context === "register") {
      return "No pudimos crear la cuenta. Revisá los datos e intentá nuevamente.";
    }
    if (context === "recovery") {
      return "No pudimos completar la recuperación. Intentá nuevamente.";
    }
    return "No pudimos iniciar sesión. Intentá nuevamente.";
  }

  function validateStandardForm() {
    clearStandardErrors();

    const email = elements.email.value.trim();
    const password = elements.password.value;
    const confirmation = elements.confirmPassword.value;
    let valid = true;

    if (!email) {
      setFieldError(elements.email, elements.emailError, "Ingresá tu email.");
      valid = false;
    } else if (!isValidEmail(email)) {
      setFieldError(elements.email, elements.emailError, "Ingresá un email válido.");
      valid = false;
    }

    if (!password) {
      setFieldError(elements.password, elements.passwordError, "Ingresá tu contraseña.");
      valid = false;
    } else if (mode === "register" && password.length < 8) {
      setFieldError(
        elements.password,
        elements.passwordError,
        "Usá al menos 8 caracteres."
      );
      valid = false;
    }

    if (mode === "register") {
      if (!confirmation) {
        setFieldError(
          elements.confirmPassword,
          elements.confirmError,
          "Repetí tu contraseña."
        );
        valid = false;
      } else if (password !== confirmation) {
        setFieldError(
          elements.confirmPassword,
          elements.confirmError,
          "Las contraseñas no coinciden."
        );
        valid = false;
      }
    }

    if (!valid) {
      elements.form.querySelector('[aria-invalid="true"]')?.focus();
    }

    return valid;
  }

  function recoveryRedirectUrl() {
    const redirectUrl = new URL("login.html", window.location.href);
    redirectUrl.search = "?mode=recovery";
    if (nextPage !== "index.html") {
      redirectUrl.searchParams.set("next", nextPage);
    }
    redirectUrl.hash = "";
    return redirectUrl.href;
  }

  function confirmationRedirectUrl() {
    const redirectUrl = new URL("login.html", window.location.href);
    if (nextPage !== "index.html") {
      redirectUrl.searchParams.set("next", nextPage);
    }
    return redirectUrl.href;
  }

  async function submitLogin() {
    setStandardBusy(true);
    setMessage(elements.message, "Verificando tus datos…", "loading");

    try {
      const { error } = await client.auth.signInWithPassword({
        email: elements.email.value.trim(),
        password: elements.password.value
      });

      if (error) throw error;

      setMessage(elements.message, "Listo. Estamos abriendo tu cuenta…", "success");
      window.setTimeout(() => {
        window.location.assign(nextPage);
      }, 650);
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      setMessage(elements.message, mapAuthError(error, "login"), "error");
      setStandardBusy(false);
    }
  }

  async function submitRegistration() {
    setStandardBusy(true);
    setMessage(elements.message, "Creando tu cuenta…", "loading");

    try {
      const { data, error } = await client.auth.signUp({
        email: elements.email.value.trim(),
        password: elements.password.value,
        options: {
          emailRedirectTo: confirmationRedirectUrl()
        }
      });

      if (error) throw error;

      if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error("User already registered");
      }

      if (data?.session) {
        setMessage(elements.message, "Cuenta creada. Estamos abriendo ColegioLibre…", "success");
        window.setTimeout(() => {
          window.location.assign(nextPage);
        }, 850);
        return;
      }

      setMessage(
        elements.message,
        "Cuenta creada. Revisá tu email y tocá el enlace de confirmación para activarla.",
        "success"
      );
      elements.password.value = "";
      elements.confirmPassword.value = "";
      updatePasswordStrength();
      setStandardBusy(false);
    } catch (error) {
      console.error("Error al crear la cuenta:", error);
      setMessage(elements.message, mapAuthError(error, "register"), "error");
      setStandardBusy(false);
    }
  }

  function showRecoveryRequest() {
    if (busy) return;
    setVisibleView("recovery");
    elements.recoveryEmail.value = elements.email.value.trim();
    setFieldError(elements.recoveryEmail, elements.recoveryEmailError);
    setMessage(elements.recoveryMessage);
    window.setTimeout(() => elements.recoveryEmail.focus(), 0);
  }

  function showStandardView() {
    setVisibleView("standard");
    setMessage(elements.recoveryMessage);
    window.setTimeout(() => elements.email.focus(), 0);
  }

  function showPasswordUpdate() {
    setVisibleView("update");
    setMessage(elements.updateMessage);
    window.setTimeout(() => elements.newPassword.focus(), 0);
  }

  async function submitRecoveryRequest(event) {
    event.preventDefault();

    const email = elements.recoveryEmail.value.trim();
    setFieldError(elements.recoveryEmail, elements.recoveryEmailError);
    setMessage(elements.recoveryMessage);

    if (!email || !isValidEmail(email)) {
      setFieldError(
        elements.recoveryEmail,
        elements.recoveryEmailError,
        "Ingresá un email válido."
      );
      elements.recoveryEmail.focus();
      return;
    }

    setButtonBusy(elements.recoverySubmit, true);
    elements.recoveryEmail.disabled = true;
    setMessage(elements.recoveryMessage, "Enviando el enlace seguro…", "loading");

    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryRedirectUrl()
      });

      if (error) throw error;

      setMessage(
        elements.recoveryMessage,
        "Si existe una cuenta con ese email, vas a recibir un enlace para cambiar la contraseña. Revisá también Spam.",
        "success"
      );
    } catch (error) {
      console.error("Error al recuperar la contraseña:", error);
      setMessage(elements.recoveryMessage, mapAuthError(error, "recovery"), "error");
    } finally {
      setButtonBusy(elements.recoverySubmit, false);
      elements.recoveryEmail.disabled = false;
    }
  }

  async function submitPasswordUpdate(event) {
    event.preventDefault();

    const password = elements.newPassword.value;
    const confirmation = elements.newPasswordConfirm.value;
    setFieldError(elements.newPassword, elements.newPasswordError);
    setFieldError(
      elements.newPasswordConfirm,
      elements.newPasswordConfirmError
    );
    setMessage(elements.updateMessage);

    if (password.length < 8) {
      setFieldError(
        elements.newPassword,
        elements.newPasswordError,
        "Usá al menos 8 caracteres."
      );
      elements.newPassword.focus();
      return;
    }
    if (password !== confirmation) {
      setFieldError(
        elements.newPasswordConfirm,
        elements.newPasswordConfirmError,
        "Las contraseñas no coinciden."
      );
      elements.newPasswordConfirm.focus();
      return;
    }

    setButtonBusy(elements.updateSubmit, true);
    elements.newPassword.disabled = true;
    elements.newPasswordConfirm.disabled = true;
    setMessage(elements.updateMessage, "Guardando tu contraseña…", "loading");

    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;

      setMessage(
        elements.updateMessage,
        "Contraseña actualizada. Ya podés continuar con tu cuenta.",
        "success"
      );
      window.history.replaceState({}, document.title, "login.html");
      window.setTimeout(() => {
        window.location.assign(nextPage);
      }, 950);
    } catch (error) {
      console.error("Error al actualizar la contraseña:", error);
      setMessage(elements.updateMessage, mapAuthError(error, "recovery"), "error");
      setButtonBusy(elements.updateSubmit, false);
      elements.newPassword.disabled = false;
      elements.newPasswordConfirm.disabled = false;
    }
  }

  function configurePasswordToggles() {
    document.querySelectorAll("[data-password-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordTarget);
        if (!input) return;

        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.setAttribute("aria-pressed", showing ? "false" : "true");
        button.setAttribute(
          "aria-label",
          showing ? "Mostrar contraseña" : "Ocultar contraseña"
        );
        input.focus();
      });
    });
  }

  async function checkExistingSession() {
    if (recoveryRequested) return;

    try {
      const { data } = await client.auth.getUser();
      if (!data?.user) return;

      setMessage(
        elements.message,
        `Ya iniciaste sesión como ${data.user.email}. Abriendo tu cuenta…`,
        "info"
      );
      window.setTimeout(() => {
        window.location.assign(nextPage);
      }, 700);
    } catch (error) {
      console.error("No se pudo comprobar la sesión:", error);
    }
  }

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  });

  elements.switchButton.addEventListener("click", () => {
    setMode(mode === "login" ? "register" : "login");
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || !validateStandardForm()) return;

    if (mode === "register") {
      submitRegistration();
    } else {
      submitLogin();
    }
  });

  elements.email.addEventListener("input", () => {
    setFieldError(elements.email, elements.emailError);
    setMessage(elements.message);
  });
  elements.password.addEventListener("input", () => {
    setFieldError(elements.password, elements.passwordError);
    setMessage(elements.message);
    updatePasswordStrength();
  });
  elements.confirmPassword.addEventListener("input", () => {
    setFieldError(elements.confirmPassword, elements.confirmError);
    setMessage(elements.message);
  });
  elements.recoveryEmail.addEventListener("input", () => {
    setFieldError(elements.recoveryEmail, elements.recoveryEmailError);
  });
  elements.newPassword.addEventListener("input", () => {
    setFieldError(elements.newPassword, elements.newPasswordError);
  });
  elements.newPasswordConfirm.addEventListener("input", () => {
    setFieldError(
      elements.newPasswordConfirm,
      elements.newPasswordConfirmError
    );
  });

  elements.forgotButton.addEventListener("click", showRecoveryRequest);
  elements.recoveryBack.addEventListener("click", showStandardView);
  elements.recoveryForm.addEventListener("submit", submitRecoveryRequest);
  elements.updateForm.addEventListener("submit", submitPasswordUpdate);

  configurePasswordToggles();
  setMode(params.get("view") === "register" ? "register" : "login", false);

  if (recoveryRequested) {
    showPasswordUpdate();
  }

  const authListener = client.auth.onAuthStateChange?.((event) => {
    if (event === "PASSWORD_RECOVERY") showPasswordUpdate();
  });

  window.addEventListener(
    "pagehide",
    () => authListener?.data?.subscription?.unsubscribe?.(),
    { once: true }
  );

  checkExistingSession();
})();
