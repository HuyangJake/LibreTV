import { afterEach, expect, it, vi } from 'vitest';
import { decodeSpiderExt, detailSpider, encodeSpiderExt, searchSpider } from './spider';
import { isSpiderSource } from './spider-source';
import { parseSubscriptionPayload } from './tvbox-parser';
vi.mock('./ssrf',()=>({checkUpstreamAllowed:vi.fn(async()=>({ok:true}))}));
afterEach(()=>{vi.unstubAllGlobals();delete process.env.SPIDER_URL;});
it('recognizes mirrored JS URLs and preserves arbitrary ext IDs',()=>{
  expect(isSpiderSource({url:'https://mirror.example/https://raw.example/a.js?x=1'})).toBe(true);
  const ext={url:'https://example.com/video/a?b=1',nested:{id:'测试'}};
  expect(decodeSpiderExt(encodeSpiderExt(ext))).toEqual(ext);
});
it('imports XPTV scripts but continues to skip JAR spiders',()=>{
  const parsed=parseSubscriptionPayload({sites:[{name:'XPTV',type:3,api:'csp_XPath',ext:'https://example.com/script.js'},{name:'JAR',type:3,api:'csp_Java'}]});
  expect(parsed.sources[0].url).toBe('https://example.com/script.js');
  expect(parsed.stats?.skipped).toBe(1);
});
it('maps search ext to detail and lazy play URLs without resolving all episodes',async()=>{
  process.env.SPIDER_URL='http://spider:8787';
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({result:{list:[{vod_name:'Example',ext:{url:'https://example.com/movie'}}]}})).mockResolvedValueOnce(Response.json({result:{list:[{tracks:[{ext:{url:'https://example.com/watch'}}]}]}}));
  vi.stubGlobal('fetch',fetch);
  const source={key:'a',name:'XPTV',url:'https://example.com/a.js'};
  const list=await searchSpider(source,'Example');
  const detail=await detailSpider(source,list[0].vodId);
  expect(detail.episodes[0]).toMatch(/^\/api\/spider\/play\?/);
  expect(JSON.parse(fetch.mock.calls[1][1].body).ext).toEqual({url:'https://example.com/movie'});
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('reports missing runtime instead of treating JS as CMS',async()=>{
  await expect(searchSpider({key:'a',name:'XPTV',url:'https://example.com/a.js'},'test')).rejects.toThrow('尚未配置');
});
