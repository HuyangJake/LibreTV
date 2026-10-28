import { guardRequest } from '@/lib/api-guard';
import { getTrack, operate } from '@/lib/catvod';
import { catvodSite } from '@/lib/catvod-source';
import { registerMedia, inspectCatvodMedia } from '@/lib/catvod-media';
import { getCatvodCache as getCache, setCatvodCache as setCache } from '@/lib/catvod-cache';
export const runtime = 'nodejs';
interface PlayResult {
  parse?: number;
  url?: string | string[];
  header?: Record<string, string>;
  headers?: Record<string, string>;
}
const active = new Map<string, Promise<unknown>>();
export async function POST(req: Request) {
  const denied = guardRequest(req);
  if (denied) return denied;
  try {
    const { id } = await req.json();
    if (typeof id !== 'string' || id.length > 100) throw new Error('播放参数无效');
    const track = getTrack(id);
    const cached = getCache('catvod-play:' + id);
    if (cached) return Response.json(cached);
    let task = active.get(id);
    if (!task) {
      task = (async () => {
        const result = await operate<PlayResult>({ url: track.sourceUrl }, 'play', {
          flag: track.flag,
          id: track.id,
        });
        if (Number(result.parse) > 0)
          throw new Error('此线路需要原生嗅探或解析器，请手动选择其他线路');
        const urls = typeof result.url === 'string' ? ['默认', result.url] : result.url;
        if (!Array.isArray(urls) || !urls.length) throw new Error('源站没有返回播放地址');
        const entries =
          urls.length === 1
            ? [{ name: '默认', target: urls[0] }]
            : Array.from({ length: Math.floor(urls.length / 2) }, (_, i) => ({
                name: urls[i * 2],
                target: urls[i * 2 + 1],
              }));
        const candidates = entries
          .filter((v) => typeof v.target === 'string' && /^https?:\/\//.test(v.target))
          .map(v=>({name:String(v.name),url:registerMedia(v.target,result.header||result.headers||{},catvodSite({url:track.sourceUrl}))}));
        const checked = await Promise.allSettled(candidates.map(async variant=>({...variant,type:await inspectCatvodMedia(req,variant.url)})));
        const variants = checked.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
        if (!variants.length) throw new Error('源站没有返回可直接播放的地址');
        const data = { variants };
        setCache('catvod-play:' + id, data, 5 * 60000);
        return data;
      })();
      active.set(id, task);
      void task.finally(() => active.delete(id)).catch(() => {});
    }
    return Response.json(await task, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : '播放解析失败' },
      { status: 502 }
    );
  }
}
