import {test} from 'node:test';import assert from 'node:assert/strict';
import {createRequire} from 'node:module';const require=createRequire(import.meta.url);
const group=require('./quark-groups.cjs');
test('keeps episodes in their actual parent directory instead of interleaving seasons',()=>{
 const files=[{vod_name:'01',catvod_path:['第一季']},{vod_name:'01',catvod_path:['第二季']},{vod_name:'02',catvod_path:['第一季']}];
 const result=group('夸父-public',files,(name,items)=>({from:name,url:items.map(f=>f.vod_name).join('#')}));
 assert.deepEqual(result,[{from:'夸父-public / 第一季',url:'01#02'},{from:'夸父-public / 第二季',url:'01'}]);
});
test('preserves root files and distinguishes identical subdirectory names in different paths',()=>{
 const result=group('夸父-public',[{vod_name:'正片'},{vod_name:'01',catvod_path:['A','1080p']},{vod_name:'02',catvod_path:['B','1080p']}],(name,items)=>({from:name,count:items.length}));
 assert.deepEqual(result.map(r=>r.from),['夸父-public','夸父-public / A / 1080p','夸父-public / B / 1080p']);
 assert.ok(result.every(r=>r.count===1));
 assert.deepEqual(group('夸父-public',[],()=>{throw Error('empty groups must not render')}),[]);
});
test('directory labels cannot inject CatVod line and episode delimiters',()=>{
 const result=group('夸父-public',[{catvod_path:['A$$$B#C\nD']}],name=>name);
 assert.ok(!result[0].includes('$')&&!result[0].includes('#')&&!result[0].includes('\n'));
});
