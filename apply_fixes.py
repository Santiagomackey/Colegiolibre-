from pathlib import Path

root = Path(__file__).resolve().parent
css = root / 'mobile-fixes.css'
assert css.exists(), 'Copy mobile-fixes.css alongside this script.'

for name in ('compra.html', 'perfil.html'):
    path = root / name
    if not path.exists():
        print(f'SKIP {name}: not found')
        continue
    content = path.read_text(encoding='utf-8')
    tag = '<link rel="stylesheet" href="/mobile-fixes.css?v=20261110-fix1">'
    if tag not in content:
        content = content.replace('</head>', tag + '</head>', 1)
        path.write_text(content, encoding='utf-8')
        print(f'Updated {name}')

path = root / 'transfer-checkout.js'
if path.exists():
    content = path.read_text(encoding='utf-8')
    old = "const back=add(root,'a','pay-link',T.text('Volver al producto','Back to listing'));back.href=params.get('product')?'/producto?id='+encodeURIComponent(params.get('product')):'/pedidos';"
    replacement = """const rawError=String(error?.message||error||'');
   if(rawError.includes('PRODUCT_IN_CHECKOUT')){
    const box=add(root,'section','pay-card');
    add(box,'h2','',T.text('Este producto está reservado','This item is reserved'));
    add(box,'p','pay-muted',T.text('Hay una compra en curso. No envíes dinero ni intentes pagar por fuera de ColegioLibre. Podés consultar al vendedor si vuelve a estar disponible.','Another purchase is in progress. Do not send money or pay outside ColegioLibre. You can ask the seller if it becomes available again.'));
    const productId=params.get('product');
    if(productId){const link=add(box,'a','pay-button',T.text('Ver publicación y contactar al vendedor','View listing and contact seller'));link.href='/producto?id='+encodeURIComponent(productId);}
    const orders=add(box,'a','pay-link',T.text('Ver mis pedidos','View my orders'));orders.href='/pedidos';
    document.querySelector('#transfer-retry').hidden=true;
   }else{
    const back=add(root,'a','pay-link',T.text('Volver al producto','Back to listing'));back.href=params.get('product')?'/producto?id='+encodeURIComponent(params.get('product')):'/pedidos';
   }"""
    if old in content:
        path.write_text(content.replace(old, replacement, 1), encoding='utf-8')
        print('Updated transfer-checkout.js')
    else:
        print('Checkout already patched or source differs; no changes')
else:
    print('SKIP transfer-checkout.js: not found')
