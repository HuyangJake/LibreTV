import { describe, it, expect } from 'vitest';
import { isCatvodSource, catvodSite } from './catvod-source';
import { catvodDetail, catvodCards, encodeCatvodId, decodeCatvodId, getTrack } from './catvod';
import { probeQuality } from './quality-probe';
const source = {
  key: 'catvod_nodejs_muou',
  name: '木偶',
  url: 'https://example.com/index.js.md5#nodejs_muou',
};
describe('CatVod adapter', () => {
  it('distinguishes package sites from XPTV script URLs', () => {
    expect(isCatvodSource(source)).toBe(true);
    expect(catvodSite(source)).toBe('nodejs_muou');
    for (const url of [
      'https://x.test/source.js',
      'https://x.test/index.js.md5',
      'https://x.test/index.js.md5#../../config',
    ])
      expect(isCatvodSource({ url })).toBe(false);
  });
  it('round-trips URL based IDs through existing detail-route validation', () => {
    const id = 'https://example.com/vod/a?share=中文';
    expect(decodeCatvodId(encodeCatvodId(id))).toBe(id);
    expect(() => decodeCatvodId('../x')).toThrow();
  });
  it('preserves source identity and rejects malformed search results', () => {
    expect(catvodCards(source, { list: [{ vod_id: 'a/b', vod_name: '三体' }] })[0]).toMatchObject({
      sourceKey: source.key,
      name: '三体',
      vodId: encodeCatvodId('a/b'),
    });
    expect(() => catvodCards(source, {})).toThrow();
  });
  it('preserves separate lines, episode names and dollar signs in IDs without exposing playback data', () => {
    const result = catvodDetail(source, {
      list: [
        {
          vod_name: '测试',
          vod_play_from: '夸克$$$其他',
          vod_play_url: '第一集$id$part#第二集$id2$$$正片$id3',
        },
      ],
    });
    expect(result.lines?.map((l) => l.name)).toEqual(['夸克', '其他']);
    expect(result.lines?.[0].episodes.map((e) => e.name)).toEqual(['第一集', '第二集']);
    const url = result.episodes[0];
    expect(url).toMatch(/^\/api\/catvod\/play\?id=[\w-]+$/);
    expect(getTrack(url.split('=')[1])).toMatchObject({ flag: '夸克', id: 'id$part' });
    expect(() => getTrack('unknown')).toThrow('过期');
  });
  it('does not trigger transfers during quality probing', async () => {
    expect(await probeQuality({ source, id: 'a' })).toEqual({ sourceKey: source.key, vodId: 'a' });
  });
});
