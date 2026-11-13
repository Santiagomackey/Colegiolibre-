(() => {
 'use strict';
 const T=window.colegioLibreTransfers,root=document.querySelector('#transfer-checkout'),message=document.querySelector('#transfer-message'),dialog=document.querySelector('#transfer-confirmation');
 let order=null,product=null,busy=false,action=null;
 const MP=window.colegioLibreMercadoPago;
 let providerState='',paymentMode='transfer';
 const params=new URLSearchParams(location.search);
 const productId=params.get('product');
 const listingUrl=productId?'/producto?id='+encodeURIComponent(productId):'/pedidos';
 const retry=document.querySelector('#transfer-retry');
 const note=(value,error=false)=>{message.textContent=value;message.dataset.state=error?'error':'info'};
 const add=(parent,tag,cls,text)=>{const node=T.el(tag,cls,text);parent.append(node);return node};
 async function refresh({reserve=false}={}){
  try{
   const user=await window.colegioLibreApi.getCurrentUser(true);
   if(!user){location.replace('/login?next='+encodeURIComponent(location.pathname+location.search));return;}
   let id=params.get('id');
   if(!id&&productId&&reserve){
    let hosted;
    if(paymentMode==='mercado_pago'){
     const checkout=await MP.request('',{action:'start',id:productId});
     id=checkout.orderId;hosted=checkout.url;
    }else{
     const rpc=paymentMode==='pickup'?'start_pickup_order':'start_transfer_order';
     id=await T.rpc(rpc,{p_product_id:productId});
    }
    params.set('id',id);
    history.replaceState(null,'','/compra?id='+encodeURIComponent(id));
    if(hosted)await MP.open(hosted);
   }
   if(!id&&productId){
    const {data,error}=await window.colegioLibreSupabase.from('products')
     .select('id,title,price,status,moderation_status,user_id').eq('id',productId).maybeSingle();
    if(error)throw error;
    if(!data||!data.user_id||!Number.isFinite(Number(data.price))||Number(data.price)<=0||
       (data.status||'available')!=='available'||(data.moderation_status||'approved')!=='approved'){
     throw Error('PRODUCT_UNAVAILABLE');
    }
    if(data.user_id===user.id)throw Error('OWN_PRODUCT');
    const status=await MP?.request('?product='+encodeURIComponent(productId)).catch(()=>null);
    if(status?.available){
     paymentMode='mercado_pago';
    }else{
     const pickupAvailable=await T.rpc('pickup_checkout_ready').catch(error=>{
      if(error?.code==='PGRST202'||error?.code==='42883')return false;
      throw error;
     });
     paymentMode=pickupAvailable?'pickup':'transfer';
    }
    product=data;retry.hidden=true;renderReview();note('');return;
   }
   if(!id)throw Error('ORDER_NOT_FOUND');
   order=await T.rpc('get_transfer_order',{p_order_id:id});
   providerState='';
   let statusError;
   if(order.payment_provider==='mercado_pago'){
    try{
     const result=await MP.request('',{action:'status',id});
     providerState=result.state;
     if(['accredited','canceled'].includes(providerState))order=await T.rpc('get_transfer_order',{p_order_id:id});
    }catch(error){statusError=error;}
   }
   product=null;retry.hidden=true;render();
   if(statusError)note(mpError(statusError),true);else note('');
  }catch(error){product=null;order=null;retry.hidden=false;note(mpError(error),true);root.replaceChildren();const rawError=String(error?.message||error||'');
   if(rawError.includes('PRODUCT_IN_CHECKOUT')){
    const box=add(root,'section','pay-card');
    add(box,'h1','',T.text('Este producto está reservado','This item is reserved'));
    add(box,'p','pay-muted',T.text('Otra persona ya tiene un pedido abierto. Si lo cancela, el producto vuelve a estar disponible.','Someone else has an open order. If they cancel it, the item becomes available again.'));
    const actions=add(box,'div','pay-actions');
    button(actions,T.text('Intentar reservar de nuevo','Try reserving again'),reserveProduct);
    add(actions,'a','pay-link',T.text('Volver a la publicación','Back to listing')).href=listingUrl;
    retry.hidden=true;note('');
   }else{
    add(root,'a','pay-link',productId?T.text('Volver al producto','Back to listing'):T.text('Ver mis pedidos','View my orders')).href=listingUrl;
   }}
 }
 function button(parent,label,fn,secondary=false){const node=add(parent,'button',secondary?'pay-button pay-button--secondary':'pay-button',label);node.type='button';node.addEventListener('click',fn);return node;}
 async function reserveProduct(event){
  if(busy)return;
  const reserve=event.currentTarget;
  busy=true;reserve.disabled=true;
  try{await refresh({reserve:true});}
  finally{busy=false;reserve.disabled=false;}
 }
 function renderReview(){
  const mpAvailable=paymentMode==='mercado_pago';
  const pickupAvailable=paymentMode==='pickup';
  root.replaceChildren();
  const review=add(root,'section','pay-card');
  add(review,'span','pay-kicker',T.text('TU COMPRA','YOUR PURCHASE'));
  add(review,'h1','',T.text('Revisá tu compra','Review your purchase'));
  add(review,'p','',product.title).dataset.noTranslate='';
  add(review,'strong','pay-total',T.money(product.price));
  add(review,'span','pay-price-note',T.text('Total del producto · ARS','Item total · ARS'));
  const details=add(review,'dl','pay-details pay-review-details');
  add(details,'dt','',T.text('Pago','Payment'));
  add(details,'dd','',pickupAvailable?T.text('Antes de coordinar la entrega','Before arranging pickup'):mpAvailable?'Mercado Pago':T.text('Transferencia directa al vendedor','Direct transfer to the seller'));
  add(details,'dt','',T.text('Entrega','Delivery'));
  add(details,'dd','',T.text('Coordiná el encuentro en el colegio','Arrange pickup at school'));
  add(review,'p','pay-muted',pickupAvailable?
   T.text('Reservá el producto. Una vez confirmado el pago, coordiná la entrega con el vendedor.','Reserve the item. Once payment is confirmed, arrange pickup with the seller.'):mpAvailable?
   T.text('Al continuar, reservás el producto y abrís el checkout de Mercado Pago.','Continue to reserve the item and open Mercado Pago checkout.'):
   T.text('Al continuar, reservás el producto y accedés al alias. Podés cancelar antes de transferir.','Continuing reserves the item and reveals the payment alias. You can cancel before transferring.'));
  const actions=add(review,'div','pay-actions');
  const reserve=button(actions,pickupAvailable?
   T.text('Reservar y continuar al pago','Reserve and continue to payment'):mpAvailable?
   T.text('Pagar con Mercado Pago','Pay with Mercado Pago'):
   T.text('Reservar y ver datos de pago','Reserve and view payment details'),reserveProduct);
  if(mpAvailable)reserve.classList.add('pay-button--mercado-pago');
  reserve.disabled=busy;
  add(actions,'a','pay-link',T.text('Volver a la publicación','Back to listing')).href=listingUrl;
 }
 function render(){
  root.replaceChildren();
  const buyer=order.role==='buyer';
  const head=add(root,'section','pay-card');add(head,'span','pay-kicker',buyer?T.text('TU COMPRA','YOUR PURCHASE'):T.text('TU VENTA','YOUR SALE'));
  const title=add(head,'h1','',order.product_title);title.dataset.noTranslate='';
  const counterpart=buyer?order.seller_name:order.buyer_name;
  if(counterpart){const person=add(head,'p','pay-muted',(buyer?T.text('Vendedor: ','Seller: '):T.text('Comprador: ','Buyer: '))+counterpart);person.dataset.noTranslate='';}
  add(head,'p','pay-order-reference',T.text('Pedido ','Order ')+order.id.slice(0,8));
  add(head,'strong','pay-total',T.money(order.amount));add(head,'span','pay-price-note',(!order.payment_provider||order.payment_provider==='transfer')&&order.status==='payment_pending'&&order.listing_available!==false?T.text('Importe exacto a transferir · ARS','Exact transfer amount · ARS'):T.text('Total del pedido · ARS','Order total · ARS'));
  const steps=add(head,'ol','pay-progress');steps.setAttribute('aria-label',T.text('Estado del pedido','Order status'));
  const pickup=order.payment_provider==='pickup';
  const sequence=['payment_pending','awaiting_confirmation','paid','delivered'];
  sequence.forEach((state,index)=>{
   const label=pickup&&state==='payment_pending'?T.text('Reservado','Reserved'):T.status(state);
   const step=add(steps,'li',index<=sequence.indexOf(order.status)?'is-complete':'',label);
   if(state===order.status)step.setAttribute('aria-current','step');
  });
  if(pickup){renderPickup(buyer);return;}
  if(order.payment_provider==='mercado_pago'){renderMercadoPago(buyer);return;}
  if(order.status==='cancelled')add(head,'p','pay-notice',T.text('Pedido cancelado. No realices una transferencia para este pedido.','Order cancelled. Do not send a transfer for this order.'));
  const content=add(root,'div','pay-checkout-grid');
  const payment=add(content,'section','pay-card pay-instructions');
  if(order.payment && (order.listing_available!==false || order.status==='awaiting_confirmation' || !buyer)){
   add(payment,'h2','',buyer?(order.status==='payment_pending'?T.text('Transferí al vendedor','Transfer to the seller'):T.text('Datos de tu transferencia','Your transfer details')):T.text('Cuenta indicada para este pedido','Account specified for this order'));
   add(payment,'p','pay-muted',order.status==='awaiting_confirmation'&&buyer?T.text('Ya avisaste que transferiste. No vuelvas a enviar dinero.','You reported a transfer. Do not send the money again.'):T.text('Usá Mercado Pago o tu banco. El dinero se transfiere fuera de ColegioLibre.','Use Mercado Pago or your bank. The money is transferred outside ColegioLibre.'));
   const details=add(payment,'dl','pay-details');
   const fields=[[T.text('Método','Method'),order.payment.method==='mercado_pago'?'Mercado Pago':T.text('Transferencia bancaria','Bank transfer')],[T.text('Titular','Account holder'),order.payment.holder_name],['Alias',order.payment.alias],['CBU / CVU',order.payment.account_number]];
   for(const [label,value] of fields.filter(([,value])=>value)){add(details,'dt','',label);const data=add(details,'dd','',value);data.dataset.noTranslate='';}
   if(buyer&&order.status==='payment_pending'){button(payment,T.text('Copiar alias','Copy alias'),()=>copy(order.payment.alias),true);
   if(order.payment.account_number)button(payment,T.text('Copiar CBU / CVU','Copy CBU / CVU'),()=>copy(order.payment.account_number),true);}
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
 function renderPickup(buyer){
  const panel=add(root,'section','pay-card');
  const {status}=order;
  if(status==='cancelled'){
   add(panel,'h2','',T.text('Reserva cancelada','Reservation cancelled'));
  }else if(status==='delivered'){
   add(panel,'h2','',T.text('Entrega confirmada','Pickup confirmed'));
  }else if(status==='paid'){
   add(panel,'h2','',T.text('Coordiná la entrega','Arrange pickup'));
   add(panel,'p','pay-muted',T.text('El vendedor confirmó el pago. Acordá por chat cuándo retirar el producto en el colegio.','The seller confirmed payment. Use the chat to arrange pickup at school.'));
   button(panel,T.text('Coordinar entrega en el colegio','Arrange pickup at school'),openChat);
   if(buyer)button(panel,T.text('Confirmar que lo recibí','Confirm I received the item'),()=>confirm('confirm_delivered'),true);
  }else{
   renderPickupPayment(panel,buyer,status==='awaiting_confirmation');
  }
  if(status!=='cancelled'&&status!=='delivered')button(panel,T.text('Actualizar estado','Refresh status'),()=>void refresh(),true);
 }
 function renderPickupPayment(panel,buyer,awaiting){
  add(panel,'h2','',awaiting?
   T.text('Confirmación del pago','Payment confirmation'):
   T.text('Pagá tu pedido','Pay for your order'));
  if(awaiting){
   add(panel,'p','pay-notice',buyer?
    T.text('Avisaste que pagaste. Cuando el vendedor confirme el cobro, vas a poder coordinar la entrega.','You reported the payment. You can arrange pickup once the seller confirms receipt.'):
    T.text('El comprador avisó que pagó. Revisá que el importe figure en tu cuenta.','The buyer reported payment. Check that the amount appears in your account.'));
  }else if(order.listing_available===false){
   add(panel,'p','pay-notice',T.text('La publicación ya no está disponible para pagar.','This listing is no longer available for payment.'));
  }else if(!buyer){
   if(order.pickup_link_ready){
    add(panel,'p','pay-notice',T.text('El comprador ya tiene el link de Mercado Pago de este pedido.','The buyer has the Mercado Pago link for this order.'));
   }else{
    renderPickupLinkForm(panel);
   }
  }else{
   const ready=Boolean(order.pickup_link_ready);
   const pay=button(panel,T.text('Pagar con Mercado Pago','Pay with Mercado Pago'),openPickupLink);
   pay.classList.add('pay-button--mercado-pago');
   pay.disabled=!ready;
   const help=add(panel,'p','pay-small',ready?
    T.text('Verificá el vendedor y el importe en Mercado Pago. La entrega se coordina después de confirmar el pago.','Check the seller and amount in Mercado Pago. Arrange pickup once payment is confirmed.'):
    T.text('El botón se habilita cuando el vendedor agrega el link de pago de este pedido.','The button becomes available when the seller adds the payment link for this order.'));
   help.id='pickup-payment-help';
   pay.setAttribute('aria-describedby',help.id);
   if(!ready)button(panel,T.text('Pedir link de pago al vendedor','Ask the seller for a payment link'),openChat,true);
  }
  if(!awaiting&&buyer&&order.pickup_link_opened){
   button(panel,T.text('Ya pagué con el link','I paid with the link'),()=>confirm('claim_pickup_link_payment'),true);
  }
  if(!buyer&&(awaiting||order.listing_available!==false||order.pickup_link_opened)){
   button(panel,T.text('Confirmar pago recibido','Confirm payment received'),()=>confirm('confirm_received'),!awaiting);
  }
  if(awaiting)return;
  if(!order.pickup_link_opened){
   button(panel,T.text('Cancelar reserva','Cancel reservation'),()=>confirm('cancel'),true);
  }else if(!buyer){
   button(panel,T.text('Cancelar después de cerrar el link','Cancel after closing the link'),()=>confirm('cancel_pickup_link'),true);
  }else{
   button(panel,T.text('Consultar al vendedor','Contact the seller'),openChat,true);
  }
 }
 function renderPickupLinkForm(panel){
  const form=add(panel,'form','pay-pickup-link-form');
  const label=add(form,'label','',T.text('Link de pago de este pedido','Payment link for this order'));
  const input=add(label,'input','');
  input.type='url';
  input.placeholder='https://mpago.la/…';
  input.required=true;
  input.maxLength=81;
  add(form,'p','pay-small',T.text('Creá un link corto en Mercado Pago por '+T.money(order.amount)+' para este pedido.','Create a short link in Mercado Pago for '+T.money(order.amount)+' for this order.'));
  const submit=add(form,'button','pay-button pay-button--secondary',T.text('Compartir link con el comprador','Share link with the buyer'));
  submit.type='submit';
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   await runPickupAction(submit,async()=>{
    const url=input.value.trim();
    if(!/^https:\/\/mpago[.]la\/[A-Za-z0-9]{4,64}$/.test(url))throw Error('INVALID_PICKUP_LINK');
    await T.rpc('save_pickup_order_link',{p_order_id:order.id,p_url:url});
    await refresh();
   });
  });
 }
 async function openPickupLink(event){
  await runPickupAction(event.currentTarget,async()=>{
   const url=await T.rpc('open_pickup_order_link',{p_order_id:order.id});
   await refresh();
   await MP.open(url);
  });
 }
 async function runPickupAction(control,task){
  if(busy)return;
  busy=true;
  control.disabled=true;
  try{await task();}
  catch(error){note(mpError(error),true);}
  finally{busy=false;control.disabled=false;}
 }
 function mpError(error){
  const message=String(error?.message||'');
  if(message==='MP_SELLER_RECONNECT'||message==='MP_SELLER_NOT_LINKED'){
   return T.text('El vendedor tiene que volver a vincular su cuenta de Mercado Pago.','The seller needs to reconnect their Mercado Pago account.');
  }
  if(message==='MP_CANNOT_CANCEL')return T.text('Mercado Pago todavía no confirmó la cancelación. Actualizá el estado.','Mercado Pago has not confirmed cancellation. Refresh the status.');
  const pickupMessages={
   INVALID_PICKUP_LINK:['Pegá el link corto que generó Mercado Pago (https://mpago.la/…).','Paste the short link generated by Mercado Pago (https://mpago.la/…).'],
   PICKUP_LINK_ALREADY_SHARED:['Ya compartiste un link para este pedido.','You already shared a link for this order.'],
   PICKUP_LINK_IN_USE:['Generá un link nuevo para este pedido.','Generate a new link for this order.'],
   PICKUP_LINK_CANCEL_REQUIRED:['El comprador abrió el link. El vendedor tiene que cerrarlo antes de cancelar.','The buyer opened the link. The seller must close it before cancelling.']
  };
  if(pickupMessages[message])return T.text(...pickupMessages[message]);
  if(message.startsWith('MP_'))return T.text('No pudimos completar la solicitud de Mercado Pago. Volvé a intentar.','We could not complete the Mercado Pago request. Try again.');
  return T.errorMessage(error);
 }
 async function actOnMercadoPago(event,action){
  if(busy)return;
  const control=event.currentTarget;
  busy=true;control.disabled=true;
  try{
   if(action==='start'){
    const checkout=await MP.request('',{action:'resume',id:order.id});
    if(checkout.url){await MP.open(checkout.url);return;}
   }else await MP.request('',{action,id:order.id});
   await refresh();
  }catch(error){note(mpError(error),true);}
  finally{busy=false;control.disabled=false;}
 }
 function renderMercadoPago(buyer){
  const panel=add(root,'section','pay-card');
  add(panel,'h2','','Mercado Pago');
  if(['refunded','partially_refunded'].includes(providerState)){
   add(panel,'p','pay-notice',providerState==='refunded'?
    T.text('Mercado Pago registró un reembolso.','Mercado Pago recorded a refund.'):
    T.text('Mercado Pago registró un reembolso parcial.','Mercado Pago recorded a partial refund.'));
  }else if(order.status==='cancelled'){
   add(panel,'p','pay-notice',T.text('Mercado Pago confirmó la cancelación.','Mercado Pago confirmed cancellation.'));
  }else if(order.status==='payment_pending'){
   const waiting=providerState==='processing';
   add(panel,'p','pay-muted',waiting?
    T.text('Mercado Pago está procesando el pago.','Mercado Pago is processing the payment.'):
    T.text('El pedido se actualiza cuando Mercado Pago confirma el pago.','The order updates when Mercado Pago confirms payment.'));
   if(buyer&&!waiting&&providerState){
    const pay=button(panel,T.text('Pagar con Mercado Pago','Pay with Mercado Pago'),event=>actOnMercadoPago(event,'start'));
    pay.classList.add('pay-button--mercado-pago');
   }
   if(!waiting&&providerState)button(panel,T.text('Cancelar pedido','Cancel order'),event=>actOnMercadoPago(event,'cancel'),true);
  }else if(order.status==='paid'&&providerState==='accredited'){
   add(panel,'p','pay-notice',T.text('Pago confirmado por Mercado Pago.','Payment confirmed by Mercado Pago.'));
   button(panel,T.text('Coordinar entrega en el colegio','Arrange delivery at school'),openChat);
   if(buyer)button(panel,T.text('Confirmar que lo recibí','Confirm I received the item'),()=>confirm('confirm_delivered'),true);
  }else if(order.status==='paid'){
   add(panel,'p','pay-muted',T.text('Actualizá el estado para confirmar el pago con Mercado Pago.','Refresh to verify the payment with Mercado Pago.'));
  }else if(order.status==='delivered'){
   add(panel,'p','pay-muted',T.text('El comprador confirmó la entrega.','The buyer confirmed pickup.'));
  }
  button(panel,T.text('Actualizar estado','Refresh status'),()=>void refresh(),true);
 }
 async function copy(value){try{await navigator.clipboard.writeText(value);note(T.text('Copiado.','Copied.'));}catch(_){note(T.text('No pudimos copiar. Seleccioná el dato y copialo manualmente.','Could not copy. Select the value and copy it manually.'),true)}}
 function confirm(next){
  action=next;
  const copy={claim_transfer:[T.text('¿Ya hiciste la transferencia?','Have you made the transfer?'),T.text('El vendedor deberá verificar que el dinero llegó a su cuenta. Tu aviso no marca el pedido como pagado.','The seller must verify the money arrived. Reporting a transfer does not mark the order paid.'),T.text('Transferí el importe exacto a la cuenta indicada.','I transferred the exact amount to the specified account.')],confirm_received:[T.text('Verificá tu cuenta antes de confirmar','Check your account before confirming'),T.text('Confirmá solo si viste el dinero acreditado en tu cuenta. No alcanza con el aviso del comprador o una captura.','Confirm only after seeing the money credited to your account. A buyer claim or screenshot is not enough.'),T.text('Verifiqué en mi cuenta que recibí el importe completo.','I checked my account and received the full amount.')],confirm_delivered:[T.text('¿Recibiste el material?','Did you receive the item?'),T.text('El pedido quedará marcado como entregado.','The order will be marked delivered.'),T.text('Ya recibí el material acordado.','I received the agreed item.')],cancel:[T.text('Cancelar este pedido','Cancel this order'),T.text('Si hubo una transferencia, no canceles: contactá a la otra persona.','If money was transferred, do not cancel: contact the other person.'),T.text('No se transfirió ni recibió dinero por este pedido.','No money was transferred or received for this order.')]};
  if(order.payment_provider==='pickup'){
   copy.confirm_received=[
    T.text('¿Recibiste el pago?','Did you receive the payment?'),
    T.text('Si fue digital, verificá que el importe esté acreditado en tu cuenta.','For a digital payment, verify the amount is credited in your account.'),
    T.text('Recibí el importe completo.','I received the full amount.')
   ];
   copy.claim_pickup_link_payment=[
    T.text('¿Pagaste con el link de Mercado Pago?','Did you pay using the Mercado Pago link?'),
    T.text('El vendedor tiene que verificar el cobro.','The seller needs to verify the payment.'),
    T.text('Pagué el importe del pedido.','I paid the order amount.')
   ];
   copy.cancel=[
    T.text('¿Cancelar la reserva?','Cancel the reservation?'),
    T.text('El producto quedará disponible para otra persona.','The item will become available to someone else.'),
    T.text('Confirmo que no hubo un pago.','I confirm there was no payment.')
   ];
   copy.cancel_pickup_link=[
    T.text('¿Cerrar este pedido?','Close this order?'),
    T.text('Antes de cancelar, comprobá que el link ya no acepte pagos y revisá tus cobros.','Before cancelling, check that the link no longer accepts payments and review your payments.'),
    T.text('El link ya no acepta pagos y no recibí dinero.','The link no longer accepts payments and I received no money.')
   ];
  }
  document.querySelector('#transfer-confirm-title').textContent=copy[next][0];document.querySelector('#transfer-confirm-copy').textContent=copy[next][1];document.querySelector('#transfer-confirm-label').textContent=copy[next][2];document.querySelector('#transfer-confirm-check').checked=false;dialog.showModal();
 }
 dialog.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const submit=dialog.querySelector('[type="submit"]');submit.disabled=true;
  try{await T.rpc('transition_transfer_order',{p_order_id:order.id,p_action:action});dialog.close();await refresh();}
  catch(error){dialog.close();await refresh();note(mpError(error),true);}
  finally{busy=false;submit.disabled=false;}
 });
 document.querySelector('#transfer-confirm-cancel').addEventListener('click',()=>dialog.close());
 async function openChat(){try{const {conversation,error}=await window.colegioLibreApi.ensureConversation({buyerId:order.buyer_id,sellerId:order.seller_id,productId:order.product_id});if(error||!conversation)throw error||Error('chat');location.assign('/mensajes?id='+encodeURIComponent(conversation.id));}catch(error){note(T.errorMessage(error),true)}}
 retry.addEventListener('click',()=>void refresh());
 window.addEventListener('colegiolibre:languagechange',()=>{if(busy)return;if(order){render();note('')}else if(product){renderReview();note('')}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&order?.payment_provider==='pickup'&&!busy)void refresh()});
 window.addEventListener('pageshow',event=>{if(event.persisted&&!busy)void refresh()});
 window.addEventListener('pagehide',()=>root.querySelector('.pay-instructions')?.replaceChildren());
 void refresh();
})();


