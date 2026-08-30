# PostgreSQL 部署模板

`compose.yml` 提供相互隔离的 production 与 development PostgreSQL 实例。复制 `example.env` 后设置不同的随机密码，并把生成的环境文件权限限制为 `0600`；这些文件已经被 `.gitignore` 排除。

`init-roles.sh` 创建运行时、迁移和只读备份角色。应用运行时账号只应拥有业务所需的 DML 权限，schema 迁移使用独立的 `DATABASE_MIGRATION_URL`。

`backup.sh` 使用 PostgreSQL custom dump，并在写盘前通过 age 加密。配置 `RESTIC_REPOSITORY` 与 `RESTIC_PASSWORD_FILE` 后可以把加密备份同步到兼容存储；两个变量应同时提供或同时省略。部署者需要定期在隔离数据库中验证恢复流程。

不要把 PostgreSQL 端口直接暴露到公网，也不要提交数据库连接串、备份密钥或实际环境文件。
