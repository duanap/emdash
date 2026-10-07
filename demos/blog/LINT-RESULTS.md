# 全量类型感知 lint 检查结果

2026-10-07 更新：在最终根构建完成后，quick lint 与完整类型感知 lint 均为 **0 条诊断**。未禁用规则或添加批量豁免。

本次修复覆盖会员与 QQ 输入类型检查、旧会话兼容、迁移和备份脚本的 SQLite 值处理，以及发布服务测试配置解析。全部包和 demo 类型检查通过。后台五项审核修复已通过浏览器、实际 HTTP 页面和真实 SQLite 回归验证；本次仅提交推送，不部署。

## 历史检查记录

检查日期：2026-10-01。根构建完成后运行 `pnpm --silent lint:json`。

当前 59 条诊断：41 错误、18 警告。quick lint 为零；全量类型感知 lint 尚未通过。

本文记录待处理项，不改变规则或隐藏诊断。后续按行为影响核查，避免把类型转换当作批量字符串替换。

2026-10-02 更新：最新根构建后的全量检查报告 78 项诊断。此前列出的 59 项仍未解决，另有 18 项位于 .github/scripts/test-plan.test.mjs，1 项位于 apps/release-service/vitest.encryption-verification.config.ts。本次轮播设置、WebP 转换、图片缓存及 QQ 导航新增文件的 scoped type-aware lint 为零，全仓 quick lint 为零。完整 JSON 保存在本机 DeploymentBackups/EmdashBlog/2026-10-02/carousel-controls-lint-strict.json；没有修改规则或清理无关文件。

| 文件                                                                                                   | 行   | 级别    | 规则                                        |
| ------------------------------------------------------------------------------------------------------ | ---- | ------- | ------------------------------------------- |
| [demos/blog/src/scripts/zh-copy.ts](./src/scripts/zh-copy.ts#L77)                                      | 77   | warning | `typescript(no-unnecessary-type-assertion)` |
| [demos/blog/src/scripts/zh-copy.ts](./src/scripts/zh-copy.ts#L81)                                      | 81   | warning | `typescript(no-unnecessary-type-assertion)` |
| [demos/blog/src/utils/archive-items.ts](./src/utils/archive-items.ts#L38)                              | 38   | warning | `typescript(no-unnecessary-type-assertion)` |
| [demos/blog/src/utils/wall-lanes.ts](./src/utils/wall-lanes.ts#L29)                                    | 29   | warning | `typescript(no-unnecessary-type-assertion)` |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L282)                                     | 282  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L378)                                     | 378  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L412)                                     | 412  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L499)                                     | 499  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L500)                                     | 500  | error   | `typescript(no-base-to-string)`             |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L541)                                     | 541  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L552)                                     | 552  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L579)                                     | 579  | warning | `typescript(no-unnecessary-type-assertion)` |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L580)                                     | 580  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L634)                                     | 634  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L645)                                     | 645  | warning | `typescript(no-unnecessary-type-assertion)` |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L646)                                     | 646  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L995)                                     | 995  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/member-plugin/index.ts](./member-plugin/index.ts#L1059)                                    | 1059 | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/scripts/backup-db.mjs](./scripts/backup-db.mjs#L48)                                        | 48   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/backup-db.mjs](./scripts/backup-db.mjs#L49)                                        | 49   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/backup-db.mjs](./scripts/backup-db.mjs#L50)                                        | 50   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/backup-db.mjs](./scripts/backup-db.mjs#L50)                                        | 50   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/backup-db.mjs](./scripts/backup-db.mjs#L50)                                        | 50   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/e2e-rest-path-test.mjs](./scripts/e2e-rest-path-test.mjs#L48)                      | 48   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/e2e-rest-path-test.mjs](./scripts/e2e-rest-path-test.mjs#L48)                      | 48   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/e2e-rest-path-test.mjs](./scripts/e2e-rest-path-test.mjs#L50)                      | 50   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L64)                          | 64   | error   | `typescript(no-base-to-string)`             |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L64)                          | 64   | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/lib/markdown-to-portable-text.ts](./scripts/lib/markdown-to-portable-text.ts#L203) | 203  | warning | `typescript(no-unsafe-type-assertion)`      |
| [demos/blog/scripts/migrate-from-blog-front.mjs](./scripts/migrate-from-blog-front.mjs#L352)           | 352  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-from-blog-front.mjs](./scripts/migrate-from-blog-front.mjs#L352)           | 352  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-from-blog-front.mjs](./scripts/migrate-from-blog-front.mjs#L352)           | 352  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-from-blog-front.mjs](./scripts/migrate-from-blog-front.mjs#L362)           | 362  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-from-blog-front.mjs](./scripts/migrate-from-blog-front.mjs#L375)           | 375  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L368)                         | 368  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L373)                         | 373  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L392)                         | 392  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L400)                         | 400  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L483)                         | 483  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L489)                         | 489  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L489)                         | 489  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L489)                         | 489  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L493)                         | 493  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L496)                         | 496  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L496)                         | 496  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L496)                         | 496  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L496)                         | 496  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L497)                         | 497  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L513)                         | 513  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L533)                         | 533  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L534)                         | 534  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L534)                         | 534  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L534)                         | 534  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L623)                         | 623  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L628)                         | 628  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L639)                         | 639  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L639)                         | 639  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L639)                         | 639  | error   | `typescript(restrict-template-expressions)` |
| [demos/blog/scripts/migrate-old-site.mjs](./scripts/migrate-old-site.mjs#L656)                         | 656  | error   | `typescript(restrict-template-expressions)` |
