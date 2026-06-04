# 版本管理

## 版本范围

- `@cs2dak/contract`、`core`、`cohort`、`maps`、`presentation`、`react`：公开 npm 包，使用 Changesets。
- `@cs2dak/cli`、`@cs2dak/demo-lab`、未来 DAK Studio：私有工作区应用，不发布 npm。
- Python `cs2dak` 与桌面应用：跟随仓库 release tag。

## 版本规则

- **major**：删除或改变公开 API、合同字段、语义或默认行为。
- **minor**：新增向后兼容的公开能力。
- **patch**：修复实现、文档或不改变公开合同的内部重构。
- 每个影响公开包的 PR 必须包含 changeset。
- `cs2-demo-format` 与 `@rivalhub/rival-rating` 独立发版；DAK 只升级依赖并记录兼容范围。

## 发布流程

1. 为公开包变更运行 `pnpm changeset`。
2. 合并后运行 `pnpm version:packages`，更新包版本与 changelog。
3. 运行完整测试、类型检查和构建。
4. 运行 `pnpm release:npm`。
5. 仓库 release tag 使用同一里程碑版本；Python 与桌面应用由 `pnpm sync-version` 同步。

不得手动发布未记录 changeset 的公开包，也不得在 DAK 内复制外部真相源以规避依赖升级。
