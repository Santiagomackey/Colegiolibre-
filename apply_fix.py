"""Run from ColegioLibre repository root: python apply_fix.py"""
from pathlib import Path
import shutil
root = Path.cwd()
source = Path(__file__).resolve().parent / 'mensajes-layout-fix.css'
if not (root / 'mensajes.html').exists():
    raise SystemExit('Run this script from the ColegioLibre repository root.')
shutil.copy2(source, root / 'mensajes-layout-fix.css')
for name in ('mensajes.html', 'mobile-app/www/mensajes.html'):
    path = root / name
    if not path.exists():
        continue
    html = path.read_text(encoding='utf-8')
    if 'mensajes-layout-fix.css' not in html:
        href = '/mensajes-layout-fix.css?v=20261111-layoutfix' if name == 'mensajes.html' else './mensajes-layout-fix.css?v=20261111-layoutfix'
        html = html.replace('</head>', f'  <link rel="stylesheet" href="{href}" />\n</head>', 1)
        path.write_text(html, encoding='utf-8')
        print('Updated', name)
mobile = root / 'mobile-app/www'
if mobile.is_dir():
    shutil.copy2(source, mobile / 'mensajes-layout-fix.css')
print('Done. Review changes and deploy.')
