(() => {
  const client = window.colegioLibreSupabase;
  const api = window.colegioLibreApi;
  const products = document.getElementById("materials-products");
  const requests = document.getElementById("materials-requests");
  const composer = document.querySelector(".materials-composer");
  const price = new Intl.NumberFormat("es-AR", {
    style: "currency", currency: "ARS", maximumFractionDigits: 2
  });

  function row(href, title, detail) {
    const link = document.createElement("a");
    link.className = "materials-row";
    link.href = href;
    const copy = document.createElement("span");
    const heading = document.createElement("strong");
    heading.textContent = title;
    const description = document.createElement("span");
    description.textContent = detail;
    copy.append(heading, description);
    link.append(copy);
    return link;
  }

  async function loadProducts() {
    try {
      const { data, error } = await client.from("products")
        .select("id,title,price,condition,image_url")
        .eq("status", "available")
        .or("moderation_status.eq.approved,moderation_status.is.null")
        .order("created_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      products.replaceChildren();
      for (const product of data) {
        const link = row("/producto?id=" + encodeURIComponent(product.id), product.title, product.condition);
        const thumbnail = document.createElement("span");
        thumbnail.className = "materials-thumb";
        thumbnail.setAttribute("aria-hidden", "true");
        if (product.image_url && /^https?:\/\//i.test(product.image_url)) {
          const image = document.createElement("img");
          image.src = product.image_url;
          image.alt = "";
          image.addEventListener("error", () => image.replaceWith(thumbnail), { once: true });
          link.prepend(image);
        } else {
          link.prepend(thumbnail);
        }
        const amount = document.createElement("strong");
        amount.className = "materials-price";
        amount.textContent = Number(product.price) === 0 ? "Gratis" : price.format(product.price);
        link.append(amount);
        products.append(link);
      }
      if (!data.length) products.textContent = "Todavía no hay publicaciones disponibles.";
    } catch (_) {
      products.textContent = "No pudimos cargar las publicaciones.";
    }
  }

  async function loadRequests() {
    try {
      const user = await api.getCurrentUser();
      if (!user) {
        const login = document.createElement("a");
        login.href = "/login?next=%2F";
        login.className = "materials-link";
        login.textContent = "Iniciá sesión para ver tus pedidos";
        requests.replaceChildren(login);
        return;
      }
      const { data, error } = await client.from("wanted_posts")
        .select("title,max_price,match_paused")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      requests.replaceChildren();
      for (const request of data) {
        const status = request.match_paused ? "Pausado" : "Buscando";
        const budget = request.max_price == null ? "" : " · Hasta " + price.format(request.max_price);
        requests.append(row("/busco", request.title, status + budget));
      }
      if (!data.length) requests.textContent = "Todavía no tenés pedidos activos.";
    } catch (_) {
      requests.textContent = "No pudimos cargar tus pedidos.";
    }
  }

  const scopes = [...composer.querySelectorAll('[name="scope"]')];
  function validateScopes() {
    scopes[0].setCustomValidity(scopes.some(input => input.checked) ? "" : "Elegí tu colegio o tu zona.");
  }
  composer.addEventListener("change", validateScopes);
  window.addEventListener("pageshow", validateScopes);

  void loadProducts();
  void loadRequests();
})();
