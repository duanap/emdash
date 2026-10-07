# duanap-blog 项目进度

更新时间：2026-10-01。本文件是当前进度入口，随代码保存在 Git 中。
实施范围见 [MIGRATION.md](./MIGRATION.md)，部署步骤见 [DEPLOY.md](./DEPLOY.md)。

## 本地状态

工作目录 `V:\EmdashBlog`，分支 `feat/blog-phase5-members`。
审核起点为 `d2add2e35`，比远端 main 多 31 个本地提交；本轮修复尚未提交、推送或部署。
当前聊天 worktree 是旧的 POC 快照，不能据它判断最新功能进度。

- [x] 视觉、内容模型和前台页面。
- [x] Native 会员插件、QQ OAuth 状态机、会话、资料编辑、点赞收藏、会员中心。
- [x] 原生评论留言墙、双轨动画和中文文案兜底。
- [x] 备用迁移工具和旧数字 URL 路由；旧数据导入已从上线范围移除。
- [x] 登录页及会员导航使用 DOM/textContent 渲染会员资料，站内 returnTo 校验。
- [x] 收藏准确计数和分页；评论点赞每批最多 50 个目标。
- [x] 部署前保存旧产物、按实际数据库路径备份，失败恢复产物。
- [x] 补齐 EMDASH_SITE_URL，统一 .env 和数据目录约定。
- [x] 根目录构建、站点生产构建、全部 demo 类型检查、quick lint 和 146 项回归通过。
- [!] 全量类型感知 lint：59 条诊断（41 错误、18 警告），集中在迁移/备份脚本、会员插件的数据断言与少量工具；未把全量 lint 标为通过。本轮没有批量修改范围外文件，不提交代码。
- [ ] 新实例生产初始化、源站/公网验证及流量切换。
- [ ] 上线后配置 QQ 并验证真实授权回调。

## 生产状态（审核时只读验证）

旧站 `blog-front.service` active，监听 `127.0.0.1:4321`，源站 `/api/health` 和公网首页均为 200。
4322 未监听，新站尚未运行。此记录是 2026-10-01 的检查结果，部署前仍需现场复核。

## 验证边界

新增回归覆盖恶意昵称和 returnTo、121 条评论、超过 100 条互动，以及部署成功/构建失败/健康检查失败/重启失败。
部署脚本回归使用隔离临时目录和模拟系统命令，不会启动生产服务；它不能替代实际服务器验收。
QQ 测试覆盖状态机和宿主响应处理，不代表已完成 QQ 互联的真实授权测试。
PostgreSQL 测试需通过 EMDASH_TEST_PG 配置真实实例，本轮没有配置 PostgreSQL。
生产产物在隔离空库上初始化返回 200，setup/auth 两个 dev-bypass 返回 403。
严格 lint 的详细诊断保存在 [LINT-RESULTS.md](./LINT-RESULTS.md)，应作为单独的后续任务处理。

## 历史记录

主目录 `night-work/` 保存此前夜间日志、截图和迁移细节，并被本地 `.git/info/exclude` 排除。
它是历史资料，新的 worktree 和远端 clone 以本文件为准。

## 本次生产部署（2026-10-01，等待连接恢复）

用户授权部署到 blog.duanap.cn，不导入旧数据，并在部署验证完成后关闭电脑。
旧站数据、上传与 Nginx/systemd 配置已备份到服务器和本机。
新发布包 emdashblog-d2add2e35-fixed-20261001T021326 已上传并校验，601 个 Linux 依赖安装完成。
服务器构建期间开始出现 SSH 握手超时和源站 HTTP 超时；已中断本机的构建连接，但无法核实远端构建是否停止或完成。
新服务尚未启动，博客流量未切换，电脑未关机。主域名和 www 的线上配置没有修改。
新的部署配置补齐 HTTPS 转发域名和规范站点地址；本地 astro check 为零错误。
恢复连接后先只读检查 build.log、内存/交换分区、构建进程和旧站健康，再启动新服务、初始化内容、验证并切换博客域名。
当前没有已登录云控制台或配置好的 Aliyun CLI，需用户提供控制台诊断结果或恢复 SSH。
本机状态文件：C:\Users\18282\Documents\Codex\DeploymentBackups\EmdashBlog\2026-10-01\deployment-status.json。

## 2026-10-01 下午：上线及服务器诊断完成

- 本机构建产物已部署到 blog.duanap.cn，服务 blog-emdash.service 监听 127.0.0.1:4322。Linux 运行依赖在服务器安装，构建输出的文件路径已迁移到实际发布目录。
- 17 项公网检查通过；页面/RSS/sitemap/robots/会员状态返回 200，生产 dev-bypass 返回 403，后台未认证返回 401。CSS、JS 和封面 SVG 下载正常。
- CDN 只刷新 blog.duanap.cn，用户明确批准后执行，任务 3vnpq46ph5pa 已 success。主域名、www 和其他站点未切到新站。
- 新站使用演示内容，没有导入旧数据；旧数据及配置保留作回滚备份。首次管理员仍需用户完成 passkey 创建，外层临时访问凭据位于本机 DeploymentBackups/EmdashBlog/2026-10-01/admin-access.txt。QQ 仍未配置。
- 新进程测得常驻约 115 MB、峰值约 128 MB，NRestarts=0；设置 MemoryHigh=384M、MemoryMax=640M、CPUQuota=100%（一颗 CPU）。
- 历史 sar：负载最高 66.08、I/O 等待最高 81.62%、磁盘利用率最高 96.74%、等待队列约 256、最多 71 个阻塞进程；可用内存由约 710 MB 降至 200 MB，swap 未使用，swappiness=0。journald 看门狗超时。证据支持内存/文件缓存压力引起磁盘拥塞，未发现明确 OOM kill，不能证明是哪一个原生打包线程导致。
- 自有 21 个服务改由 duanap-boot-*.timer 在开机后 45–225 秒依次拉起；原 service 自动启用已关闭，但正在运行的应用没有重启。基础设施、mhsp 和朋友的 ynwykj 服务未改。
- timer 语法校验和隔离无业务测试通过（实测约 3 秒间隔）；未为验收重启生产机器，因此下次真实重启的峰值尚未测量。
- 诊断、部署、错峰计划和回滚备份保存在本机 C:\Users\18282\Documents\Codex\DeploymentBackups\EmdashBlog\2026-10-01。

## 2026-10-01：duanap.cn 博客入口

按用户确认，将 duanap.cn 作为新博客入口，301 跳转到 https://blog.duanap.cn，保留路径与查询参数。
www.duanap.cn 保持旧站；为其保留现有 QQ 回调桥。现有 passkey 和正式站点 URL 未变。
配置先备份、nginx -t 后 reload，没有重启应用或改动数据库。回滚备份目录为 /srv/apps/duanap/blog-emdash/backups/apex-entry-20261001T151211。
CDN 仅在用户明确批准后刷新 duanap.cn，任务 3vnt6b4isqou；不刷新 www 或其他域名。
电脑关机已由用户取消，后续没有再次安排。

## 当前域名状态（2026-10-01，直接访问，替代此前跳转方案）

按用户最新要求，duanap.cn、www.duanap.cn、blog.duanap.cn 都直接反代到同一个 EmDash 实例（4322）。首页和前台页面返回 200，没有跨域 Location 跳转；菜单内链保留当前域名。
新增 EMDASH_PUBLIC_ORIGINS 配置受信任的反代公开域名，在本机构建后上传纯 JS/静态产物，没有在服务器构建。
EMDASH_SITE_URL 与现有 passkey RP ID 保持 blog.duanap.cn；已注册管理员和数据库未迁移、未重置。后台继续使用 https://blog.duanap.cn/_emdash/admin，不把已有通行密钥视为自动适用于根域名或 www。
24 项源站及 27 项公网检查通过：页面、RSS、sitemap、会员状态正常，后台匿名 401、生产 dev-bypass 403。公网已经 MISS 获取新内容，本次没有刷新 CDN。
此前 duanap-blog-entry.conf 跳转配置和旧 www 站点配置已移至备份目录，统一使用 blog-emdash.duanap.cn.conf 的三个 server_name。
回滚备份：/srv/apps/duanap/blog-emdash/backups/direct-domains-20261001T155340，含前版产物、环境变量、Nginx 配置和一致数据库备份。
电脑关机取消状态保持不变。

## 2026-10-01：首页沉浸式轮播上线

导航栏与“最新文章”之间的图文推荐区已替换为全宽封面轮播，支持淡入淡出、7 秒自动播放、暂停、前后切换、圆点选择、键盘方向键和手机横向滑动。悬停、焦点进入和页面隐藏时暂停自动播放；减少动态效果偏好下默认暂停。

轮播复用首页最新 5 篇文章的数据，从有封面的文章中取最多 4 篇，不增加首页内容查询。最新文章区展示最新 3 篇。只有一张封面时静态展示，没有封面时不显示轮播。维护文章封面即可更新轮播，目前生产数据提供 2 张轮播图；本地预览有 3 张。

13 项交互回归测试、轮播脚本与测试的 scoped lint、站点生产构建和 Astro check 通过（46 个文件，零错误、警告和提示）。本地桌面及 390×844 手机预览检查通过。全量类型感知 lint 的 59 条诊断仍见 LINT-RESULTS.md，没有把它标为通过；代码尚未提交或推送。

产物在本机构建后上传，仅重启 blog-emdash.service，没有修改数据库、环境变量或 Nginx。三个域名的公网首页均返回 200/MISS，包含新轮播，旧 featured-section 已移除；CSS 和脚本资源正常。服务 active/running，NRestarts=0，最后检查内存约 126 MiB。线上浏览器交互检查受连接超时限制，交互验收来自同版代码的本地预览。

回滚备份：/srv/apps/duanap/blog-emdash/backups/homepage-carousel-20261001T171132。回滚界面时将当前发布目录的 dist 移到另一个目录，恢复备份中的 dist.before 为 dist，再重启 blog-emdash.service；不覆盖数据库。

本机部署包、公网检查结果及预览图位于 C:\Users\18282\Documents\Codex\DeploymentBackups\EmdashBlog\2026-10-01，文件名以 homepage-carousel 开头。电脑关机仍为取消状态。

## 2026-10-01：默认图片、手机导航和备案设置

- 文章默认封面使用室内写作兔子，生活记录默认封面使用户外兔子，按原尺寸转为 WebP。第三张图按像素拆成透明头像和项目图标，保存在 public/defaults；没有重新绘制。卡片、详情页及轮播替换缺图和原演示 SVG 占位图，保留自定义媒体；项目默认图标完整显示，用户、作者和评论使用默认头像兜底。
- 手机顶部仅保留 Logo、站名、搜索、夜间模式和登录；底部固定横条复用菜单，溢出时横向滑动，预留安全区域。搜索支持展开、实际查询、Escape 和 Ctrl/Cmd+K；主题切换与页脚选择共享 cookie。长轮播标题不再被 flex 布局压缩截断。
- 页脚“导航”替换为“ICP备案、公安备案”。后台“设置 → 常规 → ICP备案、公安备案”可添加最多 20 条文字和 HTTP(S) 链接，并从媒体库选择或上传图标。设置存入现有网站设置，无新增访客查询和数据库迁移；未填写实际备案号码，没有创建虚构备案信息。
- 根目录构建、站点生产构建、站点及 admin 类型检查通过；60 项相关 Vitest 测试、默认封面选择验证和全仓 quick lint 通过，新增核心代码的 scoped type-aware lint 无诊断。全量严格 lint 的既有记录仍见 LINT-RESULTS.md。桌面、390×844 手机及阿拉伯语 RTL 布局已检查，实际图标上传和设置保存通过。
- 第一次切换因构建时带入本地 SQLite 路径打开空库，封面检查失败后自动恢复。原生产数据库未覆盖。重新显式设置生产数据库、上传目录、正式 URL 和公开别名；打包及服务器解压时验证 bundle 的数据库路径，匹配后才切换。构建仍只在本机执行。
- 最终产物 SHA256 为 10104bdc0c0ca255ec94a1cddd66f5c205f9004e27629de7f07d6201b565c125。三个域名源站检查通过，公网首页返回 200/MISS，四张默认图片可访问；生产 dev-bypass 为 403，未认证设置 API 为 401。没有修改 Nginx、运行环境或旧站数据，没有刷新 CDN。
- 本次备份为 /srv/apps/duanap/blog-emdash/backups/mobile-defaults-20261001T112449Z。若需恢复整个改版前的页面，使用 mobile-defaults-20261001T111659Z：停止 blog-emdash.service，保存当前产物，再恢复 dist.before、core-dist.before 和 admin-dist.before 到发布目录 dist、vendor/emdash/dist、vendor/emdash-cms-admin/dist，启动服务并检查源站和公网。无需覆盖数据库。
- 本机部署包、检查结果和手机预览图以 mobile-defaults 或 mobile-header 开头，存放在 DeploymentBackups/EmdashBlog/2026-10-01。代码没有提交或推送，电脑关机仍已取消。

## 2026-10-01：沉浸式顶部导航

首页有轮播时，顶部导航直接覆盖封面，顶端背景透明且无模糊；开始滚动后恢复半透明背景并启用 12px 高斯模糊，返回顶端再次透明。导航文字在透明状态使用浅色，封面顶部增加遮罩保证可读性。其他页面保留常规导航，手机底部横条继续使用原布局。无需新增数据库查询。

19 项导航和轮播测试、站点类型检查及本机构建通过，修改脚本与测试的类型感知 lint 无诊断。桌面和 390×844 手机实测顶端背景 rgba(0,0,0,0)、backdrop-filter 为 none，滚动后为 blur(12px)；搜索可返回内容，无横向页面溢出。

仅替换 dist 和三个前台源码文件，保留依赖、Nginx、环境与数据库。源站三个域名均返回新首页。备份目录：/srv/apps/duanap/blog-emdash/backups/immersive-header-20261001T141914Z。回滚时停止 blog-emdash.service，保存当前 dist，再把 dist.before 恢复到发布目录 dist，恢复 src.before 中的三个文件并启动服务；不要覆盖数据库。

本机部署包、预览图和公网检查记录以 immersive-header 开头，位于 DeploymentBackups/EmdashBlog/2026-10-01。产物 SHA256：679ac3558365894c7913ffd148d9154998b6aae4fad6c1eed8c99fe0cb7731a7。

## 2026-10-01：页脚、轮播管理、网站地图与文章分页

页脚移除“关于本站”、EmDash 署名和底部主题选择器，保留站点信息、备案信息和订阅三个等宽区域，手机端也保持三列；订阅增加 /sitemap.xml。只移除对应区域的渲染，未删除小部件或内容数据。

后台“设置 → 常规”新增首页轮播编辑器，可上传或选择图片、设置标题、说明和站内或 HTTP(S) 链接，并调整顺序。设置保存为 heroSlides，复用现有网站设置查询；没有自定义轮播时回退到文章封面。网站地图按钮会即时生成并验证索引和子地图，只包含已发布、允许索引的内容，并记录 sitemapUpdatedAt。地图响应要求重新验证；生成接口需管理员权限和现有 CSRF 保护。

全部文章改为电脑三列首页同款卡片，手机每行一篇、左图右文字；每页最多 9 篇，使用现有 cursor 查询和上一页/下一页链接，不增加内容查询轮次。隔离本地验证库添加符合正式发布时间格式的内容后，12 篇分为 9＋3，前后页无重复，上一页正确恢复。原本地库和生产库未加入验证条目。

根目录构建、admin 与站点类型检查、站点生产构建及 48 项相关测试通过；全仓 quick lint 为零，新增代码与测试的 scoped type-aware lint 为零。桌面、390×844 手机和阿拉伯语 RTL 布局已检查。真实图片上传、保存、自定义轮播跳转和网站地图按钮在本地通过，按钮生成 5 个集合、20 条链接。全量严格 lint 的既有记录仍见 LINT-RESULTS.md。

三个域名首页、文章列表、地图索引及子地图公网检查通过；首页为 200/MISS，当前生产文章数为 7，未人为添加生产文章验证分页。未认证的网站地图生成请求为 401。只更新前台和 core/admin 产物及源码；保留运行环境、Nginx、现有数据库、账号和上传文件，没有执行 CDN 刷新。

备份目录：/srv/apps/duanap/blog-emdash/backups/footer-carousel-posts-20261001T154210Z。回滚时停止 blog-emdash.service，保存当前目录，再恢复 dist.before → dist、src.before → src、core-dist.before → vendor/emdash/dist、core-src.before → vendor/emdash/src、admin-dist.before → vendor/emdash-cms-admin/dist，启动服务并验证首页、/posts 和 /sitemap.xml；无需覆盖数据库。

本机部署包、公网证据和预览图位于 DeploymentBackups/EmdashBlog/2026-10-01，文件以 footer-carousel-posts、posts-mobile 或 carousel-admin 开头。最终产物 SHA256：0879b52dd0690f60766010ae5505fb8fede2d191e21317a696806b3ee2ee94a3。代码未提交或推送，电脑关机仍已取消。

## 2026-10-02：轮播入口、留言墙、手机布局和 Lucide 图标

后台设置首页新增“首页轮播图”入口，跳到常规设置；轮播编辑器移到该页最上方，支持上传图片、填写链接和调整顺序。留言墙改为读取最早发布的 wall 条目，以内容 ID 关联评论，不再依赖固定 slug；/wall/{slug} 预览入口跳到 /messages 并保留查询参数。部署后核实当前生产 slug 为 messages。原 CMS 自动规则仍将旧 /wall/test 跳到 /wall/messages，再进入 /messages；旧规则第一跳不保留查询参数，没有修改该规则或内容数据。

手机首页文章、生活记录和作品每行两张、最多四张；查看更多放到区块底部居中。首页卡片完整显示封面，轮播高度随当前图片原始比例变化；手机页脚三块按三行一列显示。前台及整个管理后台改用 Lucide，包括 Kumo 内部图标；原有封面、头像、项目插画和已保存的图标名称继续兼容。未增加访客数据库查询轮次。

根目录构建、admin 和站点生产构建、admin 类型检查通过；Astro check 为 51 个文件、零错误、警告和提示，28 项相关测试通过。全仓 quick lint 与新增图标适配代码的 scoped type-aware lint 无诊断；全量严格 lint 的 59 项诊断仍见 LINT-RESULTS.md。桌面及 375px 手机本地预览检查了布局、自然图片比例、轮播入口和留言墙改名场景。线上浏览器工具持续超时，未自动化生产 passkey 登录；后台交互依据同版代码的隔离本地预览验收。

本机构建、校验生产数据库路径后，仅部署站点 dist、src 与 admin dist。三个域名各自的首页、留言墙、文章列表、预览跳转、未认证设置接口、生产 dev-bypass 和 CSS/JS 共 33 项公网检查通过，动态页面为 200/MISS。服务 active/running，NRestarts=0，最后内存约 207 MiB，负载 0.22/0.21/0.15。数据库和上传文件保留，未修改 Nginx、运行环境、内存限制或开机错峰设置，未刷新 CDN。

回滚备份：/srv/apps/duanap/blog-emdash/backups/home-wall-lucide-20261002T022622Z。停止 blog-emdash.service，将当前 dist、src 和 vendor/emdash-cms-admin/dist 移到保留目录，再依次恢复 dist.before、src.before 和 admin-dist.before，启动服务并验证首页、/messages、/posts 和预览跳转；不要恢复数据库备份覆盖新内容。

产物 SHA256：f8d92e665f65144f10cb846c9f1238fbda754549b9bd56c72de922be914e6a02。本机部署证据、回滚说明和预览截图位于 DeploymentBackups/EmdashBlog/2026-10-02，文件以 home-wall-lucide、admin-carousel-entry 或 mobile-home-lucide 开头。代码未提交或推送，电脑关机仍已取消。

## 2026-10-02：轮播自定义、WebP 上传和 QQ 回调兼容

首页轮播移到独立后台页面 /_emdash/admin/settings/carousel，分为“播放与画面”“文字样式”“图片与链接”，每张轮播图可折叠。播放间隔支持 2–60 秒；模糊 0–30 像素、遮罩 0–100%、九种文字位置、电脑与手机标题字号及说明字号可分别调整。电脑和手机可单独设置 160–1200 像素的高度，0 表示按原图比例自动显示；图片保持完整显示。保存只提交轮播字段，常规设置保存不带轮播字段。独立页面提供第一张图片的样式预览。

后台统一上传入口及外部媒体提供者上传入口自动把静态 JPEG、PNG、BMP、AVIF、SVG 转为 WebP，质量 85%，最长边不超过 2560 像素，保留透明度。已上传媒体不改写；GIF、APNG 和现有 WebP 保留原字节，避免丢失动画；同文件名的原图编辑保持原格式，兼容原图替换接口的 MIME 校验。

轮播使用 /covers/{原存储键}.webp?w={宽度} 按 480、960、1600、2560 像素提供 WebP。源图片直接从本地存储读取，无外部下载或首页新增数据库查询；副本缓存到 uploads/.carousel-cache 一小时，生成任务串行并合并重复请求，已预热生产两张轮播的四种尺寸。先加载当前图片，再加载下一张。原图 1,630,266 和 2,084,003 字节，1600 像素输出为 76,738 和 144,770 字节，减少约 95.3% 和 93.1%。

QQ 配置未被识别的原因是后台登记了 https://duanap.cn/oauth/qq/callback，插件仅接受其内部回调路径。新增兼容入口并保留登记地址，Client Secret 和原有配置不修改。登录在登记的回调域名启动；来自 www 或 blog 的登录通过 60 秒有效、绑定目标域名、原子消费一次的票据返回原域名，Cookie 保持 host-only、HttpOnly 和 Secure。回调继续校验 state 与 Cookie，不接受外站返回地址。Nginx 仅新增该兼容回调 location，关闭其访问日志，避免记录授权 code/state。

根目录构建、生产站点构建和 admin 类型检查通过，Astro check 为 56 个文件零错误、警告和提示。32 项轮播/缓存/QQ 测试及 28 项 admin 上传/常规设置浏览器测试通过；浏览器测试使用本机 Edge，验证真实 WebP 编码、透明像素和尺寸。quick lint 与新增轮播代码 scoped type-aware lint 为零；全量严格 lint 当前 78 项，详见 LINT-RESULTS.md，未将其标为通过。隔离本地预览验证了设置保存、480px 电脑高度、280px 手机高度、字号、模糊、遮罩及阿拉伯语 RTL；没有横向溢出。

三个域名 54 项公网检查通过：页面 200、QQ 状态已配置、授权开始指向 QQ/登记域名、错误 state 被拒绝、WebP 及 JS/CSS 正常；未认证设置接口 401，生产 dev-bypass 403。真实 QQ 账号授权未实测；原生插件的完整流程通过模拟 QQ 响应、真实 SQLite 的回归测试。公网浏览器工具仍超时，界面验收基于同版代码的隔离本地预览。末次服务 active/running、NRestarts=0、内存约 168 MiB，服务器负载 0.29/0.31/0.43。

备份：/srv/apps/duanap/blog-emdash/backups/carousel-controls-webp-qq-20261002T032413Z。回滚时停止 blog-emdash.service，保存当前 dist、src、member-plugin、vendor/emdash/dist、vendor/emdash/src、vendor/emdash-cms-admin/dist，再恢复对应 dist.before、src.before、member-plugin.before、core-dist.before、core-src.before、admin-dist.before；恢复备份的 blog-emdash.duanap.cn.conf，经 nginx -t 后 reload，启动服务并验证首页、留言墙、文章和 QQ 状态。不要覆盖数据库或 uploads。

产物 SHA256：0db4b75f603868ae8c8bdbbb307d39125c06cb1dc6950624c5136935eb726f3e。部署包、公网证据、预览图及回滚说明位于 DeploymentBackups/EmdashBlog/2026-10-02，以 carousel-controls 开头。业务内容、QQ 配置、账号和原图保留，未修改内存限制或错峰启动，未刷新 CDN；验收 QQ 授权入口产生了临时 OAuth 状态。代码未提交或推送，电脑关机仍已取消。
