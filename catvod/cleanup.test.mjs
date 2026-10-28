import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import account from './account.cjs';
const root=await mkdtemp(path.join(os.tmpdir(),'catvod-cleanup-'));process.env.CATVOD_DATA_DIR=root;
const {removeOwnedFiles}=await import('./cleanup.mjs');
const secret='fixture-cookie';const owned={account:account(secret),parent:'owned-dir',fid:'owned-file'};
async function reset(){await writeFile(path.join(root,'ledger.json'),JSON.stringify({directories:[{account:account(secret),fid:'owned-dir'}],files:[owned],pending:[]}));}
test('cleanup accepts the real Quark data.list shape and records deletion',async()=>{await reset();const calls=[];const result=await removeOwnedFiles(secret,['owned-file'],async(route,method,body)=>{calls.push({route,method,body});return {code:0,data:{list:[{fid:'owned-file',pdir_fid:'owned-dir'}]}}});assert.equal(result.deleted,1);assert.ok(calls[0].route.startsWith('file/sort?pr=ucpro&fr=pc&pdir_fid=owned-dir&'));assert.equal(calls[1].route,'file/delete?pr=ucpro&fr=pc');assert.deepEqual(calls[1].body.filelist,['owned-file']);assert.equal(JSON.parse(await readFile(path.join(root,'ledger.json'))).files.length,0);});
test('cleanup refuses unrelated and moved files before delete',async()=>{await reset();let deletes=0;const request=async(route)=>{if(route.startsWith('file/delete'))deletes++;return {code:0,data:{list:[{fid:'owned-file',pdir_fid:'personal'}]}}};await assert.rejects(()=>removeOwnedFiles(secret,['other'],request),/系统记录/);await assert.rejects(()=>removeOwnedFiles(secret,['owned-file'],request),/位置已改变/);assert.equal(deletes,0);});
test.after(()=>rm(root,{recursive:true,force:true}));
