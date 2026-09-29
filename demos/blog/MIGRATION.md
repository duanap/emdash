# duanap.cn 博客迁移计划（blog-front → EmDash）

> 起始日期：2026-09-30
> 旧项目：`duanap/blog-front`（Vue 3 + Fastify + Drizzle/SQLite，本地副本 `C:\Users\18282\Documents\ChatGPT\blog`）
> 新项目：本仓库（`duanap/emdash` fork，站点在 `demos/blog`，包名 `duanap-blog`）
> 旧站线上：`duanap.cn` / `blog.duanap.cn`（systemd `blog-front.service`，端口 4321，**迁移完成前保持运行**）

## 当前进度（2026-09-30 夜间批量开发后）

**已落地（本地完成，未部署）**：

- ✅ 站点基座：`demos/blog`（模板复制 + workspace 链接），全站中文化（zh-CN）
- ✅ 品牌主题：米白/墨绿/赭石 palette（light-dark 双模式）+ 系统 CJK 字体栈（无 webfont 拉取）
- ✅ 内容模型：posts / pages / **life** / **projects** 四集合 + category/tag/life_category/project_type 四分类法（seed.json），后台可维护
- ✅ 页面：首页（featured + 文章/生活/作品三区块）、文章列表/详情（含原生评论）、生活列表（分类过滤）/详情/标签页、作品列表（类型过滤 + 精选区）/详情（截图画廊）、归档（年/月两级 + `/archives/{year}` `/archives/{year}/{month}`）、关于、友链、404、搜索（四集合）
- ✅ 中文占位内容：8 篇文章 + 6 条生活 + 4 个作品 + 2 个页面；本地 SVG 渐变封面
- ✅ 质量：`astro check` 0 错误、生产构建通过、18 条路由巡检通过、sitemap（分集合）/robots/RSS 由 core 注入、移动端（390px）与亮暗双主题截图审核通过
- 🔁 **停止性方案**：评论表单/列表的英文 UI 字符串目前用 Base.astro 内的 DOM 翻译脚本转中文（core 尚无前台 i18n）——上游支持后应移除；也适合给上游提 i18n PR

**尚未做（后续会话）**：真实内容迁移（旧 SQLite → 新站，含 Markdown→Portable Text 转换与 ID 映射表）、会员/QQ 登录/点赞/收藏/留言墙（Phase 5 决策）、部署切换（Phase 6，等用户指令 + 雷池 WAF 放行）。

## 总体策略

**在 fork 内开发（官方支持的工作流）**：站点位于 `demos/blog`，通过 `workspace:*` 链接 `emdash` 核心包——core 有问题可以直接改源码，且 `demos/` 目录上游几乎不动，以后同步上游不会冲突。目前 fork 的 main 除 demos/ 外与上游无分叉，同步上游仍可 ff-only。

**逐阶段切换**：每个阶段独立可验证；旧站全程在线，最后一步才切 `blog.duanap.cn` 流量，保留回滚能力。

**免费获得的能力**（不自己写）：管理后台（`/_emdash/admin`）、REST API（`/_emdash/api/*`）、媒体库、全文搜索、草稿/修订/定时发布、sitemap/robots/RSS（core 自动注入）、回收站软删除、原生评论。

## 关键设计决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 文章卡片 | 沿用模板 `PostCard.astro`（16:10 封面 + byline + 标签），文章与生活记录共用（新增 `tagBasePath` 属性） | 用户点名保留模板卡片风格；作品用同视觉语言的 `ProjectCard.astro` |
| 其余界面 | 功能优先，不追求复刻旧站像素；品牌色（米白/墨绿/赭石）通过 `theme.css` token 覆盖沿用 | 2026-09-30 夜间指令 |
| 字体 | 系统 CJK 字体栈（theme.css 定义 `--font-body`/`--font-mono`），不用 Google Fonts | 国内网络可靠 + 构建离线可跑 |
| 文章 URL | 暂用模板默认 `/posts/{slug}`；**真实内容迁移时**把 `urlPattern` 改为 `/article/{slug}` 并同步移动 `src/pages/posts/` → `article/` | 占位阶段少动；URL 保留只在真实迁移时有意义 |
| 生活记录 URL | `life` 集合 `urlPattern: /life/{slug}`；真实迁移时 slug 用旧数字 id | 旧站 `/life/123` 不变 |
| 正文格式 | Markdown → Portable Text 转换后入库（真实迁移阶段做） | 原生富文本渲染/编辑 |
| 评论 | 用 EmDash 原生评论（`commentsEnabled` + `emdash/ui/comments`），中文文案走 DOM 翻译停止性方案 | 免维护审核流 |
| 会员/QQ 登录/点赞/收藏/留言墙 | **过渡期保留 Fastify**，长期做 EmDash 插件 | 面向会员的业务，非编辑者账号体系 |
| 旧内容 ID 映射 | 导入脚本维护 `old_id → 新 ULID` 映射表（导出 JSON 存档） | 会员点赞/收藏按 targetType+oldId 关联 |
| 部署形态 | Node.js standalone（`@astrojs/node`），非 Docker，新 systemd 单元 + 端口 4322 | 与旧站并存，Nginx 只切 `blog.duanap.cn` |
| datetime 字段 | 值可能是 `string \| Date`，统一走 `src/utils/date.ts` 的 `toDate/formatDateZh` | 运行时实测踩坑 |
| 归档 | 站点自建 `/archives`（+年/月路由）；侧栏 `core:archives` widget 的链接指向这些路由，widget 月份标签仍是英文（core 硬编码） | core 不注入归档路由 |

## 开发与审核流程（每任务循环）

1. 改代码 → `pnpm exec astro check`（0 错误门槛）
2. dev server 页面冒烟（curl 状态码 + 关键文案 grep）
3. 关键页面浏览器截图审核（桌面 1440 + 移动 390、亮/暗主题）
4. 每任务独立 commit 推送到 fork main
5. 生产构建 `pnpm build` 作为阶段性验收

注意：本地 curl 测试要 `--noproxy "*"`；dev server 绑定 `localhost`（IPv6）。`emdash` bin shim 在 Windows 不可用，用 `node ../../packages/core/dist/cli/index.mjs` 直调。改 seed 后需停 dev → 删 `data.db*` → 重新 seed → 重启 dev。

## 阶段计划

### Phase 1 — 视觉与基座（✅ 已完成，形式调整见上）
### Phase 2 — 内容模型扩展（✅ 已完成，life/projects 已进 seed）
### Phase 3 — 文章迁移（待做，等真实内容指令）
- 从旧 SQLite 导出：正文 Markdown→Portable Text、图片入库（REST media API）、slug/发布时间/分类标签保留
- 导出并归档 `old_id → 新 ULID` 映射表
- URL 切换：`urlPattern /article/{slug}` + `src/pages/posts/` → `article/` 移动 + seed redirects
- 迁移脚本走 REST `POST /_emdash/api/content/{collection}`（Bearer token）

### Phase 4 — 生活/作品/静态页迁移（✅ 页面骨架已完成；真实数据替换占位时复用导入脚本）
### Phase 5 — 会员与互动（决策点）
- 评论已原生；旧评论数据导入 `POST /_emdash/api/comments`
- QQ 登录/点赞/收藏/留言墙：评估 EmDash 插件化（参考 `packages/plugins/plugin-forms`）或继续 Fastify 并行
### Phase 6 — 部署切换（等用户明确指令）
- 前置：**雷池 WAF 放行本机出口 IP**（上次部署失败原因，需人工在控制台操作）
- 服务器 `/srv/apps/duanap/blog-emdash` 发布目录 + systemd `blog-emdash.service`（端口 4322）+ 独立 `data/`、`uploads/` + `EMDASH_ENCRYPTION_KEY`（备份！）
- 生产先 `npx emdash setup` 建管理员；Nginx 临时 Basic Auth 保护 `/_emdash/admin` 防抢注
- Nginx 只切 `blog.duanap.cn` → 4322，旧站保留；EdgeOne 刷新缓存；验证 sitemap/RSS/文章 URL
- 回滚：Nginx 切回 4321

## 风险清单

1. **Markdown→Portable Text 转换**是内容保真关键：代码块、表格、图片、链接逐项抽查
2. **会员互动数据**依赖旧 ID 映射，Phase 3 导入脚本必须导出映射表存档
3. **服务器 GitHub 直连不通**：大文件本机下载后 scp 上传
4. **生产构建在服务器做**（Windows 本机构建慢且产物平台相关）
5. **上游更新**：目前仍可 ff-only 同步（fork 无 demos/ 以外的自有提交）；若未来 patch core，改为 merge 并在 PR 上游
6. **评论 UI 翻译脚本**是停止性方案：升级 EmDash 后回归测试评论表单

## 旧站资产速查（迁移输入）

- 页面清单/路由/视觉 token/API 端点/数据库 schema：`C:\Users\18282\Documents\ChatGPT\blog`（`src/router/index.ts`、`src/styles/variables.scss`、`server/src/db/schema.ts`、`server/src/db/seed.ts`）
- 备份要点：`server/data/blog.sqlite` + `server/uploads/`
- 旧站 SEO 文件由 Fastify 写 dist；新站 sitemap/rss/robots 由 EmDash core 自动注入

