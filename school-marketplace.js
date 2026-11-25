(() => {
  'use strict';
  const categories = ['Libros','Apuntes','Cuadernos','Útiles','Mochilas','Tecnología','Uniformes','Otros'];
  const samples = [
    {id:'demo-1',title:'Matemática · Secundaria',category:'Libros',condition:'Como nuevo',price:18000},
    {id:'demo-2',title:'Buzo del colegio',category:'Uniformes',condition:'Usado',price:24500},
    {id:'demo-3',title:'Cuaderno cuadriculado',category:'Cuadernos',condition:'Nuevo',price:6200},
    {id:'demo-4',title:'Calculadora científica',category:'Tecnología',condition:'Usado',price:16200}
  ];
  const formatter = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
  function node(tag, className, label) {
    const el = document.createElement(tag);
    el.className = className;
    if (label) el.textContent = label;
    return el;
  }
  function card(product, school, demo) {
    const article = node('article','market-card');
    const body = node(demo?'div':'a','market-card-link');
    if (!demo) body.href = '/producto?id=' + encodeURIComponent(product.id);
    const media = node('div','market-image');
    const img = node('img','');
    img.alt = '';
    img.loading = 'lazy';
    const fallback = '/images/product-placeholder.svg';
    const demoLabels = { Libros:'Libro', Uniformes:'Uniforme', Cuadernos:'Cuaderno', Tecnología:'Calculadora' };
    if (demo) {
      media.append(node('span','market-demo-art',demoLabels[product.category]));
      media.dataset.category = product.category;
    } else {
      try {
        const image = new URL(product.image_url || fallback,location.origin);
        img.src = image.protocol === 'https:' && !image.username && !image.password ? image.href : fallback;
      } catch (_) { img.src = fallback; }
      img.addEventListener('error', () => { img.src = fallback; }, {once:true});
      media.append(img);
    }
    if (product.condition) media.append(node('span','market-condition',product.condition));
    body.append(media,node('div','market-card-copy'));
    body.lastChild.append(node('h3','',product.title),node('strong','',formatter.format(product.price)),
      node('p','',[product.category,school].filter(Boolean).join(' · ')));
    article.append(body);
    return article;
  }

  window.colegioLibreSchoolMarketplace = function ({header, demo, preview, school, catalogTitle, load}) {
    const place = node('section','school-marketplace');
    place.id = 'publicaciones';
    place.setAttribute('aria-labelledby','school-market-title');
    const form = node('form','school-search');
    form.setAttribute('role','search');
    form.setAttribute('aria-label','Buscar en el colegio');
    const search = node('input','');
    search.type = 'search';
    search.disabled = Boolean(preview);
    search.placeholder = '¿Qué material estás buscando?';
    search.setAttribute('aria-label','Buscar material escolar');
    search.maxLength = 100;
    const searchButton = node('button','','Buscar');
    searchButton.disabled = Boolean(preview);
    const categoryNav = node('nav','school-categories');
    categoryNav.setAttribute('aria-label','Categorías del colegio');
    const heading = node('div','market-heading');
    const title = node(preview ? 'h2' : 'h1','',catalogTitle || 'Publicaciones del colegio');
    title.id = 'school-market-title';
    const sort = node('select','');
    if (preview) sort.disabled = true;
    sort.setAttribute('aria-label','Ordenar publicaciones');
    for (const [id,label] of [['recent','Más recientes'],['price','Menor precio'],['price_desc','Mayor precio']]) {
      const option = node('option','',label);
      option.value = id;
      sort.append(option);
    }
    const status = node('p','market-status');
    status.setAttribute('role','status');
    const grid = node('div','market-grid');
    const next = node('button','button secondary','Ver más publicaciones');
    next.type = 'button';
    next.hidden = true;
    heading.append(title,sort);
    const request = node('a','button secondary','¿Lo necesitás? Pedilo en tu colegio');
    request.hidden = true;
    if (!demo && !preview) {
      const requests = node('a','button secondary','Ver pedidos de mi colegio');
      requests.href = '/busco?view=school#pedidos';
      place.append(requests);
    }
    place.append(heading,status,grid,next);
    if (!demo && !preview) place.append(request);
    form.append(search,searchButton);
    header.after(categoryNav);
    header.append(form);

    let category = '', query = '', page = 0, sequence = 0, retryPage = false;
    const categoryButtons = ['',...categories].map(value => {
      const button = node('button','',value || 'Todo');
      button.type = 'button';
      button.disabled = Boolean(preview);
      button.setAttribute('aria-pressed',String(value === ''));
      button.addEventListener('click', () => {
        category = value;
        for (const item of categoryButtons) item.setAttribute('aria-pressed',String(item === button));
        void update();
        place.scrollIntoView({block:'nearest'});
      });
      categoryNav.append(button);
      return button;
    });
    async function update(append = false) {
      request.hidden = true;
      const revision = ++sequence;
      const offset = append ? page + 1 : 0;
      if (!append) grid.replaceChildren();
      next.hidden = true;
      next.textContent = 'Ver más publicaciones';
      grid.setAttribute('aria-busy','true');
      status.textContent = 'Cargando publicaciones…';
      try {
        let result;
        if (demo) {
          const products = samples.filter(item => (!category || item.category === category) &&
            (!query || item.title.toLowerCase().includes(query.toLowerCase())));
          if (sort.value !== 'recent') products.sort((a,b) => (a.price-b.price) * (sort.value === 'price' ? 1 : -1));
          result = {products,more:false};
        } else {
          result = await load({category,q:query,sort:sort.value,page:String(offset)});
        }
        if (revision !== sequence || !place.isConnected) return;
        page = offset;
        for (const item of result.products) grid.append(card(item,school,demo));
        status.textContent = grid.children.length ? '' :
          (category || query ? 'No encontramos publicaciones para esta búsqueda.' : 'Todavía no hay publicaciones disponibles en tu colegio.');
        request.href = '/busco?' + new URLSearchParams({scope:'school', title:query, category}) + '#crear-pedido';
        request.hidden = grid.children.length > 0;
        next.hidden = !result.more;
      } catch (_) {
        if (revision === sequence) {
          status.textContent = 'No pudimos cargar las publicaciones.';
          retryPage = append;
          next.textContent = 'Reintentar';
          next.hidden = false;
        }
      } finally {
        if (revision === sequence) grid.setAttribute('aria-busy','false');
      }
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      query = search.value.trim();
      void update();
      place.scrollIntoView({block:'nearest'});
    });
    sort.addEventListener('change', () => void update());
    next.addEventListener('click', () => {
      const append = next.textContent === 'Reintentar' ? retryPage : true;
      next.textContent = 'Ver más publicaciones';
      void update(append);
    });
    return {place, start() {
      if (!preview) { void update(); return; }
      if (demo) for (const product of samples) grid.append(card(product,school,true));
      else status.textContent = 'Acá se mostrarán las publicaciones disponibles del colegio.';
    }};
  };
})();
