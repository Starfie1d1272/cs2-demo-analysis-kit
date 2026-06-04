# npm 发布

公开包使用 Changesets 独立版本管理，规则见 [versioning.md](versioning.md)。

## 发布包

- `@cs2dak/contract`
- `@cs2dak/core`
- `@cs2dak/cohort`
- `@cs2dak/maps`
- `@cs2dak/presentation`
- `@cs2dak/react`

`@cs2dak/cli` 与 `@cs2dak/demo-lab` 是私有工作区应用，不发布。

## 流程

```bash
pnpm changeset           # 在功能 PR 中记录公开合同变化
pnpm version:packages    # 消费 changeset，更新版本与 changelog
pnpm release:npm         # build + test + typecheck + changeset publish
```

发布前必须确保 `cs2-demo-format` 和 `@rivalhub/rival-rating` 的依赖版本已存在于 npm。
禁止发布脚本临时重写依赖或手工指定包发布顺序；Changesets 根据 workspace 依赖图处理版本与发布。
