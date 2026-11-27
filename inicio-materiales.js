(() => {
  const client = window.colegioLibreSupabase;
  const api = window.colegioLibreApi;
  const list = document.getElementById("materials-requests");
  const results = document.getElementById("materials-matches");
  const feedback = document.getElementById("materials-feedback");
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
  let lastSelection = 0;

  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function budgetText(item) {
    if (item.min_price != null && item.max_price != null) return money.format(item.min_price) + " a " + money.format(item.max_price);
    if (item.max_price != null) return "Hasta " + money.format(item.max_price);
    if (item.min_price != null) return "Desde " + money.format(item.min_price);
    return "Sin límite de precio";
  }

  async function showMatches(item, button) {
    const selection = ++lastSelection;
    list.querySelectorAll("button").forEach(control => control.setAttribute("aria-pressed", String(control === button)));
    results.textContent = item.match_paused ? "Material marcado como conseguido. Destildalo para reanudar la búsqueda." : "Buscando coincidencias para " + item.title + "…";
    if (item.match_paused) return;
    try {
      const { data, error } = await client.rpc("colego_match_results", { p_wanted: item.id });
      if (selection !== lastSelection) return;
      if (error) throw error;
      if (!data?.length) {
        results.textContent = "Todavía no hay publicaciones compatibles con este pedido. ColeGo sigue buscando.";
        return;
      }
      results.replaceChildren(element("p", item.title, "materials-match-note"));
      for (const product of data.slice(0, 6)) {
        const link = element("a", "", "materials-row");
        link.href = "/producto?id=" + encodeURIComponent(product.id);
        const copy = element("span");
        const details = [product.condition, product.exact_isbn ? "ISBN exacto" : ""].filter(Boolean).join(" · ");
        copy.append(element("strong", product.title), element("span", details), element("small", "Ver publicación"));
        const amount = element("strong", money.format(product.price), "materials-price");
        const label = item.min_price != null && product.price < item.min_price
          ? "Por debajo del rango"
          : item.min_price != null || item.max_price != null ? "Dentro del presupuesto" : "";
        if (label) amount.append(element("small", label));
        link.append(copy, amount);
        results.append(link);
      }
    } catch (_) {
      if (selection === lastSelection) results.textContent = "No pudimos cargar las coincidencias. Elegí el pedido para volver a intentar.";
    }
  }

  function addRequest(item, userId) {
    const row = element("div", "", "materials-request");
    const checkbox = element("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.match_paused;
    checkbox.setAttribute("aria-label", "Marcar como conseguido: " + item.title);
    const button = element("button");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    function updateLabel() {
      button.replaceChildren(element("strong", item.title), element("small",
        (item.match_paused ? "Conseguido · " : "") + budgetText(item)));
    }
    updateLabel();
    button.addEventListener("click", () => void showMatches(item, button));
    checkbox.addEventListener("change", async () => {
      checkbox.disabled = true;
      feedback.textContent = "";
      try {
        const { data, error } = await client.from("wanted_posts").update({ match_paused: checkbox.checked })
          .eq("id", item.id).eq("user_id", userId).eq("status", "active").select("match_paused").single();
        if (error) throw error;
        item.match_paused = data.match_paused;
        updateLabel();
        void showMatches(item, button);
        feedback.textContent = item.match_paused ? "Marcaste el material como conseguido." : "Búsqueda reanudada.";
      } catch (_) {
        checkbox.checked = item.match_paused;
        feedback.textContent = "No pudimos actualizar el pedido. Volvé a intentar.";
      } finally { checkbox.disabled = false; }
    });
    row.append(checkbox, button);
    list.append(row);
    return button;
  }

  async function loadRequests(user) {
    if (!user) {
      const login = element("a", "Iniciá sesión para ver tu lista", "materials-link");
      login.href = "/login?next=%2F";
      list.replaceChildren(login);
      return;
    }
    const { data, error } = await client.from("wanted_posts").select("id,title,min_price,max_price,match_paused")
      .eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(12);
    if (error) throw error;
    list.replaceChildren();
    if (!data.length) {
      list.textContent = "Todavía no agregaste materiales.";
      return;
    }
    const buttons = data.map(item => addRequest(item, user.id));
    const active = data.findIndex(item => !item.match_paused);
    if (active >= 0) void showMatches(data[active], buttons[active]);
    else results.textContent = "Ya marcaste como conseguidos todos los materiales de esta lista.";
  }

  async function loadSchool() {
    const profile = await api.getCurrentProfile();
    if (!profile?.school_code) return;
    const path = await window.colegoPrivateSchoolPath(profile.school_code);
    if (!path) return;
    const link = document.getElementById("materials-school-link");
    link.href = path;
    link.hidden = false;
    document.getElementById("materials-school-status").textContent = "Tu comunidad está habilitada.";
  }

  Promise.resolve().then(() => api.getCurrentUser()).then(user => {
    if (user) void loadSchool().catch(() => {});
    return loadRequests(user);
  }).catch(() => { list.textContent = "No pudimos cargar tu lista."; });
})();
