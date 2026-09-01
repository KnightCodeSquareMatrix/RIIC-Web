## 变更

<!-- 说明用户可见行为、问题原因与实现边界。 -->

## 验证

- [ ] PR 的 base branch 是 `develop`；只有维护者的 `release/**` PR 可以指向 `main`，不经 `develop` 的特批发布还必须带有 `direct-main-release` 标签
- [ ] 已运行 `npm run check`
- [ ] 已运行 `npm run build`
- [ ] 交互改动已运行相关 Chromium / production-profile / WebKit 测试
- [ ] 数据库改动包含迁移并通过集成测试
- [ ] 未包含凭据、用户数据、内部文档、服务器 helper、solver 或真实部署信息

## 许可

- [ ] 我有权提交这些内容，并同意自有贡献按 PolyForm Noncommercial 1.0.0 发布
- [ ] 第三方代码或素材已注明来源、许可证与固定版本
