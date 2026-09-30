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
- ✅ **留言墙视觉**：双轨无缝滚动卡片（奇偶分轨，轨道前一半可读可点赞，补位与副本 `aria-hidden`），悬停/聚焦暂停，`prefers-reduced-motion` 退化为静态网格；点赞走会员 activity 路由（`targetType=comment`）。
- 🔁 **停止性方案**：core 公开 UI（评论表单/列表、搜索与归档 widget）的英文文案由 `src/scripts/zh-copy.ts` 在 DOM 层转中文（core 尚无前台 i18n，字符串硬编码、无 locale 入口）——上游支持后应整体移除；也适合给上游提 i18n PR。站点自有标记里的英文（主题按钮 aria-label、footer 署名）直接改源码，不走兜底。回归见 `scripts/test-zh-copy.mjs`（含「不该翻译的内容一个字都不许动」的负例）

**尚未做（后续会话）**：真实内容迁移（旧 SQLite → 新站，含 Markdown→Portable Text 转换与 ID 映射表）、部署切换（Phase 6 的最后一步：切流量，等用户指令 + 雷池 WAF 放行）。Phase 5（会员/QQ 登录/点赞/收藏/留言墙）与 Phase 6 的**准备工作**已完成：部署 runbook 见 `night-work/DEPLOY.md`，本机已用数据库副本跑通生产模式冒烟（13/13，含 dev 端点在生产返回 403）。

## Phase 3 迁移映射（进行中）

字段与分类法的完整映射表见 `night-work/PHASE3-MAPPING.md`（依据旧站 Drizzle schema 与新站 seed 逐列核对）。要点：

- **URL 保持**：新站 `/posts/{slug}`、`/life/{slug}` 与旧站一致；旧站只有 `/article/:id`、`/life/:id`、`/life-detail/:id` 三个数字入口需要 301 到新 slug（旧站**没有**作品详情路由）。
- **正文**：旧站 Markdown → Portable Text（`scripts/lib/markdown-to-portable-text.ts`，18 项回归）。
- **图片**：旧站 `/uploads/*` 经媒体 API 入库，正文与封面里的旧路径统一改写。
- **会员与互动**：`members`/`member_identities` 进插件存储（`qqOpenid` 取旧站 provider_subject），`member_likes`/`member_favorites` 进 `activity`（`article→posts` 等目标类型映射 + 数字 ID → 新 ULID 映射）。
- **评论**：`published→approved`、`pending→pending`、`hidden→spam`；有会员的评论用会员派生身份邮箱（与 Phase 5.4c 一致），自动归到会员名下。
- **友链**：旧站存在设置项 `friends.items`（JSON 数组），迁移脚本转成 Portable Text 写进新站 `friends` 页面（过滤非 http(s) 地址；`PUT` 写的是草稿修订，写完要再发布才可见）。
- **不迁移**：管理员密码与会话（新站用 passkey 重建）、旧站浏览量、旧站作品详情（不存在）。

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
### Phase 3 — 文章迁移（工具已就绪，等真实数据）
- **迁移脚本已写好并用合成数据全链路验证**：
  - `scripts/migrate-from-blog-front.mjs`：旧 SQLite → REST 导入（posts/life/projects/comments 四阶段），Markdown 正文用 core 内置 `markdownToPortableText` 转换；分类/标签映射到 seed terms（缺失标签自动 `POST /taxonomies/tag/terms` 补建）；封面图 `--old-uploads` 上传媒体库；`publishedAt/createdAt` 随条目写入；409 slug 冲突幂等跳过；**每次运行导出 `.migration/mapping.json`（旧 id → 新 ULID），会员点赞/收藏将来靠它对账，务必备份**
  - `scripts/test-fixture-old-blog.mjs`：生成合成旧库做 dry-run
  - `scripts/e2e-rest-path-test.mjs`：dev-bypass cookie 走通 create→publish→comment→trash→purge 全链路（已验证全绿）
- 真实导入步骤（下次会话）：
  1. `scp duanap-server:/srv/apps/duanap/blog-front/*/server/data/blog.sqlite .`（或宝塔路径）+ `server/uploads/` 目录
  2. `--dry-run` 审阅转换报告与警告
  3. 后台生成 PAT（需 content:create/publish_any/media 权限）→ 正式运行 → 抽查正文/图片/URL
- URL 切换：`urlPattern /article/{slug}` + `src/pages/posts/` → `article/` 移动 + seed redirects（导入完成后做）
- 已验证的 API 事实：create 只收 draft（`data.item.id` 返回形状）；publish 是独立端点；评论字段是 `authorName/authorEmail/body`（email 必填，迁移用 `old-<id>@migrated.duanap.cn` 占位）；byline 引用需运行时解析 ULID（seed id 只是引用键）

### Phase 4 — 生活/作品/静态页迁移（✅ 页面骨架已完成；真实数据替换占位时复用导入脚本）
### Phase 5 — 会员与互动（**决策已定：方案 B，EmDash Native 插件**，2026-10-01 用户拍板）
- **可行性 spike 已完成，三个关键能力全部实测通过**（POC：`member-plugin/index.ts` + `/poc` 验证页）：
  1. ❌ **公开带 Cookie 路由（2026-09-30 复核：原结论不成立）**：Native 插件（descriptor `format:"native"` + `definePlugin`）路由挂 `/_emdash/api/plugins/{id}/*`，`public:true` + `response:"raw"` 确实能**读**请求 Cookie，但**响应侧 `Set-Cookie` 会被宿主丢弃**——`packages/core/src/plugins/route-wire.ts` 的 `ALLOWED_RESPONSE_HEADERS` 白名单只放行内容类头与 `Location`。同时 raw 路由**不能返回 HTML**（`text/html` 属活跃同源类型，实测 `auth/qq/start` 返回 500 `INVALID_PLUGIN_RESPONSE`），公开 raw 路由的 `Location` 也**不能跨域**。→ **Cookie 会话 + 跳 `graph.qq.com` 的 OAuth 在插件路由里无法实现**。沙箱插件连请求侧 Cookie 都拿不到，必须 Native（这一点仍成立）。上游 `main`（18d6aa3f0）同样如此；方向待决策，见 `night-work/PROGRESS.md`
  2. ✅ **页面注入**：`page:fragments` hook（capability `hooks.page-fragments:register`）向所有公开页面注入 inline/external script 和 HTML（Base.astro 的 EmDashHead/BodyStart/End 已渲染）
  3. ✅ **SSR 会员上下文**：同进程直接 import 插件模块导出的辅助函数；ctx 在 hook/route 捕获到模块级变量复用（Node 部署安全）。**页面导入说明符必须与虚拟模块一致**（Vite 根相对 `/member-plugin/index.ts`），否则双实例状态不共享
- 实测坑：raw 响应 body 是 `{kind:"text"|"bytes", value}` tagged 形式；存储 `orderBy:{field:"dir"}` 对象形式且字段必须已声明索引；**Native 插件改动不热更，需重启 dev**；`plugin:activate` dev 下不保证触发（用 page:fragments/路由兜底捕获 ctx）；raw 公开路由 `location` 头默认限制同源（跨域回调桥需查 `allowExternalLocation`）
- 实施子阶段（每步落地后下线对应旧 Fastify 能力）：
  - **5.1** QQ OAuth 插件：state 存 ctx.kv + `auth/qq/start|callback` 公开路由 + members/identities/sessions 存储集合 + 登录岛（复用旧站 callback-bridge 双域机制；QQ secret 用 emdash secrets 管理）
  - **5.2 ✅ 留言墙**：**复用 EmDash 原生评论**而不是插件存储（旧站同样是复用 comments 表）。seed 新增 `wall` 集合（`commentsEnabled`）+ 唯一公开条目作为评论目标 + 导航「留言墙」；`src/pages/messages.astro` 服务端取已审核留言渲染卡片，表单复用 `CommentForm`。提交进 `pending`，**审核直接用后台「评论」页**（按 collection=wall 过滤）。已知差异：核心评论 schema 要求 `authorEmail`，所以表单比旧站多一个必填邮箱（公开 API 不返回邮箱，已在表单下说明）
  - **5.3 ✅ 点赞/收藏**：插件 `activity` 集合（点赞与收藏共用表，`kind` 区分；记录 id = `kind:openid:targetType:targetId`，**主键即唯一约束**，幂等无需复合索引）+ 公开路由 `activity/state`、`activity/toggle`（需会员会话，用 `content:read` 校验目标已发布）+ `MemberActivity.astro` 卡片岛（文章/生活/作品详情页）。**匿名访客 SSR 零查询**（计数由客户端拉取），仅会员注入开关态。旧站还支持给评论点赞，本次未做
  - **5.4 ✅ 会员中心页**：`/member`（资料卡 + 点赞/收藏计数 + 收藏列表，可取消收藏；页头会员岛下拉指向它）。数据走插件公开路由 `GET member/overview`，页面**客户端渲染**——页面 frontmatter 早于布局渲染，拿不到 `page:fragments` 捕获的 ctx（实测预热进程也拿不到），路由自带 ctx 始终可靠；页面私有且 noindex。资料可编辑（昵称 1–40 / 头像必须 HTTPS / 简介 ≤200，规则对齐旧站 `PATCH /api/member/profile`）：会员记录带 `customizedFields`，**用户改过的字段 QQ 登录不再回写覆盖**。**我的评论**：EmDash 评论按 `authorEmail` 归属而会员没有邮箱，插件也不能创建评论、`comments.list` 也不能按邮箱过滤 —— 因此给每位会员派生一个稳定身份邮箱（`member-<sha256(openid) 前 16 位>@members.duanap.cn`，不暴露 openid），登录会员的评论表单自动预填该身份，`comment:afterCreate` 钩子据此把评论记进 `memberComments`，会员中心按当前状态展示。（钩子需要 `users:read`，否则宿主静默跳过。）**评论点赞**：复用同一张 `activity` 表（`targetType=comment`），存在性用 `comments:read` 校验，`activity/state` 支持 `targetIds` 批量取回按钮状态；评论不能收藏。**旧 Fastify 退役**依赖 Phase 6 部署，冻结中
- 会员数据迁移：members/identities/likes/favorites 按映射表导入插件存储（content 目标 id 用 `.migration/mapping.json` 换算）
- 评论已原生；旧评论数据导入 `POST /_emdash/api/comments`（占位 email `old-<id>@migrated.duanap.cn`）
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

