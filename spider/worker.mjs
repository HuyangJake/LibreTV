import vm from 'node:vm';
import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import { publicFetch } from './network.mjs';

// The container is the isolation boundary, NOT node:vm. No NAS mounts or secrets.
process.once('message', async ({ script, method, ext, code }) => {
  try {
    if (!['search', 'getTracks', 'getPlayinfo', 'getConfig'].includes(method)) throw new Error('不支持的 Spider 方法');
    if (!code) {
      const loaded = await publicFetch(script);
      if (!loaded.response.ok) throw new Error(`脚本下载 HTTP ${loaded.response.status}`);
      code = loaded.data;
    }
    if (code.length > 1_000_000) throw new Error('脚本过大');
    const request = async (url, data, options = {}, method = 'GET') => {
      const headers = new Headers(options.headers || {});
      let body;
      if (data !== undefined) {
        if (typeof data === 'string') body = data;
        else if (headers.get('content-type')?.includes('application/x-www-form-urlencoded')) body = new URLSearchParams(data).toString();
        else { body = JSON.stringify(data); headers.set('content-type', 'application/json'); }
      }
      const result = await publicFetch(url, { method, headers, body });
      if (result.data.includes('Just a moment...') || result.response.status === 403) throw new Error('源站要求浏览器验证或拒绝 NAS 请求，无法在服务端自动完成');
      if (!result.response.ok) throw new Error(`源站 HTTP ${result.response.status}`);
      return { data: result.data, status: result.response.status, respHeaders: Object.fromEntries(result.response.headers) };
    };
    const context = vm.createContext({
      createCheerio: () => cheerio, createCryptoJS: () => CryptoJS,
      argsify: (v) => typeof v === 'string' ? JSON.parse(v) : v,
      jsonify: JSON.stringify,
      $fetch: { get: (url, options) => request(url, undefined, options), post: (url, data, options) => request(url, data, options, 'POST') },
      $utils: { openSafari: () => { throw new Error('此 Spider 需要交互式浏览器验证，NAS 暂不支持'); } },
      URL, URLSearchParams, TextEncoder, TextDecoder,
      console: { log() {}, warn() {}, error() {} },
      __ext: JSON.stringify(ext || {}),
    });
    new vm.Script(code).runInContext(context, { timeout: 2000 });
    const result = await new vm.Script(`${method}(__ext)`).runInContext(context, { timeout: 2000 });
    const value = typeof result === 'string' ? JSON.parse(result) : result;
    if (JSON.stringify(value).length > 2_000_000) throw new Error('Spider 结果过大');
    process.send({ result: value });
  } catch (err) { process.send({ error: err.message || 'Spider 执行失败' }); }
  finally { process.disconnect(); }
});
