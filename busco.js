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
  const translate = text => window.colegioLibrePreferences?.translate?.(text) || text;
  init().catch(() => showFeedError());

  async function init() {
    try { user = await api.getCurrentUser(true); profile = user ? await api.getCurrentProfile(true) : null; } catch (_) {}
    if (!profile?.school_code) {form.querySelector('[name="scope"][value="country"]').checked=true;form.dispatchEvent(new Event('change',{bubbles:true}));}
    document.querySelectorAll('[data-alert-view]').forEach(button=>button.addEventListener('click',()=>{
      view=button.dataset.alertView;
      document.querySelectorAll('[data-alert-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
      render();
    }));
    window.addEventListener('colegiolibre:languagechange',render);
    form.addEventListener("submit", submit);
    filter.addEventListener("change", render);
    search?.addEventListener("input", render);
    await load();
  }

  async function load() {
    list.setAttribute("aria-busy","true");
    let result;
    try {result = await client.from("wanted_posts").select("*").eq("status", "active")
      .order("created_at", { ascending: false }).limit(100);}catch(_){showFeedError();return;}
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
    const mode = filter.value;
    if ((view==='mine' || mode==='school' || mode==='zone') && !user) {
      resultCount.textContent='0';list.innerHTML='<div class="wanted-empty"><b>Iniciá sesión para ver tus alertas</b><p>Guardá tus búsquedas y seguí las coincidencias desde tu cuenta.</p><a class="wanted-have" href="/login?next=/busco">Iniciar sesión</a></div>';window.colegioLibrePreferences?.refresh?.(list);return;
    }
    const query = String(search?.value || "").trim().toLowerCase();
    const visible = posts.filter((post) => {
      const matchesScope = (view !== 'mine' || post.user_id === user?.id) && (mode === 'all' || (mode==='country' && post.scope==='country') || (mode==='school' && post.scope==='school' && profile?.school_code && post.school_code===profile.school_code) || (mode==='zone' && post.scope==='zone' && profile?.zone_code && post.zone_code===profile.zone_code));
      const searchable = `${post.title || ""} ${post.description || ""} ${post.category || ""}`.toLowerCase();
      return matchesScope && (!query || searchable.includes(query));
    });
    if (resultCount) resultCount.textContent = String(visible.length);
    list.replaceChildren();
    visible.forEach((post) => {
      const item = document.createElement("article");
      item.className = "wanted-item";
      item.innerHTML = '<div class="wanted-item__top"><h3 data-no-translate></h3><span class="wanted-chip"></span></div><div class="wanted-item__meta"><span data-category></span><span data-transaction></span><span data-place></span></div><p class="wanted-description" data-no-translate></p><div class="wanted-item__actions"><span class="wanted-time"></span><a class="wanted-have">Tengo este material</a></div>';
      item.querySelector("h3").textContent = post.title;
      item.querySelector(".wanted-chip").textContent = post.scope === "school" ? "Colegio" : post.scope === "zone" ? "Zona" : "Argentina";
      item.querySelector(".wanted-description").textContent = post.description || post.category || "Material escolar";
      item.querySelector("[data-category]").textContent = post.category || "Material";
      item.querySelector("[data-transaction]").textContent = post.transaction_type === "exchange" ? "Intercambio" : post.transaction_type === "either" ? "Compra o intercambio" : "Compra";
      item.querySelector("[data-place]").textContent = post.scope === "school" ? (post.school_name || "Su colegio") : post.scope === "zone" ? (post.zone_code || "Su zona") : "Toda Argentina";
      item.querySelector(".wanted-time").textContent = relativeTime(post.created_at);
      if (Number(post.max_price)>0) {const budget=document.createElement('span');budget.className='wanted-item__budget';budget.textContent=translate('Presupuesto máximo')+': '+new Intl.NumberFormat(document.documentElement.lang==='en'?'en-US':'es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(post.max_price);item.querySelector('.wanted-item__actions').before(budget);}
      const haveLink = item.querySelector(".wanted-have");
      haveLink.href = `/publicar?wanted=${encodeURIComponent(post.id)}&title=${encodeURIComponent(post.title)}`;
      if (user && post.user_id === user.id) {
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
    if (!user) { window.location.href = "/login?next=/busco"; return; }
    const data = new FormData(form);
    const scope = String(data.get("scope"));
    const title = String(data.get("title") || "").trim();
    if(title.length<3 || title.length>120){status.dataset.state='error';status.textContent=translate('Escribí al menos 3 letras para tu búsqueda.');return;}
    const budget=String(data.get('max_price')||'').trim();
    if(budget && (!Number.isFinite(Number(budget)) || Number(budget)<0 || Number(budget)>100000000)){status.dataset.state='error';status.textContent=translate('Revisá el presupuesto máximo.');return;}
    status.dataset.state = "loading";
    status.textContent = "Creando tu alerta…";
    const record = { user_id: user.id, title, query: title, category: String(data.get("category") || ""), transaction_type: String(data.get("transaction_type") || "buy"), description: String(data.get("description") || "").trim(), scope, school_code: profile?.school_code || null, school_name: profile?.school_name || null, zone_code: profile?.zone_code || null, country: "Argentina", max_price: Number(data.get("max_price") || 0) || null };
    if (scope === "school" && !record.school_code) { status.dataset.state = "error"; status.textContent = "Primero elegí tu colegio desde Mi perfil."; return; }
    if (scope === "zone" && !record.zone_code) { status.dataset.state = "error"; status.textContent = "Primero completá tu zona desde Mi perfil."; return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    creating=true;
    let result;
    try { result = await client.from("wanted_posts").insert(record); }
    catch (_) { result = {error: true}; }
    finally { button.disabled = false; creating=false; }
    if (result.error) {
      status.dataset.state = "error";
      status.textContent = "No pudimos crear tu alerta. Volvé a intentar en un momento.";
      return;
    }
    status.dataset.state = "success";
    form.reset();
    status.textContent = "¡Alerta creada! Te avisaremos cuando aparezca una coincidencia.";
    await load();
  }
})();
