import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('initial home HTML contains the exact responsive styles shipped to the app',()=>{
 for(const file of ['index.html','colegio/eccleston/index.html']){
  const html=read(file);
  for(const [id,css] of [['cl-mobile-critical','mobile.css'],['cl-home-critical','home-header.css']]){
   const start=html.indexOf(`<style id="${id}">`),body=html.indexOf('<body');
   assert.ok(start>=0&&start<body,`${file}: missing initial ${id}`);
   const text=html.slice(start).match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].trim();
   assert.equal(text,read(css).trim(),`${file}: stale embedded ${css}`);
  }
 }
});
