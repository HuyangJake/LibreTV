import {describe,it,expect}from'vitest';
import{rewriteCatvodPlaylist}from'./catvod-playlist';
describe('CatVod HLS rewriting',()=>{
 it('includes alternate audio, subtitles, keys, maps and media segments',()=>{
  const seen:string[]=[];
  const text='#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-SESSION-KEY:METHOD=AES-128,URI="https://keys.example/key"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4,\nsegment.ts\n';
  const result=rewriteCatvodPlaylist(text,'https://cdn.example/video/index.m3u8',url=>{seen.push(url);return '/media/'+seen.length;});
  expect(seen).toEqual(['https://cdn.example/video/audio.m3u8','https://keys.example/key','https://cdn.example/video/init.mp4','https://cdn.example/video/segment.ts']);
  expect(result).not.toContain('https://');expect(result).toContain('URI="/media/1"');expect(result).toContain('\n/media/4\n');
 });
});
