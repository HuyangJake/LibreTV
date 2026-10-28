import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareBundle } from './compatibility.mjs';
test('unreviewed source versions never execute', () => {
  assert.throws(
    () => prepareBundle(Buffer.from('module.exports={start(){}}'), 'dedicated'),
    /兼容审核/
  );
});
test(
  'reviewed bundle patches every known destructive or messaging path',
  { skip: !process.env.CATVOD_TEST_BUNDLE },
  async () => {
    const original = await readFile(process.env.CATVOD_TEST_BUNDLE);
    const code = prepareBundle(original, 'LibreTV-Quark-test');
    for (const symbol of ['hPe', 'dPe', 'mPe', 'uPe'])
      assert.ok(code.includes(`async function ${symbol}(){return;`));
    assert.ok(code.includes('static async[Ub(438,"Sahb")](r){return;'));
    assert.ok(code.includes('lPe="LibreTV-Quark-test"'));
    assert.ok(code.includes('async function zYt(n){return (await Ia("file/download?'));
    assert.ok(code.includes('return globalThis.catvodQuarkRequest(n,r,'));
    assert.ok(code.includes('x=(a??3)'));
    assert.ok(!code.includes('globalThis.Pans=await Yne(fn)'));
  }
);

test('share details initialize the saved account before enumerating files', {skip:!process.env.CATVOD_TEST_BUNDLE}, async()=>{
  const { default: vm } = await import('node:vm');
  const original=await readFile(process.env.CATVOD_TEST_BUNDLE);
  const code=prepareBundle(original,'LibreTV-Quark-test');
  const start=code.indexOf('async function tt(n,r){');
  const enumeration=code.slice(start,code.indexOf('async function _t(',start));
  // Only this inspected source function is evaluated; no bundle execution or network.
  assert.ok(enumeration.startsWith('async function tt(n,r){'));
  assert.ok(!enumeration.includes('require(')&&!enumeration.includes('fetch('));
  const context=vm.createContext(Object.create(null));
  vm.runInContext(`
    var uo='',I2=null,Jb=null,reads=0;
    var IX={default:{enc:{Hex:{stringify:v=>v}},MD5:()=> 'fixture-account'}};
    var xt=()=>{throw Error('unexpected undecoded call');};
    // QO below is the inspected source function with only string lookups decoded.
    async function QO(n){let r=xt;I2=n.server.db;let t=n.server.config.quark;uo=t.cookie,Jb=IX.default.enc.Hex.stringify(IX.default.MD5(t.cookie)).toString();let o=await I2.getObjectDefault('/quark',{});o[Jb]&&(uo=o[Jb]);}
    var ny=()=>false,oy=url=>url.includes('pan.quark.cn'),sh=()=>[{key:'quark',validator:oy}];
    var kPe=async()=>uo==='fixture-cookie'?{from:'quark-test',url:'episode'}:{};
    var request={server:{config:{quark:{cookie:'libretv'}},db:{getObjectDefault:async()=>{reads++;return {'fixture-account':'fixture-cookie'};}}}};
    ${enumeration}
  `,context,{timeout:1000});
  const result=await vm.runInContext("tt(['https://pan.quark.cn/s/fixture'],request)",context,{timeout:1000});
  assert.equal(result.froms,'quark-test');
  assert.equal(vm.runInContext('reads',context),1);
});

test('unavailable transcodes leave original-quality fallback available', {skip:!process.env.CATVOD_TEST_BUNDLE}, async()=>{
 const {default:vm}=await import('node:vm');
 const code=prepareBundle(await readFile(process.env.CATVOD_TEST_BUNDLE),'LibreTV-Quark-test');
 const start=code.indexOf('async function CPe(n,r,t,o){');
 const end=code.indexOf('async function catvodOriginalTranscodes',start);
 assert.ok(end>start,'the reviewed transcode wrapper must exist');
 const context=vm.createContext({Array,catvodOriginalTranscodes:async()=>null});
 vm.runInContext(code.slice(start,end),context,{timeout:1000});
 assert.equal((await vm.runInContext('CPe()',context,{timeout:1000})).length,0);
});

test('reopening a share replaces its process-cached token with a fresh token', {skip:!process.env.CATVOD_TEST_BUNDLE}, async()=>{
 const {default:vm}=await import('node:vm');
 const original=(await readFile(process.env.CATVOD_TEST_BUNDLE)).toString();
 const code=prepareBundle(Buffer.from(original),'LibreTV-Quark-test');
 // Evaluate only the inspected string decoder and token function with fake HTTP.
 const ts=original.indexOf('function BO()',2800000),te=original.indexOf('BO()}',original.indexOf('return BO=function',ts))+5;
 const ds=original.indexOf('function Hx(',ts),de=original.indexOf('Hx(n,r)}',ds)+8;
 const rs=original.indexOf('(function(n,r){let t=Hx',2800000),re=original.indexOf('function APe',rs);
 const decoder=original.slice(ts,te)+original.slice(ds,de)+original.slice(rs,re)+';var xt=Hx;';
 const start=code.indexOf('async function gPe(n){'),end=code.indexOf('async function KYt(n){',start);
 const context=vm.createContext(Object.create(null));
 vm.runInContext(decoder+`var KW={fixture:{stoken:'expired'}},$0='pr=ucpro&fr=pc',reads=0;var Ia=async()=>({code:0,data:{stoken:'fresh-'+(++reads)}});`+code.slice(start,end),context,{timeout:1000});
 await vm.runInContext("gPe({shareId:'fixture'})",context,{timeout:1000});
 await vm.runInContext("gPe({shareId:'fixture'})",context,{timeout:1000});
 assert.equal(vm.runInContext('reads',context),2);
 assert.equal(vm.runInContext('KW.fixture.stoken',context),'fresh-2');
});
