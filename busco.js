(function () {
  "use strict";
  const api = window.colegioLibreApi;
  const client = window.colegioLibreSupabase;
  const form = document.getElementById("wanted-form");
  const list = document.getElementById("wanted-list");
  const filter = document.getElementById("wanted-filter");
  const status = document.getElementById("wanted-status");
  let user = null;
  let profile = null;
  let posts = [];
  init();

  async function init() {
    user = await api.getCurrentUser(true);
    profile = user ? await api.getCurrentProfile(true) : null;
    form.addEventListener("submit", submit);
    filter.addEventListener("change", render);
    await load();
  }

  async function load() {
    const result = await client.from("wanted_posts").select("*").eq("status", "active")
      .order("created_at", { ascending: false }).limit(100);
    posts = result.data || [];
    if (result.error) {
      const missing = /wanted_posts|schema cache|does not exist/i.test(String(result.error.message || ""));
      list.innerHTML = missing
        ? '<div class="wanted-empty"><b>El foro todavía no fue activado</b><p>Ejecutá database/05_growth_payments_forum.sql en Supabase para habilitar los pedidos.</p></div>'
        : '<div class="wanted-empty"><b>No pudimos cargar los pedidos</b><p>Revisá tu conexión e intentá nuevamente.</p></div>';
      return;
    }
    render();
  }

  function render() {
    const mode = filter.value;
    const visible = posts.filter((post) => mode === "all" || post.scope === mode || (mode === "mine" && user && post.user_id === user.id));
    list.replaceChildren();
    visible.forEach((post) => {
      const item = document.createElement("article");
      item.className = "wanted-item";
      item.innerHTML = '<div class="wanted-item__top"><h3></h3><span class="wanted-chip"></span></div><p class="wanted-description"></p><p class="wanted-place"></p>';
      item.querySelector("h3").textContent = post.title;
      item.querySelector(".wanted-chip").textContent = post.scope === "school" ? "Colegio" : post.scope === "zone" ? "Zona" : "Argentina";
      item.querySelector(".wanted-description").textContent = post.description || post.category || "Material escolar";
      item.querySelector(".wanted-place").textContent = post.scope === "school" ? (post.school_name || "Su colegio") : post.scope === "zone" ? (post.zone_code || "Su zona") : "Toda Argentina";
      if (user && post.user_id === user.id) {
        const close = document.createElement("button");
        close.className = "wanted-close";
        close.textContent = "Marcar como conseguido";
        close.onclick = async function () {
          await client.from("wanted_posts").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", post.id).eq("user_id", user.id);
          await load();
        };
        item.appendChild(close);
      }
      list.appendChild(item);
    });
    if (!visible.length) list.innerHTML = '<div class="wanted-empty"><b>Todavía no hay pedidos acá</b><p>Sé la primera persona en crear una alerta para este alcance.</p></div>';
  }

  async function submit(event) {
    event.preventDefault();
    if (!user) { window.location.href = "login.html?next=busco.html"; return; }
    const data = new FormData(form);
    const scope = String(data.get("scope"));
    const title = String(data.get("title") || "").trim();
    status.textContent = "Creando tu alerta…";
    const record = { user_id: user.id, title, query: title, category: String(data.get("category") || ""), description: String(data.get("description") || "").trim(), scope, school_code: profile?.school_code || null, school_name: profile?.school_name || null, zone_code: profile?.zone_code || null, country: "Argentina" };
    if (scope === "school" && !record.school_code) { status.textContent = "Primero elegí tu colegio desde Mi perfil."; return; }
    if (scope === "zone" && !record.zone_code) { status.textContent = "Primero completá tu zona desde Mi perfil."; return; }
    const result = await client.from("wanted_posts").insert(record);
    if (result.error) {
      status.textContent = /wanted_posts|schema cache|does not exist/i.test(String(result.error.message || ""))
        ? "El foro todavía no está activado en Supabase. Ejecutá el SQL incluido en la carpeta."
        : `No pudimos publicar: ${result.error.message}`;
      return;
    }
    form.reset();
    status.textContent = "¡Alerta creada! Te avisaremos cuando aparezca una coincidencia.";
    await load();
  }
})();
