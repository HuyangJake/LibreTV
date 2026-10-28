# CatVod 与夸克 NAS 部署

版本：`2.19.5-nas.3`。发布目标为本仓库 `nas` 分支。三个镜像统一发布 amd64/arm64：`libretv`、`libretv-spider`、`libretv-catvod`；同时提供 `nas` 与 `nas-<完整提交SHA>` 标签。

## 配置与持久数据

继续使用 `docker-compose.nas.yml`、原 Compose 项目名、`PASSWORD`、`LIBRETV_PORT`、原订阅及代理配置。新增两个必填变量，只放在本机 `.env`：

```dotenv
ADMIN_PASSWORD=设置一个不同于观看密码的管理员密码
CATVOD_TOKEN=设置至少24字符的随机内部令牌
```

可分别用 `openssl rand -hex 24` 和 `openssl rand -hex 32` 生成。不要提交实际密码、令牌或 `.env`。若已显式配置 `NO_PROXY`，须追加 `catvod`，保留 `127.0.0.1,localhost,spider,libretv` 等原项目。

- 应用继续使用原 `libretv-data` 卷，不能用测试实例的 sources.json 覆盖它。
- CatVod 使用新的 `catvod-data:/data` 卷，内部8790/9988没有主机端口映射。
- Runtime监督进程只持有内部令牌；审核源包子进程仅获得运行路径与明确允许的代理设置，不获得观看/管理员密码或内部令牌。代理路径与应用保持一致。
- 源包与夸克授权通过「设置→源管理→猫影视与夸克」管理。新装实例需手动安装已审核源包并扫码；不自动下载或执行未知版本。
- 手动清理只处理账本中属于本实例专用目录的文件；升级/回退不自动清理远程文件。

## 从独立测试实例迁移

1. 停止测试应用及Runtime，避免迁移期间两个实例同时转存或清理。
2. 备份NAS原 `.env`、Compose配置、应用数据及运行镜像ID；保留原镜像。
3. 从停止的测试Runtime复制完整 `/data`，包含 `state.json`、`db.json`、`ledger.json` 和 `versions/`，通过SSH加密传输到新建的CatVod数据卷。不能只复制Cookie，否则会丢失目录归属和去重记录。迁移文件含授权信息，不放到Git或公开报告。
4. 将卷内文件交给容器node用户（uid/gid1000），敏感JSON权限600。NAS原源配置继续保留；只按URL去重补充已验证的新采集源。
5. 使用对应同一提交的三个镜像启动；验证原观看密码、独立管理员权限、夸克账号状态、账本数量与真实播放。迁移成功后继续停止本机测试Runtime，避免双写同一云盘专用目录。

固定发布版本时，在NAS `.env` 中设置三个镜像，不混用不同提交：

```dotenv
LIBRETV_IMAGE=ghcr.io/huyangjake/libretv:nas-完整提交SHA
SPIDER_IMAGE=ghcr.io/huyangjake/libretv-spider:nas-完整提交SHA
CATVOD_IMAGE=ghcr.io/huyangjake/libretv-catvod:nas-完整提交SHA
```

```sh
docker compose -f docker-compose.nas.yml config --quiet
docker compose -f docker-compose.nas.yml pull
docker compose -f docker-compose.nas.yml up -d --no-build
```

## 回退

保留部署前配置和旧镜像ID。需要回退应用时，使用备份的旧Compose和环境配置，指定备份的原应用/Spider镜像，然后重建原两个服务；停止CatVod服务。**不得执行 `down -v` 或删除数据卷。** 新CatVod卷与账本继续保留，不使用旧备份覆盖已经新增的云盘文件记录。

本轮变更的合并检查：应用492项测试、Spider14项Node测试及3项Python测试、CatVod28项测试通过；生产构建包含类型检查和lint通过。实际NAS访问、授权和播放结果应以部署后验收记录为准。此前局域网测试是短测，未将其视为两路全程1080p的30分钟验收。
