(() => {
 const T=window.colegioLibreTransfers,list=document.querySelector('#transfer-orders-list'),message=document.querySelector('#transfer-orders-message');
 let orders=[],view=new URLSearchParams(location.search).get('view')==='seller'?'seller':'buyer';
 document.querySelectorAll('[data-orders-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab.dataset.ordersView===view)));
 async function load(){
  message.textContent=T.text('Cargando pedidos…','Loading orders…');
  try{const user=await window.colegioLibreApi.getCurrentUser(true);if(!user){location.replace('/login?next=/pedidos');return}orders=await T.rpc('list_my_transfer_orders')||[];message.textContent='';render()}
  catch(error){message.textContent=T.errorMessage(error);message.dataset.state='error'}
 }
 function render(){
  list.replaceChildren();const items=orders.filter(order=>order.role===view);
  if(!items.length){const empty=T.el('div','pay-card pay-empty');empty.append(T.el('h2','',T.text('Todavía no hay pedidos acá','No orders here yet')),T.el('p','pay-muted',T.text('Tus reservas y compras aparecerán acá.','Your reservations and purchases will appear here.')));list.append(empty);return;}
  for(const order of items){const card=T.el('a','pay-order-card');card.href='/compra?id='+encodeURIComponent(order.id);const info=T.el('div');const title=T.el('h2','',order.product_title);title.dataset.noTranslate='';info.append(title,T.el('small','pay-muted',T.text('Pedido ','Order ')+order.id.slice(0,8)));const right=T.el('div','pay-order-card__right');right.append(T.el('strong','',T.money(order.amount)),T.el('span','pay-status',order.payment_provider==='pickup'&&order.status==='payment_pending'?T.text('Reservado','Reserved'):T.status(order.status)));card.append(info,right);list.append(card);}
 }
 document.querySelectorAll('[data-orders-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.ordersView;document.querySelectorAll('[data-orders-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));render()}));
 document.querySelector('#transfer-orders-retry').addEventListener('click',()=>void load());
 window.addEventListener('pagehide',()=>list.replaceChildren());window.addEventListener('colegiolibre:languagechange',render);window.addEventListener('pageshow',event=>{if(event.persisted)void load()});void load();
})();
