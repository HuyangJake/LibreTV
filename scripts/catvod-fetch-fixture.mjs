// Download as data, verify the reviewed hash, and never execute the whole bundle.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import profile from '../catvod/test-source.json' with { type: 'json' };
const response = await fetch(profile.entry.replace(/\.md5$/, ''), { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error('Pinned fixture download failed: ' + response.status);
const chunks = [];
let size = 0;
for await (const chunk of response.body) {
  size += chunk.length;
  if (size > 8000000) throw new Error('Pinned fixture exceeds the size limit');
  chunks.push(chunk);
}
const bytes = Buffer.concat(chunks);
if (createHash('sha256').update(bytes).digest('hex') !== profile.sha256)
  throw new Error('The upstream fixture no longer matches the reviewed version');
const target = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'catvod-pinned-source.cjs');
await writeFile(target, bytes, { mode: 0o600 });
console.log('Verified pinned CatVod fixture:', bytes.length, 'bytes');
