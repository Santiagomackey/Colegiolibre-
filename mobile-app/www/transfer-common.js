(() => {
 'use strict';
 const labels={payment_pending:['Pendiente de pago','Payment pending'],awaiting_confirmation:['Esperando confirmación','Awaiting confirmation'],paid:['Pagado','Paid'],delivered:['Entregado','Delivered'],cancelled:['Cancelado','Cancelled']};
 const english=()=>document.documentElement.dataset.language==='en';
 const text=(es,en)=>english()?en:es;
 const status=code=>(labels[code]||labels.payment_pending)[english()?1:0];
 const money=value=>new Intl.NumberFormat(english()?'en-US':'es-AR',{style:'currency',currency:'ARS',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value));
 function validateRecipient(value) {
  const alias=String(value.alias||'').trim().toLowerCase();
  const holder_name=String(value.holder_name||'').trim();
  if(!/^[a-z0-9.-]{6,20}$/.test(alias))throw Error('INVALID_ALIAS');
  if(holder_name.length<2||holder_name.length>100||/[\u0000-\u001f\u007f]/.test(holder_name))throw Error('INVALID_HOLDER');
  return {alias,holder_name};
 }
 function validatePayment(value) {
  const method=String(value.method||'');
  const account_number=String(value.account_number||'').replace(/\s/g,'');
  if(!['bank','mercado_pago'].includes(method))throw Error('INVALID_METHOD');
  const recipient=validateRecipient(value);
  if(!/^\d{22}$/.test(account_number)||/^(\d)\1{21}$/.test(account_number))throw Error('INVALID_ACCOUNT');
  return {method,...recipient,account_number};
 }
 async function saveMercadoPagoAlias(alias,holderName) {
  const recipient=validateRecipient({alias,holder_name:holderName});
  await rpc('save_my_payment_details',{
   p_method:'mercado_pago',p_alias:recipient.alias,p_account_number:null,p_holder_name:recipient.holder_name
  });
  return recipient;
 }
 const errors={PROFILE_REQUIRED:['Completá tu perfil antes de comprar.','Complete your profile before buying.'],INVALID_ALIAS:['El alias debe tener entre 6 y 20 letras, números, puntos o guiones.','Use 6–20 letters, numbers, dots or hyphens for the alias.'],INVALID_ACCOUNT:['Ingresá los 22 dígitos de tu CBU o CVU.','Enter the 22 digits of your CBU or CVU.'],INVALID_HOLDER:['Ingresá el nombre del titular de la cuenta.','Enter the account holder’s name.'],PAYMENT_DETAILS_MISSING:['El vendedor todavía no configuró sus datos de cobro. Contactalo antes de comprar.','The seller has not set up payment details yet. Contact them before buying.'],PRODUCT_IN_CHECKOUT:['Este producto tiene otro pedido activo. Contactá al vendedor.','This item has another active order. Contact the seller.'],PRODUCT_UNAVAILABLE:['Este producto ya no está disponible.','This item is no longer available.'],OWN_PRODUCT:['No podés comprar tu propia publicación.','You cannot buy your own listing.'],ORDER_NOT_FOUND:['No encontramos este pedido en tu cuenta.','This order could not be found in your account.'],AUTH_REQUIRED:['Iniciá sesión para continuar.','Sign in to continue.'],ACCOUNT_RESTRICTED:['Tu cuenta no está habilitada para comprar.','Your account cannot make purchases.'],SELLER_ONLY:['Solo el vendedor puede confirmar el dinero recibido.','Only the seller can confirm receipt of payment.'],INVALID_ORDER_STATE:['El pedido cambió. Actualizá para ver su estado.','This order has changed. Refresh to see its status.'],CANNOT_CANCEL_AFTER_TRANSFER:['No se puede cancelar después de indicar la transferencia. Contactá a la otra persona.','You cannot cancel after reporting a transfer. Contact the other person.']};
 function errorMessage(error){const code=Object.keys(errors).find(key=>String(error?.message||error).includes(key));return code?errors[code][english()?1:0]:text('No pudimos completar la acción. Volvé a intentar.','We could not complete this action. Try again.');}
 async function rpc(name,args){const {data,error}=await window.colegioLibreSupabase.rpc(name,args);if(error)throw error;return data;}
 function el(tag,className,content){const node=document.createElement(tag);if(className)node.className=className;if(content!==undefined)node.textContent=content;return node;}
 window.colegioLibreTransfers={english,text,status,money,validatePayment,saveMercadoPagoAlias,errorMessage,rpc,el};
})();
