'use client';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { pickShared, type SharedSources } from '@/lib/shared-sources';
import { useAuth } from './auth';

/** One NAS, one shared source catalog. Revision checks reject stale-device writes. */
export function SharedSourceSync() {
  const { verified } = useAuth();
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!verified) return;
    let stopped = false, applying = false, busy = false;
    let revision: string | null = null;
    let baseline = '';
    let dirty = false;
    let unsubscribe = () => {};
    const apply = (data: SharedSources) => {
      applying = true;
      useAppStore.setState(data);
      applying = false;
      baseline = JSON.stringify(pickShared(useAppStore.getState()));
    };
    const tick = async () => {
      if (busy || stopped || !useAppStore.persist.hasHydrated()) return;
      busy = true;
      try {
        const sent = pickShared(useAppStore.getState());
        const writing = revision !== null && dirty;
        const res = await fetch('/api/shared-sources', writing ? {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision, data: sent }),
        } : { cache: 'no-store' });
        if (stopped) return;
        if (!res.ok && res.status !== 409) throw new Error('源配置尚未同步到 NAS，将自动重试');
        const snapshot = await res.json() as { revision: string; data: SharedSources | null };
        const previousRevision = revision;
        revision = snapshot.revision;
        if (res.status === 409 || (!writing && dirty && previousRevision !== null && previousRevision !== snapshot.revision)) {
          // Keep a recoverable local copy before accepting the other device's update.
          localStorage.setItem('libretv-source-conflict-backup', JSON.stringify(sent));
          if (snapshot.data) apply(snapshot.data);
          dirty = false;
          setMessage('其他设备已修改源配置，已载入最新版本；本次修改保存在本机冲突备份中，请重新编辑。');
        } else if (writing) {
          baseline = JSON.stringify(sent);
          dirty = JSON.stringify(pickShared(useAppStore.getState())) !== baseline;
          setMessage('');
        } else if (snapshot.data) {
          // An edit made while GET was in flight must go through revision checking.
          if (previousRevision === null || !dirty) {
            if (previousRevision === null) localStorage.setItem('libretv-source-migration-backup', JSON.stringify(sent));
            apply(snapshot.data);
            dirty = false;
          }
          setMessage('');
        } else {
          // First authenticated browser seeds the NAS; empty new devices never erase it.
          dirty = true;
        }
      } catch (err) { if (!stopped) setMessage(err instanceof Error ? err.message : '源同步失败'); }
      finally { busy = false; }
    };
    const start = async () => {
      if (!useAppStore.persist.hasHydrated()) await useAppStore.persist.rehydrate();
      if (stopped) return;
      baseline = JSON.stringify(pickShared(useAppStore.getState()));
      unsubscribe = useAppStore.subscribe((state) => {
        if (!applying && JSON.stringify(pickShared(state)) !== baseline) dirty = true;
      });
      await tick();
    };
    void start();
    const timer = setInterval(() => void tick(), 2000);
    const focus = () => void tick();
    window.addEventListener('focus', focus);
    return () => { stopped = true; clearInterval(timer); unsubscribe(); window.removeEventListener('focus', focus); };
  }, [verified]);
  return message ? <div role="status" className="fixed bottom-3 left-3 right-3 z-50 rounded-lg bg-surface-raised p-3 text-sm text-amber-500 shadow-lg">{message}</div> : null;
}
