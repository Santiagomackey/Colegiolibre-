import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const template=fs.readFileSync(new URL('templates/site-header.html',root),'utf8');
const pages=['index','explorar','producto','publicar','favoritos','mensajes','perfil','perfil-publico','colegio','busco','compra','pedidos','apuntes','materia','curso','ayuda','seguridad','terminos','privacidad','productos-prohibidos','instituciones','beta'];
for(const name of pages){
 const file=new URL(name+'.html',root);let html=fs.readFileSync(file,'utf8');
 const header=/<header\b[^>]*>[\s\S]*?<\/header>/;
 html=html.replace(header,'');
 html=html.replace(/(<body\b[^>]*>)/,'$1\n'+template);
 if(!html.includes('site-header.css?'))html=html.replace('</head>','<link rel="stylesheet" href="/site-header.css?v=20261111-flow38">\n</head>');
 const add=[];
 if(!/src=["'](?:\.\/|\/)?supabase\.js/.test(html))add.push('<script src="/vendor/supabase.js?v=20261109-release25"></script>','<script src="/supabase.js?v=20261110-recovery31"></script>');
 if(!/src=["'](?:\.\/|\/)?notifications\.js/.test(html))add.push('<script src="/notifications.js?v=20261110-shell32"></script>');
 if(!html.includes('site-header.js?'))add.push('<script src="/site-header.js?v=20261111-flow38"></script>');
 if(add.length)html=html.replace('</body>',add.join('\n')+'\n</body>');
 if(!html.includes('notifications.css'))html=html.replace('</head>','<link rel="stylesheet" href="/notifications.css?v=20261109-release25">\n</head>');
 html=html.replace(/<html\b(?![^>]*data-theme)/,'<html data-theme="light"');
 fs.writeFileSync(file,html);fs.utimesSync(file,new Date('2030-01-01'),new Date('2030-01-01'));
}
console.log('Synchronized shared header on '+pages.length+' public pages.');
