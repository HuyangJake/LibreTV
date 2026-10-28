import { beforeEach, expect, it, vi } from 'vitest';
const table = vi.hoisted(() => {
 const rows = new Map<string, Record<string, unknown>>();
 return { rows, get: async (id: string) => rows.get(id), put: async (entry: Record<string, unknown>) => rows.set(String(entry.id), entry), count: async () => rows.size };
});
vi.mock('dexie', () => ({ default: class { history = table; version() { return { stores() {} }; } } }));
import { upsertHistory, type HistoryEntry } from './db';
beforeEach(() => table.rows.clear());
const base: Omit<HistoryEntry, 'id'> = { sourceKey: 'catvod_nodejs_push', sourceUrl: 'https://source.test/index.js.md5#nodejs_push', vodId: 'share', title: '多季测试', episodeIndex: 0, lineIndex: 0, totalEpisodes: 10, playbackPosition: 120, duration: 600, timestamp: 0 };
it('preserves progress when reopening the same episode in the same directory', async () => {
 await upsertHistory(base); await upsertHistory({ ...base, playbackPosition: 0, duration: 0 });
 expect(table.rows.get('catvod_nodejs_push_share')).toMatchObject({ playbackPosition: 120, duration: 600, lineIndex: 0 });
});
it('does not carry a previous directory or episode position into another one', async () => {
 await upsertHistory(base); await upsertHistory({ ...base, lineIndex: 1, playbackPosition: 0, duration: 0 });
 expect(table.rows.get('catvod_nodejs_push_share')).toMatchObject({ playbackPosition: 0, duration: 0, lineIndex: 1 });
 await upsertHistory(base); await upsertHistory({ ...base, episodeIndex: 1, playbackPosition: 0, duration: 0 });
 expect(table.rows.get('catvod_nodejs_push_share')).toMatchObject({ playbackPosition: 0, duration: 0, episodeIndex: 1 });
});
