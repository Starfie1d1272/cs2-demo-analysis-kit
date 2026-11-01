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
Current task needs it: npm registry 等待修复已独立完成；巡检发现 Worker 配置允许 512 MiB 却整包读入 128 MB isolate，以及本地 release:npm 绕开正式对账策略。
Deferred because: 两项分别涉及上传合同与本地发布入口语义，单独处理并验证；本次保留源码依据与建议。
