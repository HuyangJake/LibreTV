import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateShared, type SharedSources } from './shared-sources';

export interface SharedSnapshot { revision: string; data: SharedSources | null }
let queue: Promise<unknown> = Promise.resolve();
function file() { return path.join(process.env.DATA_DIR || path.join(process.cwd(), 'data'), 'sources.json'); }
export async function readShared(): Promise<SharedSnapshot> {
  try {
    const snapshot = JSON.parse(await readFile(file(), 'utf8')) as SharedSnapshot;
    validateShared(snapshot.data);
    if (typeof snapshot.revision !== 'string') throw new Error('源配置版本损坏');
    return snapshot;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { revision: '0', data: null };
    throw err;
  }
}
export function writeShared(revision: string, data: SharedSources): Promise<{ conflict: boolean; snapshot: SharedSnapshot }> {
  const task = queue.then(async () => {
    const current = await readShared();
    if (current.revision !== revision) return { conflict: true, snapshot: current };
    const snapshot = { revision: randomUUID(), data: validateShared(data) };
    const target = file();
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(snapshot), { mode: 0o600 });
    await rename(temp, target);
    return { conflict: false, snapshot };
  });
  queue = task.catch(() => {});
  return task;
}
