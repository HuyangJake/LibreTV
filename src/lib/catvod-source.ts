import type { SourceConfig } from './types';
export function isCatvodSource(source: Pick<SourceConfig, 'url'>): boolean {
  try {
    const u = new URL(source.url);
    return /\.js\.md5$/.test(u.pathname) && /^#nodejs_[\w-]+$/.test(u.hash);
  } catch {
    return false;
  }
}
export function catvodSite(source: Pick<SourceConfig, 'url'>): string {
  if (!isCatvodSource(source)) throw new Error('无效的猫影视站点');
  return new URL(source.url).hash.slice(1);
}
