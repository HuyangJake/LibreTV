# 公开 CatVod / TVBox / DRPY 资源调查

核查日期：2026-10-25。前四节为研究子任务对项目README、源码、发布配置、提交记录与候选站点主页的只读调查；末节为主任务随后在独立worktree进行的安装和实际播放验证。

本报告区分四件事：公开配置可以下载；配置结构可解析；目标内容接口能返回真实数据；视频播放通过。前两项不能替代后两项。域名声明来自规则维护者，也不等于站点作者本人认证。

## 优先级与候选（共 4 类）

| 候选 | 执行类型 | 当前系统接入方式 | 成本与当前结论 |
| --- | --- | --- | --- |
| gao 配置中明确标记 `type:1` 的采集 API | 纯 HTTP JSON / MacCMS API | 逐个取出 API 地址，使用现有 CMS 接入 | 最低；不需要执行新 JS/JAR；由主任务做真实搜索、详情、取流验证 |
| 现有已审核源包 + 四个域名候选 | 已审核 Node 源包；域名来自 DRPY 规则源码 | 只覆盖现有站点的 host，并复核 HTML/API 结构 | 较低；三个新域名本次 TLS 未通过，雷鲸主页成功但主要是天翼资源 |
| jadehh/TVSpider `dist` | CatVodOpen Node/Fastify 服务包 | 新增独立兼容 profile，空凭证隔离验证 | 中高；宿主 API 相近，但发布版本较旧，不能套用旺二牛源包补丁或信任策略 |
| drpy-node / drpyS T4 服务 | 独立 Node/Fastify 服务 + 规则引擎，HTTP T4 API | 单独服务部署，经 T4/CMS 适配器访问 | 中高；API 清晰，不能把 DS 规则直接塞入当前 CatVod Runtime |

## 1. gao 的 type 1 采集接口：本轮最适合直接添加测试

一级证据：[gao 固定提交 `8213bb0`](https://github.com/gaotianliuyun/gao/commit/8213bb046f4dce746b5f2ddcddb13a336d0b0d60)，提交日期 **2024-11-17**。仓库 GitHub `updated_at` 为 2026 年不能当作配置仍在持续维护的证据。

本次实际下载并按 JSON 解析：

- [0821.json](https://raw.githubusercontent.com/gaotianliuyun/gao/8213bb046f4dce746b5f2ddcddb13a336d0b0d60/0821.json)：5 个数字类型 `type:1`。
- [0825.json](https://raw.githubusercontent.com/gaotianliuyun/gao/8213bb046f4dce746b5f2ddcddb13a336d0b0d60/0825.json)：7 个 `type:1`。
- [0827.json](https://raw.githubusercontent.com/gaotianliuyun/gao/8213bb046f4dce746b5f2ddcddb13a336d0b0d60/0827.json)：6 个 `type:1`。
- 上述三份配置没有 `type:4`。`0826.json` 为 type 3；`0707.json` 没有顶层 `sites`，不能一概当作站点列表。

去重后的公开 API 地址：

| 配置中的名称 | 可独立测试的 API 地址 | 配置证据 |
| --- | --- | --- |
| 暴風 | `https://bfzyapi.com/api.php/provide/vod` | 0821 / 0825 / 0827 |
| 索尼 | `https://suoniapi.com/api.php/provide/vod` | 0821 / 0825 / 0827 |
| 量子 | `https://cj.lziapi.com/api.php/provide/vod` | 0825 / 0827 |
| 非凡 | `http://cj.ffzyapi.com/api.php/provide/vod` | 0825 / 0827 |
| 海外看 | `https://haiwaikan.com/api.php/provide/vod` | 0821 / 0825 / 0827 |
| 快帆 | `https://api.kuaifan.tv/api.php/provide/vod` | 0821 / 0825 / 0827 |
| 乐视 | `https://leshiapi.com/api.php/provide/vod` | 0825 |
| 百度 | `https://api.apibdzy.com/api.php/provide/vod?ac=list` | 0821 |

这是**一个可提取的 API 候选集合**，不意味着这些 API 都通过本轮播放验证。应与已有 CMS 地址去重，再优先测试尚未配置的两三个。详情若包含直接 M3U8/MP4，可使用现有播放代理；需要外部解析或失效线路的结果应单独记录。原地址含 `ac=list` 的项目需要正确合并查询参数，避免重复 `ac`。

原 `js.json` 的 298 项、Jade TVBox 配置的 28 项均为 type 3（由主任务核查）；不能因为它们是 JSON 文件就直接作为 CMS API 导入。它们包含执行规则，依赖不同的宿主。

## 2. 四个现有站点的域名候选：先复用已审核解析器

来源是 [Hululu007/drpy-node 固定提交 `295f2b7`](https://github.com/Hululu007/drpy-node/commit/295f2b7047e14122d542a7736cb931e81abcf85c)，提交日期 **2026-03-22**，仓库 push 日期 2026-03-23。这里是该公开版本规则的 host 声明，不是推断出的猜测域名。

| 站点 | 规则中当前 host | 一级源码证据 | 本次无凭证主页 GET |
| --- | --- | --- | --- |
| 二小 | `https://erxiaofn.site` | [二小盘规则](https://raw.githubusercontent.com/Hululu007/drpy-node/295f2b7047e14122d542a7736cb931e81abcf85c/spider/js/%E4%BA%8C%E5%B0%8F%5B%E7%9B%98%5D.js) | SSL EOF，未取得有效页面 |
| 玩偶哥哥 | `https://www.wogg.one/` | [玩偶哥哥盘规则](https://raw.githubusercontent.com/Hululu007/drpy-node/295f2b7047e14122d542a7736cb931e81abcf85c/spider/js/%E7%8E%A9%E5%81%B6%E5%93%A5%E5%93%A5%5B%E7%9B%98%5D.js) | 证书验证失败；未关闭 TLS 校验 |
| 至臻 | `https://mihdr.top` | [至臻盘规则](https://raw.githubusercontent.com/Hululu007/drpy-node/295f2b7047e14122d542a7736cb931e81abcf85c/spider/js/%E8%87%B3%E8%87%BB%5B%E7%9B%98%5D.js) | SSL EOF，未取得有效页面 |
| 雷鲸 | `https://www.leijing1.com` | [雷鲸小站盘规则](https://raw.githubusercontent.com/Hululu007/drpy-node/295f2b7047e14122d542a7736cb931e81abcf85c/spider/js/%E9%9B%B7%E9%B2%B8%E5%B0%8F%E7%AB%99%5B%E7%9B%98%5D.js) | HTTP 200，主页标题为“雷鲸小站-天翼云盘交流站” |

玩偶规则还将 `https://www.wogg.net` 留为注释；gao 的 0821/0826 配置仍将它作为 `siteUrl`。这给出了两个不同年代的维护者声明，不能据此保证任一个今天可播放。现有包使用 `wogg.xxooo.cf`；先测试维护者公开的新 host 是否仍兼容原搜索、详情 CSS，再决定是否覆盖。[gao 的旧域名配置证据](https://raw.githubusercontent.com/gaotianliuyun/gao/8213bb046f4dce746b5f2ddcddb13a336d0b0d60/0821.json)

雷鲸即使成功，也主要说明天翼内容站可达。第一版只支持 Quark，不能将雷鲸首页 HTTP 200 计入夸克播放验收。后三个 TLS 失败结论只代表本次所在网络的观察；不据此宣称全球失效。

本路径无需执行上述 DRPY 规则；只把公开 host 作为已审核解析器的候选参数。若页面结构改变，应回到已审核站点适配流程，不为了得到搜索结果重新引入未知脚本。

## 3. jadehh/TVSpider：结构最接近现有 Runtime 的独立 Node 包

[项目 README](https://github.com/jadehh/TVSpider/blob/d740cb717859dae415d2f3d757147e62dce6a0ca/README.md)明确区分 QuickJS 的 `js` 分支与 Node 的 `dist` 分支；[Node 目录说明](https://github.com/jadehh/TVSpider/blob/d740cb717859dae415d2f3d757147e62dce6a0ca/nodejs/readme.md)声明编译产物发布到 dist。

公开入口：

- [dist/index.js.md5](https://raw.githubusercontent.com/jadehh/TVSpider/dist/index.js.md5)
- [固定版本 index.js.md5](https://raw.githubusercontent.com/jadehh/TVSpider/5963bb9cf2a6e66abd4ceb01e825ab7e6018dbf2/index.js.md5)
- [固定版本 index.js](https://raw.githubusercontent.com/jadehh/TVSpider/5963bb9cf2a6e66abd4ceb01e825ab7e6018dbf2/index.js)
- [固定版本 index.config.js](https://raw.githubusercontent.com/jadehh/TVSpider/5963bb9cf2a6e66abd4ceb01e825ab7e6018dbf2/index.config.js)

[dist 提交 `5963bb9`](https://github.com/jadehh/TVSpider/commit/5963bb9cf2a6e66abd4ceb01e825ab7e6018dbf2)日期 **2024-09-09**；main 最新提交为 2024-09-18，不能称作当前活跃维护的新源。

[启动源码](https://github.com/jadehh/TVSpider/blob/d740cb717859dae415d2f3d757147e62dce6a0ca/nodejs/src/index.js)包含 `export async function start(config)` / `stop()`，Fastify `catServerFactory`、`catDartServerPort()`、`NODE_PATH/db.json`、`DEV_HTTP_PORT` 与现有宿主很相近。它默认绑定 127.0.0.1，端口可由环境变量指定。这些是可适配的证据，不是已兼容证明。

成本集中在路由/站点目录 schema、配置项、请求代理和 Dart 嗅探依赖。现有旺二牛补丁依赖另一份固定哈希，不适用于 Jade。需要新增独立审核 profile，以空凭证启动并验证站点；公开配置若包含网盘/站点授权字段，先移除或留空，不把原账号授权迁移过去。旧站点域名失效与宿主启动失败应分别记录。

## 4. drpyS / drpy-node：适合经 HTTP T4 接入，不适合当作同一种源包

已知原 `hjdhnx/drpy-node` 本轮 GitHub API 返回 404；不能直接把旧安装教程当作仍可用的下载源。[Hululu007/drpy-node](https://github.com/Hululu007/drpy-node)提供公开实现与文档，本次固定到 [2026-03-22 的提交](https://github.com/Hululu007/drpy-node/commit/295f2b7047e14122d542a7736cb931e81abcf85c)。这是一份可审查的公开副本，不能把它表述成已确认的原作者主仓。

[一级 T4 API 文档](https://github.com/Hululu007/drpy-node/blob/295f2b7047e14122d542a7736cb931e81abcf85c/docs/t4api.md)及[接口总览](https://github.com/Hululu007/drpy-node/blob/295f2b7047e14122d542a7736cb931e81abcf85c/docs/apidoc.md)声明：

| 功能 | HTTP 接口模式 |
| --- | --- |
| 首页 | `GET /api/<module>` |
| 搜索 | `GET /api/<module>?wd=<keyword>&pg=1` |
| 分类 | `GET /api/<module>?ac=list&t=<category>&pg=1` |
| 详情 | `GET /api/<module>?ac=detail&ids=<id>` |
| 播放解析 | `GET /api/<module>?play=<episodeId>&flag=<line>` |
| 媒体代理 | `GET /proxy/<module>/*`，可能跳转 `/mediaProxy` |

接口有 `validatePwd` 验证；具体密码和 `extend` 必须由自部署配置决定。接入时需要保留服务端配置的验证参数，识别 `headers`/`header`、相对代理 URL、多种响应结构，并支持独立的播放解析步骤；不能只把详情里的剧集 ID 当成媒体直链。

适合下一阶段新增独立 T4 source kind，或接入已由用户部署且信任的 drpy 服务。本轮不安装它的自动更新脚本、不运行未知规则、不把真实 Quark 账号交给第二套服务。当前直接收益是公开规则里的 host 与 T4 协议证据；完整服务需要另行隔离审核。

## 未列为优先可添加候选的项目

- [FongMi/CatVodSpider](https://github.com/FongMi/CatVodSpider)有 2026-10-24 的实际提交，但其 app/Gradle/JAR 与 `csp_` 爬虫属于另一执行体系。项目活跃不等于当前 Node Runtime 可加载，不为本轮再引入 Java/Android 宿主。
- gao `cat/js/config_open.json` 与大量 `*_open.js` 属于 CatOpen 规则集合；“JavaScript”扩展名不足以证明可调用 Node `start/stop`。现阶段优先提取纯 API 和已审核站点 host。
- `hjdhnx/dr_py` 原仓已 archived，最后 push 为 2024-05-30；不作为新的优先部署对象。

所有添加结果以主任务的隔离验证与真实内容测试为准。本报告没有把下载成功、HTTP 200 或静态结构相似计为播放成功。

## 主任务：已添加的资源与真实验收

本轮在独立测试实例添加并启用两项，未部署原NAS：

| 新源 | 资源与来源 | 已完成验证 |
| --- | --- | --- |
| 公开夸克·跨年晚会 | gao固定提交的[quarkshare.txt](https://raw.githubusercontent.com/gaotianliuyun/gao/8213bb046f4dce746b5f2ddcddb13a336d0b0d60/json/quarkshare.txt)中2023–2024跨年分享；从可列出的12个文件提取纯名称、shareId和fid | 片库12项、分类1项、搜索bilibili得到3项；单片详情、实际转存、MP4 Range206；山东新年交响音乐会在局域网浏览器实际1920×1080解码 |
| 公开TVBox·暴风 | [0825.json](https://raw.githubusercontent.com/gaotianliuyun/gao/8213bb046f4dce746b5f2ddcddb13a336d0b0d60/0825.json)中的type1采集API | 三体搜索13条、49个浏览分类、详情15集；该旧片首集媒体404。改抽仙逆最新第164集后，应用代理清单200/505分片、首分片200；局域网浏览器实际1920×816解码，无媒体错误 |

公开夸克目录是本项目新增的可信元数据适配器，**没有执行gao的JAR或JS**。服务器从固定JSON读取节目名称与公开文件ID，播放继续使用当前已审核的push/Quark链路及本实例专用账号。目录只保存公开静态信息，不保存stoken、file token或Cookie；当前内容是固定快照，不能自动代表分享今后仍有效。新增站点可在现有管理员站点列表停用。

逐个节目按不可变fid匹配新详情，不按同名文件/集号匹配。媒体会话只将该可信虚拟目录映射到原push代理，不放宽到其他站点或配置端口。配置文件为catvod/public-quark-catalog.json，包含上游commit、文件SHA-256与核查日期。

其他抽查：公开share文件里7个分享中4个token有效、3个41010。4个有效分享进一步列文件时：每日短剧更新超过20秒，短剧162g/114g没有视频，只有晚会合集列出12个节目。因此只加入这一可验证目录，不把token成功当播放成功。原文件self“我的夸克网盘”条目没有导入，也没有枚举账号其他目录。

CMS共测6个：暴风、百度可搜索和取详情；索尼返回“暂不支持搜索”；快帆、乐视、海外看本次连接失败。百度旧片和仙逆最新集均403，未启用；暴风也并非全库可播，保留旧片404事实。

Jade固定包MD5匹配，SHA-256为a08dfe815cd16564dbfe25d168e923ee1a87d299decd92d6789bb43bb0534d26。在无网络、空凭证、无当前数据卷的临时容器中启动了本地Fastify服务，但当前宿主所需GET /full-config返回404，尚不能直接替换当前包。公开默认配置中的第三方授权字段没有使用，该原始配置副本已移除。没有将本实例Quark账号交给新包，也没有启用它。

本轮Runtime27项测试、应用媒体与适配器13项测试通过；生产构建包含类型检查和lint通过。真实报告保存在被忽略的data/acceptance/public-*。新增节目转存后，账本5→6、pending为0；继续采用手动清理。短测不等于长播验收。

最终浏览器复核：新公开夸克节目1920×1080、暴风仙逆第164集1920×816；两项均跳转到600秒后继续解码至约602秒，无媒体错误。验证均使用192.168.1.130:18081局域网入口，属于单片短测；没有把它记为两路30分钟结果。浏览器保留公开夸克节目暂停结果页供查看。
