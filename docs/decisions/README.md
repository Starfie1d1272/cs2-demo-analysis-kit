# Decision Log

这里记录会改变 DAK 产品方向、模块边界、数据口径或发布策略的重要决定。普通 bug、临时实现细节和未验证想法不要放这里。

## 何时新增

- 现实证据推翻了原产品假设。
- 多个可行方案会长期影响模块边界或数据合同。
- 一个决定解释了为什么某条路暂时不做。
- 未来很可能有人追问“这是没做完，还是当时决定不做”。

## 文件格式

文件名使用 `YYYY-MM-DD-short-title.md`。

```markdown
# Decision: Title

Date: YYYY-MM-DD

## Problem

## Previous Assumption

## New Evidence

## Options Considered

## Decision

## Why

## Reopen When
```
