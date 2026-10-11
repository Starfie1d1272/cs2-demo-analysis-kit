# Uploader 安装构建资源

`uploader-setup.iss` 使用 Inno Setup 6.4+；编译器从官方获取，CI 使用 Windows runner 的已有版本，
编译日志记录实际版本。安装包自身不依赖目标机安装 Inno。

`ChineseSimplified.isl` 原样来自 Inno 官方源码仓库 `is-6_4_3`：

- [固定来源](https://github.com/jrsoftware/issrc/blob/is-6_4_3/Files/Languages/Unofficial/ChineseSimplified.isl)
- tag object：`fdc1d79e2443a4faa2698b8119da92662e1cbc57`
- SHA-256：`dceca9fea16ea057a64012ac8744a1eca7dc6ce3187d0c8991accbb539f2d4a0`

保留原作者信息、UTF-8 BOM 和 CRLF。此语言文件未随部分 Windows runner 编译器安装分发，
因此作为构建资源固定在仓库，而不在构建或安装时联网下载翻译。
