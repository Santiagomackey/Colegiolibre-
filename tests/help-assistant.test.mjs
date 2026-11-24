import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import handler from '../api/help-assistant.js';

test('assistant accepts a follow-up, limits usage and preserves a failed turn for retry', async t => {
  const db = new PGlite();
  t.after(()=>db.close());
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await readFile(new URL('../database/20_help_ai_usage.sql',import.meta.url),'utf8'));
  const env = {SUPABASE_URL:'https://fixture.example',SUPABASE_SERVICE_ROLE_KEY:'fixture',AI_GATEWAY_API_KEY:'fixture'};
  for(const [key,value] of Object.entries(env)) {
    const previous=process.env[key];
    process.env[key]=value;
    t.after(()=>{if(previous===undefined) delete process.env[key]; else process.env[key]=previous;});
  }
  let offline=false, calls=0;
  t.mock.method(globalThis,'fetch',async (url,opts)=>{
    const body=JSON.parse(opts.body);
    if(url.endsWith('/rpc/reserve_help_ai_turn')) {
      const result=await db.query('select reserve_help_ai_turn($1) allowed',[body.p_bucket]);
      return Response.json(result.rows[0].allowed);
    }
    calls++;
    assert.equal(body.messages[0].role,'system');
    return offline ? new Response(null,{status:503}) : Response.json({choices:[{message:{content:'Abrí Mi colegio.'}}]});
  });
  async function ask(messages) {
    const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
    await handler({method:'POST',headers:{},body:{messages}},res);
    return res;
  }
  assert.equal((await ask([{role:'system',content:'entrada'}])).code,400);
  const first={role:'user',content:'¿Dónde está mi colegio?'};
  const follow=[first,{role:'assistant',content:'Abrí Mi colegio.'},{role:'user',content:'¿Y después?'}];
  assert.equal((await ask(follow)).data.answer,'Abrí Mi colegio.');
  offline=true;
  assert.equal((await ask([first])).code,503);
  offline=false;
  for(let n=2;n<20;n++) assert.equal((await ask([first])).code,200);
  assert.equal((await ask([first])).code,429);
  assert.equal(calls,20);
});
