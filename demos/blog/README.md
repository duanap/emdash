# duanap-blog（duanap的小破站）

基于 [EmDash](https://emdashcms.com)（Astro 全栈 CMS）的个人博客，从旧版
`blog-front`（Vue 3 + Fastify）逐步迁移而来。**迁移计划与进度见
[MIGRATION.md](./MIGRATION.md)**，当前状态见 [PROGRESS.md](./PROGRESS.md)，部署步骤见 [DEPLOY.md](./DEPLOY.md)。

## 本地开发

前置：Node ≥ 22.16（本机用 `~/tools/node-v24.21.0-win-x64`）、pnpm 11.9
（已在仓库根 `packageManager` 锁定）。每次新终端先：

```bash
export PATH="/c/Users/18282/tools/node-v24.21.0-win-x64:$PATH"
```

```bash
# 仓库根（首次）
pnpm install && pnpm build

# 本站点
cd demos/blog
pnpm dev        # http://localhost:4321（注意：绑定 localhost/IPv6，不是 127.0.0.1）
```

| 入口                  | 地址                                                     |
| --------------------- | -------------------------------------------------------- |
| 前台                  | http://localhost:4321                                    |
| 管理后台              | http://localhost:4321/_emdash/admin                      |
| dev 跳过 passkey 引导 | `/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`  |
| REST API              | `/_emdash/api/*`（OpenAPI: `/_emdash/api/openapi.json`） |
| 搜索                  | `/search?q=关键词`                                       |

本地 curl 测试记得 `--noproxy "*"`（本机代理会拦 localhost）。

## 内容维护

内容模型存在数据库（文章/页面/生活记录/作品 + 留言墙专用 wall 集合，以及 4 套分类法），
定义在 [seed/seed.json](./seed/seed.json)。模型可在后台调整。下列重建命令仅用于可丢弃的本地演示库；如有需要保留的内容，先备份并通过后台调整模型。

```bash
# 停掉 dev server（Windows 下 pnpm 的 node 子进程会残留，需 kill astro 进程）
rm -f data.db data.db-shm data.db-wal
node ../../packages/core/dist/cli/index.mjs seed seed/seed.json
pnpm dev
```

Windows 下 `emdash`/`em` bin shim 不可用，一律用
`node ../../packages/core/dist/cli/index.mjs` 直调（types/seed/doctor…）。

## 旧站内容迁移（blog-front → 本站）

站长已决定不迁移旧数据。当前完整工具 `scripts/migrate-old-site.mjs` 保留备用，使用前检查脚本参数与 dry-run 报告。下面是早期工具的历史调用示例，不属于上线流程。

```bash
# 1. 生成合成旧库，验证转换与映射逻辑（不触网、不写入）
node scripts/test-fixture-old-blog.mjs /tmp/old-blog.sqlite
node scripts/migrate-from-blog-front.mjs --db /tmp/old-blog.sqlite --dry-run

# 2. 真实导入（管理员后台生成 PAT；需要 content + media 权限）
scp duanap-server:<旧站>/server/data/blog.sqlite ./old.sqlite
node scripts/migrate-from-blog-front.mjs --db ./old.sqlite \
  --token $EMDASH_TOKEN --old-uploads <旧站>/server/uploads
```

- 导入幂等：slug 冲突（409）自动跳过，可安全重跑
- **`.migration/mapping.json` 记录旧 id → 新 ULID 映射，会员点赞/收藏数据
  将来靠它对账，务必备份**

## 目录速览

```
src/pages/        页面（posts/ life/ projects/ archives/ about/ friends/ search）
src/components/   PostCard（文章+生活卡片）/ ProjectCard / ArchiveTimeline
src/styles/       tokens.css（模板默认）+ theme.css（站点主题覆盖）
src/utils/        date（datetime 字段 string|Date 归一）等
seed/seed.json    内容模型 + 占位内容
scripts/          旧站迁移工具
MIGRATION.md      迁移计划、决策与进度
```

## 已知取舍

- 文章卡片沿用 EmDash 模板样式（用户点名保留）；品牌色（米白/墨绿/赭石）
  通过 `theme.css` token 覆盖沿用旧站
- 评论 UI 的英文文案用 `src/scripts/zh-copy.ts` 的 DOM 翻译脚本转中文（core 尚无前台
  i18n 的停止性方案，上游支持后移除）
- 文章 URL 保持 `/posts/{slug}`；旧数字入口通过映射表跳转，没有映射时返回 404

## 本轮修复的回归验证

从仓库根目录执行以下检查；浏览器测试使用本机 Chrome 的独立临时配置，不复用个人浏览器会话。

```bash
pnpm --filter emdash exec vitest run tests/integration/blog-member-overview.test.ts
node demos/blog/scripts/test-deploy.mjs
node --experimental-strip-types demos/blog/scripts/test-member-ui.mjs
```

会员分页测试使用真实 SQLite；设置 EMDASH_TEST_PG 后同时验证 PostgreSQL。部署脚本测试使用临时目录和模拟系统命令，不操作生产服务。
