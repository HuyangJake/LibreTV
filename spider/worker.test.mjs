import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { assertPublic } from './network.mjs';
function run(code,method,ext={}) {
  return new Promise((resolve,reject)=>{
    const child=fork(new URL('./worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
    const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('test timeout'));},5000);
    child.once('message',m=>{clearTimeout(timeout);child.kill();resolve(m);});
    child.once('error',reject);child.send({code,method,ext});
  });
}
test('XPTV helpers support Cheerio and stringified ext',async()=>{
  const result=await run(`const $=createCheerio().load('<h1>Hello</h1>'); async function search(ext){return jsonify({list:[{vod_name:$('h1').text(),ext:argsify(ext)}]})}`,'search',{text:'query'});
  assert.equal(result.result.list[0].vod_name,'Hello'); assert.equal(result.result.list[0].ext.text,'query');
});
test('synchronous loops are terminated',async()=>{const result=await run('while(true){}','search');assert.match(result.error,/timed out/);});
test('interactive browser dependency gives an explicit error',async()=>{const result=await run('function getTracks(){ $utils.openSafari("https://example.com"); }','getTracks');assert.match(result.error,/浏览器验证/);});
test('blocks private, mapped and reserved addresses',async()=>{
  for(const url of ['http://127.0.0.1','http://192.168.1.114','http://[::1]','http://[::ffff:127.0.0.1]','file:///etc/passwd','http://169.254.169.254']) await assert.rejects(assertPublic(url));
});
test('XPTV category listing receives its category ext and requested page',async()=>{
  const result=await run('function getCards(ext){const e=argsify(ext);return jsonify({list:[{vod_name:"Example",ext:e}]})}','getCards',{typeurl:'https://example.com/category',page:2});
  assert.equal(result.result.list[0].ext.page,2);
  assert.equal(result.result.list[0].ext.typeurl,'https://example.com/category');
});
test('search-only extensions give an actionable browsing error',async()=>{
  const result=await run('function search(){return jsonify({list:[]})}','getConfig');
  assert.match(result.error,/未提供分类浏览功能/);
});
