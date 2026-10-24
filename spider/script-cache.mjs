import { publicFetch } from './network.mjs';

// The parent loads scripts; only the disposable child evaluates them.
// Coalesce downloads during category/page requests and never cache failures.
export function createScriptLoader({ fetchScript = publicFetch, now = Date.now, ttl = 300000, maxEntries = 20 } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function loadScript(url) {
    const cached = cache.get(url);
    if (cached && cached.expires > now()) {
      cache.delete(url); cache.set(url, cached);
      return cached.code;
    }
    cache.delete(url);
    if (pending.has(url)) return pending.get(url);
    const load = (async () => {
      const start = now();
      let loaded;
      try { loaded = await fetchScript(url); }
      catch (error) {
        // Retry only quick connection failures, keeping slow misses bounded.
        if (now() - start > 3000) throw error;
        loaded = await fetchScript(url);
      }
      if (!loaded.response.ok) throw new Error(`脚本下载 HTTP ${loaded.response.status}`);
      const code = loaded.data;
      if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > 1000000) throw new Error('Spider 脚本为空或超过 1MB');
      while (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
      cache.set(url, { code, expires: now() + ttl });
      return code;
    })();
    pending.set(url, load);
    try { return await load; }
    finally { pending.delete(url); }
  };
}

export const loadScript = createScriptLoader();
