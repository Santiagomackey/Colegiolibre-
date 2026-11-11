import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('initial home HTML contains the exact responsive styles shipped to the app',()=>{
 for(const file of ['index.html','colegio/eccleston/index.html']){
  const html=read(file);
  for(const [id,css] of [['cl-mobile-critical','mobile.css'],['cl-home-critical','home-header.css'],['cl-chrome-critical','chrome-theme.css']]){
   const start=html.indexOf(`<style id="${id}">`),body=html.indexOf('<body');
   assert.ok(start>=0&&start<body,`${file}: missing initial ${id}`);
   const text=html.slice(start).match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].trim();
   assert.equal(text,read(css).trim(),`${file}: stale embedded ${css}`);
  }
 }
});

test('sign-in pages declare the phone viewport before routing scripts run', () => {
  for (const file of ['login.html', 'auth-callback.html', 'recovery-callback.html', 'index.html']) {
    const html = read(file);
    const viewport = html.indexOf('name="viewport" content="width=device-width, initial-scale=1.0');
    assert.ok(viewport >= 0 && viewport < html.indexOf('<script'), file);
  }
  const android = read('mobile-app/android/app/src/main/java/com/colegiolibre/app/MainActivity.java');
  assert.match(android, /protected void load\(\)\s*\{[\s\S]*?setUseWideViewPort\(false\);[\s\S]*?super\.load\(\);/);
});

test('scrolling over message history can continue onto the page when the pane is empty or at an edge', () => {
  const css = read('mensajes.css');
  assert.match(css, /\.messages-app\s*\{[^}]*overflow:\s*clip;/);
  assert.match(css, /\.messages-app :is\(\.messages-list, \.conversation-list, \.chat-panel\)\s*\{\s*overscroll-behavior:\s*auto;/);
});
