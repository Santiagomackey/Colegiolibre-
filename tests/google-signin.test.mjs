import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/google-signin.js';

test('Google sign-in keeps upstream timeout HTML off the login screen and preserves OAuth parameters on retry', async t => {
  const google = 'https://accounts.google.com/o/oauth2/v2/auth?state=test';
  let healthy = false;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.searchParams.get('provider'), 'google');
    assert.equal(url.searchParams.get('code_challenge'), 'example');
    assert.equal(options.redirect, 'manual');
    return healthy ? new Response(null, {status:302, headers:{location:google}}) :
      new Response('<!DOCTYPE html>Connection timed out', {status:522});
  });
  const request = {method:'GET', url:'/api/google-signin?redirect_to=https%3A%2F%2Fwww.colego.com.ar%2Fauth-callback&code_challenge=example'};
  const response = {setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
  await handler(request,response);
  assert.equal(response.code,503);
  assert.deepEqual(response.body,{error:'google_unavailable'});
  healthy = true;
  await handler(request,response);
  assert.equal(response.code,200);
  assert.deepEqual(response.body,{url:google});
});
