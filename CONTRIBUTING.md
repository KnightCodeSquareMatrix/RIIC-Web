# 参与贡献

感谢你帮助改进可露希尔基建终端。本仓库公开产品代码、公共 API 契约、单元/API/数据库集成测试和基于 mock API 的浏览器测试；求解器、服务器部署 helper、真实部署测试与内部运维资料不在公开仓库中。

## 分支与 PR

1. 从最新的 `develop` 创建功能分支。
2. 将功能、修复、文档和资源同步 PR 的 base branch 设为 `develop`。
3. 不要向 `main` 直接提交普通 PR。`main` 只接受维护者从本仓库 `release/**` 分支发起的发布 PR；确需跳过 `develop` 的特批发布，必须由维护者添加 `direct-main-release` 标签。
4. 普通 PR 不运行远程质量检查；PR 合并到 `develop` 或 `main` 后，目标分支才并行执行质量检查、生成一次发布产物，并在全部检查通过后部署。通过 development 验收的变更再经 release PR 晋级 `main`。

来自 fork 的 PR 不会获得 Environment secrets，也不会触发部署。只有指向 `main` 的发布 PR 会运行只读、无依赖安装的分支来源检查。请不要为了验证部署而在 PR 中添加、打印或探测 secret。

## Git 身份与贡献归属

GitHub 按每个 commit 的 author email 关联贡献者，而不是按谁合并了 PR 推断作者。提交前请把本仓库的 Git 身份设为 GitHub 账号中已验证的邮箱，或 GitHub 设置页提供的 `noreply` 邮箱：

```bash
git config user.name "YOUR_GITHUB_NAME"
git config user.email "YOUR_GITHUB_NOREPLY_EMAIL"
git config --get user.name
git config --get user.email
```

修改邮箱只影响后续 commit；历史 commit 应将当时使用的邮箱添加到同一个 GitHub 账号，由 GitHub 重建归属，不要为修正统计重写公开分支历史。维护者在整合他人改动时，如一个 commit 确实包含双方工作，应使用关联到对方 GitHub 账号的 `Co-authored-by: Name <email>` trailer。

## 本地验证

需要 Node.js 22 和 npm。提交前至少运行：

```bash
npm ci
npm run check
npm run audit:security
npm run build
```

修改页面交互或浏览器行为时，再运行：

```bash
npm run test:e2e
npm run test:e2e:production-profile
npm run test:e2e:webkit
```

数据库集成测试需要本地 PostgreSQL 和测试专用连接串：

```bash
npm run test:auth-integration
```

不要使用生产数据库、真实账号、真实 Cookie 或线上服务完成公开测试。E2E 必须使用仓库内样例和 mock API。

## 提交边界

- 可以提交产品源代码、公共协议、数据库迁移、公开测试、样例和经审查的生成资源。
- 不得提交 `AGENTS.md`、内部文档、服务器 helper、helper/备份/真实部署测试、solver contract smoke、`infra-cli`、凭据、用户数据、运行日志或 `.ts.net` 主机名。
- 不得提交私钥、token、真实 `.env` 文件、Playwright 报告、trace、截图或其他测试产物。
- 第三方素材变更必须同步更新来源和权利声明。

`npm run check:public-repository` 会对这些边界、常见 secret、超大文件、浮动 GitHub Action 引用和 `pull_request_target` 做失败关闭检查。

## 许可与署名

提交代码即表示你有权提供该贡献，并同意该贡献按 [PolyForm Noncommercial License 1.0.0](./LICENSE.md) 与仓库其余自有代码一同发布。第三方代码和素材仍适用各自的许可证或权利声明。

公开根提交不会携带旧仓库历史或历史邮箱。项目在 [CONTRIBUTORS.md](./CONTRIBUTORS.md) 中保留贡献者署名；如需更正显示名称，请提交 PR。

## 安全问题

请不要为漏洞创建公开 Issue。按照 [SECURITY.md](./SECURITY.md) 使用 GitHub 私密漏洞报告。
