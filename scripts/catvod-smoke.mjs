// Run against the independent test instance, never the production NAS endpoint.
import { readFile } from 'node:fs/promises';
const base=process.env.CATVOD_TEST_BASE||'http://127.0.0.1:18081';
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')));
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('This smoke script only accepts a local test instance');
const env=Object.fromEntries((await readFile(new URL('../.env.catvod-test.local',import.meta.url),'utf8')).trim().split('\n').map(line=>line.split('=')));
const login=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:env.CATVOD_TEST_PASSWORD})});
if(!login.ok)throw new Error('Test login failed');const cookie=login.headers.get('set-cookie')?.split(';')[0];
async function request(route,body){const res=await fetch(base+route,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await res.json();return {status:res.status,data};}
const denied=await request('/api/catvod/manage',{action:'quarkStatus'});if(denied.status!==403)throw new Error('Viewing session can access administrator operations');
console.log('PASS administrator isolation');
const status=await request('/api/catvod/status');if(!status.data.running)throw new Error('Runtime not ready');
const source=status.data.sources.find(s=>s.key==='catvod_'+(args.site||'nodejs_bdjuhe'));if(!source)throw new Error('The selected test site is not enabled');
const search=await request('/api/search',{wd:args.title||'星际穿越',sources:[source]});if(search.status!==200||!search.data.list?.length)throw new Error('Real source search failed');
console.log('PASS real search:',search.data.list.length,'results');
const categories=await request('/api/browse',{action:'categories',source});if(categories.status!==200||!categories.data.categories?.length)throw new Error('Category browsing failed');
console.log('PASS category browsing:',categories.data.categories.length,'categories');
const category=categories.data.categories[0].id;
const videos=await request('/api/browse',{action:'videos',source,category,page:1});if(videos.status!==200||!videos.data.list?.length)throw new Error('Video browsing failed');
console.log('PASS real video browsing:',videos.data.list.length,'items');
const first=search.data.list[0];const detail=await request('/api/detail?'+new URLSearchParams({source:JSON.stringify(source),id:first.vodId}));
if(detail.status===200)console.log('PASS real detail:',detail.data.episodes.length,'episodes');
else if(/夸克.*授权|管理员.*夸克/.test(detail.data.error||''))console.log('WAIT Quark authorization is required for real detail and playback');
else throw new Error('Unexpected detail error: '+detail.data.error);
