// Keep playback state separate from the small, disposable public-response cache.
const entries = new Map<string, { value: unknown; expires: number }>();
const MAX_ENTRIES = 12000;
export function getCatvodCache<T>(key: string): T | undefined {
  const item = entries.get(key);
  if (!item) return;
  if (item.expires < Date.now()) {
    entries.delete(key);
    return;
  }
  return item.value as T;
}
export function setCatvodCache(key: string, value: unknown, ttl: number) {
  if (entries.size >= MAX_ENTRIES) {
    for (const [key, item] of entries) {
      if (item.expires < Date.now()) entries.delete(key);
    }
    if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  }
  entries.set(key, { value, expires: Date.now() + ttl });
}

export function clearCatvodCache() { entries.clear(); }
