# 0.8.6 候选的数据保留与 notice 发布门槛

## 范围

桌面 `vX.Y.Z` 的既有 Release workflow 同时发布 Studio 与独立 Uploader。
Studio 的完整 runtime 含 `apps/dak-studio` 资料库路径和 Windows relay；独立 Uploader
不调用 Studio relay，使用独立 Inno Setup 安装器。不能将 Uploader smoke 当作
Studio 更新资料保全验收，也不能将已安装旧客户端视为已使用新 updater。

## 本地投影身份

资料库 entry ID 是 ZIP 内容 SHA，raw Demo SHA 控制去重；原来 facts/derived 使用
文件名去扩展名，因此不同 raw Demo 的同名 ZIP 会共用投影。新增本地
`analysisMatchId` 只隔离冲突投影，普通唯一文件名保留旧 key。entry ID、raw SHA、
文件名、Series/Event 引用和上传 source/remote identity 不改。

历史冲突首次列库、导入、删除或维护时，在原 key 和 entry 锁下重新读取当前记录，
通过 checkpoint 尝试在运行时失败后恢复 metadata，为每个冲突 entry 分配独立 key 并清除
`builtWith`，使其进入既有“从本地 ZIP 重建”路径。原 ZIP 和旧共享投影保留，
不猜测旧 facts 属于哪一场；重建前新 key 无可信投影。删除只清理无人引用的
投影。赛季缓存 key 纳入发生变化的本地投影 key，避免返回旧别名聚合。

checkpoint 是运行时撤销机制，不承诺断电/磁盘故障的跨存储事务。

历史共享 key 同时写入持久 tombstone，并包含在同一撤销 checkpoint 中；即使冲突
条目之后全部删除，第三个同名 ZIP 也不能重用旧 key。只有旧 matchId 的 PrepItem
保持无可回放条目的显式缺失状态，不静默指向新比赛；不猜测旧备战清单来源，
不引入 Coach 数据重构。

## Windows 持久资料

冻结 Studio 默认使用 exe 同级 `userdata`，包含 SQLite 和 Demo ZIP；`assets`、
`cache`、`updates` 同级。外部自定义数据目录或系统回退不由安装目录 relay 搬迁。
旧 relay 忽略目录 MOVE 失败后无条件删除旧安装根，存在资料损失风险。
新 relay 遇到目标冲突、MOVE 失败或源仍存在就停止启动和清理，保留新旧目录、
脚本和日志，显示先备份两处持久目录、联系支持确认后恢复的指引。
旧嵌套 runtime 根若含任何持久目录，installer 在删除或覆盖任何旧程序之前停止，
不自动合并数据库、不要求用户删除原始目录。

**首跳尚未解决**：0.8.5→0.8.6 由已安装的旧 relay 执行，新包内修复不能保护这次
更新。禁止把当前候选直接作为完整 Studio runtime 稳定自动更新发布。必须另行
确认安全首跳入口、完整目录失败验收和最终发布范围；现有 Release workflow 不能
默认限制为 Uploader。当前 PR 只准备源码修复，不发布 tag 或任何稳定 manifest。

## 第三方通知

HeatmapCanvas 声明改编自 simpleheat，不能用 DAK MIT notice 代替 BSD-2-Clause。
完整原文取自上游 `mourner/simpleheat` commit
`6cb44b3494ae33912bf03dbbd55da15fb57b2c37` 的 LICENSE，SHA-256 为
`756d6c334c9289a7b8e563cad0be32ab425cd35303d491789ab1adb9fbcef847`。
根 notices 保存完整 copyright、conditions、disclaimer；React build 将原许可和
notices 放入 dist，实际 tgz consumer 检查其 bytes；Studio Vite 将两者作为独立资产
输出，PyInstaller 后检查真实 `studio_web` 分发目录，再允许 ZIP/DMG 装配。

本次检查不宣称所有第三方依赖已完成完整许可证审计，也不替代 AGPL 产品源码
提供和既有 provenance 要求。

独立制品复审补充：两上游 MIT 原文此前仅随 npm dist/vendor 分发，Vite 不会自动
保留它们。Studio 与 Uploader 现在通过共同资产生成器，按已固定来源和 hash 输出
两份完整 MIT 许可、根 notices 与来源记录；Studio 另输出 simpleheat 原文。
两类 PyInstaller 实际 web 目录均检查完整原文 bytes；Windows Uploader ZIP、
Studio runtime ZIP 与 Full Portable ZIP 再读取真实归档核对原文和 notices。

补充中途退出与自定义目录边界：tombstone 先于任何 alias metadata 写入持久化，
重启时即使只剩一个旧 key，也会检测 marker、将残余条目隔离并标为待重建；
回归覆盖持久化中间态重新列库。新 relay 成功后也保留整个旧根，避免删除非白名单
用户文件；原安装根内不在持久白名单下的自定义 userdata 拒绝自动 relay，改用
安装器。安装器遇到自定义数据位于将被覆盖的 runtime 文件树时在覆盖前停止；
无白名单资料的旧嵌套 runtime 也保留，不再递归删除未知文件。
