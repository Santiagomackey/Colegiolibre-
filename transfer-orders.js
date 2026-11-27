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
  void window.renderColegoPurchases(list, { orders, role: view });
 }
 document.querySelectorAll('[data-orders-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.ordersView;document.querySelectorAll('[data-orders-view]').forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));render()}));
 document.querySelector('#transfer-orders-retry').addEventListener('click',()=>void load());
 window.addEventListener('pagehide',()=>list.replaceChildren());window.addEventListener('colegiolibre:languagechange',render);window.addEventListener('pageshow',event=>{if(event.persisted)void load()});void load();
})();
