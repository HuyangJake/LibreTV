import type { SourceConfig } from './types';
export interface CatvodStatus {
  configured: boolean;
  running: boolean;
  version?: string;
  patchVersion?: number;
  entry?: string;
  directory?: string;
  sites: { key: string; name: string; enabled: boolean }[];
  sources: SourceConfig[];
}
export async function catvodRequest<T>(route: string, method = 'GET', body?: unknown): Promise<T> {
  const endpoint = process.env.CATVOD_URL;
  const token = process.env.CATVOD_TOKEN;
  if (!endpoint || !token) throw new Error('尚未部署猫影视运行服务');
  const res = await fetch(endpoint.replace(/\/$/, '') + route, {
    method,
    headers: { 'X-Catvod-Token': token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(route === '/operate' ? 65000 : 45000),
    redirect: 'error',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : '猫影视服务暂不可用');
  return data as T;
}
