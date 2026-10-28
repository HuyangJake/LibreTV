import { createHash } from 'node:crypto';
import pinned from './test-source.json' with { type: 'json' };
import directoryPatches from './quark-directory-patches.json' with { type: 'json' };
export const profile = pinned;
export const PATCH_VERSION = 6;
// Every patch is tied to the reviewed original hash. Fail closed if upstream changes.
export function prepareBundle(original, directoryName) {
  if (createHash('sha256').update(original).digest('hex') !== profile.sha256)
    throw new Error('此源包版本尚未完成兼容审核，不能激活');
  let code = original.toString('utf8');
  const patches = [
    // Authentication initialization is needed for details even with maintenance disabled.
    ['async function tt(n,r){', 'async function tt(n,r){if(r?.server)await QO(r);'],
    // Share tokens expire independently of the account Cookie. Do not retain
    // the upstream process-global token across later detail requests.
    ['async function gPe(n){', 'async function gPe(n){delete KW[n.shareId];'],
    ...directoryPatches.map(({ find, replace }) => [find, replace]),
    // Disable mutable startup configuration and its remote shutdown switch.
    // Sources that require this remote configuration are not part of v1 validation.
    ['async function uPe(){', 'async function uPe(){return;'],
    [
      'async function Ia(n,r,t,o,a){let i=xt',
      'async function Ia(n,r,t,o,a){return globalThis.catvodQuarkRequest(n,r,()=>catvodOriginalQuark(n,r,t,o,a),(route,body={},method="get")=>catvodOriginalQuark(route,body,{},method));}async function catvodOriginalQuark(n,r,t,o,a){let i=xt',
    ],
    ['x=s[i(1035,"*wN%")](a,5948*-1+-2829+8780)', 'x=(a??3)'],
    [
      'async function CPe(n,r,t,o){',
      'async function CPe(n,r,t,o){let result=await catvodOriginalTranscodes(n,r,t,o);return Array.isArray(result)?result:[];}async function catvodOriginalTranscodes(n,r,t,o){',
    ],
    ['async function hPe(){', 'async function hPe(){return;'],
    ['async function dPe(){', 'async function dPe(){return;'],
    ['async function mPe(){', 'async function mPe(){return;'],
    ['static async[Ub(438,"Sahb")](r){', 'static async[Ub(438,"Sahb")](r){return;'],
    ['lPe=xt(1099,"p0gh")', `lPe=${JSON.stringify(directoryName)}`],
    ['if(await s[i(477,"Kku3")](HYt,a),a){', 'if(await s[i(477,"Kku3")](HYt,a),!1){'],
    // Stock original-quality acceleration sends a chat file message. Use normal download.
    [
      'async function zYt(n){',
      'async function zYt(n){return (await Ia("file/download?pr=ucpro&fr=pc",{fids:[n]}))?.data?.[0]?.download_url||"";',
    ],
    [
      'globalThis.Pans=await Yne(fn)',
      'globalThis.Pans=(await Yne(fn)).map(p=>({...p,enable:p.key==="quark"}))',
    ],
  ];
  for (const [find, replace] of patches) {
    if (code.split(find).length !== 2) throw new Error('源包兼容补丁位置不匹配');
    code = code.replace(find, replace);
  }
  return code;
}
