(function () {
  "use strict";

  const { escapeHtml, formatDateTime, getCurrentUser, isAdminUser } =
    window.colegioLibreApi;

  const elements = {
    accountSearch: document.getElementById("account-search"),
    accountsList: document.getElementById("accounts-list"),
    automaticList: document.getElementById("automatic-list"),
    automaticSearch: document.getElementById("automatic-search"),
    automaticStatus: document.getElementById("automatic-status-filter"),
    copyGeneratedCode: document.getElementById("copy-generated-code"),
    generatedCode: document.getElementById("generated-code"),
    generatedCodeValue: document.getElementById("generated-code-value"),
    inviteExpiresAt: document.getElementById("invite-expires-at"),
    inviteForm: document.getElementById("invite-form"),
    inviteLabel: document.getElementById("invite-label"),
    inviteMaxUses: document.getElementById("invite-max-uses"),
    inviteSchoolCode: document.getElementById("invite-school-code"),
    invitesList: document.getElementById("invites-list"),
    pendingCount: document.getElementById("pending-count"),
    pendingAutomaticBadge: document.getElementById(
      "pending-automatic-badge"
    ),
    pendingVerificationsBadge: document.getElementById(
      "pending-verifications-badge"
    ),
    refresh: document.getElementById("refresh-current-section"),
    reportsList: document.getElementById("reports-list"),
    reportSearch: document.getElementById("report-search"),
    reportStatus: document.getElementById("report-status-filter"),
    resolvedCount: document.getElementById("resolved-count"),
    reviewingCount: document.getElementById("reviewing-count"),
    ruleField: document.getElementById("rule-field"),
    ruleForm: document.getElementById("rule-form"),
    ruleMatchType: document.getElementById("rule-match-type"),
    rulePattern: document.getElementById("rule-pattern"),
    ruleReason: document.getElementById("rule-reason"),
    ruleSeverity: document.getElementById("rule-severity"),
    rulesList: document.getElementById("rules-list"),
    toast: document.getElementById("moderation-toast"),
    verificationSearch: document.getElementById("verification-search"),
    verificationStatus: document.getElementById("verification-status-filter"),
    verificationsList: document.getElementById("verifications-list")
  };

  const state = {
    accounts: [],
    currentTab: "reports",
    currentUser: null,
    generatedPlainCode: "",
    invites: [],
    memberships: [],
    moderationProducts: new Map(),
    moderationReviews: [],
    profiles: new Map(),
    reports: [],
    rules: []
  };

  bindEvents();
  setDefaultInviteExpiry();
  void initModeration();

  async function initModeration() {
    state.currentUser = await getCurrentUser(true);
    if (!state.currentUser) {
      window.location.replace(
        `login.html?next=${encodeURIComponent("moderacion.html")}`
      );
      return;
    }

    if (!(await isAdminUser())) {
      window.location.replace("index.html");
      return;
    }

    await Promise.all([loadReports(), loadAutomaticReviews()]);
  }

  function bindEvents() {
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.adminTab));
    });
    elements.refresh.addEventListener("click", () => loadCurrentSection());
    elements.reportStatus.addEventListener("change", renderReports);
    elements.reportSearch.addEventListener("input", renderReports);
    elements.automaticStatus.addEventListener("change", renderAutomaticReviews);
    elements.automaticSearch.addEventListener("input", renderAutomaticReviews);
    elements.verificationStatus.addEventListener(
      "change",
      renderVerifications
    );
    elements.verificationSearch.addEventListener(
      "input",
      renderVerifications
    );
    elements.accountSearch.addEventListener("input", renderAccounts);
    elements.inviteForm.addEventListener("submit", createInviteCode);
    elements.ruleForm.addEventListener("submit", createRule);
    elements.copyGeneratedCode.addEventListener("click", copyGeneratedCode);
  }

  async function activateTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.adminTab === tab);
    });
    document.querySelectorAll("[data-admin-section]").forEach((section) => {
      section.hidden = section.dataset.adminSection !== tab;
    });
    await loadCurrentSection();
  }

  async function loadCurrentSection() {
    elements.refresh.disabled = true;
    const loaders = {
      accounts: loadAccounts,
      automatic: loadAutomaticReviews,
      invites: loadInvites,
      reports: loadReports,
      rules: loadRules,
      verifications: loadVerifications
    };
    try {
      await loaders[state.currentTab]?.();
    } finally {
      elements.refresh.disabled = false;
    }
  }

  async function loadProfiles(ids) {
    const missingIds = [
      ...new Set(
        ids.filter(Boolean).filter((profileId) => !state.profiles.has(profileId))
      )
    ];
    if (!missingIds.length) return;

    const { data, error } = await window.colegioLibreSupabase
      .from("profiles")
      .select(
        "id, name, school_code, school_name, account_status, school_verification_status"
      )
      .in("id", missingIds);

    if (error) {
      console.warn("No se pudieron cargar algunos perfiles:", error);
      return;
    }

    (data || []).forEach((profile) => state.profiles.set(profile.id, profile));
  }

  async function loadAutomaticReviews() {
    const { data, error } = await window.colegioLibreSupabase
      .from("product_moderation_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      showToast(
        error.message ||
          "No se pudo cargar la revisión automática. Ejecutá primero el archivo SQL 4."
      );
      return;
    }

    state.moderationReviews = data || [];
    await Promise.all([
      loadProfiles(state.moderationReviews.map((review) => review.user_id)),
      loadModerationProducts(
        state.moderationReviews.map((review) => review.product_id)
      )
    ]);
    renderAutomaticBadge();
    renderAutomaticReviews();
  }

  async function loadModerationProducts(ids) {
    const productIds = [...new Set(ids.filter(Boolean))];
    if (!productIds.length) return;

    const { data, error } = await window.colegioLibreSupabase
      .from("products")
      .select(
        "id, title, image_url, category, price, status, moderation_status, moderation_reason"
      )
      .in("id", productIds);

    if (error) {
      console.warn("No se pudieron cargar los productos moderados:", error);
      return;
    }

    (data || []).forEach((product) =>
      state.moderationProducts.set(product.id, product)
    );
  }

  function renderAutomaticBadge() {
    elements.pendingAutomaticBadge.textContent = String(
      state.moderationReviews.filter((review) =>
        ["pending", "manual_review"].includes(review.decision)
      ).length
    );
  }

  function renderAutomaticReviews() {
    const status = elements.automaticStatus.value;
    const search = normalizeText(elements.automaticSearch.value);
    const seenProducts = new Set();
    const reviews = state.moderationReviews.filter((review) => {
      if (seenProducts.has(review.product_id)) return false;
      seenProducts.add(review.product_id);

      const product = state.moderationProducts.get(review.product_id);
      const profile = state.profiles.get(review.user_id);
      const matchesStatus =
        status === "all" ||
        (status === "open"
          ? ["pending", "manual_review"].includes(review.decision)
          : review.decision === status);
      const haystack = normalizeText(
        `${product?.title || ""} ${product?.category || ""} ${
          profile?.name || ""
        } ${review.reason || ""}`
      );
      return matchesStatus && (!search || haystack.includes(search));
    });

    if (!reviews.length) {
      elements.automaticList.innerHTML = emptyCard(
        status === "open"
          ? "No hay publicaciones esperando una decisión."
          : "No hay resultados para estos filtros."
      );
      return;
    }

    elements.automaticList.innerHTML = reviews
      .map((review) => {
        const product = state.moderationProducts.get(review.product_id);
        const profile = state.profiles.get(review.user_id);
        return `
          <article class="admin-card" data-automatic-product="${escapeHtml(
            review.product_id
          )}">
            <div class="admin-card__main">
              <span class="status-pill" data-status="${escapeHtml(
                review.decision
              )}">${escapeHtml(moderationDecisionLabel(review.decision))}</span>
              <h3>${escapeHtml(product?.title || "Publicación eliminada")}</h3>
              <p>${escapeHtml(review.reason || "Sin motivo informado.")}</p>
              <div class="admin-card__meta">
                <span>${escapeHtml(profile?.name || "Usuario")}</span>
                <span>${escapeHtml(product?.category || "Sin categoría")}</span>
                <span>Riesgo: ${escapeHtml(review.severity || "low")}</span>
                <span>${escapeHtml(formatDateTime(review.created_at))}</span>
              </div>
              ${
                product
                  ? `<a href="producto.html?id=${encodeURIComponent(
                      product.id
                    )}" target="_blank" rel="noopener">Ver publicación</a>`
                  : ""
              }
            </div>
            ${
              ["pending", "manual_review"].includes(review.decision)
                ? `
                  <div class="admin-card__actions">
                    <button type="button" data-automatic-decision="approved">Aprobar</button>
                    <button class="danger-button" type="button" data-automatic-decision="rejected">Bloquear</button>
                  </div>
                `
                : ""
            }
          </article>
        `;
      })
      .join("");

    elements.automaticList
      .querySelectorAll("[data-automatic-decision]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const card = button.closest("[data-automatic-product]");
          reviewAutomaticProduct(
            card.dataset.automaticProduct,
            button.dataset.automaticDecision,
            button
          );
        });
      });
  }

  async function reviewAutomaticProduct(productId, decision, button) {
    const note = window.prompt(
      decision === "approved"
        ? "Motivo de aprobación:"
        : "Motivo del bloqueo:"
    );
    if (!note?.trim()) return;

    button.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "review_product_moderation",
      {
        target_product_id: productId,
        next_decision: decision,
        moderator_note: note.trim()
      }
    );

    if (error) {
      button.disabled = false;
      showToast(error.message || "No se pudo revisar la publicación.");
      return;
    }

    await loadAutomaticReviews();
    showToast(
      decision === "approved"
        ? "Publicación aprobada."
        : "Publicación bloqueada."
    );
  }

  async function loadReports() {
    const { data, error } = await window.colegioLibreSupabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      showToast(error.message || "No se pudieron cargar los reportes.");
      return;
    }

    state.reports = data || [];
    await loadProfiles(
      state.reports.flatMap((report) => [
        report.reporter_id,
        report.reported_user_id
      ])
    );
    renderReportMetrics();
    renderReports();
  }

  function renderReportMetrics() {
    elements.pendingCount.textContent = String(
      state.reports.filter((report) => report.status === "pending").length
    );
    elements.reviewingCount.textContent = String(
      state.reports.filter((report) => report.status === "reviewing").length
    );
    elements.resolvedCount.textContent = String(
      state.reports.filter((report) => report.status === "resolved").length
    );
  }

  function renderReports() {
    const status = elements.reportStatus.value;
    const search = normalizeText(elements.reportSearch.value);
    const reports = state.reports.filter((report) => {
      const reporter = state.profiles.get(report.reporter_id);
      const reported = state.profiles.get(report.reported_user_id);
      const matchesStatus =
        status === "all" ||
        (status === "open"
          ? ["pending", "reviewing"].includes(report.status)
          : report.status === status);
      const haystack = normalizeText(
        `${report.reason} ${report.details || ""} ${report.target_type} ${
          reporter?.name || ""
        } ${reported?.name || ""}`
      );
      return matchesStatus && (!search || haystack.includes(search));
    });

    if (!reports.length) {
      elements.reportsList.innerHTML = emptyCard(
        "No hay reportes para estos filtros."
      );
      return;
    }

    elements.reportsList.innerHTML = "";
    reports.forEach((report) => {
      const card = document.createElement("article");
      const reporter = state.profiles.get(report.reporter_id);
      const reported = state.profiles.get(report.reported_user_id);
      card.className = "report-card";
      card.innerHTML = `
        <div class="report-card__head">
          <div>
            <span class="report-card__type">${escapeHtml(targetLabel(report.target_type))}</span>
            <h2>${escapeHtml(reasonLabel(report.reason))}</h2>
          </div>
          <span class="report-card__status" data-status="${escapeHtml(report.status)}">${escapeHtml(statusLabel(report.status))}</span>
        </div>
        <div class="report-card__meta">
          <span>Reportó: ${escapeHtml(reporter?.name || "Usuario")}</span>
          <span>Reportado: ${escapeHtml(reported?.name || "No especificado")}</span>
          <span>${escapeHtml(formatDateTime(report.created_at))}</span>
        </div>
        <p class="report-card__details">${escapeHtml(report.details || "Sin detalles adicionales.")}</p>
        ${renderEvidence(report)}
        <div class="report-card__links">
          ${report.product_id ? `<a href="producto.html?id=${encodeURIComponent(report.product_id)}" target="_blank" rel="noopener">Ver producto</a>` : ""}
          ${report.reported_user_id ? `<a href="perfil-publico.html?id=${encodeURIComponent(report.reported_user_id)}" target="_blank" rel="noopener">Ver perfil</a>` : ""}
        </div>
        ${
          ["pending", "reviewing"].includes(report.status)
            ? `
              <div class="report-card__actions">
                <textarea data-resolution-note maxlength="1000" placeholder="Nota interna de resolución"></textarea>
                ${report.status === "pending" ? '<button type="button" data-next-status="reviewing">Tomar reporte</button>' : ""}
                ${report.product_id ? '<button type="button" data-next-status="pause_product">Pausar publicación</button>' : ""}
                <button type="button" data-next-status="dismissed">Descartar</button>
                <button type="button" data-next-status="resolved">Resolver</button>
              </div>
            `
            : ""
        }
      `;
      card.querySelectorAll("[data-next-status]").forEach((button) => {
        button.addEventListener("click", () =>
          updateReport(
            report,
            button.dataset.nextStatus,
            card.querySelector("[data-resolution-note]")?.value.trim(),
            button
          )
        );
      });
      elements.reportsList.appendChild(card);
    });
  }

  async function updateReport(report, nextStatus, note, button) {
    if (
      nextStatus === "resolved" &&
      !note &&
      !window.confirm("¿Resolver este reporte sin una nota interna?")
    ) {
      return;
    }
    button.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "moderate_safety_report",
      {
        target_report: report.id,
        moderation_action: nextStatus,
        moderator_note: note || null
      }
    );
    if (error) {
      button.disabled = false;
      showToast(error.message || "No se pudo actualizar el reporte.");
      return;
    }
    await loadReports();
    showToast("Reporte actualizado.");
  }

  async function loadVerifications(options = {}) {
    const { data, error } = await window.colegioLibreSupabase
      .from("school_memberships")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      showToast(
        error.message || "No se pudieron cargar las verificaciones."
      );
      return;
    }

    state.memberships = data || [];
    await loadProfiles(state.memberships.map((membership) => membership.user_id));
    renderPendingVerificationBadge();
    if (options.render !== false) renderVerifications();
  }

  function renderPendingVerificationBadge() {
    elements.pendingVerificationsBadge.textContent = String(
      state.memberships.filter((membership) => membership.status === "pending")
        .length
    );
  }

  function renderVerifications() {
    const status = elements.verificationStatus.value;
    const search = normalizeText(elements.verificationSearch.value);
    const memberships = state.memberships.filter((membership) => {
      const profile = state.profiles.get(membership.user_id);
      const haystack = normalizeText(
        `${profile?.name || ""} ${profile?.school_name || ""} ${
          membership.school_code
        }`
      );
      return (
        (status === "all" || membership.status === status) &&
        (!search || haystack.includes(search))
      );
    });

    if (!memberships.length) {
      elements.verificationsList.innerHTML = emptyCard(
        "No hay solicitudes con estos filtros."
      );
      return;
    }

    elements.verificationsList.innerHTML = memberships
      .map((membership) => {
        const profile = state.profiles.get(membership.user_id);
        return `
          <article class="admin-card" data-membership-id="${membership.id}">
            <div class="admin-card__main">
              <span class="status-pill" data-status="${escapeHtml(membership.status)}">${escapeHtml(membershipStatusLabel(membership.status))}</span>
              <h3>${escapeHtml(profile?.name || "Usuario")}</h3>
              <p>${escapeHtml(profile?.school_name || "Colegio sin nombre")}</p>
              <div class="admin-card__meta">
                <span>Código: ${escapeHtml(membership.school_code)}</span>
                <span>Solicitud: ${escapeHtml(formatDateTime(membership.updated_at))}</span>
                ${membership.verification_method ? `<span>Método: ${escapeHtml(methodLabel(membership.verification_method))}</span>` : ""}
              </div>
              ${membership.rejection_reason ? `<div class="admin-card__note">${escapeHtml(membership.rejection_reason)}</div>` : ""}
            </div>
            <div class="admin-card__actions">
              ${
                membership.status === "pending"
                  ? `
                    <button type="button" data-review-decision="verified">Aprobar</button>
                    <button class="danger-button" type="button" data-review-decision="rejected">Rechazar</button>
                  `
                  : ""
              }
              <button class="secondary-button" type="button" data-create-code="${escapeHtml(membership.school_code)}">Crear código para este colegio</button>
            </div>
          </article>
        `;
      })
      .join("");

    elements.verificationsList
      .querySelectorAll("[data-review-decision]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const card = button.closest("[data-membership-id]");
          reviewMembership(
            card.dataset.membershipId,
            button.dataset.reviewDecision,
            button
          );
        });
      });
    elements.verificationsList.querySelectorAll("[data-create-code]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          elements.inviteSchoolCode.value = button.dataset.createCode;
          void activateTab("invites");
          elements.inviteLabel.focus();
        });
      }
    );
  }

  async function reviewMembership(membershipId, decision, button) {
    let note = null;
    if (decision === "rejected") {
      note = window.prompt(
        "Escribí el motivo del rechazo. La persona podrá verlo:"
      );
      if (!note) return;
    } else if (!window.confirm("¿Aprobar esta verificación escolar?")) {
      return;
    }

    button.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "review_school_verification",
      {
        target_membership: membershipId,
        decision,
        moderator_note: note
      }
    );
    if (error) {
      button.disabled = false;
      showToast(error.message || "No se pudo revisar la solicitud.");
      return;
    }
    await loadVerifications();
    showToast(
      decision === "verified"
        ? "Verificación aprobada."
        : "Solicitud rechazada."
    );
  }

  async function createInviteCode(event) {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );
    const validUntil = new Date(elements.inviteExpiresAt.value);
    if (Number.isNaN(validUntil.getTime())) {
      showToast("Elegí una fecha de vencimiento válida.");
      return;
    }

    submitButton.disabled = true;
    const { data, error } = await window.colegioLibreSupabase.rpc(
      "create_school_invite_code",
      {
        target_school_code: elements.inviteSchoolCode.value
          .trim()
          .toUpperCase(),
        invite_label: elements.inviteLabel.value.trim() || null,
        allowed_uses: Number(elements.inviteMaxUses.value),
        valid_until: validUntil.toISOString()
      }
    );
    submitButton.disabled = false;

    if (error) {
      showToast(error.message || "No se pudo crear el código.");
      return;
    }

    const created = Array.isArray(data) ? data[0] : data;
    state.generatedPlainCode = created?.invitation_code || "";
    elements.generatedCodeValue.textContent = state.generatedPlainCode;
    elements.generatedCode.hidden = !state.generatedPlainCode;
    elements.inviteLabel.value = "";
    elements.inviteMaxUses.value = "1";
    setDefaultInviteExpiry();
    await loadInvites();
    showToast("Código temporal creado.");
  }

  async function copyGeneratedCode() {
    if (!state.generatedPlainCode) return;
    try {
      await navigator.clipboard.writeText(state.generatedPlainCode);
      showToast("Código copiado.");
    } catch (_error) {
      showToast("Seleccioná el código y copialo manualmente.");
    }
  }

  async function loadInvites() {
    const { data, error } = await window.colegioLibreSupabase
      .from("school_invite_codes")
      .select(
        "id, school_code, code_prefix, label, max_uses, used_count, expires_at, is_active, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      showToast(error.message || "No se pudieron cargar las invitaciones.");
      return;
    }
    state.invites = data || [];
    renderInvites();
  }

  function renderInvites() {
    if (!state.invites.length) {
      elements.invitesList.innerHTML = emptyCard(
        "Todavía no creaste códigos temporales."
      );
      return;
    }
    elements.invitesList.innerHTML = state.invites
      .map((invite) => {
        const isAvailable =
          invite.is_active &&
          new Date(invite.expires_at).getTime() > Date.now() &&
          invite.used_count < invite.max_uses;
        return `
          <article class="admin-card admin-card--compact">
            <div class="admin-card__main">
              <span class="status-pill" data-status="${isAvailable ? "verified" : "rejected"}">${isAvailable ? "Activo" : "Cerrado"}</span>
              <h3>${escapeHtml(invite.code_prefix)}</h3>
              <p>${escapeHtml(invite.label || "Sin etiqueta")}</p>
              <div class="admin-card__meta">
                <span>Colegio: ${escapeHtml(invite.school_code)}</span>
                <span>Usos: ${invite.used_count}/${invite.max_uses}</span>
                <span>Vence: ${escapeHtml(formatDateTime(invite.expires_at))}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function createRule(event) {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );
    submitButton.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "create_product_rule",
      {
        rule_field: elements.ruleField.value,
        rule_match_type: elements.ruleMatchType.value,
        rule_pattern: elements.rulePattern.value.trim(),
        rule_severity: elements.ruleSeverity.value,
        rule_reason: elements.ruleReason.value.trim()
      }
    );
    submitButton.disabled = false;
    if (error) {
      showToast(error.message || "No se pudo crear la regla.");
      return;
    }
    event.currentTarget.reset();
    await loadRules();
    showToast("Regla agregada.");
  }

  async function loadRules() {
    const { data, error } = await window.colegioLibreSupabase
      .from("prohibited_product_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      showToast(error.message || "No se pudieron cargar las reglas.");
      return;
    }
    state.rules = data || [];
    renderRules();
  }

  function renderRules() {
    if (!state.rules.length) {
      elements.rulesList.innerHTML = emptyCard(
        "No hay reglas configuradas todavía."
      );
      return;
    }
    elements.rulesList.innerHTML = state.rules
      .map(
        (rule) => `
          <article class="admin-card admin-card--compact" data-rule-id="${rule.id}">
            <div class="admin-card__main">
              <span class="status-pill" data-status="${rule.is_active ? "verified" : "rejected"}">${rule.is_active ? "Activa" : "Desactivada"}</span>
              <h3>${escapeHtml(rule.pattern)}</h3>
              <p>${escapeHtml(rule.reason)}</p>
              <div class="admin-card__meta">
                <span>Campo: ${escapeHtml(fieldLabel(rule.field))}</span>
                <span>Coincidencia: ${escapeHtml(matchLabel(rule.match_type))}</span>
                <span>Acción: ${rule.severity === "block" ? "Bloquear" : "Revisar"}</span>
              </div>
            </div>
            <div class="admin-card__actions">
              <button class="secondary-button" type="button" data-toggle-rule="${String(!rule.is_active)}">${rule.is_active ? "Desactivar" : "Activar"}</button>
            </div>
          </article>
        `
      )
      .join("");
    elements.rulesList.querySelectorAll("[data-toggle-rule]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = button.closest("[data-rule-id]");
        toggleRule(
          card.dataset.ruleId,
          button.dataset.toggleRule === "true",
          button
        );
      });
    });
  }

  async function toggleRule(ruleId, nextActive, button) {
    button.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "toggle_product_rule",
      { target_rule: ruleId, next_active: nextActive }
    );
    if (error) {
      button.disabled = false;
      showToast(error.message || "No se pudo modificar la regla.");
      return;
    }
    await loadRules();
    showToast(nextActive ? "Regla activada." : "Regla desactivada.");
  }

  async function loadAccounts() {
    const { data, error } = await window.colegioLibreSupabase
      .from("profiles")
      .select(
        "id, name, school_code, school_name, account_status, moderation_strikes, moderation_restriction_until, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      showToast(error.message || "No se pudieron cargar las cuentas.");
      return;
    }
    state.accounts = data || [];
    renderAccounts();
  }

  function renderAccounts() {
    const search = normalizeText(elements.accountSearch.value);
    const accounts = state.accounts.filter((profile) =>
      normalizeText(
        `${profile.name || ""} ${profile.school_name || ""} ${
          profile.school_code || ""
        }`
      ).includes(search)
    );
    if (!accounts.length) {
      elements.accountsList.innerHTML = emptyCard(
        "No se encontraron cuentas."
      );
      return;
    }
    elements.accountsList.innerHTML = accounts
      .map(
        (profile) => `
          <article class="admin-card admin-card--compact" data-account-id="${profile.id}">
            <div class="admin-card__main">
              <span class="status-pill" data-status="${escapeHtml(profile.account_status || "active")}">${escapeHtml(accountStatusLabel(profile.account_status))}</span>
              <h3>${escapeHtml(profile.name || "Usuario")}</h3>
              <p>${escapeHtml(profile.school_name || "Sin colegio")}</p>
              <div class="admin-card__meta">
                <span>${escapeHtml(profile.school_code || "Sin código")}</span>
                <span>Alertas: ${Number(profile.moderation_strikes || 0)}</span>
                ${
                  profile.moderation_restriction_until
                    ? `<span>Restricción hasta ${escapeHtml(
                        formatDateTime(profile.moderation_restriction_until)
                      )}</span>`
                    : ""
                }
              </div>
            </div>
            ${
              profile.id === state.currentUser.id
                ? '<span class="admin-self-label">Tu cuenta administradora</span>'
                : `
                  <div class="admin-card__actions">
                    ${
                      profile.account_status === "active"
                        ? `
                          <button type="button" data-account-status="suspended">Suspender</button>
                          <button class="danger-button" type="button" data-account-status="banned">Bloquear</button>
                        `
                        : '<button type="button" data-account-status="active">Reactivar</button>'
                    }
                  </div>
                `
            }
          </article>
        `
      )
      .join("");
    elements.accountsList.querySelectorAll("[data-account-status]").forEach(
      (button) => {
        button.addEventListener("click", () => {
          const card = button.closest("[data-account-id]");
          moderateAccount(
            card.dataset.accountId,
            button.dataset.accountStatus,
            button
          );
        });
      }
    );
  }

  async function moderateAccount(userId, nextStatus, button) {
    const reason = window.prompt(
      nextStatus === "active"
        ? "Motivo de la reactivación:"
        : "Motivo de la restricción:"
    );
    if (!reason) return;
    button.disabled = true;
    const { error } = await window.colegioLibreSupabase.rpc(
      "moderate_user_account",
      {
        target_user: userId,
        next_account_status: nextStatus,
        moderator_reason: reason
      }
    );
    if (error) {
      button.disabled = false;
      showToast(error.message || "No se pudo actualizar la cuenta.");
      return;
    }
    await loadAccounts();
    showToast("Estado de cuenta actualizado.");
  }

  function setDefaultInviteExpiry() {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    elements.inviteExpiresAt.value = localDate.toISOString().slice(0, 16);
  }

  function renderEvidence(report) {
    const messages = Array.isArray(report.evidence?.messages)
      ? report.evidence.messages
      : [];
    if (!messages.length) return "";
    return `
      <details class="report-evidence">
        <summary>Ver últimos ${messages.length} mensajes adjuntos</summary>
        <div>
          ${messages
            .map((message) => {
              const sender = state.profiles.get(message.sender_id);
              return `
                <article>
                  <strong>${escapeHtml(sender?.name || "Usuario")}</strong>
                  <span>${escapeHtml(formatDateTime(message.created_at))}</span>
                  <p>${escapeHtml(message.body || "")}</p>
                </article>
              `;
            })
            .join("")}
        </div>
      </details>
    `;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function emptyCard(message) {
    return `<div class="empty-reports">${escapeHtml(message)}</div>`;
  }

  function targetLabel(type) {
    return { conversation: "Conversación", product: "Publicación", user: "Usuario" }[type] || "Reporte";
  }

  function statusLabel(status) {
    return { dismissed: "Descartado", pending: "Pendiente", resolved: "Resuelto", reviewing: "En revisión" }[status] || status;
  }

  function moderationDecisionLabel(decision) {
    return {
      approved: "Aprobada",
      manual_review: "Revisión manual",
      pending: "Procesando",
      rejected: "Bloqueada"
    }[decision] || decision;
  }

  function membershipStatusLabel(status) {
    return { pending: "Pendiente", rejected: "Rechazada", unverified: "Sin verificar", verified: "Verificada" }[status] || status;
  }

  function accountStatusLabel(status) {
    return { active: "Activa", banned: "Bloqueada", suspended: "Suspendida" }[status || "active"];
  }

  function methodLabel(method) {
    return { admin: "Revisión manual", invite_code: "Código temporal" }[method] || method;
  }

  function fieldLabel(field) {
    return { all: "Todo", category: "Categoría", description: "Descripción", title: "Título" }[field] || field;
  }

  function matchLabel(matchType) {
    return { contains: "Contiene", exact: "Exacta" }[matchType] || matchType;
  }

  function reasonLabel(reason) {
    return {
      fraud: "Posible fraude",
      harassment: "Acoso o conducta ofensiva",
      inappropriate: "Contenido inapropiado",
      other: "Otro motivo",
      spam: "Spam",
      unsafe: "Conducta insegura",
      wrong_information: "Información incorrecta"
    }[reason] || reason;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.hidden = false;
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 3000);
  }
})();
