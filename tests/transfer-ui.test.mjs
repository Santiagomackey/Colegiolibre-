import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
test('payment form normalization preserves leading zeroes, validates inputs and translates order statuses',()=>{
 const window={},document={documentElement:{dataset:{language:'es'}}};
 vm.runInNewContext(fs.readFileSync(new URL('../transfer-common.js',import.meta.url),'utf8'),{window,document,Intl});
 const T=window.colegioLibreTransfers;
 const data=T.validatePayment({method:'mercado_pago',alias:' LIBROS.SANTI ',account_number:'00000031 00012345678901',holder_name:' Santiago Pérez '});
 assert.equal(data.account_number,'0000003100012345678901');assert.equal(data.alias,'libros.santi');assert.equal(data.holder_name,'Santiago Pérez');
 for(const patch of [{alias:'short'},{alias:'bad alias'},{account_number:'0000000000000000000000'},{account_number:'12345'},{holder_name:'A'},{method:'credit_card'}])assert.throws(()=>T.validatePayment({...data,...patch}));
 assert.equal(T.status('awaiting_confirmation'),'Esperando confirmación');document.documentElement.dataset.language='en';assert.equal(T.status('awaiting_confirmation'),'Awaiting confirmation');assert.match(T.errorMessage(Error('SELLER_ONLY')),/Only the seller/);assert.match(T.money('1250.50'),/1,250\.50/);
});

test('viewing checkout leaves stock free, and a competing reservation hides payment details', async () => {
 const checkout = fs.readFileSync(new URL('../transfer-checkout.js', import.meta.url), 'utf8');
 function element(textContent = '') {
  return {
   textContent,
   children: [],
   dataset: {},
   events: {},
   append(child) { this.children.push(child); },
   replaceChildren() { this.children = []; },
   addEventListener(name, handler) { this.events[name] = handler; },
   querySelector() { return element(); }
  };
 }
 const selectors = new Map();
 const document = {
  addEventListener() {},
  querySelector(selector) {
   if (!selectors.has(selector)) selectors.set(selector, element());
   return selectors.get(selector);
  }
 };
 const product = { id: 'book', user_id: 'seller', title: 'Biología', price: 3000 };
 const query = {
  select() { return this; },
  eq() { return this; },
  async maybeSingle() { return { data: product, error: null }; }
 };
 const calls = [];
 const window = {
  addEventListener() {},
  colegioLibreApi: { async getCurrentUser() { return { id: 'buyer' }; } },
  colegioLibreSupabase: { from() { return query; } },
  colegioLibreTransfers: {
   el(_tag, _cls, text) { return element(text); },
   text(es) { return es; },
   money(value) { return String(value); },
   errorMessage(error) { return error.message; },
   async rpc(name, params) {
    if(name==='pickup_checkout_ready')return true;
    calls.push([name, params.p_product_id]);
    throw Error('PRODUCT_IN_CHECKOUT');
   }
  }
 };
 vm.runInNewContext(checkout, {
  window, document, URLSearchParams,
  location: { pathname: '/compra', search: '?product=book' }
 });
 await new Promise(setImmediate);
 const root = document.querySelector('#transfer-checkout');
 const all = node => [node, ...node.children.flatMap(all)];
 const reserve = all(root).find(node => node.textContent === 'Reservar y pagar al retirar');
 assert.ok(reserve);
 assert.deepEqual(calls, []);
 await Promise.all([reserve.events.click({ currentTarget: reserve }), reserve.events.click({ currentTarget: reserve })]);
 assert.deepEqual(calls, [['start_pickup_order', 'book']]);
 assert.ok(all(root).some(node => node.textContent === 'Este producto está reservado'));
 assert.ok(all(root).every(node => node.textContent !== 'Copiar alias'));
});
