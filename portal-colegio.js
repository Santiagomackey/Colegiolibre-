(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const code = new URLSearchParams(location.search).get('code');
  const form = $('#editor');
  const status = $('#portal-status');
  const fields = ['name','title','description','primary','accent','logo','contact'];
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
    const identity = element('div','','school-identity');
    const logo = urlFor(content.logo);
    if (logo) {
      const img = element('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = logo.href;
      img.addEventListener('error',() => img.remove());
      identity.append(img);
    }
    identity.append(element('span',content.name || portal.school.name));
    hero.append(identity,element(editing ? 'h2' : 'h1', content.title || portal.school.name));
    if (content.description) hero.append(element('p',content.description));
    host.append(hero);
    if (content.announcements?.length) {
      const block = element('section','','school-block');
      block.append(element('h2','Comunicados'));
      for (const item of content.announcements) {
        const article = element('article');
        article.append(element('h3',item.title),element('p',item.body));
        block.append(article);
      }
      host.append(block);
    }
    if (content.resources?.length) {
      const block = element('section','','school-block');
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
      host.append(block);
    }
    const block = element('section','','school-block');
    block.append(element('h2','Comunidad'));
    const catalog = element('a','Ver publicaciones públicas del colegio');
    catalog.href = '/colegio?code=' + encodeURIComponent(portal.school.code);
    block.append(catalog);
    if (content.contact && /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(content.contact)) {
      const link = element('a','Escribir al colegio');
      link.href = 'mailto:' + content.contact;
      block.append(link);
    }
    host.append(block);
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
  function changed() { dirty = true; draw(read()); }
  function setMode(value) {
    editing = value;
    form.hidden = !editing;
    $('#layout').classList.toggle('editing',editing);
    $('#preview-label').hidden = !editing;
    $('#mode').textContent = editing ? 'Ver portal publicado' : 'Editar portal';
    draw(editing ? read() : portal.content);
  }
  form.addEventListener('input',changed);
  form.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click',() => { addRow(button.dataset.add); changed(); }));
  $('#mode').addEventListener('click',() => setMode(!editing));
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (saving) return;
    const publish = event.submitter?.value === 'publish';
    const content = read();
    if ((content.logo && !urlFor(content.logo)) || content.resources.some(item => !urlFor(item.url))) {
      status.textContent = 'Usá enlaces HTTPS para el logo y los recursos.';
      return;
    }
    saving = true;
    const controls = [...form.querySelectorAll('button,input,textarea')];
    controls.forEach(control => control.disabled = true);
    status.textContent = publish ? 'Publicando…' : 'Guardando…';
    try {
      const result = await api({ revision:portal.revision, content, publish });
      portal.revision = result.revision;
      if (publish) portal.content = content;
      dirty = false;
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
    if (!code) { status.textContent = 'Entrá desde la página de tu colegio.'; return; }
    $('#portal-content').hidden = $('#portal-login').hidden = $('#portal-verification').hidden = true;
    try {
      const result = await api(undefined,true);
      if (current !== boot) return;
      portal = result;
      document.title = portal.school.name + ' | ColegioLibre';
      $('#portal-content').hidden = false;
      $('#workspace').hidden = $('#membership').hidden = !portal.manager;
      if (portal.manager) {
        drawMembers();
        const { plan,billing_cycle,paid_through } = portal.subscription;
        const until = new Date(paid_through).toLocaleDateString('es-AR',{ timeZone:'America/Argentina/Buenos_Aires' });
        $('#plan-status').textContent = plan + ' · ' + (billing_cycle === 'annual' ? 'Anual' : 'Mensual') + ' · Pago hasta el ' + until;
        fields.forEach(key => { form.elements[key].value = portal.draft[key] || ''; });
        for (const kind of Object.keys(lists)) {
          $('#edit-'+kind).replaceChildren();
          for (const item of portal.draft[kind] || []) addRow(kind,item);
        }
      }
      status.textContent = '';
      setMode(portal.manager);
    } catch (error) {
      if (current !== boot) return;
      status.textContent = error.message;
      if (error.status === 401) {
        const link = $('#portal-login');
        link.href = '/login?next=' + encodeURIComponent('/portal-colegio?code='+encodeURIComponent(code));
        link.hidden = false;
      }
      if (error.status === 403) $('#portal-verification').hidden = false;
    }
  }
  window.colegioLibreSupabase.auth.onAuthStateChange(event => {
    if (event !== 'SIGNED_OUT') return;
    dirty = false;
    $('#school-site').replaceChildren();
    setTimeout(() => void load(),0);
  });
  window.addEventListener('pageshow',event => { if (event.persisted) { dirty = false; void load(); } });
  void load();
})();
