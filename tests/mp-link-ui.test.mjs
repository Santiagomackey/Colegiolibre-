import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
async function fixture({user = 'seller', enabled = true, linked = false, connectError = false} = {}) {
  const events = {}, nodes = {}, requests = [];
  let connections = 0;
  const card = {querySelector(selector) {
    return nodes[selector] ||= {addEventListener(name, fn) { this[name] = fn; }};
  }};
  const window = {
    colegioLibreSupabase: {auth: {getSession: async () => ({data:{session:user ? {user:{id:user}} : null}})}},
    colegioLibreMercadoPago: {
      request: async path => {requests.push(path); return {enabled, linked};},
      connect: async () => {connections++; if (connectError) throw Error('offline');}
    },
    addEventListener(name, fn) { events[name] = fn; }
  };
  const document = {querySelector: () => card, documentElement:{dataset:{language:'es'}}, addEventListener() {}};
  vm.runInNewContext(read('mp-link-settings.js'), {window, document, URLSearchParams, location:{search:''}});
  await settle();
  return {button:nodes['[data-mp-connect]'], login:nodes['[data-mp-login]'], status:nodes['[data-mp-status]'], requests, count:()=>connections};
}
test('Más links to the seller connection settings in Profile', () => {
  assert.match(read('mas.html'), /href="\/perfil\?view=settings#datos-cobro"/);
  assert.match(read('perfil.html'), /data-mp-connect-card/);
});
test('signed-in sellers can open OAuth in the ready state', async () => {
  const ui = await fixture();
  assert.deepEqual(ui.requests,['?seller=1']); assert.equal(ui.button.disabled,false);
  await ui.button.click(); assert.equal(ui.count(),1);
});
test('linked accounts offer reconnection', async () => {
  const ui=await fixture({linked:true});assert.match(ui.button.textContent,/Volver a conectar/);
});
test('guests see sign-in and cannot start a connection', async () => {
  const ui=await fixture({user:null});assert.equal(ui.login.hidden,false);assert.equal(ui.button.hidden,true);
  await ui.button.click();assert.equal(ui.count(),0);assert.deepEqual(ui.requests,[]);
});
test('unavailable and failed connections give actionable feedback', async () => {
  const off=await fixture({enabled:false});assert.equal(off.button.disabled,true);
  const ui=await fixture({connectError:true});await ui.button.click();
  assert.match(ui.status.textContent,/Volvé a intentar/);assert.equal(ui.button.disabled,false);
});
