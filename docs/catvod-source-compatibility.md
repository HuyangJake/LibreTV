# 猫影视测试源兼容性核查

日期：2026-10-24。范围：固定版本源码的静态核查；本文件不声称已通过登录、转存或长时间播放验收。

## 来源与复现方式

- [源包入口](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js.md5)
- [实际 Node 源包](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)
- 本次分析副本：`/tmp/cat-source-index.js`。
- MD5：`ac6f412993768b14463625a3b4ce281f`。
- SHA-256：`788b5a69aeb730a5d8cb26c33ad2716378d5a5ccd57d1da097e021c678d6e630`。
- 文件长度：4,461,070 个 Unicode 字符。下文偏移均为该副本的从 0 开始字符偏移，**不是源码行号，也不是 UTF-8 字节偏移**；同时列函数名作为稳定定位依据。

分析没有在宿主机执行完整源包。仅将三组经过检查的字符串数组、RC4/base64 字符串解码函数和数组旋转初始化放入无 `require`、无网络 API 的 Node `vm`，并为求值设置超时；程序的启动函数、路由处理器和网盘操作都没有通过这一方法执行。解码后仍按源码控制流追踪，未把函数定义当作已验证的运行结果。

## 结论

该包是带有 Fastify、网站配置页、站点列表和多个网盘适配器的完整 Node 服务。LibreTV 可以实现宿主接口后启动它，但**原样交给真实夸克账号不符合已确认方案**：源码会自动清空播放目录、按天执行其他分享资源转存，并通过夸克聊天发送文件消息尝试获得下载加速令牌。以上行为均有可定位的固定版本补丁点，应在凭证进入 Runtime 之前禁用，并使用无凭证/模拟接口验证补丁。

## 1. 启动契约

### 导出与宿主依赖

源码偏移 2,356,570 的导出映射为 `start → wpr`、`stop → EX`；实际启动函数 `wpr` 位于 4,455,629，停止函数 `EX` 位于 4,457,401。[来源：Node 源包](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

`start(config)` 直接使用两个宿主全局函数：

| 名称 | 源码使用方式 | 兼容层行为 |
| --- | --- | --- |
| `catServerFactory` | 传给 Fastify 的 `serverFactory` | 返回可承载 HTTP 请求的 Node HTTP server |
| `catDartServerPort()` | 查询 Dart 消息服务端口，向 `http://127.0.0.1:<port>/msg` POST | 无 Dart 宿主时返回 0；这会使 `messageToDart` 返回 null |

其他 `globalThis.messageToDart`、`Pans`、`getPanName`、`getPanEnabled` 由包自己创建。普通网盘 HTTP 接口不必依赖 Dart；toast、弹幕推送和原生宿主功能不能因为返回 null 就宣称已兼容。

启动还执行以下行为：

- `fn.config = config`；数据库使用 `(process.env.NODE_PATH || '.') + '/db.json'`。
- JsonDB 自动保存；所有数据库 `push`/`delete` 会触发 `saveProfile` 消息，启动时发起 `queryProfile`。无 Dart 模式依靠本地 `db.json` 持久化。
- 监听 `0.0.0.0`，起始端口 9988，`DEV_HTTP_PORT` 可以覆盖。
- 自定义 `address()` 仅检查 `en0/en1/en2`，否则使用 127.0.0.1；Linux 容器内返回本地地址，因此所有返回给浏览器的本地媒体 URL 必须映射。
- logger 在 `NODE_ENV !== 'development'` 时开启。源码会直接输出消息对象与 HTTP 错误；必须在 Runtime 日志出口做脱敏。
- `stop()` 调用 `fn.close()`，但未 await 它；监督进程应等待 HTTP 服务实际退出。

`Yne`（4,317,424）读取 `config.pans.list`；`Cne`（4,286,379）调用的 `nne` 读取 `config.sites.list`。最小配置应包含 `pans: { list: [] }`、`sites: { list: [] }`、`quark: { cookie: '' }`；其他具体站点可能要求额外配置，不应让缺项导致整个服务崩溃。

### 未完全内联的 npm 运行依赖

静态 `require` 包含以下非 Node 内建模块路径。它们可能在 Fastify/AJV 生成校验代码时才访问，单纯 `require(index.js)` 成功不足以证明依赖完整：

- `ajv-formats/dist/formats`
- `ajv/dist/runtime/{equal,parseJson,quote,timestamp,ucs2length,uri,validation_error}`
- `fast-json-stringify/lib/{serializer,validator}`

其余直写 `require` 名称均为 Node 内建模块。原始包已内联绝大多数依赖，但宿主仍应显式安装并锁定兼容版本，而不是从主应用的 `node_modules` 偶然解析。

### 启动依赖可变远程配置

`wpr` 最后 await `uPe()`（2,887,172）。它请求下列三个明文 HTTP 远程配置：

- `http://upload.baicanuc.cn/ossfiles/1768320816/api.txt`：解密后拼接 `/wexfnwshinidie` 得到 `Ht.Wexsiteurl`。
- `http://upload.baicanuc.cn/ossfiles/1768320816/ioswex.txt`：保存为 `Ul`，影响全局配置、分享任务及站点。
- `http://upload.baicanuc.cn/ossfiles/1768320816/baidu.txt`：保存为百度相关配置。

`uPe()` 发现 `Ul.wexcat !== 'wexnb'` 时调用 `EX()` 关闭服务器。因此，**只固定 JS 哈希没有固定所有运行行为**。应记录测试时使用的远程配置快照；后续如果把快照固定为 Runtime 输入，应明确列为兼容补丁，并为依赖远程配置的站点单独测试。[来源：`uPe` 与 `yX`，偏移 2,887,172–2,888,539](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

## 2. 站点与通用接口

`Cne` 注册每个站点到 `/spider/<meta.key>/<meta.type>`，配置输出的 key 添加 `nodejs_` 前缀。[来源：`Cne`，4,286,379](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

- `GET /check` → `{ run: !stop }`。
- `GET /config` → 按用户站点顺序和开关筛选的配置。
- `GET /full-config` → 完整配置；分类包括 video/read/comic/music/pan。
- 视频类型为 `meta.type < 10`。不可把其他媒体类型自动当作电影站点加入统一搜索。
- 输出里的 `api` 是 Runtime 内部路径，客户端不能直接访问容器服务。

完整配置会把未出现在已保存列表里的站点默认加入 `/config`。LibreTV 应独立维护站点启用白名单，而不是依赖这一上游默认行为。

## 3. 夸克登录和保存凭证

网站插件 `toe` 把 `Une` 注册在 `/website/quark`（注册点 4,320,575）；`Une` 本身位于 4,307,293，凭证读写 helper `ylr/Slr` 位于约 4,306,605。[来源：Node 源包](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

| 方法与路径 | 输入 | 实际语义 |
| --- | --- | --- |
| `GET /website/quark/qrcode` | 无 | 请求登录 token，合成 300×300 PNG；更新模块级 token 和登录初始 Cookie |
| `POST /website/quark/cookie` | 不使用 body | 用当前 token 查询授权，取得 service ticket、账号 Cookie、网盘 Cookie；成功 `{code:0,data:cookie}`，失败 `{code:-1,message}` |
| `GET /website/quark/cookie` | 无 | `{code:0,data:storedCookie}`；只读取存储，**不验证账号登录状态** |
| `PUT /website/quark/cookie` | JSON `{cookie: string}` | 写入 JsonDB，返回 `{code:0}` |

扫码数据流由源包依次访问：

1. `https://uop.quark.cn/cas/ajax/getTokenForQrcodeLogin?client_id=532&v=1.2`
2. 二维码内容为 `https://su.quark.cn/4_eMHBJ?token=<token>&client_id=532&ssb=weblogin...`
3. `https://uop.quark.cn/cas/ajax/getServiceTicketByQrcodeToken?client_id=532&v=1.2&token=<token>`，期望 JSON `status === 2000000`。
4. `https://pan.quark.cn/account/info?st=<service_ticket>&fr=pc&platform=pc`。
5. `https://drive-pc.quark.cn/1/clouddrive/share/sharepage/dir?pr=ucpro&fr=pc&uc_param_str=&aver=1`，进一步获得 `__puus` 等 Cookie。

注意：

- `POST /cookie` 成功**不会保存** Cookie；LibreTV 服务端必须随后调用 `PUT`，再向浏览器返回无凭证的成功状态。
- QR token 与初始 Cookie 是模块级全局变量 `Gne/aGe`。一次只能保留一个有效扫码流程；需要管理员单会话控制、轮询超时及取消。
- 存储键是 `/quark/<md5(config.quark.cookie)>`。`config.quark.cookie` 为空字符串时，键固定为 `/quark/d41d8cd98f00b204e9800998ecf8427e`。不需要把真实 Cookie 填入 bootstrap config。
- 实际播放 helper `QO`（2,903,347）先读 `config.quark.cookie`，再用上述 hash 从 JsonDB 覆盖；网盘返回刷新的 `__puus` 时包会持久化更新。
- 登录状态应独立做真实账号接口验证；“数据库非空”和二维码请求成功都不是有效登录证据。

## 4. 分享、转存与播放

`APe`（2,888,962）接受 `https://pan.quark.cn/s/<shareId>`，初始 folderId 为 `0`。`gPe`（2,912,713）通过 `share/sharepage/token` 获取 stoken，`KYt`（2,913,147）递归 `share/sharepage/detail` 列目录。[来源：上述函数](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

`kPe`（2,920,527）生成剧集 ID，字段以 `*` 拼接：

```text
shareId * stoken * fileFid * shareFidToken * subtitleFid * subtitleToken * fileName
```

`SPe`（2,922,892）接收请求 body 的 `flag` 与 `id`；`flag` 必须以 `getPanName('quark')` 开头。包内夸克显示名可由 pan 列表修改，不能硬编码为“夸克”。返回结构：

```text
{ parse: 0, url: [qualityLabel, internalURL, qualityLabel, internalURL, ...],
  header: { Cookie, User-Agent, Referer }, extra: { danmaku, subt? } }
```

`url` 是标签、地址交替的扁平数组，并非单地址。`header.Cookie` 绝不能被序列化进 LibreTV 浏览器响应。内部地址形如：

```text
http://127.0.0.1:<port><spiderPrefix>/proxy/quark/src/down/<shareId>/<encodedStoken>*<fid>*<token>/.bin
http://127.0.0.1:<port><spiderPrefix>/proxy/quark/trans/<resolution>/<shareId>/<...>/.m3u8
```

`yPe`（2,921,376）处理本地代理，转码画质路径通常 redirect 到远端 URL；原画路径由 `Fb` 转发。LibreTV 必须自己处理重定向和必要请求头，浏览器只拿到受控播放会话地址。

`bPe`（2,915,661）执行 `share/sharepage/save`，`scene: 'link'`，目标目录 `_2`，再查询 `task` 约 6 次，每次间隔约 1 秒，返回转存 fid。缓存 `jW` 按原始 file fid 记忆转存结果。`CPe`（2,916,940）获取 `file/v2/play`，请求 `normal,low,high,super,2k,4k`，只展示 `accessable` 项；这里是夸克提供的画质，并非 NAS 本地转码。

原包存在需要补齐的稳定性问题：

- 初始化播放目录时会删除其内容，见下一节。
- `CPe` 以清理标志调用 `bPe`，后者清空整个 `jW`。不同影片互相使缓存失效，可能重复转存。
- 同一 fid 的两路同时调用可在缓存尚未写入前各自转存，需要在兼容层对同一资源做单次并发解析。
- 转存 fid、画质列表和下载 URL 缓存位于模块全局，源包没有针对这些缓存展示可见的过期处理。403/410 或账号切换后需要受控刷新；手动清理后也需要失效缓存。
- 持久化转存账本需要由 LibreTV 维护；原包只有内存缓存，重启无法证明文件属于本系统。清理只能操作账本中记录且仍在专用目录里的 fid。

## 5. 与产品要求冲突的源码行为

### 5.1 自动删除播放目录内容

默认目录名 `lPe` 是 **`Wexfnw`**，临时任务目录 `WPe` 是 **`Wexfnwtmp`**（2,903,292 附近）。

`HYt`（2,910,145）在根目录按名字寻找 `Wexfnw`；如果找到，立即调用 `hPe`。如果已经知道 `_2`，收到 true 清理标志时也调用 `hPe`。

`hPe`（2,909,483）列出该目录最多 200 项，将列表中**所有 fid**提交 `file/delete`，`action_type:2`、`exclude_fids:[]`。没有所有权核查，也没有活跃播放保护。[来源：`HYt/hPe`](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

**必须禁用**，否则与“只手动清理”“两路并发”直接冲突。NAS 容器文件隔离不能阻止远程账号文件被删除。

### 5.2 按日执行其他分享转存，删除根目录特定文件夹

`SX.NBwex`（2,884,696）会运行 UC 与夸克账号任务。许多站点 home 接口调用它；它不是仅在点击网盘播放后才执行。

夸克任务 `dPe`（2,928,275）读取 `/quark/qktime`，按 UTC+8 日期检查是否已执行；未执行/异常时调用 `mPe`（2,924,860）。后者：

- 使用远程配置 `Ul.qkshare`，否则默认分享 ID `0cd027572f55`；
- 列出账号根目录前 50 项，删除名字恰为 `0000temp` 或 `tvtemp` 的项；
- 从上述非用户选择的分享目录随机选文件转存到 `Wexfnwtmp`；
- 成功后写入 `/quark/qktime`。

必须禁用维护任务入口及夸克底层任务。只重命名播放目录不能消除这个行为。[来源：`SX.NBwex/dPe/mPe`](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

### 5.3 获取原画地址时发送夸克聊天文件消息

`zYt`（2,917,723）先列出 Quark 社交会话，取第一个 conversation，调用 `chat/conv/msg/batch_send` 发送当前转存文件，消息内容 `Wex.mp4`、device_model `Wex Administrator`，随后读消息、获取下载 token。失败才退回普通 `file/download`。

该操作超出了登录与播放授权范围；兼容层应直接使用普通下载接口，不能静默发送文件消息。[来源：`zYt/wO`](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

## 6. 固定版本可审查补丁位置

下面每个原始 needle 在本次固定哈希源码中恰好出现 **1 次**。加载补丁前先校验原始 SHA-256，再校验所有匹配次数；任意不符即拒绝加载，不能对新版本宽松套用。记录原始和打补丁后的哈希及补丁版本。

| 目的 | 原始 needle | 替换方式 |
| --- | --- | --- |
| 禁止源包删除播放目录文件 | `async function hPe(){` | 函数开头插入 `return;` |
| 关闭整组账号维护任务（包括 UC） | `static async[Ub(438,"Sahb")](r){` | 函数开头插入 `return;` |
| 关闭每日夸克任务 | `async function dPe(){` | 函数开头插入 `return;` |
| 关闭底层其他分享转存 | `async function mPe(){` | 函数开头插入 `return;` |
| 使用专用目录名 | `lPe=xt(1099,"p0gh")` | 改成 `lPe="LibreTV-Quark"`；如测试实例需要唯一目录，用受控 JSON 字符串替换 |
| 保留其他影片转存缓存 | `if(await s[i(477,"Kku3")](HYt,a),a){` | 把最后的 `a` 改成 `!1`，保留 HYt 调用，跳过清空整个 jW 的分支 |
| 禁止通过聊天发送文件 | `async function zYt(n){` | 函数开头直接返回普通 `Ia('file/download?pr=ucpro&fr=pc', {fids:[n]})` 的首个 `data[].download_url`，使原聊天流程不可达 |

这些补丁只适用于上述哈希，不能证明任意新包的安全性。除匹配次数验证外，应使用模拟夸克 HTTP 接口断言：浏览/播放不会调用 delete、其他分享 ID、聊天发送接口；两个不同视频不会删除彼此转存文件；同文件并发只转存一次；只有明确手动清理流程可以删除已记录文件。

## 7. 待真实验证清单

- 容器 HTTP serverFactory 与内联 Fastify 是否兼容，AJV 动态 require 是否都可解析。
- 远程配置能否访问，以及固定配置快照后目标站点是否可工作。
- QR 的 token/ticket/Cookie 链路是否仍有效；扫码 Cookie 是否具有所需账号权益。
- 不同站点是否返回有效夸克分享；常见解析错误应单站隔离。
- 普通 `file/download` 是否可用；禁用聊天加速后实际速度是否达到两路 1080p。
- 夸克转码返回的是 HLS 还是其他格式，分片是否需要 Cookie，刷新与 Range 行为如何。
- 2 部电影、2 部剧集，以及内外网各两路 30 分钟的真实验收仍必须单独完成。


## 8. 首批站点的最小配置与 URL

`/full-config` 里的每个站点 key 去掉 `nodejs_` 后，都可以先建立空对象作为该站点的配置 section；这能覆盖常见 `config.<site>.url` 的缺对象问题。再合并网盘必需字段和列表：

```js
const keys = [
  'douban', 'baseset', 'erxiao', 'wogg', 'zhizhen', 'wuming', 'duoduo',
  'muou', 'sayang', 'huban', 'bdjuhe', 'shuangxing', 'leijing',
  'pan123ziyuan', 'panta', 'guazi', 'hanxiaoquan', 'bobo', 'wexYueYue',
  'wexDuBoKu', 'wencai', 'ikanbot', 'animeGiriGiri', 'animefanshu',
  'animemodu', 'dongli', 'hema', 'baiduduanju', 'duanjuweiguan',
  'bookyueting', 'jipin', 'bookWuWei', 'bookdui100', 'bili', 'huya',
  'douyu', 'bililive', 'musicqingting', 'music163', 'musickuwo',
  'lunhuidj', 'guazisport', 'sportKanQiuTong', 'sportWwe', 'tgsou',
  'duso', 'haiyinso', 'zhaopanso', '97so', 'wodequark', 'wodebaidu',
  'wode189', 'wode115', 'wode123', 'livetovod', 'Emby', 'push',
  'updata', 'gengxin', 'tgchannel', 'baidu', 'tyi', 'pan123'
];
const config = Object.fromEntries(keys.map(key => [key, {}]));
Object.assign(config, {
  color: [],
  sites: { list: [] },
  pans: { list: [{ key: 'quark', name: '夸克', enable: true }] },
  quark: { cookie: '' },
  uc: { cookie: '', token: '', refreshtoken: '', ut: '' },
  ali: { token: '', token280: '' },
  y115: { cookie: '' },
  wuming: { cookie: '' },
  pan123ziyuan: { cookie: '' },
  wogg: { url: 'https://wogg.xxooo.cf' },
  muou: { url: 'https://666.666291.xyz' },
  leijing: { url: 'https://www.leijing1.com' },
  tgsou: { url: 'https://tgsou.252035.xyz', count: 4 },
  tgchannel: { url: 'https://t.me', count: 4 }
});
```

这是兼容层可控的初始形状，不代表全部站点已兼容。上游 `Yne` 会把未指定的其他网盘追加为默认启用，应在启动后显式写 `/website/pans/list` 关闭非 Quark 项，或修正本地启动配置合并逻辑。

静态反混淆确认的站点地址与搜索路径：

| 站点 | 源码常量 | 实际地址 | 搜索 |
| --- | --- | --- | --- |
| erxiao 二小 | `LB`，3,255,942 模块 | `https://www.wexwp.cc` | `/index.php/vod/search/wd/<wd>.html` |
| zhizhen 至臻 | `vB`，3,201,082 模块 | `https://www.miqk.cc` | 同上 |
| duoduo 多多 | `Wte`，3,110,084 模块 | `https://tv.yydsys.top` | 同上 |
| wogg 玩偶 | helper `x5`，3,178,527 | `https://wogg.xxooo.cf` | 由该模块请求构造决定 |

[来源：`Sd/DB`、`Ad/kB`、`Cd/RB` 三组字符串解码及其站点函数](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)。以上地址是该版本写死的地址，不是当前可达性保证。

前三站点的 home 都能返回静态分类，因此 home 有分类不能证明内容 HTTP 链路可用。搜索使用 body 的 `wd` 和 `page`；接口外层虽然 POST，但站点抓取是 GET。erxiao、zhizhen 的相对海报 URL 处理分支使用了未声明的 `siteUrl`，属于潜在上游缺陷，必要时将该引用修为本模块 `LB/vB`（只允许固定哈希、局部范围替换）。

## 9. 转存账本与安全手动清理的插入点

唯一 needle `async function Ia(n,r,t,o,a){let i=xt` 对应 Quark HTTP helper，位置 2,905,549。整个包存在另一个同名 Ia，因此只能使用这个完整局部 needle。建议将它重命名为内部 `catvodQuarkRequest`，另加包装器 `Ia`，让 Runtime 宿主在请求前后接收**仅包含 API 路径、业务 body 与业务响应**的钩子。不要传送 `t` headers，避免 Cookie 进入账本或日志。

| 调用 | 请求参数 | 返回数据 | 账本动作 |
| --- | --- | --- | --- |
| `file?pr=...` 创建专用目录 | `pdir_fid:'0'`, `file_name:<ownedName>` | `data.fid` | 记录目录归属与账号标识 |
| `share/sharepage/save?...` | `fid_list`, `to_pdir_fid`, `pwd_id` | `data.task_id` | 在响应返回源包前持久化 pending 转存任务 |
| `task?...&task_id=<id>` | task ID 位于路径 query | `data.save_as.save_as_top_fids[]` | 将 pending 任务完成为转存文件记录 |
| `file/delete?...` | `filelist`, `exclude_fids`, `action_type` | API 状态 | 只允许宿主明确发起的手动清理；源包通道禁止自动删除 |

记录项至少包含本地账号 ID、Runtime/源包版本、源分享 ID、源文件 fid、目标目录 fid、任务 ID、转存后的 fid、时间与状态。stoken、share_fid_token 和 Cookie 均不需要进入账本。

转存成功但 task 查询失败时保留 pending 项，之后按 task ID 恢复。目录列表里的未知文件不能直接“认领”为可删除文件。删除前重新获取目标文件信息确认 parent fid 仍为本系统目录，并排除活跃播放会话的文件；账号切换时不能把旧账号账本用于新账号。

`bPe` 返回 fid 的确切源码表达式是：

```js
return u[i(748,"sPks")][i(519,"32#p")][i(1228,"4^o%")+i(516,"GX%@")][-1195*7+3231+-151*-34];
```

其解码语义是 `return u.data.save_as.save_as_top_fids[0]`。可在这里增加转存完成钩子作为交叉检查，但单独增加这个钩子无法恢复“保存成功、查询失败”的任务，因此仍需请求级 pending 记录。

另一个唯一 needle `x=s[i(1035,"*wN%")](a,5948*-1+-2829+8780)` 是 Quark API 的重试默认值 `a || 3`。递归降到 0 时会重新变成 3，可能使持续 429 重试无上限。应改为 `(a ?? 3)` 并增加外层请求取消/超时；这属于兼容稳定性补丁，不应由用户承担技术选择。

## 10. 2026-10-25：木偶详情空线路与初始化核查

本节区分静态代码结论与主任务提供的真实接口观察；本研究过程没有读取账号 Cookie，也没有执行完整源包。

### 10.1 木偶实际抽取规则

木偶 detail handler 是 `rrr(n,r)`（原始偏移 3,138,578）。它抓取站点 HTML，读取标题、海报和演职员信息，然后只按以下规则生成分享链接输入：

```js
$('div.module-row-info p').map((index, element) => element.children[0].data).get()
```

接着调用 `tt(shares, request)`。它没有读取任意锚点 href、完整嵌套文本或播放器脚本，所以“有元数据但没有线路”并不能独立证明网盘适配失败。[来源：`rrr`，固定 Node 源包](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

通用分享 helper `tt(n,r)`（3,104,944）通过 `sh()` 的 validator 识别分享，按网盘限制每种最多 3 个输入。Quark validator 是：

```js
getPanEnabled('quark') && text.includes('https://pan.quark.cn')
```

它再调用 `kPe → KYt → gPe → Ia` 列出文件。`KYt` 只收集 `obj_category` 为 `audio`/`video` 或 `format_type` 为 `application/octet-stream` 的文件，并过滤 **小于 5 MiB** 的文件；目录递归与分页均在这里处理。解析返回空文件时，`Mx` 不产生线路，最后输出空的 `froms/urls`。该链路没有引用 `Ht`/`Ul` 或专有远程启动配置。

判断空线路应依次核对：

1. HTML 中上述 selector 是否命中，首个 child.data 是否确实是分享文本。
2. `quark.enable` 是否为 true，传给 validator 的内容是否包含标准 https 域名。
3. 分享 token 和目录 API 返回业务状态，尤其是链接被封禁、失效、提取码或访问限制。
4. 返回文件类型、大小与递归目录是否符合上述过滤规则。

主任务在有效账号下对木偶的多个不同分享做只读核查，观察到分享 token API 返回 HTTP 403、业务 `code: 41031`、信息“分享者用户封禁链接查看受限”。这类结果是资源分享受限，不是账号有效性检查的矛盾，也不是应该通过恢复自动维护任务解决的问题。该实时观察由主任务取得，本研究仅确认源包遇到无 stoken 时会静默生成空线路。

### 10.2 禁用维护任务之后需要显式初始化 Quark 上下文

静态代码同时发现独立的兼容缺陷：`uo` 初值为 `''`、`I2/Jb` 初值为 null。只有 `QO(request)`（2,903,347）会把当前请求的数据库、配置 namespace 与持久化 Cookie 加载到这些全局变量。

原来很多 home handler 通过 `SX.NBwex → QO` 间接加载它。禁用有副作用的 `NBwex` 后，木偶 detail 的 `rrr → tt → kPe → KYt → gPe → Ia` 链路不会调用 `QO`；直到 `SPe/yPe` 播放阶段才初始化则已经太晚。独立账号状态接口读取 Cookie 并证明有效，并不会初始化源包这些变量。

安全修复位置：

- needle：`async function tt(n,r){`
- 原始固定哈希源码中匹配次数：**1**。
- 替换：`async function tt(n,r){if(r?.server)await QO(r);`

这只读取持久化凭证，不恢复删除、维护转存、聊天消息或可变启动配置。它适合所有经通用分享 helper 解析的站点；账号共享前提下每次请求重读账号上下文也可防止旧的内存 Cookie 被误用。

为独立证明初始化问题，已建立临时 fixture：`/tmp/catvod-quark-initialization-fixture.cjs`。它只从固定源码抽取 `tt`，并使用先前静态解码的 `QO`；在隔离的 `vm` 中提供假 namespace、假 Cookie、内存数据库和 stub 网盘列目录函数。没有执行完整 bundle，也没有网络请求或读取真实凭证。测试通过：原始函数未读取数据库、下游 `hasCookie:false`、线路 0；插入初始化后读取数据库一次、下游 `hasCookie:true`、线路 1。

这一 fixture 证明兼容补丁必要，不代表业务 41031 的分享会因此恢复可用。

### 10.3 其他内置站点的候选默认地址

下表均为固定源码静态解码结果，尚未证明域名当前可达或分享有效。所有候选都可先为相应 config section 设 `{}`；“额外依赖”需要另外处理。

| key | 默认地址 | 搜索请求（由源包发往站点） | 额外依赖 |
| --- | --- | --- | --- |
| `huban` | `http://103.45.162.207:20720` | GET `/index.php/vod/search/wd/<wd>.html` | 无专有启动配置；相对海报引用有与其他同模板站点相同的 `siteUrl` 缺陷 |
| `bdjuhe` | `https://www.bdjuhe.com` | GET `/q/index-----<page>?k=<encodedWd>` | 无专有启动配置 |
| `shuangxing` | `https://1.star2.cn` | GET `/search/?keyword=<encodedWd>&page=<page>` | 先调用站点 `/init`；它访问首页保存反爬 Cookie 到模块变量 VB |
| `panta` | `https://www.91panta.cn` | GET `/search?keyword=<encodedWd>&page=<page>` | 搜索结果按电影/剧集等 category tag 筛选 |
| `zhaopanso` | 搜索实际使用 `https://v2pan.com` | GET `/s/<encodedWd>/0/<page>` | detail 读取 `v2pan.com + id` 的 Location，交给 `tt`；另有 `xiongdipan.com` 常量但不用于该搜索 |
| `97so` | 搜索实际使用 `https://pansoo.cn` | 先 GET `/search?q=<wd>&type=online`，再 GET `/api/search?keyword=<wd>&pan_types=0&page=<page>&limit=30&file_type=video` | 使用源码内置的站点认证头，可能过期；detail GET `/api/check_resource_status?<id>` |
| `tgsou` | config 默认 `https://tgsou.252035.xyz` | GET `?pic=<pic>&count=<count>&channelUsername=<channels>&keyword=<wd>`；旧接口分支改为 POST | `tgsou.url/count/channelUsername/pic` 可配置；默认 count 4；先做一次探测请求 |
| `wuming` | `https://www.xn--wcv59z.com` | GET `/s/2-0...` 等站点路径 | search/detail/category 都请求 `Ht.Wexsiteurl + '/wuming/cookie.php'`，禁用可变启动配置后不应作为首批候选 |

对应模块源码偏移：huban 常量 `d9` 3,455,212；bdjuhe 常量 `E5` 3,770,349；shuangxing 常量 `KB` 3,334,916；panta 常量 `Ite` 3,172,081；zhaopanso `Dsr` 3,800,545；tgsou 模块 `VDe` 3,224,033。[来源：固定 Node 源包及各模块字符串解码](https://raw.giteeusercontent.com/AdamCao/cat-wang-er-niu/raw/main/index.js)

优先验证独立上传者的分享资源，再做文件列举与播放；不能用“多个站点的同一受限分享都失败”来推断整个 Quark 功能不可行。

## 11. 2026-10-25：找盘现行详情页改为会员可见地址

对主任务捕获的三个公开详情页做 HTML 与内联脚本检查：

| 本地捕获 | canonical 公开页面 | 会员提示字符偏移 | `pan.quark.cn` URL 数量 |
| --- | --- | --- | --- |
| `/tmp/zhaopanso-3.html` | [资源页 3](https://v2pan.com/res/rYGlfoUMdXSeXIoQtBqGzQ) | 9,137 | 0 |
| `/tmp/zhaopanso-8.html` | [资源页 8](https://v2pan.com/res/8V00W_1eNqG79tS_inXGhw) | 9,029 | 0 |
| `/tmp/zhaopanso-19.html` | [资源页 19](https://v2pan.com/res/qr2iJe7yhYV_Oe8FhpFoWw) | 10,636 | 0 |

三个页面都在 `.copy-url` 区域显示“成为VIP用户，可查看完整网盘下载地址。”，链接指向 `/m/trans/index`。没有下载按钮的 onclick，也没有公开的 Quark URL。页面展示的“网盘快照”只有文件名和大小，不包含可用于网盘请求的分享 ID/token。

页面内联脚本的相关只读请求是 `/m/resource/check?id=<resourceId>`，其前端回调只处理有效/无效状态；这不是页面公布的下载地址接口。另外有反馈 POST 接口，与播放无关，没有调用。研究没有登录找盘、购买会员、发送反馈或尝试绕过会员限制。

原源包 `Dsr(n,r)`（3,800,545）假定 detail 地址会给 302 Location；实际上它的 validateStatus 也允许 200。收到当前 200 HTML 后，代码取 `Location || 原 v2pan 地址`，再交给 `tt`。因为 v2pan 不属于受支持的网盘域名，最终得到空线路。这既有原包错误提示不足，也有明确的上游会员条件，不能通过替换 CSS selector 恢复未公开的分享地址。

建议当前将找盘保留为未通过验证/需要站点授权的站点。只有页面或 Location 实际公开支持的分享 URL 时才能正常解析；不要把无权限页中一个普通导航链接当作分享地址，也不要暗中恢复其他源包维护功能。

如需把静默空线路改为明确错误，固定源码中以下 needle 恰好出现一次，位于 3,801,201：

```js
}),c=s[t(451,"5ASB")][t(553,"0e84")]
```

其含义是 `}),c=s.headers.location`。可以在这里增加对 `String(s.data || '')` 的会员提示检测，命中后抛出明确的“找盘资源需要站点会员授权”，否则返回原 Location 并保留原有 fallback。完整函数头 `async function Dsr(n,r){` 也恰好一次，可用于插入一个受控的新 detail handler。此补丁只改善识别和提示，**不应把它列为找盘播放验收通过**。

## 12. 2026-10-25：BD 聚合搜索相关性与正片验证

### 12.1 原始 24 条不相关结果来自上游主列表

只读抓取 [BD 聚合“星际穿越”搜索页面](https://www.bdjuhe.com/q/index-----1?k=%E6%98%9F%E9%99%85%E7%A9%BF%E8%B6%8A)，捕获为 `/tmp/bdjuhe-xingji-search.html`（HTTP 200）。原源包 `Ssr(n,r)`（原始偏移 3,779,395）使用全局 CSS `.col-xs-4.col-sm-3` 选择结果卡片。

实测该 selector 命中 24 张卡片，**全部**属于同一个 `ul#content_list`，祖先路径为：

```text
li.col-xs-4.col-sm-3
  → ul#content_list.clearfix
  → div.item
  → div.dfg-video-list.list
  → div.dfg-layout.clearfix
  → div.col-md-9.col-sm-12.dfg-main-content
```

没有任何命中来自侧栏；原始上游 `data-total="263"`。列表本身已经包含“亲爱的，不要跨过那条江”“猪猪侠大电影之竞速小英雄”“黑衣人3”等非片名匹配结果。因此当前问题不是源包把侧栏推荐混入搜索，单纯改成 `#content_list > li.col-xs-4.col-sm-3` 会得到完全相同的 24 条。

页面公开的“精确搜索”开关会追加 `exact=1`。只读对比显示它能缩小结果，但仍不是严格片名过滤：

- “星际穿越”精确模式为 3 条，含两部标题相关影片及“亲爱的，不要跨过那条江”。
- “三体”精确模式为 8 条，含六个“三体”标题变体，以及“我是女生，也是男生”“怜悯”。

[来源：星际穿越精确模式](https://www.bdjuhe.com/q/index-----1?k=%E6%98%9F%E9%99%85%E7%A9%BF%E8%B6%8A&exact=1)、[三体精确模式](https://www.bdjuhe.com/q/index-----1?k=%E4%B8%89%E4%BD%93&exact=1)。这说明相关性需要在聚合层处理，不能把 `exact=1` 当作严格匹配保证。

主任务已经确认 LibreTV 的 `aggregateOutcomes` 会调用 `filterRelevantResults(list, wd)`。因此**不需要新增过滤器，也不需要为此修改源包搜索 selector**；保留现有聚合层过滤即可。本研究没有修改运行源码。

### 12.2 资源级失败不能推断全站失败

主任务提供的真实播放验证结果：

- BD 聚合“肖申克的救赎”的约 11 GB 正片，已真实转存，高清 MP4 请求返回 206。
- BD 聚合“星际穿越”的约 35.66 GB 正片，已真实转存，高清 MP4 请求返回 206。
- “星际穿越”同一分享中的约 10 MB 样片解析失败，不计入正片验收。
- “三体”前几条没有线路，不代表 BD 聚合全站不可用。

以上取流观察由主任务执行并报告；本研究只核查公开 HTML 与固定源包解析逻辑。206 证明对应正片的分段取流链路，不等同于已经完成内外网双路 30 分钟播放验收。

## 13. 2026-10-25：多季目录应拆为独立播放线路

主任务发现“我的三体”的 40 个文件在递归后被扁平化，`Mx` 再按集号排序，使不同季的 01 集、02 集交错。只保留原始扁平顺序不足以保证安全连续播放：即使目录内文件临时连续，季末仍会自动进入下一目录，而且分页递归会影响目录遍历顺序。

静态证据：

- `KYt`（2,913,147）的闭包数组 `a` 接收所有目录的文件。递归函数 `s(c,x,u)` 其实知道当前父目录 fid `x`，并从父页读到子目录的 `file_name`，可以在这里确定完整路径。
- `kPe`（2,920,527）把 raw file map 为 `vod_id/vod_name/vod_size` 时丢掉目录信息，随后对整个数组调用 `Mx`，是跨季排序的直接原因。
- `tt`（3,104,944）已经支持 `kPe` 返回多个 `{from,url}`，会逐项加入 `froms/urls`。
- `Wt/SPe` 按线路名是否以 `getPanName('quark')` 开头识别网盘，因此保留该前缀、在后面加目录路径不改变播放协议或转存标识。

建议按**实际完整目录路径**拆线路，不推断“第几季”。同目录继续使用现有 `Mx` 排集；根目录文件归入“根目录”；同名子目录在不同父路径下保持独立。目录可能代表季、画质或特典，直接展示路径比猜测语义稳定。

固定哈希补丁清单已写到 `/tmp/catvod-folder-patch.json`，共 7 项，每个 needle 在原始 SHA-256 对应源码中恰好出现一次：

| 原始偏移 | 补丁目的 |
| --- | --- |
| 2,913,982 | 递归函数增加 `catvodPath=[]` 参数 |
| 2,914,473 | raw 条目记录 `catvod_path` 路径数组，及用于字幕隔离的私有目录 fid |
| 2,915,186 | 分页直接调用 `s(..., catvodPath)`，保持当前路径 |
| 2,915,295 | 子目录直接调用 `s(..., [...catvodPath, file_name])` |
| 2,915,552 | 字幕候选限制在相同父目录，避免同名字幕跨季匹配 |
| 2,921,187 | `kPe` mapped file 仅额外保留 `catvod_path` |
| 2,921,216 | 调用可信 `globalThis.catvodGroupQuarkFiles(prefix, mappedFiles, Mx)` 逐目录打包 |

注意原分页与子目录调用经过固定参数数量的 obfuscation helper；只给原 helper 多传一个 path 参数会被丢弃，必须在这两处改为直接调用递归函数。可信分组 helper 可以用 `JSON.stringify(catvod_path)` 作 key，保持分组首次出现顺序，显示标签去除 `$`、`#` 等源协议分隔符，且始终保留传入的 Quark 前缀。

已建立并运行 `/tmp/catvod-folder-fixture.cjs`：只求值经过检查的字符串解码器、提取的 `KYt/kPe/tt` 与纯打包函数，API 和分享 token 均为内存假数据，没有执行完整源包、访问网络或读取账号数据。结果：9 个视频从原来的 1 条线路拆为 5 条目录线路，断言覆盖根目录、不同父路径的同名 Bonus 子目录、根目录及子目录分页、逐目录集号排序、字幕目录隔离、Quark 前缀和协议分隔符清理。

该 fixture 证明补丁和协议衔接，不替代真实多季资源的部署验收；运行实例由主任务在长播放测试结束后统一更新。

## 补丁6：分享与文件转存凭证过期（2026-10-25）

前一轮保留的真实stoken在同一有效账号下返回HTTP404/code41016；重新申请stoken后目录读取恢复。继续尝试旧文件转存凭证得到HTTP403/code41020。仅刷新stoken不能恢复旧播放信息。

兼容层现在每次解析夸克播放前通过已审核的push详情重新列出分享，按分享ID和文件fid匹配整条新ID，保留原线路参数；不会按文件名或集号匹配。固定源包gPe每次详情重新申请分享凭证，原缓存不跨详情复用。Ia受控请求对41016仅刷新重试一次；非过期业务错误不自动重试。

归属账本仅在41012/41016/41020/41031明确拒绝且没有task_id时解除对应意图；未知响应或网络失败仍保留待核对。真实旧罗辑传157MB播放信息经新流程转存成功，账本4→5、pending为0，随后Range返回MP4 206。原包哈希未改变，Runtime兼容补丁版本为6；25项Runtime测试通过。CDN签名地址过期仍是独立的待验收项。
