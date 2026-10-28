import { readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import accountFingerprint from './account.cjs';
import findOwnedFiles from './quark-files.cjs';
import { dataRoot } from './bundle-store.mjs';
export async function ownedFiles(secret) {
  let ledger;
  try {
    ledger = JSON.parse(await readFile(path.join(dataRoot, 'ledger.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const account = accountFingerprint(secret);
  return ledger.files.filter(
    (f) =>
      f.account === account &&
      ledger.directories.some((d) => d.account === account && d.fid === f.parent)
  );
}
export async function removeOwnedFiles(secret, ids, request) {
  const files = await ownedFiles(secret);
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 200 ||
    !ids.every((id) => files.some((f) => f.fid === id))
  )
    throw new Error('只允许删除系统记录的转存文件');
  // Revalidate parent on the server before deleting, so moved/user-owned files cannot be removed.
  for (const parent of new Set(ids.map((id) => files.find((f) => f.fid === id).parent))) {
    const selected = ids.filter((id) => files.find((f) => f.fid === id).parent === parent);
    const found = await findOwnedFiles(parent, selected, request);
    if (!selected.every((id) => found.has(id)))
      throw new Error('文件位置已改变，请先刷新，未执行删除');
  }
  await request('file/delete?pr=ucpro&fr=pc', 'POST', {
    action_type: 2,
    filelist: ids,
    exclude_fids: [],
  });
  const file = path.join(dataRoot, 'ledger.json');
  const ledger = JSON.parse(await readFile(file, 'utf8'));
  const account = accountFingerprint(secret);
  ledger.files = ledger.files.filter((f) => f.account !== account || !ids.includes(f.fid));
  const temp = file + '.' + randomUUID() + '.tmp';
  await writeFile(temp, JSON.stringify(ledger), { mode: 0o600 });
  await rename(temp, file);
  return { deleted: ids.length };
}
