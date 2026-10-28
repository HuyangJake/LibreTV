// Real playback acceptance against the isolated local instance. Never print credentials or upstream URLs.
import { readFile,mkdir,writeFile } from 'node:fs/promises';
const base=process.env.CATVOD_TEST_BASE||'http://127.0.0.1:18081';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Only a local test instance is allowed');
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const env=Object.fromEntries((await readFile(new URL('../.env.catvod-test.local',import.meta.url),'utf8')).trim().split('\n').map(line=>line.split('=')));
const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:env.CATVOD_TEST_PASSWORD})});if(!auth.ok)throw new Error('Viewing login failed');
const cookie=auth.headers.get('set-cookie')?.split(';')[0];
async function json(route,body){const res=await fetch(base+route,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(70000)});const data=await res.json();if(!res.ok)throw new Error(data.error||'HTTP '+res.status);return data;}
const status=await json('/api/catvod/status');
const key='catvod_'+(args.site||'nodejs_shuangxing');
let source,item,search;
if(args.shareFile){
 const share=(await readFile(args.shareFile,'utf8')).trim();
 source={key:'catvod_nodejs_push',name:'夸克分享',url:status.entry+'#nodejs_push'};
 item={name:args.label||'夸克分享',vodId:Buffer.from(share).toString('base64url')};search={list:[item]};
}else{
 source=status.sources.find(s=>s.key===key);if(!source)throw new Error('Test site is not enabled');
 search=await json('/api/search',{wd:args.title||'三体',sources:[source]});item=search.list[Number(args.result||0)];if(!item)throw new Error('No matching test sample: '+(search.failures?.[0]?.error||'empty result'));
}
console.log({stage:'search',title:item.name,results:search.list.length});
const detail=await json('/api/detail?'+new URLSearchParams({source:JSON.stringify(source),id:item.vodId}));
const lineIndex=Number(args.line||0);const line=detail.lines?.[lineIndex];if(!line)throw new Error('No playback line');
const episodeIndex=Number(args.episode||0);const episode=line.episodes[episodeIndex];if(!episode)throw new Error('No test episode');
console.log({stage:'detail',lines:detail.lines.length,episodes:line.episodes.length,sampleNames:line.episodes.slice(0,4).map(e=>e.name)});
const id=new URL(episode.url,base).searchParams.get('id');const before=Date.now();const playback=await json('/api/catvod/play',{id});
console.log({stage:'resolve',ms:Date.now()-before,variants:playback.variants.map(v=>({name:v.name,type:v.type}))});
const variant=args.quality
 ? playback.variants.find(v=>v.name===args.quality||v.type===args.quality)
 : playback.variants.find(v=>v.name==='高清')||playback.variants.find(v=>v.type==='hls')||playback.variants[0];
if(!variant)throw new Error('Requested quality is unavailable');
const response=await fetch(base+variant.url,{headers:{Cookie:cookie,...(variant.type==='video'?{Range:'bytes=0-1023'}:{})},signal:AbortSignal.timeout(30000)});
const type=response.headers.get('content-type')||'';
let size=0,segments=[];if(type.includes('mpegurl')){const text=await response.text();if(!text.startsWith('#EXTM3U'))throw new Error('Invalid HLS playlist');segments=text.split('\n').filter(x=>x&&!x.startsWith('#'));size=text.length;}else{const reader=response.body.getReader();const part=await reader.read();size=part.value?.length||0;await reader.cancel();}
console.log({stage:'media',status:response.status,type,bytes:size,segments:segments.length,range:response.headers.get('content-range')});if(!response.ok)throw new Error('Media request failed');
if(segments.length){
 let target=new URL(segments[0],base);let checked=false;
 for(let depth=0;depth<5;depth++){
  const part=await fetch(target,{headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)});
  if(!part.ok)throw new Error('HLS child request failed');
  if(/mpegurl/i.test(part.headers.get('content-type')||'')){
   const text=await part.text();const child=text.split('\n').find(x=>x&&!x.startsWith('#'));
   if(!child)throw new Error('Empty child HLS playlist');target=new URL(child,target);continue;
  }
  const reader=part.body.getReader();const chunk=await reader.read();await reader.cancel();
  console.log({stage:'segment',status:part.status,bytes:chunk.value?.length||0});
  if(!chunk.value?.length)throw new Error('First HLS segment is empty');checked=true;break;
 }
 if(!checked)throw new Error('Too many nested HLS playlists');
}
const report={source,vodId:item.vodId,title:item.name,lineIndex,episodeIndex,episodeName:episode.name,variants:playback.variants,watchUrl:base+'/watch?'+new URLSearchParams({source:source.key,id:item.vodId,sourceUrl:source.url,line:String(lineIndex),index:String(episodeIndex),title:item.name}),checkedAt:new Date().toISOString()};
await mkdir(new URL('../data/acceptance/',import.meta.url),{recursive:true});const reportName=(args.report||'playback').replace(/[^\w-]/g,'');await writeFile(new URL('../data/acceptance/'+reportName+'.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});console.log({stage:'PASS',report:reportName});
