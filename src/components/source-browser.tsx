'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAppStore, isInDisabledSubscription } from '@/lib/store';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { SearchResultItem } from '@/lib/types';
import { useAuth } from './auth';
import { DetailModal } from './detail-modal';
import { VideoCard } from './video-card';
import { EmptyState, ErrorState, LoadingState } from './states';
import { Icon } from './icon';

function useBrowseSources() {
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sources = useMemo(() => {
    const seen = new Set<string>();
    const selected = new Set(selectedKeys);
    return [...customAPIs, ...envSources].filter((source) => {
      if (seen.has(source.key)) return false;
      seen.add(source.key);
      return !(yellowFilter && source.isAdult) && !isInDisabledSubscription({ subscriptions }, source.key);
    }).sort((a, b) => Number(selected.has(b.key)) - Number(selected.has(a.key)) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
  }, [customAPIs, envSources, selectedKeys, subscriptions, yellowFilter]);
  return { sources, yellowFilter };
}

/** 首页直接进入单个源；仅展示入口，不同时请求所有源的片库。 */
export function SourceBrowseEntry() {
  const { sources } = useBrowseSources();
  return (
    <section aria-label="按源浏览" className="mb-8 rounded-xl border border-line bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-content">按源浏览</h2>
          <p className="text-xs text-muted mt-1">不用先想片名，进入一个源看看分类和最近更新。</p>
        </div>
        <Link href="/browse" className="btn-ghost btn-sm shrink-0">进入片库</Link>
      </div>
      {sources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {sources.slice(0, 8).map((source) => (
            <Link key={source.key} href={`/browse?source=${encodeURIComponent(source.key)}`} className="rounded-lg border border-line bg-chip px-3 py-2 text-sm text-content hover:border-accent hover:text-accent transition-colors max-w-full truncate">
              {source.name}
            </Link>
          ))}
          {sources.length > 8 && <Link href="/browse" className="px-3 py-2 text-sm text-accent">全部 {sources.length} 个源 →</Link>}
        </div>
      ) : <p className="text-xs text-faint">在设置中添加数据源后，就可以进入它的片库。</p>}
    </section>
  );
}

export function SourceBrowser() {
  const params = useSearchParams();
  const router = useRouter();
  const { sources, yellowFilter } = useBrowseSources();
  const { checked, verified, openLogin } = useAuth();
  const sourceKey = params.get('source') || '';
  const source = sources.find((item) => item.key === sourceKey);
  const categoryParam = params.get('category');
  const requestedPage = Number(params.get('page') || '1');
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 10000 ? requestedPage : 1;
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['browse-categories', source?.key, source?.url, yellowFilter],
    queryFn: ({ signal }) => api.browseCategories(source!, yellowFilter, signal),
    enabled: Boolean(source && verified), staleTime: 5 * 60000, retry: false,
  });
  const categories = categoriesQuery.data?.categories || [];
  const category = categoryParam ?? categories[0]?.id;
  const categoryValid = categories.some((item) => item.id === category);
  const videosQuery = useQuery({
    queryKey: ['browse-videos', source?.key, source?.url, category, page, yellowFilter],
    queryFn: ({ signal }) => api.browseVideos(source!, category!, page, yellowFilter, signal),
    enabled: Boolean(source && verified && categoryValid), staleTime: 60000, retry: false,
  });

  const navigate = (key: string, nextCategory?: string, nextPage = 1) => {
    setDetailItem(null);
    const next = new URLSearchParams();
    if (key) next.set('source', key);
    if (nextCategory !== undefined) next.set('category', nextCategory);
    if (nextPage > 1) next.set('page', String(nextPage));
    router.push(`/browse${next.size ? '?' + next : ''}`, { scroll: false });
  };
  const changePage = (nextPage: number) => {
    navigate(sourceKey, category, nextPage);
    document.getElementById('source-videos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const list = videosQuery.data?.list || [];
  const currentCategory = categories.find((item) => item.id === category);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content">源片库</h1>
        <p className="text-sm text-muted mt-2">选择一个数据源，按分类浏览影片，点开即可查看剧集和播放。</p>
      </div>

      {checked && !verified ? (
        <EmptyState title="登录后浏览片库" action={<button className="btn-primary btn-sm" onClick={openLogin}>登录</button>} />
      ) : sources.length === 0 ? (
        <EmptyState title="还没有可显示的数据源" description="请在右上角设置中添加点播源。开启内容过滤或停用订阅时，相应的源会隐藏。" />
      ) : (
        <>
          <label className="block mb-5">
            <span className="block text-xs text-muted mb-2">选择数据源 · {sources.length} 个</span>
            <select aria-label="选择数据源" className="input w-full sm:max-w-md" value={source?.key || ''} onChange={(e) => navigate(e.target.value)}>
              <option value="">请选择一个源</option>
              {sources.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select>
          </label>

          {!source ? (
            <>
              {sourceKey && <p role="status" className="text-sm text-muted mb-4">这个源已移除或被当前过滤设置隐藏，请选择其他源。</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-label="数据源列表">
                {sources.map((item) => (
                  <Link key={item.key} href={`/browse?source=${encodeURIComponent(item.key)}`} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card p-4 hover:border-accent transition-colors">
                    <span className="font-medium text-content truncate">{item.name}</span>
                    <span className="text-sm text-accent shrink-0">进入 →</span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div>
              {categoriesQuery.isPending && <LoadingState label="正在读取影片分类..." />}
              {categoriesQuery.isError && <ErrorState message={categoriesQuery.error.message} onRetry={() => { void categoriesQuery.refetch(); }} />}
              {categoriesQuery.isSuccess && categories.length === 0 && <EmptyState title="这个源没有可显示的分类" description="请检查内容过滤设置，或换一个源浏览。" />}

              {categories.length > 0 && (
                <>
                  <nav aria-label="影片分类" className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pb-2 mb-5">
                    {categories.map((item) => (
                      <button key={item.id} type="button" aria-pressed={item.id === category} onClick={() => navigate(sourceKey, item.id)} className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors', item.id === category ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-chip text-muted hover:text-content')}>
                        {item.name}
                      </button>
                    ))}
                  </nav>
                  {!categoryValid ? (
                    <EmptyState title="这个分类已失效" action={<button className="btn-ghost btn-sm" onClick={() => navigate(sourceKey)}>返回默认分类</button>} />
                  ) : (
                    <section id="source-videos" aria-label="影片列表" className="scroll-mt-20">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <h2 className="font-semibold text-content truncate">{currentCategory?.name}</h2>
                          <p className="text-xs text-faint mt-1">第 {page} 页{videosQuery.isSuccess ? ` · 本页 ${list.length} 部` : ''}</p>
                        </div>
                        <button aria-label="刷新影片列表" className="btn-ghost btn-sm" disabled={videosQuery.isFetching} onClick={() => { void videosQuery.refetch(); }}><Icon name="refresh" className="w-4 h-4" />刷新</button>
                      </div>
                      <div aria-live="polite" aria-busy={videosQuery.isFetching}>
                        {videosQuery.isPending && <LoadingState label="正在加载影片..." />}
                        {videosQuery.isError && <ErrorState message={videosQuery.error.message} onRetry={() => { void videosQuery.refetch(); }} />}
                        {videosQuery.isSuccess && list.length === 0 && <EmptyState title="这一页没有可显示的影片" description={page > 1 ? '可以返回上一页，或切换分类继续浏览。' : '可以换一个分类，或检查内容过滤设置。'} />}
                        {videosQuery.isSuccess && list.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {list.map((item) => <VideoCard key={`${item.sourceKey}_${item.vodId}`} item={item} onClick={() => setDetailItem(item)} />)}
                          </div>
                        )}
                      </div>
                      <nav aria-label="影片翻页" className="flex items-center justify-center gap-3 mt-6">
                        <button className="btn-ghost btn-sm" disabled={page <= 1 || videosQuery.isFetching} onClick={() => changePage(page - 1)}>上一页</button>
                        <span className="text-sm text-muted tabular-nums">{page}{videosQuery.data?.pageCount ? ` / ${videosQuery.data.pageCount}` : ''}</span>
                        <button className="btn-ghost btn-sm" disabled={!videosQuery.data?.hasMore || videosQuery.isFetching} onClick={() => changePage(page + 1)}>下一页</button>
                      </nav>
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </>
  );
}
