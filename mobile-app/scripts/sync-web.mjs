import {cp,mkdir,readdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
const mobileRoot=fileURLToPath(new URL('..',import.meta.url));
const root=resolve(mobileRoot,'..'),target=resolve(mobileRoot,'www');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
const folders=new Set(['images','vendor','colegio']);
const extensions=new Set(['.html','.css','.js','.webmanifest','.txt','.xml']);
for(const entry of await readdir(root,{withFileTypes:true})){
 if(entry.name.startsWith('.')||entry.name.includes(' ('))continue;
 if(entry.isDirectory()?!folders.has(entry.name):!extensions.has(extname(entry.name)))continue;
 if(!entry.isDirectory()&&['.txt','.xml'].includes(extname(entry.name))&&!['robots.txt','sitemap.xml'].includes(entry.name))continue;
 await cp(resolve(root,entry.name),resolve(target,entry.name),{recursive:true});
}
console.log('Current web assets synchronized; downloads, API, development and release files excluded.');
