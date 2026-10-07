# Phase 6 部署 runbook（EmdashBlog）

> 目标：把 `demos/blog` 以 **Node standalone** 方式跑在自有 VPS 上，前面是 Nginx。
> 旧站（Vue 3 + Fastify）全程在线，最后一步才切流量，随时可回滚。
> 首次部署与升级流程分开执行；本地验证结果见文末。生产切流前仍需现场验收。
>
> **站长已确认的三条（2026-10-01）**
>
> 1. **不迁旧站数据**：上线用 `seed/seed.json` 的演示内容，真实内容在管理后台写；迁移工具保留备用。
> 2. **雷池 WAF 已关闭**：不作为部署前置（第 6 节只留反代）。
> 3. **QQ 互联上线后再配**：未配置期间登录页会明确提示，会员中心与点赞引导到登录页，留言墙匿名可评（见第 9.5 节）。

## 1. 运行环境

| 项        | 结论                                                             | 依据                               |
| --------- | ---------------------------------------------------------------- | ---------------------------------- |
| 适配器    | `@astrojs/node` `mode: "standalone"`                             | `demos/blog/astro.config.mjs`      |
| 入口      | `node dist/server/entry.mjs`                                     | 构建产物                           |
| 监听      | `HOST`（默认 `0.0.0.0`）、`PORT`（默认 `8080`）                  | `@astrojs/node/dist/standalone.js` |
| Node      | ≥ 22（`node:sqlite`、`--experimental-strip-types` 用于测试脚本） | 仓库要求                           |
| 数据库    | 单个 SQLite 文件                                                 | `sqlite({ url })`                  |
| 上传/媒体 | 本地目录                                                         | `local({ directory })`             |

## 2. 服务器目录布局

```
/srv/emdashblog/
├── app/                # 仓库（或只放构建产物：dist/ + node_modules/ + package.json）
├── data/
│   └── data.db         # 数据库（不要放在 dist 里，升级时别被覆盖）
├── uploads/            # 媒体文件
├── backups/            # 备份产物
└── .env                # 密钥（chmod 600）
```

**关键点**：数据库与上传目录都通过环境变量给出，**在构建期求值并写进 server bundle**（Astro 配置是构建期配置），所以路径要在 `astro build` 时就设好；运行期改这两个变量不生效。相对路径按**进程工作目录**解析，因此进程必须从 `demos/blog` 启动。

## 3. 构建

当前生产机器只运行上传的构建产物，不在服务器执行构建。本机打包前必须从生产配置核对数据库和上传目录，并在 `astro build` 时显式设置这两个路径、`EMDASH_SITE_URL` 和 `EMDASH_PUBLIC_ORIGINS`。打包及服务器解压后都检查 server bundle 包含实际生产数据库路径，且没有 `file:./data.db`；配置不匹配时禁止切换。

2026-10-01 的实际持久化目录为 `/srv/apps/duanap/blog-emdash/shared/production-emdashblog-d2add2e35-fixed-20261001T021326`，数据库为其下的 `data.db`，上传目录为 `uploads`。正式 URL 保持 `https://blog.duanap.cn`，公开别名为 `https://duanap.cn,https://www.duanap.cn`。以下 `/srv/emdashblog` 是通用示例，不能直接用于当前生产环境。

```bash
# 仓库根目录：先构建 workspace 包（站点通过 workspace:* 链接 emdash 核心）
pnpm install
pnpm build                     # packages/**，产出 packages/core/dist

# 站点
cd demos/blog
EMDASH_DATABASE_URL="file:/srv/emdashblog/data/data.db" \
EMDASH_UPLOADS_DIR="/srv/emdashblog/uploads" \
  pnpm exec astro build        # 产出 dist/server/entry.mjs + dist/client/
```

> 注意：本机若没有 `npx`，`packages/admin` 的构建脚本会失败（它调用 `npx @tailwindcss/cli`）；
> 服务器上正常有 npm/npx，不需要这个 workaround。

## 4. 环境变量

**构建期**（写进 bundle，改了要重新构建）：

| 变量                  | 说明                                                                       |
| --------------------- | -------------------------------------------------------------------------- |
| `EMDASH_DATABASE_URL` | SQLite 路径，如 `file:/srv/emdashblog/data/data.db`；默认 `file:./data.db` |
| `EMDASH_UPLOADS_DIR`  | 上传目录绝对路径；默认 `./uploads`                                         |

**运行期**：

| 变量                                    | 说明                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `EMDASH_SITE_URL`                       | 正式站点 origin，例如 `https://blog.duanap.cn`；生产初始化必填，不能用 EMDASH_ALLOWED_ORIGINS 替代                  |
| `HOST` / `PORT`                         | 监听地址与端口（建议 `127.0.0.1` + 反代）                                                                           |
| `NODE_ENV=production`                   | 生产模式；dev-only 端点（`dev-bypass`）在生产下返回 **403**                                                         |
| `EMDASH_ENCRYPTION_KEY`                 | 插件密钥（如 QQ Client Secret）的加解密密钥。**设定后不要再改、并随数据库一起备份**；改了需要在后台重新填写插件设置 |
| `EMDASH_IP_SALT` / `EMDASH_AUTH_SECRET` | 评论限流用的 IP 哈希盐、预览令牌。不设时 EmDash 会在数据库里生成并保存（随数据库一起备份），设置则更可控            |
| `EMDASH_PREVIEW_SECRET`                 | 草稿预览令牌（可选，同上）                                                                                          |
| `EMDASH_ALLOWED_ORIGINS`                | 允许的来源（逗号分隔），用于来源校验；填线上域名，如 `https://blog.duanap.cn`                                       |

**QQ 互联的 Client ID/Secret 不放在环境变量里**：它们在管理后台的插件设置中保存（用 `EMDASH_ENCRYPTION_KEY` 加密）。

## 5. 启动（systemd 示例）

```ini
# /etc/systemd/system/emdashblog.service
[Unit]
Description=EmdashBlog (Astro Node standalone)
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/emdashblog/app/demos/blog
EnvironmentFile=/srv/emdashblog/.env
ExecStart=/usr/bin/node dist/server/entry.mjs
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now emdashblog
journalctl -u emdashblog -f
```

## 6. 反向代理（雷池 WAF 已关闭，忽略）

> 站长的决定：**雷池 WAF 已关闭，不再作为前置**。下面只留反代本身；若以后重新开启 WAF，
> 需要放行的路径是 `/_emdash/admin/*`、`/_emdash/api/*`（含媒体与评论提交），
> 以及登录用的跨站 302（`auth/qq/start` → `graph.qq.com`）。

Nginx：

```nginx
server {
	listen 443 ssl http2;
	server_name blog.duanap.cn;

	client_max_body_size 32m;          # 媒体上传

	location / {
		proxy_pass http://127.0.0.1:4322;
		proxy_http_version 1.1;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
}
```

Nginx 之外不需要额外的东西：**雷池 WAF 已关闭**。若将来重新启用，放行 `/_emdash/admin/*`、
`/_emdash/api/*`（含媒体文件与评论提交），并允许登录时的跨站 302。

## 7. 数据与备份

需要备份 `data/data.db`、`uploads/` 和 `.env` 中的 `EMDASH_ENCRYPTION_KEY`。密钥单独妥善保存，不能只备份数据库。

```bash
cd /srv/emdashblog/app/demos/blog
node scripts/backup-db.mjs --db /srv/emdashblog/data/data.db --out /srv/emdashblog/backups
# 备份用 SQLite 的 VACUUM INTO（服务运行中也能拿到一致快照），并逐表比对行数
```

**恢复**（务必先停服务，避免写入竞争）：

```bash
systemctl stop emdashblog
cp /srv/emdashblog/data/data.db /srv/emdashblog/data/data.db.before-restore
cp /srv/emdashblog/backups/data-<时间戳>.db /srv/emdashblog/data/data.db
systemctl start emdashblog
curl -fsS http://127.0.0.1:4322/ >/dev/null && echo "站点已起来"
```

> `EMDASH_ENCRYPTION_KEY` 不在数据库里，恢复数据库时也要保证密钥没变，否则插件设置解不开。

## 8. 健康检查

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4322/            # 200
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4322/messages    # 200
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4322/rss.xml     # 200
curl -s  -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4322/login        # 200
curl -s  -o /dev/null -w '%{http_code}\n' \
  "http://127.0.0.1:4322/_emdash/api/setup/dev-bypass?redirect=/"            # 必须 403
```

## 8.5 首次部署与后续升级

首次部署先按第 3 节构建、按第 5 节启动服务。通过受保护的 HTTPS 预览入口访问管理后台，
完成 setup、管理员创建并选择导入演示内容，然后执行 `deploy.sh --check-only`。
`deploy.sh` 是已初始化实例的升级入口；空库中的留言墙内容尚不存在，不能用页面 200 检查代替首次 setup。

首次构建也要传入正式数据路径；服务的 .env 至少包括 HOST、PORT、EMDASH_SITE_URL、EMDASH_ENCRYPTION_KEY。
应用用户需要数据和上传目录的写权限，旧站进程保持运行。完成检查后再申请正式切换流量。

后续升级在仓库根目录运行下面的脚本。

```bash
cd /srv/emdashblog/app
./demos/blog/scripts/deploy.sh              # 备份 → 构建 → 切换 → 重启 → 健康检查（失败自动回滚）
./demos/blog/scripts/deploy.sh --dry-run    # 只打印步骤
./demos/blog/scripts/deploy.sh --no-build   # 重启现有产物，保留已有 dist.previous（排障）
./demos/blog/scripts/deploy.sh --check-only # 只对运行中的实例做健康检查
```

- 路径与端口可用环境变量覆盖：`APP_DIR` / `STATE_DIR` / `ENV_FILE` / `SERVICE` / `DATA_DIR` / `UPLOADS_DIR` / `BACKUP_DIR` / `HOST` / `PORT`。
- 默认 STATE_DIR 是 APP_DIR 的父目录：`/srv/emdashblog/.env`、`/srv/emdashblog/data/data.db`、`/srv/emdashblog/uploads`、`/srv/emdashblog/backups`。备份以 .env 中 EMDASH_DATABASE_URL 指向的实际文件为准，含相对路径时按 demos/blog 工作目录解析。
- 构建前保存旧 dist 到 dist.previous，构建、服务重启或健康检查失败都恢复旧产物；数据库不会自动回退。`--no-build` 不覆盖已有 dist.previous。若回滚后仍不健康，脚本会明确报出并让你看 `journalctl -u emdashblog -n 100`。
- 健康检查与本地生产冒烟（`night-work/verify-deploy.mjs`）口径一致：4 个页面 200 + setup/auth 两个 `dev-bypass` 必须 403。

## 9. 上线检查清单

- [ ] `EMDASH_ENCRYPTION_KEY` 已生成、写进 `.env`（600 权限）并异地保存
- [ ] `EMDASH_DATABASE_URL` / `EMDASH_UPLOADS_DIR` 在构建时已指向 `/srv/emdashblog/...`
- [ ] `EMDASH_SITE_URL` 填正式站点 origin；需要额外 passkey origin 时再设置 `EMDASH_ALLOWED_ORIGINS`
- [ ] 管理后台已用 passkey 建立管理员（不要留 dev-bypass 依赖）
- [ ] `dev-bypass` 在生产返回 403（用健康检查那行验证）
- [ ] **QQ 登录：正式上线后再配**（见第 9.5 节）。未配置时登录页会明确提示「QQ 登录尚未配置」，会员中心与点赞会引导到登录页——不会出现点了没反应的按钮；留言墙（匿名可评）照常可用
- [ ] 评论审核策略确认（默认进 pending，后台「评论」页审核）
- [ ] 备份定时任务（cron/systemd timer）已配置并演练过一次恢复
- [ ] 内容来源：**不迁旧站数据**（站长决定），上线时是 `seed/seed.json` 里的演示内容；要换真实内容就在管理后台增删改（旧站迁移脚本仍保留在 `scripts/migrate-old-site.mjs`，需要时可用）
- [ ] sitemap.xml / robots.txt / rss.xml 用线上域名访问正常
- [ ] 旧站仍在运行，回滚方式 = 把反代 upstream 切回旧站

## 9.5 上线后再配 QQ 登录

不需要改代码，也不需要重新构建：

1. 管理后台 → 插件 → **duanap-members** → 填入 QQ 互联的 **Client ID**、**Client Secret**、**qqCallbackUrl** 和 **siteOrigin**（保存时会用 `EMDASH_ENCRYPTION_KEY` 加密落库）。
2. QQ 互联后台把回调地址设为 `https://blog.duanap.cn/_emdash/api/plugins/duanap-members/auth/qq/callback`。
3. 插件 qqCallbackUrl 必须与 QQ 互联登记的地址完全一致，siteOrigin 设为 `https://blog.duanap.cn`。旧站曾使用 apex 回调桥，配置新站前需核实 QQ 互联允许的正式回调域名。
4. 填完刷新 `/login`：按钮会从「尚未配置」变成「使用 QQ 账号登录」。
5. 若之后更换或丢失 `EMDASH_ENCRYPTION_KEY`，已保存的 Secret 解不开，重新填一次即可。

未配置期间的行为（本机实测 19/19，`night-work/verify-launch-state.mjs`）：全站页面 200；
`auth/status` 返回 `loggedIn:false, qqConfigured:false`；登录页提示尚未配置且不显示死按钮；
`/member` 与点赞都会把人引导到登录页并说明原因；留言墙匿名可评，站点仍然可交互。

## 10. 回滚

1. Nginx/WAF 把 `blog.duanap.cn` 的 upstream 切回旧站（旧站不停止、数据不动）；
2. 新站进程停掉即可，数据目录保留，便于排查；
3. 若已在新站产生内容（评论/会员），回滚不会自动同步回旧站——这是**单向**的，切流量前先确认。

## 已验证（本机 2026-09-30）

`night-work/verify-deploy.mjs` 用**数据库副本**跑了一遍真实部署链路，13/13 通过：

- 构建期用 `EMDASH_DATABASE_URL` 指向副本 → 生产构建成功，产物为 `dist/server/entry.mjs`
- `HOST=127.0.0.1 PORT=4322 NODE_ENV=production node dist/server/entry.mjs` 正常启动
- `/`、`/messages`、`/rss.xml`、`/login` 均 200，且留言墙页面包含**只写在副本里的标记留言**（证明服务读的是副本库，环境变量生效）
- `/_emdash/api/setup/dev-bypass` 与 `/_emdash/api/auth/dev-bypass` 均返回 **403**（生产模式关闭）
- 未登录取 `/_emdash/api/admin/comments` 被拒（401/403）
- `scripts/backup-db.mjs` 对副本库执行成功（VACUUM INTO + 逐表行数校验）

## 本次实际生产部署（2026-10-01）

生产根目录是 `/srv/apps/duanap/blog-emdash`，运行服务为 `blog-emdash.service`，实际 release/shared 路径见本机 `deployment-verified.json`。
服务器资源紧张，此后应在本机完成构建，只上传 JS/静态产物，保留服务器原生运行依赖。
Astro 产物包含绝对文件 URL，搬运前须把路径改为实际 release/vendor 路径；不能直接上传含 Windows 路径的输出。
使用每次部署独立的产物目录，先校验源站路由、资源和 HTTPS 地址，再切反代与核对公网缓存。

### 错峰启动

自有应用的 `duanap-boot-*.timer` 在开机后 45–225 秒分批触发。普通手工 `systemctl restart <service>` 仍立即执行。
不要再给这些 service 执行 enable，否则它们会同时被 multi-user.target 和 timer 拉起，破坏错峰计划。
21 个自有 service 都保持正常运行，shared infra、mhsp 和 ynwykj 不在此次修改范围。
计划与原启用状态保存在 `/srv/apps/duanap/blog-emdash/backups/staggered-start-20261001T132508/plan.json`。
恢复原开机方式可运行同目录下 `rollback-staggered-start.py`，它只移除本次 timer 并恢复原 enable 状态，不重启正在运行的业务。

### 站点回滚

Nginx 旧配置备份为 `/srv/apps/duanap/blog-emdash/backups/cutover-20261001T133001/old-blog-nginx.conf`。
先把新 `blog-emdash.duanap.cn.conf` 移到备份目录，再恢复旧 `blog.duanap.cn.conf`，执行 `nginx -t` 后 reload。
旧 blog-front.service 及旧数据没有删除。回滚不自动把新站数据合入旧站，也不覆盖任何数据库。
若不再运行新站，同时停用它的 timer 并 stop blog-emdash.service；其他应用 timer 保持原样。
域名回滚后可能仍需刷新 CDN；每次刷新重新核对额度和明确授权，不能刷新整个区域。

## 三域名直接访问（2026-10-01 最新状态）

`duanap.cn`、`www.duanap.cn`、`blog.duanap.cn` 都反代到 4322，不进行域名重定向。
构建期设置 `EMDASH_PUBLIC_ORIGINS=https://duanap.cn,https://www.duanap.cn`，与 EMDASH_SITE_URL 一起形成 Astro 可信 HTTPS 转发域名列表。
这项配置只允许公开域名，不能代替认证用 EMDASH_ALLOWED_ORIGINS。现有 passkey 是在 blog.duanap.cn 注册，保留 `EMDASH_SITE_URL=https://blog.duanap.cn` 和原后台地址，避免已有密钥失效。
三个域名共同维护同一个数据库和内容库；没有另建项目，也没有迁移管理员。
回滚时先恢复本次备份中的三个 Nginx 配置，再恢复前版 dist 与 service.env，nginx -t 后 reload，重启本项目服务；不覆盖当前数据库。
旧方案的数据库备份只供独立灾难恢复使用，恢复数据库仍需另行确认影响和备份。
