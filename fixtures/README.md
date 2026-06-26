# Fixtures

`fixtures/` 只保存能支撑默认验证与文档复现的最小数据集。

## Tracked

- `input/cs2dak-sanitized-de_ancient.zip`：CLI sample analysis input.
- `input/cohort/*.zip`：cohort / integration tests 的小型跨场样本。
- `input/sample-*.zip`：Studio 与 package tests 使用的精简职业样本。
- `input/sample-pro-finals-2026.zip`：DAK Studio 内置小 event-package 示例。
- `baselines/rr-v2-pro-baseline-v0.json`：provisional frozen pro baseline.

## Local Only

- `demos/**/*.dem`：原始 demo，本地保留，不进 Git。
- `demos/**/*.zip`、`demos/**/*.rar`：原始 demo 的本地压缩归档，用来降低磁盘占用；不进 Git，默认清理时应保留，除非确认可从 HLTV / R2 / 爬虫重新取回。
- `demos/**/*.date`、`demos/**/_build/`：下载 sidecar 与临时构建目录，不进 Git。
- `output/`、`_bench/`：本地分析输出、benchmark 与探索数据，不进 Git。

Cologne Major event packages are release/R2 assets, not repository fixtures. Release CI downloads them from `https://dakupdate.starfie1d.top/events/<slug>/<slug>.zip` when building the full installer package.
