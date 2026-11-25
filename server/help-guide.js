// Retrieve verified help passages by similarity to example questions and follow-up context.
const topics = [
  ['colegio acceso solicitar entrar portal escuela familia alumno institución pertenezco registro', 'Elegí tu colegio en el perfil y confirmá tu correo. Después abrí Mi colegio y tocá «Solicitar acceso a mi colegio». El botón aparece si el colegio tiene su portal publicado y un plan vigente.'],
  ['pendiente colegio solicitud enviada revisar aprobar aprobacion acceso espera administrador rechazada cuanto demora', 'Abrí Mi colegio para ver tu solicitud. Si figura pendiente, la administración del colegio tiene que revisarla. Si fue rechazada, comunicate con el colegio para consultar el motivo.'],
  ['administrador aprobar rechazar familias editor permisos quitar revocar colegio', 'Desde el editor de tu colegio, abrí «Acceso al portal». Ahí podés revisar las solicitudes y aprobar, rechazar o quitar un acceso.'],
  ['contraseña clave olvidé recuperar restablecer entrar iniciar sesion login password', 'En Iniciar sesión, tocá «¿Olvidaste tu contraseña?» e ingresá tu correo registrado. Revisá tu bandeja de entrada y la carpeta de spam.'],
  ['crear cuenta registrarme registro nuevo usuario', 'Abrí Iniciar sesión, elegí Crear cuenta y completá el registro. Después seleccioná tu colegio en el perfil.'],
  ['publicar vender libro material producto publicación nueva subir', 'Entrá en Publicar, completá los datos del material y enviá la publicación. Podés encontrarla después en Mi perfil, dentro de Mis publicaciones.'],
  ['editar edito editarla editarlo elimino eliminar borrar pausar modificar precio publicación anuncio revision pausada', 'Abrí Mi perfil, entrá en Mis publicaciones y buscá el menú de la tarjeta. Si figura «en revisión», la publicación está esperando una decisión de administración.'],
  ['comprar producto pagar pago compra cobro duplicado mercadopago pedido venta transferencia plata dinero', 'Abrí Mis compras y ventas y revisá el estado del pedido. Si ves un cobro que no reconocés o el pago sigue pendiente, comprobá el movimiento en tu cuenta antes de volver a pagar. Podés usar Escribir a soporte para pedir una revisión.'],
  ['entrega entregar retirar coordinar vendedor contactar mensaje mensajes chat escribir comprador', 'Abrí Mensajes y entrá en la conversación del producto para coordinar con la otra persona. Si no podés escribir, revisá si la publicación sigue disponible o si existe un bloqueo.'],
  ['notificacion notificaciones avisos llegan android iphone celular permiso push', 'En los ajustes de notificaciones de tu teléfono, buscá ColeGo y permití los avisos. Abrí la app y comprobá que iniciaste sesión con la cuenta en la que esperás recibirlos.'],
  ['humano persona soporte correo ayuda contacto agente reclamo', 'Tocá Escribir a soporte, debajo de la consulta. Contá en qué pantalla estabas y qué mensaje apareció.']
];
const stops = new Set('como para tengo quiero puedo esta esto desde sobre puedo donde una del los las que con por mis mas sin hay soy son ese esa entonces hacer'.split(' '));
function terms(text) {
  return new Set(text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[a-z]{3,}/g)?.filter(word=>!stops.has(word)).map(word=>word.slice(0,5)) || []);
}
const entries = topics.map(([keywords,answer])=>({words:terms(keywords),answer}));
export function guideAnswer(messages) {
  const current=terms(messages.at(-1).content);
  const earlier=terms(messages.filter(m=>m.role==='user').slice(-2,-1)[0]?.content || '');
  const ranked=entries.map(entry=>{
    let score=0,context=0;
    for(const word of entry.words) {
      const weight=Math.log(1+entries.length/entries.filter(e=>e.words.has(word)).length);
      if(current.has(word)) score+=weight;
      if(earlier.has(word)) context+=weight;
    }
    return {answer:entry.answer,score:score ? score+Math.min(context,3)*.6 : 0};
  }).sort((a,b)=>b.score-a.score);
  return ranked[0].score ? ranked[0].answer : '¿Tu consulta es sobre Mi colegio, una publicación, un pedido, mensajes o notificaciones? Contame en qué pantalla estás. Para revisar un caso particular, tocá Escribir a soporte.';
}
