# duanap.cn 博客迁移计划（blog-front → EmDash）

> 起始日期：2026-09-30
> 旧项目：`duanap/blog-front`（Vue 3 + Fastify + Drizzle/SQLite，本地副本 `C:\Users\18282\Documents\ChatGPT\blog`）
> 新项目：本仓库（`duanap/emdash` fork，站点在 `demos/blog`，包名 `duanap-blog`）
> 旧站线上：`duanap.cn` / `blog.duanap.cn`（systemd `blog-front.service`，端口 4321，**迁移完成前保持运行**）

## 总体策略

**在 fork 内开发（官方支持的工作流）**：站点位于 `demos/blog`，通过 `workspace:*` 链接 `emdash` 核心包——core 有问题可以直接改源码，且 `demos/` 目录上游几乎不动，以后同步上游不会冲突。

**逐阶段切换**：每个阶段独立可验证；旧站全程在线，最后一步才切 `blog.duanap.cn` 流量，保留回滚能力。

**免费获得的能力**（不自己写）：管理后台（`/_emdash/admin`）、REST API（`/_emdash/api/*`）、媒体库、全文搜索、草稿/修订/定时发布、sitemap/robots/RSS（core 自动注入）、回收站软删除。

## 现状（Phase 0 已完成 ✅）

- [x] fork 同步到上游最新 `0b9426e1`（快进 943 个提交，无冲突）
- [x] `templates/blog` → `demos/blog`，包名 `duanap-blog`
- [x] 本机工具链：Node 24.21.0 + pnpm 11.9.0（`~/tools/node-v24.21.0-win-x64`，免安装器）
- [x] `pnpm install` + dev server 验证通过（演示内容可访问）

开发命令（每次新终端需先 `export PATH="/c/Users/18282/tools/node-v24.21.0-win-x64:$PATH"`）：

```bash
cd V:/EmdashBlog/demos/blog && pnpm dev   # http://localhost:4321
# 管理后台 http://localhost:4321/_emdash/admin
# dev 跳过 passkey 引导: /_emdash/api/setup/dev-bypass?redirect=/_emdash/admin
```

## 关键设计决策

| 决策 | 结论 | 理由 |
|---|---|---|
| 文章 URL | `posts` 集合 `urlPattern: "/article/{slug}"` | 旧站文章路径是 `/article/:slug`，改 urlPattern 即可原样保留 SEO |
| 生活记录 URL | `life` 集合 `urlPattern: "/life/{slug}"`，迁移时 slug 用旧数字 id | 旧站 `/life/123` 不变 |
| 正文格式 | Markdown → Portable Text 转换后入库 | 用 EmDash 原生富文本渲染/编辑；转换脚本用 remark |
| 文章卡片 | 沿用模板 `PostCard.astro`（16:10 封面 + byline + 标签） | 用户认可 EmDash 演示站卡片风格，只调主题色 |
| 视觉主题 | 移植 blog-front 的 design tokens（米白底 `#f6f4ee` + 墨绿 `#426253` + 赭石 `#a97954`、Noto Serif SC 正文、暗色模式） | 保留旧站视觉辨识度；改 `src/styles/theme.css` 即可 |
| 会员/QQ 登录 | **过渡期保留 Fastify**，长期做 EmDash 插件 | EmDash auth 是 passkey/OAuth 体系，面向编辑者；QQ 登录+点赞+收藏+留言墙是站点会员业务，先用插件机制（参考 `packages/plugins/plugin-forms`）或继续 Fastify |
| 评论 | 迁到 EmDash 原生评论（`commentsEnabled` + `emdash/ui/comments`） | 模板原生支持，免去自维护审核流 |
| 旧内容 ID 映射 | 导入脚本维护 `old_id → 新 ULID` 映射表（导出 JSON 存档） | 会员点赞/收藏表按 `targetType+oldId` 关联，切换互动后端时靠映射表保数据 |
| 部署形态 | Node.js standalone（`@astrojs/node`），非 Docker，新 systemd 单元 + 端口 4322 | 与旧站并存，Nginx 只切 `blog.duanap.cn` |

## 阶段计划

### Phase 1 — 视觉移植（改 CSS 为主，不动结构）
- 把旧站 `src/styles/variables.scss` 的 token 映射进 `src/styles/tokens.css`/`theme.css`（颜色、圆角、双字体、暗色模式变量）
- 字体改为 Inter + Noto Serif SC（`astro.config.mjs` fonts 配置）
- 页头/页脚按旧站导航与备案信息调整（EmDash 用菜单 + widgetAreas，改 seed）
- 产出：新站视觉与旧站一致，保留 EmDash 卡片排版

### Phase 2 — 内容模型扩展（改 `seed/seed.json`）
- 新增集合：`life`（record_date、allow_comment、pinned 等）、`projects`（tech、screenshots、stars、featured、preview、show_code、sort_order 等）
- 导航菜单、页脚、关于页内容入 seed（menus/widgetAreas/pages）
- 注意：改模型后执行 `npx emdash types` 重新生成 `emdash-env.d.ts`
- 产出：后台可维护三类内容

### Phase 3 — 文章迁移（一次性脚本 + 抽查验证）
- 从旧 SQLite 导出文章（含图片下载到媒体库、Markdown→Portable Text、slug/发布时间/分类标签保留）
- 走 REST `POST /_emdash/api/content/posts`（Bearer token），或写成 seed content 一次性导入
- 迁归档页（EmDash 有 archives widget 组件可参考）
- 产出：旧站全部文章在新站可访问，URL 不变

### Phase 4 — 生活/作品/静态页迁移 + 前台页面补齐
- life 瀑布流页、projects 作品页（3D 轮播可后置简化）、about、friends、404
- 首页三区块（最新文章/生活/精选作品）+ 站点统计
- 产出：内容面迁移完毕，新站可独立成站

### Phase 5 — 会员与互动（决策点，动手前再评估）
- 评论切 EmDash 原生；旧评论数据导入 `comments` API
- QQ 登录/点赞/收藏/留言墙：优先评估 EmDash 插件化（plugin API 支持 hooks/存储/后台 UI/API 路由）；工作量过大则保留 Fastify 服务并行，前台调旧 API
- 需要 `members`/`member_likes`/`member_favorites` 等表的 old ID 映射
- 产出：互动功能可用，会员数据无损

### Phase 6 — 部署切换（单一变更窗口）
- 前置：**雷池 WAF 放行本机出口 IP**（上次部署失败原因，需人工在控制台操作）
- 服务器 `/srv/apps/duanap/blog-emdash` 新发布目录 + systemd `blog-emdash.service`（端口 4322）+ 独立 `data/`、`uploads/` 持久目录 + `EMDASH_ENCRYPTION_KEY`（丢失不可解密，需备份）
- 生产环境先跑 `npx emdash setup` 建管理员（避免公开 setup 向导被抢注，Nginx 可临时加 Basic Auth 保护 `/_emdash/admin`）
- Nginx 只切 `blog.duanap.cn` → 4322，旧站配置保留；EdgeOne 刷新缓存；验证 sitemap/RSS/文章 URL/图片
- 回滚：Nginx 切回 4321 即可

## 风险清单

1. **Markdown→Portable Text 转换**是内容保真关键：代码块、表格、图片、链接需逐项抽查（旧站正文是手写 Markdown 渲染器，无语法高亮，新站用 Shiki 反而是升级）
2. **会员互动数据**依赖旧 ID 映射，Phase 3 导入脚本必须导出映射表存档
3. **服务器 GitHub 直连不通**（无代理）：大文件（模板/依赖）需本机下载后 scp 上传，沿用上次的做法
4. **Windows 本地开发**构建慢：生产构建建议在服务器或 CI 做，本机以 dev 验证为主
5. **上游更新**：定期 `git fetch upstream && git merge --ff-only upstream/main`（只有 fork 无自有 core 改动时才安全 ff；若改过 core 需 rebase 评估）

## 旧站资产速查（迁移输入）

- 页面清单/路由/视觉 token/API 端点/数据库 schema：见仓库外调研记录 `C:\Users\18282\Documents\ChatGPT\blog`（`src/router/index.ts`、`src/styles/variables.scss`、`server/src/db/schema.ts`、`server/src/db/seed.ts`）
- 备份要点：`server/data/blog.sqlite` + `server/uploads/`
- 旧站 SEO 文件由 Fastify 启动时写入 dist；新站 sitemap/rss/robots 由 EmDash core 自动注入，无需迁移脚本
