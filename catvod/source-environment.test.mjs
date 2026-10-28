import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceEnvironment } from './source-environment.mjs';
test('NAS proxy routes reach the child without forwarding passwords or control tokens', () => {
  const env = sourceEnvironment('/data', {
    PATH:'/bin', HTTP_PROXY:'http://proxy.invalid:7890', HTTPS_PROXY:'http://proxy.invalid:7890',
    NO_PROXY:'localhost,catvod', no_proxy:'localhost,catvod', NODE_OPTIONS:'--use-env-proxy --inspect',
    PASSWORD:'viewing-secret', ADMIN_PASSWORD:'admin-secret', CATVOD_TOKEN:'control-secret', HOME:'/private',
  });
  assert.equal(env.HTTP_PROXY, 'http://proxy.invalid:7890');
  assert.equal(env.NO_PROXY, 'localhost,catvod');
  assert.equal(env.NODE_OPTIONS, '--use-env-proxy');
  for (const key of ['PASSWORD','ADMIN_PASSWORD','CATVOD_TOKEN','HOME']) assert.ok(!(key in env));
  assert.equal(env.NODE_PATH, '/data');
});
