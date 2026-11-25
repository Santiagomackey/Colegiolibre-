(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const route = location.pathname.match(/^\/comunidad\/([a-z0-9_-]{1,80})(\/editor)?\/?$/i);
  const shortRoute = location.pathname.match(/^\/([a-z0-9_-]+-school|colegio-[a-z0-9_-]+)(\/editor)?\/?$/i);
  const slug = shortRoute?.[1].toLowerCase();
  const siteCode = route?.[1] || (slug?.endsWith('-school') ? slug : slug?.slice('colegio-'.length));
  const code = siteCode || params.get('code');
  const demo = params.get('demo') === '1' && !code;
  const wantsEditor = Boolean(route?.[2] || shortRoute?.[2]) || (!siteCode && params.get('edit') === '1');
  const siteUrl = () => portal.school.path || '/comunidad/' + encodeURIComponent(portal.school.code.toLowerCase());
  const form = $('#editor');
  const status = $('#portal-status');
  const fields = ['name','title','description','primary','accent','logo','cover','layout','sectionOrder','contact','catalogTitle','headerStyle','surface','cardStyle','membershipMode'];
  const lists = { announcements: { max:8, key:'body' }, resources: { max:12, key:'url' } };
  let portal, editing = false, saving = false, dirty = false, boot = 0, previewFrame;
  let demoLogo;
  const editorFeedback = $('#editor-feedback');
  const editorUrl = () => siteUrl() + '/editor';

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
  async function api(body, manage = false, query = {}) {
    const { data } = await window.colegioLibreSupabase.auth.getSession();
    if (!data?.session?.access_token) throw Object.assign(Error('Iniciá sesión para entrar al portal de tu colegio.'),{status:401});
    const headers = { Authorization: 'Bearer ' + data.session.access_token };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/school-portal?' + new URLSearchParams({code, ...query, ...(manage && {manage:'1'})}), {
      method:body?'POST':'GET', headers, body:body?JSON.stringify(body):undefined, cache:'no-store'
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(result.error),{status:response.status});
    return result;
  }
  function draw(content) {
    const host = $('#school-site');
    host.replaceChildren();
    host.dataset.header = content.headerStyle || 'light';
    host.dataset.surface = content.surface || 'neutral';
    host.dataset.cards = content.cardStyle || 'rounded';
    const hero = element('section', '', 'school-hero');
    const color = /^#[0-9a-f]{6}$/i.test(content.primary) ? content.primary : '#0B2E6B';
    host.style.setProperty('--school-color',color);
    host.style.setProperty('--school-ink',ink(color));
    const accent = /^#[0-9a-f]{6}$/i.test(content.accent) ? content.accent : '#67C23A';
    host.style.setProperty('--school-accent',accent);
    const name = content.name || portal.school.name;
    const title = content.title && content.title !== 'Bienvenidos a nuestra comunidad' && content.title !== name ? content.title : '';
    const hasIntro = Boolean(title || content.description);
    const cover = urlFor(content.cover);
    hero.classList.toggle('cover-compact',content.layout === 'compact');

    if (cover) {
      hero.classList.add('has-cover', content.layout === 'split' ? 'cover-split' : 'cover-banner');
      const photo = element('img','','school-cover');
      photo.alt = '';
      photo.referrerPolicy = 'no-referrer';
      photo.addEventListener('error',() => {
        photo.remove();
        hero.classList.remove('has-cover','cover-banner','cover-split');
        if (!hasIntro) hero.remove();
      });
      photo.src = cover.href;
      hero.append(photo);
    }
    const copy = element('div','','school-hero-copy');
    const brand = element('a','','school-brand');
    brand.href = '#inicio';
    const logo = urlFor(content.logo);
    const monogram = element('span',name.trim().split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase(),'school-monogram');
    brand.append(monogram,element('span',name));
    if (logo || (demo && editing && demoLogo)) {
      const img = element('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load',() => monogram.replaceWith(img));
      img.src = demo && editing && demoLogo ? demoLogo : logo.href;
    }
    const header = element('header','','school-header');
    header.id = 'inicio';
    header.append(brand);
    const nav = element('nav','','school-navigation');
    nav.setAttribute('aria-label','Navegación del colegio');
    const contact = /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(content.contact || '');
    const sections = [
      ['publicaciones','Catálogo',true],
      ['comunicados','Comunicados',content.announcements?.length],
      ['recursos','Recursos',content.resources?.length],
      ['contacto','Contacto',contact]
    ];
    for (const [id,label,visible] of sections) {
      if (!visible) continue;
      const link = element('a',label);
      link.href = '#' + id;
      if (editing) link.addEventListener('click',event => {
        event.preventDefault();
        host.querySelector('#' + id)?.scrollIntoView({block:'nearest'});
      });
      nav.append(link);
    }
    if (portal.manager && !editing) {
      const link = element('a','Administrar sitio','school-admin-link');
      link.href = editorUrl();
      nav.append(link);
    }
    if (nav.childElementCount) header.append(nav);
    host.append(header);
    if (hasIntro) {
      if (title) copy.append(element('h2',title));
      if (content.description) copy.append(element('p',content.description));
      hero.append(copy);
    } else {
      hero.classList.add('image-only');
    }
    if (cover || hasIntro) host.append(hero);
    const market = window.colegioLibreSchoolMarketplace({
      header,demo,preview:editing,school:name,catalogTitle:content.catalogTitle,load:params => api(undefined,false,{...params,catalog:'1'})
    });
    if (content.sectionOrder !== 'community') host.append(market.place);

    const grid = element('div','','school-content-grid');
    if (content.announcements?.length) {
      const block = element('section','','school-block');
      block.id = 'comunicados';
      block.classList.add('school-announcements');
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
      block.classList.add('school-resources');
      block.append(element('h2','Recursos del colegio'));
      for (const item of content.resources) {
        const url = urlFor(item.url);
        if (!url) continue;
        const link = element('a',item.title,'resource-link');
        link.href = url.href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        block.append(link);
      }
      grid.append(block);
    }
    if (grid.childElementCount) host.append(grid);
    if (content.sectionOrder === 'community') host.append(market.place);
    market.start();

    const footer = element('footer','','school-footer');
    footer.append(element('strong',name));
    if (contact) {
      const link = element('a','Escribir al colegio');
      footer.id = 'contacto';
      link.href = 'mailto:' + content.contact;
      footer.append(link);
    }
    const platform = element('a','ColeGo');
    platform.href = demo ? '/instituciones' : '/';
    footer.append(platform);
    host.append(footer);
  }

  function addRow(kind, value = {}) {
    const { max, key } = lists[kind];
    const parent = $('#edit-' + kind);
    if (parent.children.length >= max) { editorFeedback.textContent = 'Llegaste al límite de esta sección.'; return; }
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
    const up = element('button','Subir','row-action');
    up.type = 'button';
    up.addEventListener('click',() => {
      if (!row.previousElementSibling) return;
      row.previousElementSibling.before(row);
      up.focus();
      changed();
    });
    const actions = element('div','','row-actions');
    actions.append(up,remove);
    row.append(titleLabel,valueLabel,actions);
    parent.append(row);
    return title;
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
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function selectTab(tab) {
    for (const option of tabs) {
      const selected = option === tab;
      option.setAttribute('aria-selected',String(selected));
      option.tabIndex = selected ? 0 : -1;
      document.getElementById(option.getAttribute('aria-controls')).hidden = !selected;
    }
  }
  for (const tab of tabs) {
    tab.addEventListener('click',() => selectTab(tab));
    tab.addEventListener('keydown',event => {
      const index = tabs.indexOf(tab);
      const next = {ArrowRight:(index+1)%tabs.length,ArrowLeft:(index+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
      if (next === undefined) return;
      event.preventDefault();
      selectTab(tabs[next]);
      tabs[next].focus();
    });
  }
  $('#copy-site-link').addEventListener('click', async () => {
    const feedback = $('#share-feedback');
    try {
      await navigator.clipboard.writeText(new URL(siteUrl(),location.origin).href);
      feedback.textContent = 'Enlace copiado.';
    } catch (_) {
      feedback.textContent = 'Copiá la dirección que aparece debajo del nombre del colegio.';
    }
  });

  function publicationStatus() {
    $('#copy-site-link').hidden = demo || !portal.publishedAt;
    $('#publication-status').textContent = dirty ? 'Cambios sin guardar' : portal.draftSaved ? 'Borrador guardado' :
      portal.publishedAt ? 'Publicado el ' + new Date(portal.publishedAt).toLocaleDateString('es-AR') : 'Pendiente de publicación';
  }
  function changed() {
    dirty = true;
    editorFeedback.textContent = '';
    publicationStatus();
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => { if (editing) draw(read()); });
  }
  function setMode(value) {
    editing = value;
    $('#editor-sidebar').hidden = $('#preview-tools').hidden = !editing;
    $('#layout').classList.toggle('editing',editing);
    document.body.classList.toggle('editing-site',editing);
    $('#school-site').classList.toggle('phone-preview',editing && $('#preview-tools [data-device=phone]').getAttribute('aria-pressed') === 'true');
    draw(editing ? read() : portal.content);
  }
  form.addEventListener('input',event => {
    if (event.target.id === 'logo-file') return;
    if (event.target.name === 'logo' && demoLogo) {
      URL.revokeObjectURL(demoLogo);
      demoLogo = '';
    }
    changed();
  });
  form.elements.membershipMode.addEventListener('change',changed);
  $('#logo-file').addEventListener('change', async event => {
    const input = event.target;
    const file = input.files[0];
    input.value = '';
    if (!file || saving) return;
    const ext = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp' }[file.type];
    if (!ext || file.size > 2 * 1024 * 1024) {
      editorFeedback.textContent = 'Elegí una imagen PNG, JPG o WebP de hasta 2 MB.';
      return;
    }
    if (demo) {
      if (demoLogo) URL.revokeObjectURL(demoLogo);
      demoLogo = URL.createObjectURL(file);
      changed();
      return;
    }
    const current = boot;
    saving = true;
    input.disabled = true;
    editorFeedback.textContent = 'Subiendo logo…';
    try {
      const folder = portal.brandingFolder;
      if (!/^[a-z0-9_-]{1,80}$/.test(folder || '')) throw Error();
      const path = folder + '/logos/' + crypto.randomUUID() + '.' + ext;
      const storage = window.colegioLibreSupabase.storage.from('school-branding');
      const { error } = await storage.upload(path,file,{contentType:file.type,upsert:false});
      if (error) throw error;
      if (current !== boot) return;
      form.elements.logo.value = storage.getPublicUrl(path).data.publicUrl;
      changed();
      editorFeedback.textContent = 'Logo cargado. Guardá o publicá para aplicar el cambio.';
    } catch (_) {
      if (current === boot) editorFeedback.textContent = 'No pudimos subir el logo. Intentá de nuevo o usá un enlace HTTPS.';
    } finally {
      input.disabled = false;
      saving = false;
    }
  });
  form.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click',() => {
    const added = addRow(button.dataset.add);
    if (added) { changed(); added.focus(); }
  }));
  // Reveal the panel containing a field before the browser reports its validation error.
  form.addEventListener('invalid',event => {
    const panel = event.target.closest('[role=tabpanel]');
    if (panel?.hidden && !form.querySelector('section:not([hidden]) :invalid')) {
      selectTab(document.getElementById(panel.getAttribute('aria-labelledby')));
    }
  }, true);
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
      editorFeedback.textContent = 'Usá enlaces HTTPS para el logo, la portada y los recursos.';
      return;
    }
    saving = true;
    const controls = [...form.querySelectorAll('button,input,textarea,select'),$('#save-draft'),$('#publish-site')];
    controls.forEach(control => control.disabled = true);
    editorFeedback.textContent = publish ? 'Publicando…' : 'Guardando…';
    const current = boot;
    try {
      const result = demo ? { revision:portal.revision + 1 } : await api({ revision:portal.revision, content, publish });
      if (current !== boot) return;
      portal.draftSaved = !publish;
      portal.revision = result.revision;
      if (publish) { portal.content = content; portal.publishedAt = new Date().toISOString(); }
      dirty = false;
      publicationStatus();
      editorFeedback.textContent = demo ? 'Cambios aplicados a esta demostración.' : publish ? 'Cambios publicados para tu comunidad.' : 'Borrador guardado.';
    } catch (error) { if (current === boot) editorFeedback.textContent = error.message; }
    finally { saving = false; controls.forEach(control => control.disabled = false); }
  });
  window.addEventListener('beforeunload',event => {
    if (dirty) { event.preventDefault(); event.returnValue = true; }
  });

  const memberForm = $('#member-form');
  const memberStatus = $('#member-status');
  const memberList = $('#member-list');
  $('#member-filter').addEventListener('input',drawMembers);
  function drawMembers() {
    const requests = $('#school-access-list');
    requests.replaceChildren();
    for (const entry of portal.accessRequests || []) {
      const row = element('li');
      row.append(element('span',[entry.name,entry.email].filter(Boolean).join(' · ')));
      const actions = entry.status === 'pending' ? [['approved','Aprobar'],['rejected','Rechazar']] : [['revoked','Quitar acceso']];
      for (const [review,label] of actions) {
        const button = element('button',label);
        button.type = 'button';
        button.addEventListener('click',async () => {
          const controls = row.querySelectorAll('button');
          controls.forEach(control => control.disabled = true);
          try {
            await api({review,userId:entry.user_id});
            if (review === 'approved') entry.status = review;
            else portal.accessRequests = portal.accessRequests.filter(item => item !== entry);
            drawMembers();
            memberStatus.textContent = {approved:'Acceso aprobado.',rejected:'Solicitud rechazada.',revoked:'Acceso quitado.'}[review];
          } catch (error) { memberStatus.textContent = error.message; }
          finally { controls.forEach(control => control.disabled = false); }
        });
        row.append(button);
      }
      requests.append(row);
    }
    if (!requests.childElementCount) requests.append(element('li','Todavía no hay solicitudes.'));
    memberList.replaceChildren();
    const members = portal.members || [];
    const query = $('#member-filter').value.trim().toLowerCase();
    const visible = members.filter(member => member.email.toLowerCase().includes(query));
    $('#member-filter-label').hidden = !members.length;
    if (!visible.length) memberList.append(element('li',query && members.length ? 'No encontramos ese correo.' : 'Todavía no hay correos autorizados.'));
    for (const member of visible) {
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
      if (demo) {
        const address = email.trim().toLowerCase();
        const members = (portal.members || []).filter(member => member.email !== address);
        if (memberAction === 'add') members.push({email:address});
        portal.members = members;
      } else {
        await api({ memberAction,email });
        const updated = await api(undefined,true);
        if (current !== boot) return;
        portal.members = updated.members;
      }
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

  function prepareEditor() {
    $('#editor-school').textContent = portal.school.name;
    $('#published-site-link').href = demo ? '/portal-colegio?demo=1' : siteUrl();
    $('#manage-plan').hidden = demo;
    $('#school-site-address').hidden = demo;
    $('#school-site-address').textContent = demo ? '' : location.host + siteUrl();
    $('#share-feedback').textContent = '';
    $('#member-filter').value = '';
    memberForm.reset();
    memberStatus.textContent = editorFeedback.textContent = '';
    drawMembers();
    publicationStatus();
    const plan = portal.subscription;
    $('#plan-status').textContent = plan
      ? (plan.plan === 'Institucional' ? 'Básico' : plan.plan) + ' · ' + (plan.billing_cycle === 'annual' ? 'Anual' : 'Mensual') + ' · Pago hasta el ' +
        new Date(plan.paid_through).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})
      : 'Modo de prueba';
    const defaults = {
      layout:'split',sectionOrder:'catalog',primary:'#0B2E6B',accent:'#67C23A',
      headerStyle:'light',surface:'neutral',cardStyle:'rounded',membershipMode:'community'
    };
    fields.forEach(key => {
      form.elements[key].value = portal.draft[key] || defaults[key] || '';
    });
    for (const kind of Object.keys(lists)) {
      if (portal.limits) lists[kind].max = portal.limits[kind];
      $('#edit-'+kind).replaceChildren();
      for (const item of portal.draft[kind] || []) addRow(kind,item);
    }
    selectTab(tabs[0]);
  }

  async function load() {
    const current = ++boot;
    if (demo) {
      portal = {
        school: { name:'Instituto del Parque' },
        content: {
          layout:'split', name:'Instituto del Parque', primary:'#123a30', accent:'#d8ef93',
          announcements:[
            {title:'Feria de intercambio',body:'El viernes nos encontramos en la biblioteca para intercambiar libros y útiles.'},
            {title:'Prepará los materiales del próximo ciclo',body:'Revisá la lista de tu curso antes de comprar o publicar materiales.'}
          ],
          resources:[{title:'Ver herramientas y planes institucionales',url:'https://www.colego.com.ar/instituciones#planes'}]
        }
      };
      $('#portal-content').hidden = false;
      document.title = 'Instituto del Parque | Sitio de ejemplo';
      portal.revision = 0;
      portal.draft = {...portal.content};
      $('#platform-header').hidden = !wantsEditor;
      $('#workspace').hidden = !wantsEditor;
      document.body.classList.toggle('school-publication',!wantsEditor);
      status.replaceChildren(element('span',wantsEditor ? 'Editor de ejemplo · Los cambios duran solo en esta pantalla.' : 'Portal de ejemplo'));
      if (!wantsEditor) {
        const tryEditor = element('a','Probar el editor →');
        tryEditor.href = '/portal-colegio?demo=1&edit=1';
        status.append(tryEditor);
      }
      if (wantsEditor) prepareEditor();
      setMode(wantsEditor);
      return;
    }
    if (!code) { status.textContent = 'Entrá desde la página de tu colegio.'; return; }
    $('#platform-header').hidden = false;
    document.body.classList.remove('school-publication');
    $('#portal-content').hidden = $('#portal-login').hidden = $('#portal-verification').hidden = true;
    $('#portal-verification').href = '/colegio';
    $('#portal-verification').textContent = 'Ir a Mi colegio';
    try {
      const result = await api(undefined,wantsEditor);
      if (current !== boot) return;
      portal = result;
      document.title = portal.school.name + ' | ColeGo';
      $('#portal-content').hidden = false;
      const canEdit = wantsEditor && portal.manager;
      $('#platform-header').hidden = !canEdit;
      document.body.classList.toggle('school-publication',!canEdit);
      $('#workspace').hidden = !canEdit;
      const canonicalPath = canEdit ? editorUrl() : siteUrl();
      if (location.pathname !== canonicalPath) history.replaceState(null,'',canonicalPath + location.hash);
      if (canEdit) prepareEditor();
      status.textContent = '';
      if (!canEdit && !portal.publishedAt) {
        $('#portal-content').hidden = true;
        $('#platform-header').hidden = false;
        status.textContent = 'El sitio todavía no está publicado.';
        const link = $('#portal-verification');
        if (portal.manager) {
          link.href = editorUrl();
          link.textContent = 'Abrir editor';
          link.hidden = false;
        }
        return;
      }
      setMode(canEdit);
      if (/^#(?:inicio|publicaciones|comunicados|recursos|contacto)$/.test(location.hash)) $(location.hash)?.scrollIntoView();
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
