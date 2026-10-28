import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('the pinned source keeps directory paths through recursion, pagination and line packing', {skip:!process.env.CATVOD_TEST_BUNDLE}, async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./quark-directory-fixture.cjs',import.meta.url))],{timeout:10000});
 const report=JSON.parse(stdout);
 assert.equal(report.beforeLines,1);assert.equal(report.afterLines,5);assert.equal(report.files,9);
});
