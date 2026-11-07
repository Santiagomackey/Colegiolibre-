(() => {
  "use strict";
  window.colegioLibreStaticProducts = [];
  window.getColegioLibreStaticProducts = () => [];
  window.getColegioLibreStaticProductById = () => null;
  window.cargarProductosDesdeSupabase = async function ({offset = 0, limit = 48} = {}) {
    const client = window.colegioLibreSupabase;
    if (!client?.from) throw new Error("No pudimos conectarnos con las publicaciones.");
    const size = Math.min(100, Math.max(1, Number(limit) || 48));
    const start = Math.max(0, Number(offset) || 0);
    const {data, error} = await client.from("products").select("*")
      .eq("status", "available")
      .or("moderation_status.eq.approved,moderation_status.is.null")
      .order("created_at", {ascending:false}).order("id", {ascending:false})
      .range(start, start + size - 1);
    if (error) throw new Error("No pudimos cargar las publicaciones. Volvé a intentar.");
    return Array.isArray(data) ? data : [];
  };
})();
