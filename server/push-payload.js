const pages=new Set(['/','/producto','/mensajes','/perfil','/favoritos','/busco','/compra','/pedidos']);
export function safePushPath(value) {
  try {
    const url=new URL(value||'/','https://www.colegiolibre.com/');
    if(!['https://www.colegiolibre.com','https://colegiolibre.com'].includes(url.origin))return '/';
    const page=url.pathname.replace(/\.html$/,'')||'/';
    return pages.has(page)?page+url.search:'/';
  }catch(_){return '/'}
}
export function buildPushMessage(device,notification) {
  const id=String(notification.id||'');
  return {message:{token:device.token,notification:{title:String(notification.title||'ColegioLibre').slice(0,120),body:String(notification.body||'Tenés una nueva notificación.').slice(0,240)},data:{url:safePushPath(notification.action_url),action_url:safePushPath(notification.action_url),notification_id:id,type:String(notification.type||'general')},android:{priority:'high',ttl:'86400s',notification:{channel_id:'colegiolibre-general',icon:'ic_stat_colegiolibre',color:'#67C23A',sound:'default',tag:'colegiolibre-'+id.slice(0,64),visibility:'PRIVATE',default_vibrate_timings:true}}}};
}
