import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// No shell interpolation; scripts and credentials never appear in process args.
export async function browserTLSFetch(url, init = {}) {
  const output = await new Promise((resolve, reject) => {
    const env = {};
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'SPIDER_PROXY', 'SPIDER_BROWSER_HOSTS']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const child = spawn('/opt/browser-client/bin/python3', [fileURLToPath(new URL('./browser_fetch.py', import.meta.url))], {
      env, stdio: ['pipe', 'pipe', 'ignore'],
    });
    let size = 0;
    const chunks = [];
    const stop = () => { child.kill('SIGKILL'); reject(new Error('Spider 浏览器客户端超时')); };
    const timer = setTimeout(stop, 14000);
    const abort = () => { child.kill('SIGKILL'); reject(new Error('Spider 请求已中止')); };
    init.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > 16_000_000) { child.kill('SIGKILL'); reject(new Error('Spider 响应超过 10MB')); }
      else chunks.push(chunk);
    });
    child.on('error', () => reject(new Error('Spider 浏览器客户端不可用，请更新 Spider 镜像')));
    child.stdin.on('error', () => {}); // Early helper exit is handled by close.
    child.once('close', (code) => {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
      if (code !== 0) return reject(new Error('Spider 浏览器请求失败'));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('Spider 浏览器响应无效')); }
    });
    child.stdin.end(JSON.stringify({ url, method: init.method || 'GET', headers: Object.fromEntries(new Headers(init.headers)), body: init.body }));
    if (init.signal?.aborted) abort();
  });
  if (output.error) throw new Error(output.error);
  const body = Buffer.from(output.body, 'base64');
  if (body.length > 10_000_000) throw new Error('Spider 响应超过 10MB');
  return new Response([204, 205, 304].includes(output.status) ? null : body, { status: output.status, headers: output.headers });
}
