'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';
import { useAppStore } from '@/lib/store';
import type { CatvodStatus } from '@/lib/catvod-client';
import { SectionTitle, Switch } from './settings-shared';
const TEST_ENTRY = 'https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js.md5';
export async function catvodFetch<T>(
  url: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST'
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '操作失败');
  return data;
}
export function CatvodSync() {
  const { verified } = useAuth();
  useEffect(() => {
    if (!verified) return;
    let stopped = false;
    const sync = async () => {
      try {
        const status = await catvodFetch<CatvodStatus>('/api/catvod/status');
        if (stopped) return;
        const store = useAppStore.getState();
        const next = [...store.envSources.filter((s) => s.kind !== 'catvod'), ...status.sources];
        if (JSON.stringify(next) !== JSON.stringify(store.envSources)) store.setEnvSources(next);
      } catch {}
    };
    void sync();
    const timer = setInterval(() => void sync(), 15000);
    const listener = () => void sync();
    window.addEventListener('catvod:changed', listener);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('catvod:changed', listener);
    };
  }, [verified]);
  return null;
}
export function CatvodManager() {
  const router=useRouter();
  const [shareUrl,setShareUrl]=useState('');
  const [status, setStatus] = useState<CatvodStatus>();
  const [admin, setAdmin] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [password, setPassword] = useState('');
  const [entry, setEntry] = useState(TEST_ENTRY);
  const [cookie, setCookie] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [quark, setQuark] = useState<{ configured: boolean; valid: boolean }>();
  const [qr, setQr] = useState<{ id: string; image: string; expires: number }>();
  const [files, setFiles] = useState<{ fid: string; created: number }[]>();
  const [confirmClean, setConfirmClean] = useState(false);
  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      catvodFetch<CatvodStatus>('/api/catvod/status'),
      catvodFetch<{ admin: boolean; configured: boolean }>('/api/catvod/admin'),
    ]);
    setStatus(s);
    setAdmin(a.admin);
    setConfigured(a.configured);
    if (s.entry) setEntry(s.entry);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };
  const manage = <T,>(action: string, data: Record<string, unknown> = {}) =>
    catvodFetch<T>('/api/catvod/manage', { action, ...data });
  useEffect(() => {
    if (!qr) return;
    let pending = false,
      stopped = false;
    const timer = setInterval(async () => {
      if (pending || stopped) return;
      if (Date.now() > qr.expires) {
        setQr(undefined);
        setError('二维码已过期，请重新生成');
        return;
      }
      pending = true;
      try {
        const result = await catvodFetch<{ done: boolean; configured: boolean; valid: boolean }>(
          '/api/catvod/manage',
          { action: 'poll', id: qr.id }
        );
        if (!stopped && result.done) {
          setQr(undefined);
          setQuark(result);
          setMessage(result.valid ? '夸克账号已连接' : '授权已保存，账号状态检查未通过，请重试');
        }
      } catch (e) {
        if (!stopped) {
          setError(e instanceof Error ? e.message : '扫码状态检查失败');
          setQr(undefined);
        }
      } finally {
        pending = false;
      }
    }, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [qr]);
  const changed = () => window.dispatchEvent(new Event('catvod:changed'));
  return (
    <div className="space-y-6" aria-busy={busy}>
      <div>
        <SectionTitle title="猫影视与夸克" hint="管理源包、启用站点和共享网盘账号" />
        <p className="text-sm text-muted">
          站点启用后可进入片库，也会参与统一搜索。播放分享资源时，将按需转存到专用目录。
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger break-words">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-success break-words">
          {message}
        </p>
      )}
      {status?.running && <form className="space-y-3" onSubmit={event=>{event.preventDefault();void run(async()=>{const result=await catvodFetch<{watchUrl:string}>('/api/catvod/open',{url:shareUrl});router.push(result.watchUrl);});}}>
        <SectionTitle title="打开夸克分享" hint="已有视频分享链接时，可直接列出文件并播放"/>
        <label className="block text-sm">分享链接<input type="url" className="input mt-2 w-full" placeholder="https://pan.quark.cn/s/…" value={shareUrl} onChange={event=>setShareUrl(event.target.value)} required/></label>
        <button className="btn-primary btn-sm" disabled={busy||!shareUrl}>打开分享</button>
      </form>}
      {!admin ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await catvodFetch('/api/catvod/admin', { password });
              setPassword('');
              await refresh();
            });
          }}
        >
          <p className="text-sm text-muted">
            观看无需管理员授权。修改源包或网盘账号需要管理员密码，授权有效期为 30 分钟。
          </p>
          {!configured && (
            <p role="status" className="text-sm text-warning">
              请部署者设置独立的 ADMIN_PASSWORD，不能与观看密码相同。
            </p>
          )}
          <label className="block text-sm">
            管理员密码
            <input
              type="password"
              autoComplete="current-password"
              className="input mt-2 w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="btn-primary" disabled={busy || !configured}>
            管理员授权
          </button>
        </form>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-success">管理员已授权</span>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                void run(async () => {
                  await catvodFetch('/api/catvod/admin', undefined, 'DELETE');
                  setAdmin(false);
                  setQr(undefined);
                  setCookie('');
                })
              }
            >
              结束授权
            </button>
          </div>
          <section className="space-y-3">
            <SectionTitle title="源包" />
            <label className="block text-sm">
              源包入口
              <input
                className="input mt-2 w-full"
                type="url"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
              />
            </label>
            <p className="text-xs text-muted">首版支持已审核的测试源版本，固定运行，手动更新。</p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary btn-sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const s = await manage<CatvodStatus>('install', { entry });
                    setStatus(s);
                    setMessage('源包已加载，请选择要启用的站点');
                    changed();
                  })
                }
              >
                {busy ? '处理中…' : status?.configured ? '重新加载固定版本' : '加载测试源包'}
              </button>
              {status?.configured && (
                <>
                  <button
                    className="btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const d = await manage<{ changed: boolean }>('update');
                        setMessage(
                          d.changed
                            ? '检测到上游新版本，需要兼容验证后才能启用'
                            : '当前源包已是审核版本'
                        );
                      })
                    }
                  >
                    检查更新
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setStatus(await manage<CatvodStatus>('rollback'));
                        setMessage('源包及配置已回退');
                        changed();
                      })
                    }
                  >
                    回退上次版本
                  </button>
                </>
              )}
            </div>
            {status?.configured && (
              <p className="text-xs text-muted break-all">
                {status.running ? '运行中' : '运行服务尚未就绪'} · 版本{' '}
                {status.version?.slice(0, 12)} · 补丁 {status.patchVersion}
              </p>
            )}
          </section>
          {status?.running && (
            <>
              <section className="space-y-3">
                <SectionTitle title="夸克测试账号" />
                <p className="text-sm text-muted">
                  所有观看者共用此账号。登录凭证将由固定版本源包使用。
                </p>
                {quark && (
                  <p
                    role="status"
                    className={quark.valid ? 'text-sm text-success' : 'text-sm text-warning'}
                  >
                    {quark.valid
                      ? '账号已连接'
                      : quark.configured
                        ? '账号检查未通过，请重新授权或重试'
                        : '尚未配置账号'}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary btn-sm"
                    disabled={busy || !!qr}
                    onClick={() => void run(async () => setQr(await manage('qr')))}
                  >
                    生成登录二维码
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void run(async () => setQuark(await manage('quarkStatus')))}
                  >
                    检查账号状态
                  </button>
                </div>
                {qr && (
                  <div className="space-y-2">
                    <Image
                      unoptimized
                      src={`data:image/png;base64,${qr.image}`}
                      alt="使用专用夸克账号扫码登录"
                      width={240}
                      height={240}
                      className="rounded-lg bg-white"
                    />
                    <p className="text-sm text-muted">
                      请使用夸克 App 扫码并确认，登录成功后会自动保存授权。
                    </p>
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() =>
                        void run(async () => {
                          await manage('cancelQr', { id: qr.id });
                          setQr(undefined);
                        })
                      }
                    >
                      取消扫码
                    </button>
                  </div>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted">使用 Cookie 配置</summary>
                  <div className="mt-3 space-y-2">
                    <label className="block">
                      夸克 Cookie
                      <textarea
                        className="input mt-2 w-full"
                        rows={3}
                        value={cookie}
                        onChange={(e) => setCookie(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <button
                      className="btn-ghost btn-sm"
                      disabled={busy || !cookie}
                      onClick={() =>
                        void run(async () => {
                          setQuark(await manage('cookie', { cookie }));
                          setCookie('');
                          setQr(undefined);
                          setMessage('授权已保存');
                        })
                      }
                    >
                      保存授权
                    </button>
                  </div>
                </details>
              </section>
              <section className="space-y-3">
                <SectionTitle
                  title="转存文件"
                  hint={status.directory ? `专用目录：${status.directory}` : undefined}
                />
                <p className="text-xs text-muted">
                  仅清理本实例记录的文件。播放停止两分钟后可清理。
                </p>
                <button
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setFiles(
                        (await manage<{ files: { fid: string; created: number }[] }>('files')).files
                      );
                      setConfirmClean(false);
                    })
                  }
                >
                  查看可清理文件
                </button>
                {files && (
                  <>
                    <p className="text-sm">已记录 {files.length} 个转存文件</p>
                    {files.length > 0 &&
                      (!confirmClean ? (
                        <button
                          className="btn-ghost btn-sm text-danger"
                          disabled={busy}
                          onClick={() => setConfirmClean(true)}
                        >
                          清理这些文件
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm text-warning">
                            将从夸克专用目录删除这 {files.length} 个已记录文件。
                          </p>
                          <div className="flex gap-2">
                            <button
                              className="btn-primary btn-sm"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await manage('cleanup', { ids: files.map((f) => f.fid) });
                                  setFiles([]);
                                  setConfirmClean(false);
                                  setMessage('已清理记录中的转存文件');
                                })
                              }
                            >
                              确认删除
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => setConfirmClean(false)}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </section>
              <section>
                <SectionTitle
                  title={`站点（${status.sites.filter((s) => s.enabled).length}/${status.sites.length} 已启用）`}
                  hint="默认关闭，建议只启用已验证的少量站点"
                />
                <div className="divide-y divide-line">
                  {status.sites.map((site) => (
                    <div key={site.key} className="flex items-center justify-between gap-3 py-3">
                      <span className="text-sm text-content break-words">{site.name}</span>
                      <span className={busy ? 'pointer-events-none opacity-50' : ''}>
                        <Switch
                          checked={site.enabled}
                          label={`启用 ${site.name}`}
                          onChange={(value) =>
                            void run(async () => {
                              const enabled = status.sites
                                .filter((s) => (s.key === site.key ? value : s.enabled))
                                .map((s) => s.key);
                              setStatus(await manage('sites', { enabled }));
                              changed();
                            })
                          }
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
