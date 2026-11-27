(function () {
  "use strict";
  const api = window.colegioLibreApi;
  const client = window.colegioLibreSupabase;
  const form = document.getElementById("wanted-form");
  const list = document.getElementById("wanted-list");
  const filter = document.getElementById("wanted-filter");
  const search = document.getElementById("wanted-search");
  const resultCount = document.getElementById("wanted-result-count");
  const status = document.getElementById("wanted-status");
  let user = null;
  let profile = null;
  let posts = [];
  let view = "all";
  let creating = false;
  let reviewed = false;
  const review = document.getElementById("match-review");
  const submitLabel = form.querySelector("[type=submit] span");
  const translate = text => window.colegioLibrePreferences?.translate?.(text) || text;
  init().catch(() => showFeedError());

  async function init() {
    try { user = await api.getCurrentUser(true); profile = user ? await api.getCurrentProfile(true) : null; } catch (_) {}
    const params = new URLSearchParams(location.search);
    const requestedScopes = params.getAll("scope");
    const scope = requestedScopes.includes("school") && requestedScopes.includes("zone")
      ? "both"
      : requestedScopes[0];
    if (scope === "school" || params.has("title")) {
      form.elements.title.value = (params.get("title") || "").slice(0, 600);
      if (Array.from(form.elements.category.options).some(option => option.value === params.get("category"))) {
        form.elements.category.value = params.get("category");
      }
      form.elements.title.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const budget = params.get("max_price");
    if (budget === "custom" || (/^\d+$/.test(budget || "") && Number(budget) <= 100000000)) {
      form.elements.max_price.value = budget === "custom" ? "" : budget;
    }
    const minimum = params.get("min_price");
    if (/^\d+$/.test(minimum || "") && Number(minimum) <= 100000000) {
      form.elements.min_price.value = minimum;
    }
    for (const field of ["isbn", "edition", "size"]) {
      const value = params.get(field);
      if (value) {
        form.elements[field].value = value.slice(0, form.elements[field].maxLength);
        const extra = form.elements[field].closest("details");
        if (extra) extra.open = true;
        if (!form.elements.category.value) form.elements.category.value = field === "size" ? "Uniformes" : "Libros";
      }
    }
    if (params.get("view") === "school" || scope === "school") filter.value = "school";
    const defaultScope = profile?.school_verification_status === "verified"
      ? "school"
      : "zone";
    form.elements.scope.value = ["school", "zone", "both"].includes(scope) ? scope : defaultScope;
    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    updatePreview();
    form.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelectorAll('[data-alert-view]').forEach(button=>button.addEventListener('click',()=>{
      view=button.dataset.alertView;
      document.getElementById("match-feed-title").textContent = view === "mine" ? "Mis búsquedas" : "Lo que están buscando";
      document.querySelectorAll('[data-alert-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
      void load();
    }));
    window.addEventListener("colegiolibre:languagechange", () => {
      if (!document.getElementById("pedidos").hidden) render();
    });
    form.addEventListener("submit", submit);
    filter.addEventListener("change", load);
    search?.addEventListener("input", render);
    form.elements.title.addEventListener("input",clearReview);
    const feedView = params.get("view");
    if (["mine", "all", "school"].includes(feedView) || location.hash === "#pedidos") {
      document.getElementById("pedidos").hidden = false;
      document.getElementById("wanted-create-intro").hidden = true;
      form.hidden = true;
      document.querySelector(feedView === "mine" || !feedView
        ? '[data-alert-view="mine"]' : '[data-alert-view="all"]').click();
    }
  }

  function updatePreview() {
    const fields = form.elements;
    const category = fields.category.value;
    for (const label of form.querySelectorAll("[data-category-field]")) {
      label.hidden = category !== (label.dataset.categoryField === "book" ? "Libros" : "Uniformes");
      label.querySelector("input").disabled = label.hidden;
    }
    const format = value => "$ " + Number(value).toLocaleString("es-AR");
    const min = fields.min_price.value, max = fields.max_price.value;
    document.getElementById("request-name").textContent = fields.title.value.trim() || "Tu pedido";
    document.getElementById("request-category").textContent = [category, category === "Uniformes" && fields.size.value ? "Talle " + fields.size.value : ""].filter(Boolean).join(" · ");
    document.getElementById("request-art").textContent = ({ Libros:"📚", Uniformes:"👕", Mochilas:"🎒", Cuadernos:"📒", Útiles:"✏️", Apuntes:"📄", Tecnología:"💻" })[category] || "📦";
    document.getElementById("request-budget").textContent = min && max ? format(min) + " – " + format(max) : min ? "Desde " + format(min) : max ? "Hasta " + format(max) : "Sin límite de precio";
    document.getElementById("request-area").textContent = ({school:"Mi colegio",zone:"Mi zona",both:"Mi colegio y mi zona"})[fields.scope.value] || "";
  }

  function clearReview() {
    reviewed = false;
    review.hidden = true;
    review.replaceChildren();
    submitLabel.textContent = "Crear pedido";
  }

  function splitMaterials(value) {
    return value.split(/\n|\s+y\s+(?=(?:un[ao]?|el|la|libro|uniforme|cuaderno)\s)/i)
      .map(line => line.trim().replace(/^(?:necesito|busco|quiero)\s+/i,"")).filter(Boolean);
  }
  function reviewMaterials(materials) {
    if (!materials.length || materials.length > 8) return false;
    const heading = document.createElement("h3");
    heading.textContent = "Confirmá lo que vas a buscar";
    review.append(heading);
    materials.forEach((material,index) => {
      const label = document.createElement("label");
      label.textContent = "Material " + (index + 1);
      const input = document.createElement("input");
      input.name = "match_material";
      input.minLength = 3;
      input.maxLength = 120;
      input.required = true;
      input.value = material;
      label.append(input);
      review.append(label);
    });
    reviewed = true;
    review.hidden = false;
    submitLabel.textContent = materials.length === 1 ? "Activar pedido" : "Activar pedidos";
    review.querySelector("input").focus();
    return true;
  }

  function addMatchControls(item, post) {
    const actions = item.querySelector(".wanted-item__actions");
    const result = document.createElement("div");
    result.setAttribute("aria-live","polite");
    item.append(result);
    const show = document.createElement("button");
    show.type = "button";
    show.className = "wanted-close";
    show.textContent = "Ver coincidencias";
    show.hidden = post.match_paused;
    async function showMatches() {
      result.textContent = "Buscando…";
      show.disabled = true;
      try {
        const {data,error} = await client.rpc("colego_match_results",{p_wanted:post.id});
        if (error) throw error;
        result.replaceChildren();
        if (!data.length) result.textContent = "Todavía no hay coincidencias. ColeGo sigue buscando.";
        for (const product of data) {
          const row = document.createElement("p");
          const link = document.createElement("a");
          link.href = "/producto?id=" + encodeURIComponent(product.id);
          link.textContent = product.title + " · " + Number(product.price).toLocaleString("es-AR",{style:"currency",currency:"ARS"}) +
            (product.exact_isbn ? " · ISBN exacto" : " · Título compatible");
          row.append(link);
          result.append(row);
        }
      } catch (_) { result.textContent = "No pudimos cargar las coincidencias. Volvé a intentar."; }
      finally { show.disabled = false; }
    }
    show.onclick = showMatches;
    const pause = document.createElement("button");
    pause.type = "button";
    pause.className = "wanted-close";
    pause.textContent = post.match_paused ? "Reanudar" : "Pausar";
    const label = document.createElement("label");
    label.textContent = "Avisos ";
    const frequency = document.createElement("select");
    for (const [value,text] of [["hourly","Hasta uno por hora"],["daily","Hasta uno por día"],["off","Desactivados"]]) {
      frequency.add(new Option(text,value));
    }
    frequency.value = post.match_frequency || "hourly";
    label.append(frequency);
    async function save(patch) {
      pause.disabled = frequency.disabled = true;
      try {
        const {error} = await client.from("wanted_posts").update(patch).eq("id",post.id);
        if (error) throw error;
        await load();
      } catch (_) {
        result.textContent = "No pudimos guardar el cambio.";
        frequency.value = post.match_frequency || "hourly";
        pause.disabled = frequency.disabled = false;
      }
    }
    pause.onclick = () => save({match_paused:!post.match_paused});
    frequency.onchange = () => save({match_frequency:frequency.value});
    actions.append(show,pause,label);
  }

  let loadSequence = 0;
  async function load() {
    list.setAttribute("aria-busy","true");
    const sequence = ++loadSequence;
    let result;
    try {
      let query = client.from("wanted_posts").select("*").eq("status", "active");
      if (view === "mine" && user) query = query.eq("user_id",user.id);
      else if (filter.value === "school" && profile?.school_code) query = query.eq("scope","school").eq("school_code",profile.school_code);
      result = await query.order("created_at", { ascending: false }).limit(100);
    } catch (_) { if (sequence === loadSequence) showFeedError(); return; }
    if (sequence !== loadSequence) return;
    list.setAttribute("aria-busy","false");
    posts = result.data || [];
    if (result.error) {
      showFeedError();
      return;
    }
    render();
  }

  function showFeedError() {
    list.setAttribute("aria-busy","false");
    if (resultCount) resultCount.textContent = "—";
    list.innerHTML = '<div class="wanted-empty"><b>Las alertas no están disponibles ahora</b><p>No pudimos conectarnos. Podés volver a intentar en un momento.</p><button type="button">Volver a intentar</button></div>';
    list.querySelector("button").onclick = () => load().catch(showFeedError);
  }

  function render() {
    const mode = view === "mine" ? "all" : filter.value;
    if ((view==='mine' || mode==='school' || mode==='zone') && !user) {
      resultCount.textContent='0';list.innerHTML='<div class="wanted-empty"><b>Iniciá sesión para ver tus alertas</b><p>Guardá tus búsquedas y seguí las coincidencias desde tu cuenta.</p><a class="wanted-have" href="/login?next=/busco">Iniciar sesión</a></div>';window.colegioLibrePreferences?.refresh?.(list);return;
    }
    const query = String(search?.value || "").trim().toLowerCase();
    const visible = posts.filter((post) => {
      const matchesScope = (view === 'mine' ? post.user_id === user?.id : !post.match_private) && (mode === 'all' || (mode==='country' && post.scope==='country') || (mode==='school' && post.scope==='school' && profile?.school_code && post.school_code===profile.school_code) || (mode==='zone' && post.scope==='zone' && profile?.zone_code && post.zone_code===profile.zone_code));
      const searchable = `${post.title || ""} ${post.description || ""} ${post.category || ""}`.toLowerCase();
      return matchesScope && (!query || searchable.includes(query));
    });
    if (resultCount) resultCount.textContent = String(visible.length);
    list.replaceChildren();
    visible.forEach((post) => {
      const item = document.createElement("article");
      item.className = "wanted-item";
      item.innerHTML = '<div class="wanted-item__top"><h3 data-no-translate></h3><span class="wanted-chip"></span></div><div class="wanted-item__meta"><span data-category></span><span data-transaction></span><span data-place></span></div><p class="wanted-description" data-no-translate></p><div class="wanted-item__actions"><span class="wanted-time"></span><a class="wanted-have">Lo tengo</a></div>';
      item.querySelector("h3").textContent = post.title;
      item.querySelector(".wanted-chip").textContent = post.scope === "school" ? "Colegio" : post.scope === "zone" ? "Zona" : "Argentina";
      item.querySelector(".wanted-description").textContent = post.description || post.category || "Material escolar";
      item.querySelector("[data-category]").textContent = post.category || "Material";
      item.querySelector("[data-transaction]").textContent = post.transaction_type === "exchange" ? "Intercambio" : post.transaction_type === "either" ? "Compra o intercambio" : "Compra";
      item.querySelector("[data-place]").textContent = post.scope === "school" ? (post.school_name || "Su colegio") : post.scope === "zone" ? (post.zone_code || "Su zona") : "Toda Argentina";
      item.querySelector(".wanted-time").textContent = relativeTime(post.created_at);
      if (Number(post.max_price)>0) {const budget=document.createElement('span');budget.className='wanted-item__budget';budget.textContent=translate('Presupuesto máximo')+': '+new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(post.max_price);item.querySelector('.wanted-item__actions').before(budget);}
      const haveLink = item.querySelector(".wanted-have");
      haveLink.href = `/mensajes?wanted=${encodeURIComponent(post.id)}`;
      if (user && post.user_id === user.id) {
        if (view === "mine") addMatchControls(item,post);
        haveLink.remove();
        const close = document.createElement("button");
        close.className = "wanted-close";
        close.textContent = "Marcar como conseguido";
        close.onclick = async function () {
          close.disabled=true;
          try {const result=await client.from("wanted_posts").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", post.id).eq("user_id", user.id);if(result.error)throw result.error;await load();}
          catch(_){close.disabled=false;status.dataset.state='error';status.textContent=translate('No pudimos cerrar la alerta. Volvé a intentar.');}
        };
        item.querySelector(".wanted-item__actions").appendChild(close);
      }
      list.appendChild(item);
    });
    if (!visible.length) list.innerHTML = '<div class="wanted-empty"><b>Todavía no hay alertas acá</b><p>Probá otro alcance o creá una alerta con el material que necesitás.</p></div>';
    window.colegioLibrePreferences?.refresh?.(list);
  }

  function relativeTime(value) {
    const milliseconds = Date.now() - new Date(value || Date.now()).getTime();
    const hours = Math.max(0, Math.floor(milliseconds / 3600000));
    if (hours < 1) return "Publicado hace unos minutos";
    if (hours < 24) return `Publicado hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Publicado hace ${days} ${days === 1 ? "día" : "días"}`;
  }

  async function submit(event) {
    event.preventDefault();
    if(creating)return;
    if (!user) { window.location.href = "/login?next=" + encodeURIComponent("/busco" + location.search + "#crear-pedido"); return; }
    const data = new FormData(form);
    const scope = String(data.get("scope"));
    const title = String(data.get("title") || "").trim();
    if(title.length<3 || title.length>600){status.dataset.state='error';status.textContent=translate('Escribí al menos 3 letras para tu búsqueda.');return;}
    const parsed = splitMaterials(title);
    if (!reviewed && parsed.length > 1) {
      if (!reviewMaterials(parsed)) status.textContent = "Agregá hasta 8 materiales, uno por línea.";
      return;
    }
    const materials = reviewed ? data.getAll("match_material").map(value => value.trim()) : parsed;
    if (!materials.length || materials.some(value => value.length < 3 || value.length > 120)) {
      status.textContent = "Cada material tiene que tener entre 3 y 120 caracteres.";
      return;
    }
    const isbn = String(data.get("isbn") || "").replace(/[\s-]/g,"").toUpperCase();
    const edition = String(data.get("edition") || "").trim();
    const size = String(data.get("size") || "").trim();
    if (isbn && !/^(?:[0-9]{9}[0-9X]|[0-9]{13})$/.test(isbn)) {
      status.textContent = "Revisá el ISBN. Debe tener 10 o 13 caracteres.";
      return;
    }
    if (materials.length > 1 && (isbn || edition || size || data.get("max_price") || data.get("min_price"))) {
      status.textContent = "Para asignar un presupuesto, ISBN, edición o talle, activá una búsqueda por material.";
      return;
    }
    const budget=String(data.get('max_price')||'').trim();
    if(budget && (!Number.isFinite(Number(budget)) || Number(budget)<0 || Number(budget)>100000000)){status.dataset.state='error';status.textContent=translate('Revisá el presupuesto máximo.');return;}
    const minimum = String(data.get("min_price") || "").trim();
    if (minimum && (!/^\d+$/.test(minimum) || Number(minimum) > 100000000 ||
        (budget !== "" && Number(minimum) > Number(budget)))) {
      status.dataset.state = "error";
      status.textContent = "El presupuesto desde debe ser menor o igual al presupuesto hasta.";
      return;
    }
    status.dataset.state = "loading";
    status.textContent = "Creando tu pedido…";
    const record = { user_id: user.id, title, query: title, category: String(data.get("category") || ""), transaction_type: String(data.get("transaction_type") || "buy"), description: String(data.get("description") || "").trim(), scope, school_code: profile?.school_code || null, school_name: profile?.school_name || null, zone_code: profile?.zone_code || null, country: "Argentina", max_price: budget === "" ? null : Number(budget), min_price: minimum === "" ? null : Number(minimum),
      match_isbn:isbn || null, match_edition:edition || null, match_size:size || null,
      match_frequency:data.get("frequency"), match_private:!data.has("community") };
    if (["school","both"].includes(scope) && profile?.school_verification_status !== "verified") { status.dataset.state = "error"; status.textContent = "Verificá tu pertenencia al colegio o elegí buscar por zona."; return; }
    if (["zone","both"].includes(scope) && !record.zone_code) { status.dataset.state = "error"; status.textContent = "Primero completá tu zona desde Mi perfil."; return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    creating=true;
    let result;
    try {
      result = await client.from("wanted_posts").insert(materials.map(material => ({...record,title:material,query:material}))).select("id");
    }
    catch (_) { result = {error: true}; }
    finally { button.disabled = false; creating=false; }
    if (result.error) {
      status.dataset.state = "error";
      status.textContent = "No pudimos crear tu pedido. Volvé a intentar en un momento.";
      return;
    }
    status.dataset.state = "success";
    const savedScope = form.elements.scope.value;
    form.reset();
    form.elements.scope.value = savedScope;
    clearReview();
    updatePreview();
    status.textContent = "Búsquedas activadas. ColeGo sigue buscando cuando aparezcan nuevas publicaciones.";
    const manage = document.createElement("a");
    manage.href = "/perfil?view=requests";
    manage.textContent = "Ver mis pedidos";
    const actions = document.createElement("span");
    actions.className = "wanted-success-actions";
    actions.append(manage);
    status.append(actions);
    const matchesBySearch = await Promise.allSettled(result.data.map(row =>
      client.rpc("colego_match_results",{p_wanted:row.id})
    ));
    const matches = matchesBySearch.flatMap(response => response.status === "fulfilled" && !response.value.error ? response.value.data || [] : []);
    const error = matchesBySearch.some(response => response.status === "rejected" || response.value.error);
    if (matches.length) {
      const link = document.createElement("a");
      link.href = "/producto?id=" + encodeURIComponent(matches[0].id);
      link.textContent = " Ver la primera coincidencia";
      actions.append(link);
    } else if (!error) {
      actions.append("Todavía no hay coincidencias.");
    }
  }
})();
