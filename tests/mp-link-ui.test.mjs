import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

async function fixture({
  user = { id: 'seller' },
  details = null,
  readError = null,
  hasSignIn = true
} = {}) {
  const events = {};
  const handlers = {};
  const calls = [];
  const message = {};
  const signIn = { hidden: true };
  const submit = {};
  const form = {
    hidden: true,
    elements: { alias: { value: '' }, holder_name: { value: '' } },
    reset() { this.elements.alias.value = this.elements.holder_name.value = ''; },
    querySelector: () => submit,
    addEventListener(name, fn) { handlers[name] = fn; }
  };
  const nodes = {
    'mp-alias-form': form,
    'mp-alias-message': message,
    'mp-alias-sign-in': hasSignIn ? signIn : null
  };
  let language = 'es';
  const document = {
    documentElement: { dataset: { language } },
    getElementById: (id) => nodes[id],
    addEventListener: (name, fn) => { events[name] = fn; }
  };
  const window = {
    addEventListener: (name, fn) => { events[name] = fn; },
    colegioLibreSupabase: {
      auth: { getSession: async () => ({ data: { session: user ? { user } : null } }) },
      rpc: async (name, args) => {
        calls.push({ name, args });
        return name === 'get_my_payment_details'
          ? { data: details, error: readError }
          : { data: null, error: null };
      }
    }
  };
  const context = { window, document };
  vm.runInNewContext(read('transfer-common.js'), context);
  vm.runInNewContext(read('mp-link-settings.js'), context);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  await settle();
  return {
    form, message, signIn, calls, submit, settle, events,
    setUser: (next) => { user = next; },
    setReadError: (next) => { readError = next; },
    setLanguage: (next) => {
      language = next;
      document.documentElement.dataset.language = language;
      events['colegiolibre:languagechange']();
    },
    edit(alias, holder) {
      form.elements.alias.value = alias;
      form.elements.holder_name.value = holder;
      handlers.input();
    },
    save: () => handlers.submit({ preventDefault() {} })
  };
}

test('Más and Profile use the same alias form', () => {
  for (const name of ['mas.html', 'perfil.html']) {
    const html = read(name);
    assert.match(html, /<form id="mp-alias-form"[^>]*hidden/);
    assert.match(html, /mp-link-settings\.js\?v=20261111-alias44/);
    assert.doesNotMatch(html, /id="mp-link-connect"|id="mp-authorization-options"/);
  }
  assert.match(read('site-header.js'), /href="\/mas#mercado-pago"[^>]*>Alias de Mercado Pago/);
});

test('saves a normalized alias and account holder directly, without OAuth', async () => {
  const ui = await fixture();
  assert.equal(ui.form.hidden, false);
  ui.edit(' Mi.Alias ', ' Titular de Prueba ');
  await ui.save();
  assert.deepEqual(ui.calls.map(({ name }) => name), ['get_my_payment_details', 'save_my_payment_details']);
  assert.deepEqual({ ...ui.calls[1].args }, {
    p_method: 'mercado_pago', p_alias: 'mi.alias',
    p_holder_name: 'Titular de Prueba', p_account_number: null
  });
  assert.equal(ui.form.elements.alias.value, 'mi.alias');
  assert.equal(ui.message.textContent, 'Alias guardado.');
  ui.setLanguage('en');
  assert.equal(ui.message.textContent, 'Alias saved.');
  assert.equal(ui.submit.disabled, false);
});

test('loads a saved alias and preserves edits on refresh', async () => {
  const ui = await fixture({ details: { method: 'mercado_pago', alias: 'mi.alias', holder_name: 'Titular' }, hasSignIn: false });
  assert.equal(ui.form.elements.alias.value, 'mi.alias');
  assert.equal(ui.form.elements.holder_name.value, 'Titular');
  ui.edit('nuevo.alias', 'Titular');
  ui.events.visibilitychange();
  await ui.settle();
  assert.equal(ui.form.elements.alias.value, 'nuevo.alias');
});

test('shows sign-in for guests and never submits details across a session change', async () => {
  const guest = await fixture({ user: null });
  assert.equal(guest.form.hidden, true);
  assert.equal(guest.signIn.hidden, false);
  assert.equal(guest.calls.length, 0);
  const ui = await fixture();
  ui.edit('mi.alias', 'Titular');
  ui.setUser(null);
  await ui.save();
  await ui.settle();
  assert.deepEqual(ui.calls.map(({ name }) => name), ['get_my_payment_details']);
  assert.equal(ui.form.hidden, true);
  assert.equal(ui.signIn.hidden, false);
  assert.equal(ui.form.elements.alias.value, '');
});

test('blocks invalid aliases and recovers after a read error', async () => {
  const ui = await fixture({ readError: new Error('offline') });
  assert.equal(ui.form.hidden, true);
  assert.match(ui.message.textContent, /No pudimos cargar/);
  ui.setReadError(null);
  ui.events.visibilitychange();
  await ui.settle();
  assert.equal(ui.form.hidden, false);
  ui.edit('bad', 'Titular');
  await ui.save();
  assert.match(ui.message.textContent, /6 y 20/);
  assert.equal(ui.calls.some(({ name }) => name === 'save_my_payment_details'), false);
});
