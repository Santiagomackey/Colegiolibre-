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
