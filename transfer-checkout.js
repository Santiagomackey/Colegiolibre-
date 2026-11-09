(() => {
 'use strict';
 const T=window.colegioLibreTransfers,root=document.querySelector('#transfer-checkout'),message=document.querySelector('#transfer-message'),dialog=document.querySelector('#transfer-confirmation');
 let order=null,busy=false,action=null;
 const params=new URLSearchParams(location.search);
 const note=(value,error=false)=>{message.textContent=value;message.dataset.state=error?'error':'info'};
 const add=(parent,tag,cls,text)=>{const node=T.el(tag,cls,text);parent.append(node);return node};
 async function refresh(){
  try{
   const user=await window.colegioLibreApi.getCurrentUser(true);
   if(!user){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));return;}
   let id=params.get('id');
   if(!id&&params.get('product')){id=await T.rpc('start_transfer_order',{p_product_id:params.get('product')});params.set('id',id);history.replaceState(null,'','/compra?id='+encodeURIComponent(id));}
   if(!id)throw Error('ORDER_NOT_FOUND');
   order=await T.rpc('get_transfer_order',{p_order_id:id});document.querySelector('#transfer-retry').hidden=true;render();note('');
  }catch(error){document.querySelector('#transfer-retry').hidden=false;note(T.errorMessage(error),true);root.replaceChildren();const back=add(root,'a','pay-link',T.text('Volver al producto','Back to listing'));back.href=params.get('product')?'/producto?id='+encodeURIComponent(params.get('product')):'/pedidos';}
 }
 function button(parent,label,fn,secondary=false){const node=add(parent,'button',secondary?'pay-button pay-button--secondary':'pay-button',label);node.type='button';node.addEventListener('click',fn);return node;}
 function render(){
  root.replaceChildren();
  const buyer=order.role==='buyer';
  const head=add(root,'section','pay-card');add(head,'span','pay-kicker',buyer?T.text('TU COMPRA','YOUR PURCHASE'):T.text('TU VENTA','YOUR SALE'));
  const title=add(head,'h1','',order.product_title);title.dataset.noTranslate='';
  const counterpart=buyer?order.seller_name:order.buyer_name;
  if(counterpart){const person=add(head,'p','pay-muted',(buyer?T.text('Vendedor: ','Seller: '):T.text('Comprador: ','Buyer: '))+counterpart);person.dataset.noTranslate='';}
  add(head,'p','pay-order-reference',T.text('Pedido ','Order ')+order.id.slice(0,8));
  add(head,'strong','pay-total',T.money(order.amount));add(head,'span','pay-price-note',order.status==='payment_pending'&&order.listing_available!==false?T.text('Importe exacto a transferir · ARS','Exact transfer amount · ARS'):T.text('Total del pedido · ARS','Order total · ARS'));
  const steps=add(head,'ol','pay-progress');steps.setAttribute('aria-label',T.text('Estado del pedido','Order status'));
  const sequence=['payment_pending','awaiting_confirmation','paid','delivered'];
  sequence.forEach((state,index)=>{const step=add(steps,'li',index<=sequence.indexOf(order.status)?'is-complete':'',T.status(state));if(state===order.status)step.setAttribute('aria-current','step')});
  if(order.status==='cancelled')add(head,'p','pay-notice',T.text('Pedido cancelado. No realices una transferencia para este pedido.','Order cancelled. Do not send a transfer for this order.'));
  const content=add(root,'div','pay-checkout-grid');
  const payment=add(content,'section','pay-card pay-instructions');
  if(order.payment && (order.listing_available!==false || order.status==='awaiting_confirmation' || !buyer)){
   add(payment,'h2','',buyer?(order.status==='payment_pending'?T.text('Transferí al vendedor','Transfer to the seller'):T.text('Datos de tu transferencia','Your transfer details')):T.text('Cuenta indicada para este pedido','Account specified for this order'));
   add(payment,'p','pay-muted',order.status==='awaiting_confirmation'&&buyer?T.text('Ya avisaste que transferiste. No vuelvas a enviar dinero.','You reported a transfer. Do not send the money again.'):T.text('Usá Mercado Pago o tu banco. El dinero se transfiere fuera de ColegioLibre.','Use Mercado Pago or your bank. The money is transferred outside ColegioLibre.'));
   const details=add(payment,'dl','pay-details');
   const fields=[[T.text('Método','Method'),order.payment.method==='mercado_pago'?'Mercado Pago':T.text('Transferencia bancaria','Bank transfer')],[T.text('Titular','Account holder'),order.payment.holder_name],['Alias',order.payment.alias],['CBU / CVU',order.payment.account_number]];
   for(const [label,value] of fields){add(details,'dt','',label);const data=add(details,'dd','',value);data.dataset.noTranslate='';}
   if(buyer&&order.status==='payment_pending'){button(payment,T.text('Copiar alias','Copy alias'),()=>copy(order.payment.alias),true);
   button(payment,T.text('Copiar CBU / CVU','Copy CBU / CVU'),()=>copy(order.payment.account_number),true);}
   add(payment,'p','pay-small',T.text('Antes de transferir, verificá en tu banco el titular y el importe. ColegioLibre no verifica automáticamente el movimiento.','Before transferring, check the recipient and amount in your bank. ColegioLibre does not verify the transfer automatically.'));
  }else{
   add(payment,'h2','',T.status(order.status));
   add(payment,'p','pay-muted',order.status==='paid'?T.text('El vendedor confirmó el dinero recibido. Coordiná la entrega en el colegio.','The seller confirmed receipt of the money. Arrange delivery at school.'):order.status==='delivered'?T.text('El comprador confirmó que recibió el material.','The buyer confirmed receiving the item.'):T.text('No transfieras: esta publicación ya no está disponible. Si ya pagaste, avisale al vendedor y coordiná por chat.','Do not transfer: this listing is no longer available. If you already paid, notify the seller and coordinate in chat.'));
  }
  const actions=add(content,'section','pay-card');add(actions,'h2','',T.text('Siguiente paso','Next step'));
  if(order.status==='payment_pending'&&buyer){add(actions,'p','pay-muted',T.text('Después de transferir el importe exacto, avisale al vendedor. Esto no confirma el pago.','After transferring the exact amount, let the seller know. This does not confirm payment.'));button(actions,T.text('Ya transferí','I’ve transferred'),()=>confirm('claim_transfer'));}
  if(order.status==='payment_pending'&&!buyer)add(actions,'p','pay-muted',T.text('Esperá a que el comprador indique que transfirió. No entregues el material hasta verificar el dinero.','Wait for the buyer to report the transfer. Verify receipt of the money before handing over the item.'));
  if(order.status==='awaiting_confirmation'){
   add(actions,'p','pay-notice',buyer?T.text('Esperando al vendedor. No vuelvas a transferir: el pago todavía no está confirmado.','Waiting for the seller. Do not transfer again: payment is not confirmed yet.'):T.text('El comprador indicó que transfirió. Revisá los movimientos de tu cuenta; un aviso o comprobante no confirma que recibiste el dinero.','The buyer reported a transfer. Check your account transactions; a claim or receipt does not confirm that the money arrived.'));
   if(!buyer)button(actions,T.text('Confirmar pago recibido','Confirm payment received'),()=>confirm('confirm_received'));
  }
  if(order.status==='paid'&&buyer)button(actions,T.text('Confirmar que lo recibí','Confirm I received the item'),()=>confirm('confirm_delivered'));
  if(order.status==='paid'&&!buyer)add(actions,'p','pay-muted',T.text('Coordiná la entrega. El comprador confirmará cuando reciba el material.','Arrange delivery. The buyer will confirm receiving the item.'));
  if(order.status!=='cancelled'&&order.status!=='delivered')button(actions,T.text('Coordinar entrega en el colegio','Arrange delivery at school'),openChat,true);
  if(order.status==='payment_pending')button(actions,T.text('Cancelar sin transferencia','Cancel before transferring'),()=>confirm('cancel'),true);
  button(actions,T.text('Actualizar estado','Refresh status'),()=>void refresh(),true);
 }
 async function copy(value){try{await navigator.clipboard.writeText(value);note(T.text('Copiado.','Copied.'));}catch(_){note(T.text('No pudimos copiar. Seleccioná el dato y copialo manualmente.','Could not copy. Select the value and copy it manually.'),true)}}
 function confirm(next){
  action=next;
  const copy={claim_transfer:[T.text('¿Ya hiciste la transferencia?','Have you made the transfer?'),T.text('El vendedor deberá verificar que el dinero llegó a su cuenta. Tu aviso no marca el pedido como pagado.','The seller must verify the money arrived. Reporting a transfer does not mark the order paid.'),T.text('Transferí el importe exacto a la cuenta indicada.','I transferred the exact amount to the specified account.')],confirm_received:[T.text('Verificá tu cuenta antes de confirmar','Check your account before confirming'),T.text('Confirmá solo si viste el dinero acreditado en tu cuenta. No alcanza con el aviso del comprador o una captura.','Confirm only after seeing the money credited to your account. A buyer claim or screenshot is not enough.'),T.text('Verifiqué en mi cuenta que recibí el importe completo.','I checked my account and received the full amount.')],confirm_delivered:[T.text('¿Recibiste el material?','Did you receive the item?'),T.text('El pedido quedará marcado como entregado.','The order will be marked delivered.'),T.text('Ya recibí el material acordado.','I received the agreed item.')],cancel:[T.text('Cancelar este pedido','Cancel this order'),T.text('Si hubo una transferencia, no canceles: contactá a la otra persona.','If money was transferred, do not cancel: contact the other person.'),T.text('No se transfirió ni recibió dinero por este pedido.','No money was transferred or received for this order.')]};
  document.querySelector('#transfer-confirm-title').textContent=copy[next][0];document.querySelector('#transfer-confirm-copy').textContent=copy[next][1];document.querySelector('#transfer-confirm-label').textContent=copy[next][2];document.querySelector('#transfer-confirm-check').checked=false;dialog.showModal();
 }
 dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const submit=dialog.querySelector('[type="submit"]');submit.disabled=true;
  try{await T.rpc('transition_transfer_order',{p_order_id:order.id,p_action:action});dialog.close();await refresh();}
  catch(error){dialog.close();note(T.errorMessage(error),true);await refresh();note(T.errorMessage(error),true);}
  finally{busy=false;submit.disabled=false;}
 });
 document.querySelector('#transfer-confirm-cancel').addEventListener('click',()=>dialog.close());
 async function openChat(){try{const {conversation,error}=await window.colegioLibreApi.ensureConversation({buyerId:order.buyer_id,sellerId:order.seller_id,productId:order.product_id});if(error||!conversation)throw error||Error('chat');location.assign('/mensajes?id='+encodeURIComponent(conversation.id));}catch(error){note(T.errorMessage(error),true)}}
 document.querySelector('#transfer-retry').addEventListener('click',()=>void refresh());
 window.addEventListener('colegiolibre:languagechange',()=>{if(order){render();note('')}});
 window.addEventListener('pageshow',event=>{if(event.persisted)void refresh()});
 window.addEventListener('pagehide',()=>root.querySelector('.pay-instructions')?.replaceChildren());
 void refresh();
})();
