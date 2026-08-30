# 求解器目录

本仓库不跟踪或分发 `infra-cli` 二进制。

本地运行排班服务时，请把有权使用且与当前协议兼容的 Linux 制品放到 `bin/infra-cli`，Windows 制品放到 `bin/infra-cli.exe`；也可以通过 `INFRA_CLI_PATH` 指向其他位置。两个文件名都已加入仓库根目录的 `.gitignore`。

服务器首次发布前，应把 Linux 制品放到应用根目录的 `shared/bin/infra-cli`。后续发布会优先使用该文件；没有共享制品时，可以复用当前 release 中的既有求解器。两个位置都不可用时，发布会终止。
