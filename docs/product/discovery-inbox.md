# Product Discovery Inbox

开发中出现但不该立即进入当前实现的产品发现先放这里。它不是承诺要做的 backlog，只是避免想法直接污染当前任务。

## 分类

- `[Invalidation]` 新证据推翻了当前产品或技术假设，需要显式决策。
- `[Improvement]` 当前方案能用，但可以更好；通常不打断当前任务。
- `[Idea]` 新功能或新方向；进入后续 discovery。

## 记录模板

```markdown
## YYYY-MM-DD Context

### [Invalidation] Title
Source:
Evidence:
Old assumption:
Impact:
Decision needed:

### [Improvement] Title
Source:
Current task needs it:
Deferred because:

### [Idea] Title
Source:
Why it might matter:
Revisit after:
```

## 2026-11-01 仓库健康巡检

### [Improvement] 赛事上传内存预算与本地发布入口
Source: [巡检记录](../research/2026-11-01-repository-health-review.md)
Current task needs it: 用户已要求完成明确修复；Worker 已改为增量校验与 5 MiB 分片，本地 release:npm 已改为指向正式 workflow。
Resolution: 实现与定向验证已完成，详见巡检记录的后续执行部分。
