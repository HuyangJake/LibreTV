import { test } from 'node:test';
import assert from 'node:assert/strict';
import manifest from './public-quark-catalog.json' with { type: 'json' };
import { publicCatalogSite, publicCatalogResult, publicCatalogDetail, publicShare } from './public-catalog.mjs';

test('pinned public metadata supports browse/search without reading any account', () => {
  assert.equal(publicCatalogSite('/spider/push/4').key, 'nodejs_public_quark');
  assert.equal(publicCatalogResult('home').list.length, 12);
  assert.equal(publicCatalogResult('search', {wd:'bilibili'}).list.length, 3);
  assert.equal(publicCatalogResult('category', {id:'stage',page:2}).list.length, 0);
  assert.equal(publicCatalogResult('category', {id:'unknown'}).list.length, 0);
  assert.ok(manifest.items.every(item => !('stoken' in item) && !('cookie' in item)));
  assert.throws(() => publicShare('https://foreign.invalid/s/share'), /没有此影片/);
});
test('detail selects the exact public file and its current tokens across duplicate filenames', () => {
  const item = manifest.items[0];
  const expected = `同名$${item.share}*fresh*${item.fid}*file-token`;
  const data = {list:[{vod_play_from:'lineA$$$lineB',vod_play_url:`同名$${item.share}*old*different*old$$$${expected}`} ]};
  const result = publicCatalogDetail(item.id, data).list[0];
  assert.equal(result.vod_play_url, expected);
  assert.equal(result.vod_play_from, 'lineB');
  assert.equal(result.vod_name, item.name);
  assert.throws(() => publicCatalogDetail(item.id,{list:[]}), /失效/);
});
