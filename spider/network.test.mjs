import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicFetch } from './network.mjs';

const publicLookup = async () => [{ address: '104.20.42.172' }];

test('Jable XPTV requests use browser TLS while script downloads stay native', async () => {
  const calls = [];
  const request = (kind) => async (url) => {
    calls.push([kind, url]);
    return new Response('<div>video results</div>');
  };
  const fetch = createPublicFetch({ lookup: publicLookup, nativeFetch: request('native'), browserFetch: request('browser') });
  await fetch('https://raw.githubusercontent.com/example/jable.js');
  const result = await fetch('https://jable.tv/search/SSIS/?mode=async');
  assert.deepEqual(calls.map(([kind]) => kind), ['native', 'browser']);
  assert.equal(result.data, '<div>video results</div>');
});

test('browser transport cannot access private DNS addresses or redirect to them', async () => {
  let calls = 0;
  const fetch = createPublicFetch({
    lookup: async (host) => [{ address: host === 'jable.tv' ? '104.20.42.172' : '127.0.0.1' }],
    browserFetch: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://private.example/' } }); },
    nativeFetch: async () => { throw new Error('must not connect'); },
  });
  await assert.rejects(fetch('https://private.example/'), /内网/);
  await assert.rejects(fetch('https://jable.tv/'), /内网/);
  assert.equal(calls, 1);
});

test('cross-origin redirects switch transport and remove credentials', async () => {
  const fetch = createPublicFetch({
    lookup: publicLookup,
    browserFetch: async () => new Response(null, { status: 302, headers: { location: 'https://cdn.example/video' } }),
    nativeFetch: async (_url, options) => {
      const headers = new Headers(options.headers);
      assert.equal(headers.has('cookie'), false);
      assert.equal(headers.has('authorization'), false);
      assert.equal(headers.get('accept'), 'text/html');
      assert.equal(options.redirect, 'manual');
      return new Response('ok');
    },
  });
  assert.equal((await fetch('https://jable.tv/', { headers: { Cookie: 'test', Authorization: 'test', Accept: 'text/html' } })).data, 'ok');
});

test('lookalike domains do not receive the Jable transport', async () => {
  const fetch = createPublicFetch({ lookup: publicLookup,
    browserFetch: async () => { throw new Error('must not use browser transport'); },
    nativeFetch: async () => new Response('ok'),
  });
  assert.equal((await fetch('https://jable.tv.example/')).data, 'ok');
});
