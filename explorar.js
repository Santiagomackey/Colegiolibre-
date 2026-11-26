(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const pageSize = 24;
  const fields = {
    q: '#ex-q', category: '#f-category', condition: '#f-condition', school: '#f-school',
    price: '#f-price', sort: '#f-sort', level: '#f-level', year: '#f-year',
    subject: '#f-subject', type: '#f-type', size: '#f-size'
  };
  const advanced = ['level', 'year', 'subject', 'type', 'size'];
  const params = new URL(location.href).searchParams;
  const state = Object.fromEntries(Object.keys(fields).map(key => [key, params.get(key) || '']));
  const labels = { Tecnologia: 'Tecnología', Utiles: 'Útiles' };
  state.category = labels[state.category] || state.category;
  state.sort ||= 'newest';
  let zone = params.get('scope') === 'zone' ? params.get('zone') || '' : '';
  let page = 0;
  let controller;
  let timer;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const pattern = value => '%' + String(value).slice(0, 120).replace(/[\\%_]/g, '\\$&') + '%';
  const orPattern = value => '"' + pattern(value).replace(/[\\"]/g, '\\$&') + '"';

  function render(products, append, catalogUrl) {
    const grid = $('#grid');
    if (!append) grid.replaceChildren();
    for (const product of products) {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = '/producto?' + new URLSearchParams({ id: product.id, from: catalogUrl });
      let image = '/images/product-placeholder.svg';
      try {
        const url = new URL(product.image_url, location.href);
        if (product.image_url && ['http:', 'https:'].includes(url.protocol)) image = url.href;
      } catch (_) {}
      const price = Number(product.price || 0).toLocaleString('es-AR', {
        style: 'currency', currency: 'ARS', maximumFractionDigits: 0
      });
      card.innerHTML = `<div class="media"><img src="${escape(image)}" alt="" loading="lazy"><span class="badge">${escape(product.condition || 'Usado')}</span></div>
        <div class="body"><h3 data-product-title translate="no">${escape(product.title || 'Producto sin título')}</h3>
        <p class="price">${price}</p><div class="meta">${escape(labels[product.category] || product.category || 'Otros')} · ${escape(product.school_name || product.location || 'Colegio no especificado')}</div></div>`;
      card.querySelector('img').addEventListener('error', event => {
        event.target.src = '/images/product-placeholder.svg';
      }, { once: true });
      grid.append(card);
    }
    window.colegioLibrePreferences?.refresh?.(grid);
  }

  async function load(append = false) {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const timeout = setTimeout(() => request.abort(), 12000);
    const nextPage = append ? page + 1 : 0;
    const grid = $('#grid');
    $('#results-status').hidden = false;
    $('#results-error').hidden = true;
    $('#empty').hidden = true;
    $('#load-more').hidden = true;
    grid.setAttribute('aria-busy', 'true');
    if (!append) {
      grid.replaceChildren();
      $('#count').textContent = '';
    }
    $('#result-title').textContent = state.q ? `Resultados para “${state.q}”` : state.category || 'Publicaciones';
    const url = new URL(location.href);
    url.search = '';
    Object.entries(state).forEach(([key, value]) => {
      if (value && !(key === 'sort' && value === 'newest')) url.searchParams.set(key, value);
    });
    if (zone) {
      url.searchParams.set('scope', 'zone');
      url.searchParams.set('zone', zone);
    }
    history.replaceState(history.state, '', url);
    const active = ['category', 'condition', 'school', 'price', ...advanced].filter(key => state[key]).length + Number(Boolean(zone));
    $('#filters-summary').textContent = active ? `Filtros · ${active} ${active === 1 ? 'activo' : 'activos'}` : 'Filtros';

    try {
      const client = window.colegioLibreSupabase;
      let query = client.from('products').select('*', { count: 'exact' })
        .eq('status', 'available').or('moderation_status.eq.approved,moderation_status.is.null');
      if (state.q) {
        const value = orPattern(state.q);
        const columns = ['title', 'description', 'school_name', 'subject', 'subcategory'];
        query = query.or(columns.map(column => `${column}.ilike.${value}`).join(','));
      }
      if (state.category) query = query.in('category', [state.category, ...Object.keys(labels).filter(key => labels[key] === state.category)]);
      if (state.condition) query = query.eq('condition', state.condition);
      if (state.school) query = query.ilike('school_name', pattern(state.school));
      if (state.price !== '' && Number.isFinite(Number(state.price))) query = query.lte('price', Math.max(0, Number(state.price)));
      if (state.level) query = query.eq('school_level', state.level);
      if (/^[1-7]$/.test(state.year)) query = query.eq('school_year', Number(state.year));
      for (const [key, column] of [['subject', 'subject'], ['type', 'subcategory'], ['size', 'size']]) {
        if (state[key]) query = query.ilike(column, pattern(state[key]));
      }
      if (zone) query = query.eq('zone_code', zone);
      const [column, ascending] = {
        newest: ['created_at', false], popular: ['views', false], price: ['price', true], price_desc: ['price', false]
      }[state.sort] || ['created_at', false];
      const { data, error, count } = await query.order(column, { ascending }).order('id', { ascending: false })
        .range(nextPage * pageSize, (nextPage + 1) * pageSize - 1).abortSignal(request.signal);
      if (request !== controller) return;
      if (error || !Array.isArray(data)) throw error || Error('Respuesta inválida');
      page = nextPage;
      render(data, append, url.pathname + url.search);
      const total = Number(count ?? data.length);
      $('#count').textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;
      $('#empty').hidden = total > 0;
      $('#load-more').hidden = (page + 1) * pageSize >= total;
    } catch (_) {
      if (request !== controller) return;
      $('#results-error').hidden = false;
      $('#retry').onclick = () => load(append);
    } finally {
      clearTimeout(timeout);
      if (request === controller) {
        $('#results-status').hidden = true;
        grid.setAttribute('aria-busy', 'false');
      }
    }
  }

  function refresh() {
    clearTimeout(timer);
    void load();
  }

  Object.entries(fields).forEach(([key, selector]) => {
    const field = $(selector);
    field.value = state[key];
    if (key === 'q') return;
    field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', () => {
      state[key] = field.value.trim();
      clearTimeout(timer);
      timer = setTimeout(refresh, field.tagName === 'SELECT' ? 0 : 350);
    });
  });
  $('#academic-filters').open = advanced.some(key => state[key]);
  $('#ex-form').addEventListener('submit', event => {
    event.preventDefault();
    state.q = $('#ex-q').value.trim().slice(0, 120);
    refresh();
  });
  document.querySelectorAll('[data-q]').forEach(button => button.addEventListener('click', () => {
    state.q = button.dataset.q;
    $('#ex-q').value = state.q;
    refresh();
  }));
  $('#clear').addEventListener('click', () => {
    zone = '';
    Object.entries(fields).forEach(([key, selector]) => {
      state[key] = key === 'sort' ? 'newest' : '';
      $(selector).value = state[key];
    });
    refresh();
  });
  $('#load-more').addEventListener('click', () => void load(true));
  const media = matchMedia('(max-width:900px)');
  const resize = () => { $('#catalog-filters').open = !media.matches; };
  resize();
  media.addEventListener('change', resize);
  window.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  void load();
})();
