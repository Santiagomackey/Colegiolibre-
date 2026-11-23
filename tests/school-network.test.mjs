import test from 'node:test';
import assert from 'node:assert/strict';
import portalApi from '../api/school-portal.js';
import { cleanContent, contentLimits, prices } from '../server/school-portal.js';

test('a paid school portal protects published content and catalog with its own membership policy', async t => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://school-fixture.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture';
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });

  let profile, roster, assignment, paid, published;
  let protectedReads = 0;
  const school = { id:'school-a', code:'A1', community_code:'PARQUE', name:'Parque' };
  t.mock.method(globalThis,'fetch',async raw => {
    const url = new URL(raw);
    const table = url.pathname.split('/').at(-1);
    switch (table) {
      case 'user': return Response.json({ id:'fixture', email:'family@example.com', email_confirmed_at:'2026-11-16' });
      case 'schools':
        if (url.searchParams.get('code') === 'eq.A1') return Response.json([school]);
        if (url.searchParams.get('community_code') === 'eq.PARQUE') return Response.json([school]);
        return Response.json([]);
      case 'profiles': return Response.json(profile ? [profile] : []);
      case 'school_admins': return Response.json(assignment ? [{school_code:'A1'}] : []);
      case 'school_portal_members':
        assert.equal(url.searchParams.get('school_id'),'eq.school-a');
        return Response.json(roster ? [{school_id:'school-a'}] : []);
      case 'institution_requests': return Response.json([{id:'request-a',requested_plan:'Institucional'}]);
      case 'institution_subscriptions': return Response.json(paid ? [{paid_through:'2099-01-01'}] : []);
      case 'school_portal_content': return Response.json(published ? [published] : []);
      case 'products':
        protectedReads++;
        assert.equal(url.searchParams.get('school_code'),'in.(A1,a1,PARQUE,parque)');
        return Response.json([{id:'private-listing'}]);
      default: throw Error('Unexpected request to ' + table);
    }
  });
  async function request(query = {}, signedIn = true) {
    const res = {
      setHeader(name,value) { assert.equal(name,'Cache-Control'); assert.equal(value,'private, no-store'); },
      status(value) { this.code = value; return this; },
      json(value) { this.data = value; return this; }
    };
    await portalApi({method:'GET',headers:signedIn ? {authorization:'Bearer fixture'} : {},query:{code:'parque',...query}},res);
    return res;
  }

  assert.equal((await request({},false)).code,401);
  profile = { school_code:'B2', school_verification_status:'verified' };
  assert.equal((await request({catalog:'1'})).code,403);
  profile.school_code = 'A1';
  assert.equal((await request()).code,403);
  paid = true;
  assert.equal((await request()).code,404);
  published = { published_at:'2026-11-16', published:{membershipMode:'verified'} };
  assert.equal((await request({catalog:'1'})).code,200);
  profile.school_code = 'B2';
  roster = true;
  assert.equal((await request()).code,403);
  assert.equal((await request({catalog:'1'})).code,403);
  assert.equal((await request({summary:'1'})).code,403);
  assert.equal(protectedReads,1);
  published.published.membershipMode = 'community';
  assert.equal((await request({summary:'1'})).data.path,'/colegio-parque');
  assignment = true;
  published.published.membershipMode = 'verified';
  assert.equal((await request({manage:'1'})).data.brandingFolder,'a1');
});

test('school appearance settings validate and retain compatible defaults', () => {
  const settings = cleanContent({
    headerStyle:'branded', surface:'tinted', cardStyle:'square', catalogTitle:' Materiales ',
    membershipMode:'verified', logo:'https://example.org/logo.png', accent:'red'
  });
  assert.deepEqual(
    [settings.headerStyle,settings.surface,settings.cardStyle,settings.catalogTitle,settings.membershipMode,settings.logo,settings.accent],
    ['branded','tinted','square','Materiales','verified','https://example.org/logo.png','#67C23A']
  );
  assert.equal(cleanContent({}).membershipMode,'community');
});

test('each school plan applies its advertised price and publishing capacity', () => {
  const items = Array.from({ length: 25 }, (_, i) => ({
    title: String(i), body: 'Aviso', url: 'https://example.com/'
  }));
  for (const [plan, monthly, annual, notices, links] of [
    ['Institucional', 19900, 199000, 8, 12],
    ['Red Escolar', 22900, 229000, 16, 24]
  ]) {
    assert.deepEqual(prices[plan], { monthly, annual });
    const saved = cleanContent({ announcements: items, resources: items }, contentLimits(plan));
    assert.equal(saved.announcements.length, notices);
    assert.equal(saved.resources.length, links);
  }
});
