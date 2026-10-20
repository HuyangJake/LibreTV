import type { SourceConfig } from './types';
import type { SourceSubscription, LiveSubscription } from './store';

export interface SharedSources {
  customAPIs: SourceConfig[];
  selectedKeys: string[];
  subscriptions: SourceSubscription[];
  liveSubscriptions: LiveSubscription[];
  liveSelectedUrls: string[];
  envKeysSeen: string[];
  liveEnvKeysSeen: string[];
  envSubsSeen: string[];
}
export const sharedKeys = ['customAPIs', 'selectedKeys', 'subscriptions', 'liveSubscriptions', 'liveSelectedUrls', 'envKeysSeen', 'liveEnvKeysSeen', 'envSubsSeen'] as const;
export function pickShared(state: SharedSources): SharedSources {
  return Object.fromEntries(sharedKeys.map((key) => [key, state[key]])) as unknown as SharedSources;
}
export function validateShared(value: unknown): SharedSources {
  if (!value || typeof value !== 'object') throw new Error('无效的源配置');
  const obj = value as Record<string, unknown>;
  for (const key of sharedKeys) {
    if (!Array.isArray(obj[key]) || obj[key].length > 2000) throw new Error(`无效的配置字段：${key}`);
  }
  const strings = ['selectedKeys', 'liveSelectedUrls', 'envKeysSeen', 'liveEnvKeysSeen', 'envSubsSeen'];
  for (const key of strings) {
    if (!(obj[key] as unknown[]).every((v) => typeof v === 'string' && v.length < 8192)) throw new Error(`无效的配置字段：${key}`);
  }
  for (const key of ['customAPIs', 'subscriptions', 'liveSubscriptions']) {
    for (const item of obj[key] as Record<string, unknown>[]) {
      if (!item || typeof item.url !== 'string' || !/^https?:\/\//.test(item.url)) throw new Error('源地址必须为 HTTP(S)');
      if (key === 'customAPIs' && (typeof item.key !== 'string' || typeof item.name !== 'string')) throw new Error('源缺少名称或标识');
      if (key === 'liveSubscriptions' && (!Array.isArray(item.fromSubscriptions) || !item.fromSubscriptions.every((v) => typeof v === 'string'))) throw new Error('直播订阅归属无效');
    }
  }
  return pickShared(obj as unknown as SharedSources);
}
