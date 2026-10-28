// Executed ONLY inside the isolated CatVod container. node:vm is not a sandbox.
process.umask(0o077);
const http = require('node:http');
const { createRequire } = require('node:module');
const path = require('node:path');
const localRequire = createRequire(__filename);
// Bundles are stored in a data volume; resolve unbundled dependencies here.
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (['ajv/', 'ajv-formats/', 'fast-json-stringify/'].some((p) => request.startsWith(p)))
    return localRequire.resolve(request);
  return originalResolve.call(this, request, parent, ...rest);
};
// Upstream logs include Cookies and profile data. Never forward them.
console.log = console.info = console.warn = console.error = () => {};
let server;
global.catServerFactory = (handler) => (server = http.createServer(handler));
global.catDartServerPort = () => 0; // db.json already persists the profile.
global.catvodQuarkRequest = require('./quark-ledger.cjs');
global.catvodGroupQuarkFiles = require('./quark-groups.cjs');
const bundle = require(path.resolve(process.argv[2]));
if (typeof bundle.start !== 'function') throw new Error('CatVod bundle has no start export');
const sections = [
  'douban',
  'baseset',
  'erxiao',
  'wogg',
  'zhizhen',
  'wuming',
  'duoduo',
  'muou',
  'sayang',
  'huban',
  'bdjuhe',
  'shuangxing',
  'leijing',
  'pan123ziyuan',
  'panta',
  'tgsou',
  'tgchannel',
  'y115',
  'livetovod',
];
const config = Object.fromEntries(sections.map((k) => [k, {}]));
Object.assign(config, {
  color: [],
  pans: { list: [] },
  sites: { list: [] },
  quark: { cookie: 'libretv' },
  uc: { cookie: '', ut: '' },
  ali: { token: '', token280: '' },
});
bundle.start(config).catch(() => {});

process.on('SIGTERM', () => {
  server?.close();
  process.exit(0);
});
