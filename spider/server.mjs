import http from 'node:http';
import { fork } from 'node:child_process';
import { loadScript } from './script-cache.mjs';
let active = 0;
const server = http.createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST' || req.url !== '/run') return reply(404, { error: 'Not found' });
  if (active >= 4) return reply(429, { error: 'Spider 正忙，请稍后重试' });
  active++;
  let child;
  try {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) throw new Error('请求过大'); }
    const { script, method, ext } = JSON.parse(raw);
    const deadline = Date.now() + 20000;
    const code = await loadScript(script);
    child = fork(new URL('./worker.mjs', import.meta.url), [], { execArgv: ['--max-old-space-size=96'], env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Spider 执行超时')); }, Math.max(1, deadline - Date.now()));
      child.once('message', (message) => { clearTimeout(timer); resolve(message); });
      child.once('error', (err) => { clearTimeout(timer); reject(err); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Spider 进程退出')); });
      req.once('aborted', () => child.kill('SIGKILL'));
      child.send({ script, method, ext, code });
    });
    reply(result.error ? 502 : 200, result);
  } catch (err) { reply(502, { error: err.message }); }
  finally { child?.kill('SIGKILL'); active--; }
});
server.listen(8787, '0.0.0.0');
