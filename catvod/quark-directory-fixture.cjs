// Only the inspected string decoder and extracted KYt/kPe/tt plus pure packing helpers.
// Fake directory API, fake tokens, no account reads, no network, no full-bundle execution.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const original=fs.readFileSync(process.env.CATVOD_TEST_BUNDLE,'utf8');
const plan={originalSha256:require('./test-source.json').sha256,patches:require('./quark-directory-patches.json')};
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),plan.originalSha256);
let patched=original;
for(const p of plan.patches){assert.equal(patched.split(p.find).length-1,1,p.purpose);patched=patched.replace(p.find,p.replace);}
function cut(s,start,end){const a=s.indexOf(start);assert.ok(a>=0,start);const b=s.indexOf(end,a+start.length);assert.ok(b>a,end);return s.slice(a,b);}
const ts=original.indexOf('function BO()',2800000),te=original.indexOf('BO()}',original.indexOf('return BO=function',ts))+5;
const ds=original.indexOf('function Hx(',ts),de=original.indexOf('Hx(n,r)}',ds)+8;
const rs=original.indexOf('(function(n,r){let t=Hx',2800000),re=original.indexOf('function APe',rs);
const decoder=original.slice(ts,te)+original.slice(ds,de)+original.slice(rs,re)+';var xt=Hx;';
assert.ok(!decoder.includes('require(')&&!decoder.includes('fetch('));
const packing=cut(original,'function uBe(n,r){','function vw(')+cut(original,'function vw(n){','function szt(')+cut(original,'function O9e(n){','function Mx(')+cut(original,'function Mx(n,r){','var ny=');
const ape=cut(original,'function APe(n){','var $0=');
const tt=cut(original,'async function tt(n,r){','async function _t(');
const ctx=vm.createContext({URL,catvodGroupQuarkFiles:require('./quark-groups.cjs')});
vm.runInContext(decoder+packing+ape+`
var $0='pr=ucpro&fr=pc',KW={},VYt=['.srt'],requests=[];
var getPanName=key=>'夸克',getPanEnabled=key=>key==='quark';
var oy=url=>getPanEnabled('quark')&&url.includes('https://pan.quark.cn');
var ny=()=>false,sh=()=>[{key:'quark',validator:oy}];
var gPe=async o=>{KW[o.shareId]={stoken:'FAKE_STOKEN'};};
var Tb=(file,subtitles)=>({bestMatch:subtitles.length?{target:subtitles[0]}:null});
function video(fid,name){return{fid,file_name:name,dir:false,obj_category:'video',size:10485760,share_fid_token:'FAKE_'+fid};}
function folder(fid,name){return{fid,file_name:name,dir:true};}
function subtitle(fid){return{fid,file_name:'01.srt',dir:false,type:'file',obj_category:'text',share_fid_token:'FAKE_'+fid};}
var listing={
 '0:1':{total:101,list:[video('root2','02.mkv'),video('root1','01.mkv'),folder('seasonA','Season A')]},
 '0:2':{total:101,list:[video('root3','03.mkv'),folder('seasonB','Season B')]},
 'seasonA:1':{total:101,list:[video('a1','01.mkv'),folder('bonusA','Bonus'),subtitle('subA')]},
 'seasonA:2':{total:101,list:[video('a2','02.mkv')]},
 'seasonB:1':{total:4,list:[video('b2','02.mkv'),video('b1','01.mkv'),folder('bonusB','Bonus'),subtitle('subB')]},
 'bonusA:1':{total:1,list:[video('ba1','01.mkv')]},
 'bonusB:1':{total:1,list:[video('bb1','01.mkv')]}
};
var Ia=async route=>{const url=new URL('https://fake.invalid/'+route),fid=url.searchParams.get('pdir_fid'),page=url.searchParams.get('_page');requests.push({fid,page});const data=listing[fid+':'+page];if(!data)throw Error('Unexpected fake request '+fid+':'+page);return{data:{list:JSON.parse(JSON.stringify(data.list))},metadata:{_total:data.total}};};
`,ctx,{timeout:1000});
function moduleCode(s){return cut(s,'async function KYt(n){','var jW=')+cut(s,'async function kPe(n){','var OO=')+tt;}
(async()=>{
  vm.runInContext(moduleCode(original),ctx,{timeout:1000});
  const before=JSON.parse(JSON.stringify(await vm.runInContext("tt(['https://pan.quark.cn/s/FAKE_SHARE'],{server:{}})",ctx,{timeout:1000})));
  assert.equal(before.froms.split('$$$').length,1);
  vm.runInContext('requests=[];',ctx);
  vm.runInContext(moduleCode(patched),ctx,{timeout:1000});
  const raw=JSON.parse(JSON.stringify(await vm.runInContext("KYt('https://pan.quark.cn/s/FAKE_SHARE')",ctx,{timeout:1000})));
  assert.equal(raw.length,9);
  assert.deepEqual(raw.find(x=>x.fid==='a2').catvod_path,['Season A']);
  assert.deepEqual(raw.find(x=>x.fid==='ba1').catvod_path,['Season A','Bonus']);
  assert.deepEqual(raw.find(x=>x.fid==='bb1').catvod_path,['Season B','Bonus']);
  assert.equal(raw.find(x=>x.fid==='a1').subtitle.fid,'subA');
  assert.equal(raw.find(x=>x.fid==='b1').subtitle.fid,'subB');
  const after=JSON.parse(JSON.stringify(await vm.runInContext("tt(['https://pan.quark.cn/s/FAKE_SHARE'],{server:{}})",ctx,{timeout:1000})));
  const labels=after.froms.split('$$$'),urls=after.urls.split('$$$');
  assert.equal(labels.length,5);assert.equal(urls.length,5);
  assert.ok(labels.every(x=>x.startsWith('夸克-FAKE_SHARE')));
  const parsed=Object.fromEntries(labels.map((label,index)=>[label,urls[index].split('#').map(x=>x.split('$')[1].split('*')[2])]));
  assert.deepEqual(parsed['夸克-FAKE_SHARE'],['root1','root2','root3']);
  assert.deepEqual(parsed['夸克-FAKE_SHARE / Season A'],['a1','a2']);
  assert.deepEqual(parsed['夸克-FAKE_SHARE / Season B'],['b1','b2']);
  assert.deepEqual(parsed['夸克-FAKE_SHARE / Season A / Bonus'],['ba1']);
  assert.deepEqual(parsed['夸克-FAKE_SHARE / Season B / Bonus'],['bb1']);
  const requests=JSON.parse(vm.runInContext('JSON.stringify(requests)',ctx));
  assert.ok(requests.some(x=>x.fid==='0'&&x.page==='2'));
  assert.ok(requests.some(x=>x.fid==='seasonA'&&x.page==='2'));
  const delimiters=JSON.parse(JSON.stringify(vm.runInContext(`catvodGroupQuarkFiles('夸克-FAKE_SHARE',[{catvod_path:['A$$$#B'],vod_id:'fake',vod_name:'01.mkv',vod_size:10485760}],Mx)`,ctx)));
  assert.ok(!delimiters[0].from.includes('$$$')&&!delimiters[0].from.includes('#'));
  console.log(JSON.stringify({patches:plan.patches.length,allNeedlesUnique:true,beforeLines:1,afterLines:5,files:raw.length,assertions:['root directory','same-named folders under distinct parents','root and child pagination paths','per-directory sorting','subtitle directory isolation','Quark prefix','tt arrays','line delimiter sanitation'],labels}));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
