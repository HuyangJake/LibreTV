import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readShared, writeShared } from './shared-sources-server';
import { validateShared, type SharedSources } from './shared-sources';
let dir: string;
const data: SharedSources = { customAPIs: [{key:'a',name:'A',url:'https://example.com/api'}], selectedKeys:['a'], subscriptions:[], liveSubscriptions:[], liveSelectedUrls:[], envKeysSeen:[], liveEnvKeysSeen:[], envSubsSeen:[] };
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'libretv-test-')); process.env.DATA_DIR = dir; });
afterEach(async () => { delete process.env.DATA_DIR; await rm(dir, {recursive:true,force:true}); });
it('persists a catalog for other devices and rejects stale revisions', async () => {
  expect(await readShared()).toEqual({revision:'0',data:null});
  const result = await writeShared('0', data);
  expect(result.conflict).toBe(false);
  expect((await readShared()).data).toEqual(data);
  const stale = await writeShared('0', {...data,customAPIs:[]});
  expect(stale.conflict).toBe(true);
  expect((await readShared()).data?.customAPIs).toHaveLength(1);
});
it('serializes simultaneous device writes; only one can win', async () => {
  const results = await Promise.all([writeShared('0',data),writeShared('0',{...data,selectedKeys:[]})]);
  expect(results.filter(r=>r.conflict)).toHaveLength(1);
  expect(JSON.parse(await readFile(path.join(dir,'sources.json'),'utf8')).data).toEqual(data);
});
it('does not replace a corrupt file with an empty catalog', async () => {
  await writeFile(path.join(dir,'sources.json'),'broken');
  await expect(writeShared('0',data)).rejects.toThrow();
});
it('rejects malformed collections and strips unexpected top-level fields', () => {
  expect(()=>validateShared({...data,customAPIs:[{}]})).toThrow();
  expect(()=>validateShared({...data,liveSubscriptions:[{url:'https://example.com',fromSubscriptions:null}]})).toThrow();
  expect(validateShared({...data,password:'secret'})).not.toHaveProperty('password');
});
