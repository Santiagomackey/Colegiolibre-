(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const siteCode = location.pathname.match(/^\/comunidad\/([a-z0-9_-]{1,80})\/?$/i)?.[1];
  const code = siteCode || params.get('code');
  const demo = params.get('demo') === '1' && !code;
  const wantsEditor = !siteCode && params.get('edit') === '1';
  const siteUrl = value => '/comunidad/' + encodeURIComponent(value.toLowerCase());
  const form = $('#editor');
  const status = $('#portal-status');
  const fields = ['name','title','description','primary','accent','logo','cover','layout','contact'];
  const lists = { announcements: { max:8, key:'body' }, resources: { max:12, key:'url' } };
  let portal, editing = false, saving = false, dirty = false, boot = 0;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function urlFor(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url : null; }
    catch (_) { return null; }
  }
  function ink(hex) {
    const rgb = (hex.match(/\w\w/g) || []).map(pair => parseInt(pair,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722 > .179 ? '#101820' : '#ffffff';
  }
  async function api(body, manage = false) {
    const { data } = await window.colegioLibreSupabase.auth.getSession();
    if (!data?.session?.access_token) throw Object.assign(Error('Iniciá sesión para entrar al portal de tu colegio.'),{status:401});
    const headers = { Authorization: 'Bearer ' + data.session.access_token };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/school-portal?' + new URLSearchParams({code, ...(manage && {manage:'1'})}), {
      method:body?'POST':'GET', headers, body:body?JSON.stringify(body):undefined, cache:'no-store'
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(result.error),{status:response.status});
    return result;
  }
  function draw(content) {
    const host = $('#school-site');
    host.replaceChildren();
    const hero = element('section', '', 'school-hero');
    const color = /^#[0-9a-f]{6}$/i.test(content.primary) ? content.primary : '#0B2E6B';
    hero.style.setProperty('--school-color',color);
    hero.style.setProperty('--hero-ink',ink(color));
    hero.style.setProperty('--school-accent',/^#[0-9a-f]{6}$/i.test(content.accent) ? content.accent : '#67C23A');
    const cover = urlFor(content.cover);
    if (cover) {
      hero.classList.add('has-cover', content.layout === 'banner' ? 'cover-banner' : 'cover-split');
      const photo = element('img','','school-cover');
      photo.alt = '';
      photo.referrerPolicy = 'no-referrer';
      photo.src = cover.href;
      photo.addEventListener('error',() => {
        photo.remove();
        hero.classList.remove('has-cover','cover-banner','cover-split');
      });
      hero.append(photo);
    }
    const copy = element('div','','school-hero-copy');
    const brand = element('a','','school-brand');
    const name = content.name || portal.school.name;
    brand.href = '#inicio';
    const logo = urlFor(content.logo);
    const monogram = element('span',name.trim().split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase(),'school-monogram');
    brand.append(monogram,element('span',name));
    if (logo) {
      const img = element('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load',() => monogram.replaceWith(img));
      img.src = logo.href;
    }
    const header = element('header','','school-header');
    header.id = 'inicio';
    header.append(brand);
    const nav = element('nav','','school-navigation');
    nav.setAttribute('aria-label','Navegación del colegio');
    const contact = /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(content.contact || '');
    const sections = [
      ['comunicados','Comunicados',content.announcements?.length],
      ['recursos','Recursos',content.resources?.length],
      ['contacto','Contacto',contact]
    ];
    for (const [id,label,visible] of sections) {
      if (!visible) continue;
      const link = element('a',label);
      link.href = '#' + id;
      nav.append(link);
    }
    if (portal.manager && !editing) {
      const link = element('a','Administrar sitio','school-admin-link');
      link.href = '/portal-colegio?code=' + encodeURIComponent(portal.school.code) + '&edit=1';
      nav.append(link);
    }
    if (nav.childElementCount) header.append(nav);
    host.append(header);
    copy.append(element(editing ? 'h2' : 'h1', content.title || name));
    if (content.description) copy.append(element('p',content.description));
    hero.append(copy);
    host.append(hero);

    const grid = element('div','','school-content-grid');
    if (content.announcements?.length) {
      const block = element('section','','school-block');
      block.id = 'comunicados';
      block.append(element('h2','Comunicados'));
      for (const item of content.announcements) {
        const article = element('article');
        article.append(element('h3',item.title),element('p',item.body));
        block.append(article);
      }
      grid.append(block);
    }
    if (content.resources?.length) {
      const block = element('section','','school-block');
      block.id = 'recursos';
      block.append(element('h2','Recursos del colegio'));
      for (const item of content.resources) {
        const url = urlFor(item.url);
        if (!url) continue;
        const link = element('a',item.title);
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        block.append(link);
      }
      grid.append(block);
    }
    if (grid.childElementCount) host.append(grid);

    const footer = element('footer','','school-footer');
    footer.append(element('strong',name));
    if (contact) {
      const link = element('a','Escribir al colegio');
      footer.id = 'contacto';
      link.href = 'mailto:' + content.contact;
      footer.append(link);
    }
    if (demo) {
      const link = element('a','Volver a Instituciones');
      link.href = '/instituciones';
      footer.append(link);
    }
    host.append(footer);
  }

  function addRow(kind, value = {}) {
    const { max, key } = lists[kind];
    const parent = $('#edit-' + kind);
    if (parent.children.length >= max) { status.textContent = 'Llegaste al límite de esta sección.'; return; }
    const row = element('div','','edit-row');
    const titleLabel = element('label','Título');
    const title = element('input');
    title.maxLength = 95;
    title.value = value.title || '';
    titleLabel.append(title);
    const valueLabel = element('label',key === 'url' ? 'Enlace HTTPS' : 'Comunicado');
    const field = element(key === 'url' ? 'input' : 'textarea');
    if (key === 'url') field.type = 'url';
    field.maxLength = key === 'url' ? 600 : 500;
    field.value = value[key] || '';
    valueLabel.append(field);
    const remove = element('button','Quitar','remove');
    remove.type = 'button';
    remove.addEventListener('click',() => { row.remove(); changed(); });
    row.append(titleLabel,valueLabel,remove);
    parent.append(row);
  }
  function read() {
    const content = Object.fromEntries(fields.map(key => [key,form.elements[key].value.trim()]));
    for (const [kind,{key}] of Object.entries(lists)) {
      content[kind] = [...$('#edit-'+kind).children].map(row => {
        const [title,value] = row.querySelectorAll('input,textarea');
        return { title:title.value.trim(), [key]:value.value.trim() };
      }).filter(item => item.title && item[key]);
    }
    return content;
  }
  function publicationStatus() {
    $('#publication-status').textContent = dirty ? 'Cambios sin guardar' :
      portal.publishedAt ? 'Publicado el ' + new Date(portal.publishedAt).toLocaleDateString('es-AR') : 'Pendiente de publicación';
  }
  function changed() { dirty = true; publicationStatus(); draw(read()); }
  function setMode(value) {
    editing = value;
    form.hidden = !editing;
    $('#layout').classList.toggle('editing',editing);
    $('#preview-tools').hidden = $('#editor-nav').hidden = !editing;
    if (!editing) $('#school-site').classList.remove('phone-preview');
    else $('#school-site').classList.toggle('phone-preview', $('#preview-tools [data-device=phone]').getAttribute('aria-pressed') === 'true');
    draw(editing ? read() : portal.content);
  }
  form.addEventListener('input',changed);
  form.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click',() => { addRow(button.dataset.add); changed(); }));
  const deviceButtons = [...document.querySelectorAll('[data-device]')];
  deviceButtons.forEach(button => button.addEventListener('click',() => {
    for (const option of deviceButtons) option.setAttribute('aria-pressed',String(option === button));
    $('#school-site').classList.toggle('phone-preview',button.dataset.device === 'phone');
  }));
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (saving) return;
    const publish = event.submitter?.value === 'publish';
    const content = read();
    if ([content.logo,content.cover].some(value => value && !urlFor(value)) || content.resources.some(item => !urlFor(item.url))) {
      status.textContent = 'Usá enlaces HTTPS para el logo, la portada y los recursos.';
      return;
    }
    saving = true;
    const controls = [...form.querySelectorAll('button,input,textarea,select')];
    controls.forEach(control => control.disabled = true);
    status.textContent = publish ? 'Publicando…' : 'Guardando…';
    try {
      const result = await api({ revision:portal.revision, content, publish });
      portal.revision = result.revision;
      if (publish) { portal.content = content; portal.publishedAt = new Date().toISOString(); }
      dirty = false;
      publicationStatus();
      status.textContent = publish ? 'Cambios publicados para tu comunidad.' : 'Borrador guardado.';
    } catch (error) { status.textContent = error.message; }
    finally { saving = false; controls.forEach(control => control.disabled = false); }
  });
  window.addEventListener('beforeunload',event => {
    if (dirty) { event.preventDefault(); event.returnValue = true; }
  });

  const memberForm = $('#member-form');
  const memberStatus = $('#member-status');
  const memberList = $('#member-list');
  function drawMembers() {
    memberList.replaceChildren();
    for (const member of portal.members || []) {
      const row = element('li',member.email);
      const remove = element('button','Quitar autorización','remove');
      remove.type = 'button';
      remove.addEventListener('click',() => void changeMember('remove',member.email,remove));
      row.append(remove);
      memberList.append(row);
    }
  }
  async function changeMember(memberAction,email,control) {
    const current = boot;
    control.disabled = true;
    try {
      await api({ memberAction,email });
      const updated = await api(undefined,true);
      if (current !== boot) return;
      portal.members = updated.members;
      drawMembers();
      if (memberAction === 'add') memberForm.reset();
      memberStatus.textContent = memberAction === 'add' ? 'Acceso autorizado.' : 'Autorización quitada.';
    } catch (error) { if (current === boot) memberStatus.textContent = error.message; }
    finally { control.disabled = false; }
  }
  memberForm.addEventListener('submit',event => {
    event.preventDefault();
    void changeMember('add',memberForm.elements.email.value,event.submitter);
  });

  async function load() {
    const current = ++boot;
    if (demo) {
      portal = {
        school: { name:'Instituto del Parque' },
        content: {
          name:'Instituto del Parque', title:'Bienvenidos al colegio', primary:'#1d493d', accent:'#c4edac',
          description:'Materiales, novedades y recursos para las familias del Instituto del Parque. Esta vista muestra contenido de ejemplo.',
          announcements:[{title:'Feria de intercambio',body:'El viernes nos encontramos en la biblioteca para intercambiar libros y útiles.'}],
          resources:[{title:'Ver herramientas y planes institucionales',url:'https://www.colegiolibre.com/instituciones#planes'}]
        }
      };
      $('#portal-content').hidden = false;
      document.title = 'Instituto del Parque | Sitio de ejemplo';
      $('#platform-header').hidden = true;
      document.body.classList.add('school-publication');
      status.textContent = 'Vista de ejemplo';
      setMode(false);
      return;
    }
    if (!code) { status.textContent = 'Entrá desde la página de tu colegio.'; return; }
    $('#platform-header').hidden = false;
    document.body.classList.remove('school-publication');
    $('#portal-content').hidden = $('#portal-login').hidden = $('#portal-verification').hidden = true;
    $('#portal-verification').href = '/perfil?view=settings';
    $('#portal-verification').textContent = 'Revisar mi colegio';
    try {
      const result = await api(undefined,wantsEditor);
      if (current !== boot) return;
      portal = result;
      document.title = portal.school.name + ' | ColegioLibre';
      $('#portal-content').hidden = false;
      const canEdit = wantsEditor && portal.manager;
      $('#platform-header').hidden = !canEdit;
      document.body.classList.toggle('school-publication',!canEdit);
      $('#workspace').hidden = $('#membership').hidden = !canEdit;
      if (!wantsEditor && !siteCode) history.replaceState(null,'',siteUrl(portal.school.code) + location.hash);
      if (canEdit) {
        $('#published-site-link').href = siteUrl(portal.school.code);
        drawMembers();
        publicationStatus();
        const { plan,billing_cycle,paid_through } = portal.subscription;
        const until = new Date(paid_through).toLocaleDateString('es-AR',{ timeZone:'America/Argentina/Buenos_Aires' });
        $('#plan-status').textContent = plan + ' · ' + (billing_cycle === 'annual' ? 'Anual' : 'Mensual') + ' · Pago hasta el ' + until;
        fields.forEach(key => { form.elements[key].value = portal.draft[key] || (key === 'layout' ? 'split' : ''); });
        for (const kind of Object.keys(lists)) {
          $('#edit-'+kind).replaceChildren();
          for (const item of portal.draft[kind] || []) addRow(kind,item);
        }
      }
      status.textContent = '';
      if (!canEdit && !portal.publishedAt) {
        $('#portal-content').hidden = true;
        $('#platform-header').hidden = false;
        status.textContent = 'El sitio todavía no está publicado.';
        const link = $('#portal-verification');
        if (portal.manager) {
          link.href = '/portal-colegio?code=' + encodeURIComponent(portal.school.code) + '&edit=1';
          link.textContent = 'Abrir editor';
          link.hidden = false;
        }
        return;
      }
      setMode(canEdit);
      if (/^#(?:inicio|comunicados|recursos|contacto)$/.test(location.hash)) $(location.hash)?.scrollIntoView();
    } catch (error) {
      if (current !== boot) return;
      status.textContent = error.message;
      if (error.status === 401) {
        const link = $('#portal-login');
        link.href = '/login?next=' + encodeURIComponent('/portal-colegio?code='+encodeURIComponent(code)+(wantsEditor ? '&edit=1' : ''));
        link.hidden = false;
      }
      if (error.status === 403) $('#portal-verification').hidden = false;
    }
  }
  window.colegioLibreSupabase?.auth.onAuthStateChange(event => {
    if (event !== 'SIGNED_OUT') return;
    dirty = false;
    $('#school-site').replaceChildren();
    setTimeout(() => void load(),0);
  });
  window.addEventListener('pageshow',event => { if (event.persisted) { dirty = false; void load(); } });
  void load();
})();
