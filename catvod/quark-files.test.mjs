import {test} from 'node:test';import assert from 'node:assert/strict';
import findOwnedFiles from './quark-files.cjs';
test('ownership checks paginate inside the owned folder and match both fid and parent',async()=>{
 const calls=[];const found=await findOwnedFiles('owned',['target'],async(route)=>{calls.push(route);return {code:0,data:{list:calls.length===1?Array.from({length:200},(_,i)=>({fid:String(i),pdir_fid:'owned'})):[{fid:'target',pdir_fid:'owned'}]}}});
 assert.ok(found.has('target'));assert.equal(calls.length,2);assert.ok(calls.every(route=>route.includes('pdir_fid=owned&')));assert.ok(calls[1].includes('_page=2&'));
});
test('ownership checks fail closed for moved files and authorization errors',async()=>{
 const found=await findOwnedFiles('owned',['moved'],async()=>({code:0,data:{list:[{fid:'moved',pdir_fid:'personal'}]}}));assert.equal(found.size,0);
 await assert.rejects(()=>findOwnedFiles('owned',['file'],async()=>({code:401})),/授权/);
});
