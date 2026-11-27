(() => {
  const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  function node(tag, cls, value) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value != null) el.textContent = value;
    return el;
  }
  const payment = {
    paid: "Pagado", delivered: "Pagado", payment_pending: "Pago pendiente",
    awaiting_confirmation: "Esperando confirmación", cancelled: "Cancelado",
    reserved: "Sin confirmar", completed: "Sin registro de pago"
  };
  function pickup(status) {
    if (status === "delivered" || status === "completed") return ["Entregado", ""];
    if (status === "cancelled") return ["Cancelado", ""];
    if (status === "paid") return ["Coordinar retiro", "Acordá el día y el lugar con el vendedor"];
    return ["Sin coordinar", "Pendiente de acordar con el vendedor"];
  }
  function row(order, product, cancel, seller, names) {
    const tr = node("tr");
    const item = node("td", "purchase-product");
    const photo = node("span", "purchase-photo", "▧");
    photo.setAttribute("aria-hidden", "true");
    if (product?.image_url) {
      const img = node("img");
      img.alt = "";
      img.loading = "lazy";
      img.onerror = () => img.remove();
      img.src = product.image_url;
      photo.append(img);
    }
    const info = node("div");
    info.append(node("strong", "", order.product_title || product?.title || "Producto"));
    const meta = [product?.category, product?.condition].filter(Boolean).join(" · ");
    if (meta) info.append(node("small", "", meta));
    item.append(photo, info);
    const amount = order.amount ?? product?.price;
    const price = node("td", "purchase-price", amount == null ? "Sin precio registrado" : money.format(amount));
    const pay = node("td", "purchase-payment");
    const badge = node("span", "purchase-badge", payment[order.status] || "Sin confirmar");
    badge.dataset.paid = String(["paid","delivered"].includes(order.status));
    pay.append(badge);
    const delivery = node("td", "purchase-pickup");
    if (seller) {
      const delivered = ["delivered", "completed"].includes(order.status);
      const label = delivered ? "Entregado" : order.status === "cancelled" ? "Cancelado" :
        order.manual ? "Sin registro" : "Pendiente de entrega";
      const tag = node("span", "purchase-badge", label);
      tag.dataset.paid = String(delivered);
      delivery.append(tag);
    } else {
      const [label, detail] = pickup(order.status);
      delivery.append(node("strong", "", label));
      if (detail) delivery.append(node("small", "", detail));
    }
    const actions = node("td", "purchase-actions");
    const link = node("a", "purchase-detail", "Ver detalle");
    link.href = order.legacy ? "/mensajes?id=" + encodeURIComponent(order.conversation_id) : "/compra?id=" + encodeURIComponent(order.id);
    if (order.manual) link.href = "/producto?id=" + encodeURIComponent(product.id);
    actions.append(link);
    if (order.legacy && order.status === "reserved" && cancel) {
      const button = node("button", "purchase-cancel", "Cancelar reserva");
      button.type = "button";
      button.onclick = () => cancel(order.id, button);
      actions.append(button);
    }
    tr.append(item, price, pay, delivery);
    if (seller) {
      tr.append(node("td", "sale-buyer", order.buyer_name || names.get(order.buyer_id) || "Sin registrar"));
    }
    tr.append(actions);
    return tr;
  }

  window.renderColegoPurchases = async function (host, { orders, legacy = [], sold = [], role = "buyer", cancel } = {}) {
    const seller = role === "seller";
    const title = seller ? "Ventas" : "Compras";
    const panel = node("section", seller ? "purchase-panel sale-panel" : "purchase-panel");
    const heading = node("h2", "", title);
    const note = node("p", "", "Cargando " + title.toLowerCase() + "…");
    note.setAttribute("role", "status");
    panel.append(heading, note);
    host.replaceChildren(panel);
    let roleOrders = [];
    let failed = false;
    try {
      roleOrders = (orders ?? await window.colegioLibreTransfers.rpc("list_my_transfer_orders") ?? []).filter(o => o.role === role);
    } catch (_) { failed = true; }
    const ids = [...new Set(roleOrders.map(o => o.product_id).filter(Boolean))];
    const products = new Map();
    if (ids.length) {
      try {
        const { data } = await window.colegioLibreSupabase.from("products")
          .select("id,title,price,image_url,category,condition").in("id", ids);
        for (const p of data || []) products.set(p.id, p);
      } catch (_) { /* Orders still carry their purchased title and amount. */ }
    }
    const entries = [...roleOrders, ...legacy.map(t => ({ ...t, legacy: true }))];
    const names = new Map();
    if (seller) {
      const buyerIds = [...new Set(entries.filter(o => !o.buyer_name).map(o => o.buyer_id).filter(Boolean))];
      if (buyerIds.length) {
        try {
          const { data } = await window.colegioLibreSupabase.from("profiles").select("id,name").in("id", buyerIds);
          for (const profile of data || []) names.set(profile.id, profile.name);
        } catch (_) { /* The order remains visible if the buyer profile is unavailable. */ }
      }
      const recorded = new Set(entries.filter(o => o.status !== "cancelled").map(o => o.product_id));
      for (const product of sold) {
        if (!recorded.has(product.id)) entries.push({ product, manual: true, created_at: product.updated_at || product.created_at });
      }
    }
    if (failed) {
      note.textContent = "No pudimos cargar todas tus " + title.toLowerCase() + ". ";
      const retry = node("button", "", "Reintentar");
      retry.onclick = () => window.renderColegoPurchases(host, { orders, legacy, sold, role, cancel });
      note.append(retry);
    } else if (!entries.length) {
      note.textContent = "Todavía no tenés " + title.toLowerCase() + ".";
      return;
    } else note.remove();
    if (!entries.length) return;
    const table = node("table", "purchase-table");
    table.setAttribute("aria-label", "Mis " + title.toLowerCase());
    const head = table.createTHead().insertRow();
    const columns = seller ? ["Producto","Precio","Pago","Entrega","Comprador",""] : ["Producto","Precio","Pago","Coordinación de retiro",""];
    for (const label of columns) {
      const th = node("th", "", label);
      th.scope = "col";
      if (!label) th.setAttribute("aria-label", seller ? "Detalle de venta" : "Detalle de compra");
      head.append(th);
    }
    const body = table.createTBody();
    entries.sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    for (const order of entries) body.append(row(order, order.product || products.get(order.product_id), cancel, seller, names));
    panel.append(table);
  };
})();