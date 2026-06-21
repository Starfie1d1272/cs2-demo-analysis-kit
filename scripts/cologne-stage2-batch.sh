#!/usr/bin/env bash
# 一次性把 stage2 全部 demo 导出到 Stage2/（已存在的 ZIP 自动跳过，可断点续跑）。
# 数据源：~/Downloads 的 iem-cologne-major-2026-stage-2-*.rar。
# 用法：bash scripts/cologne-stage2-batch.sh
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DL="$HOME/Downloads"

n=0
failed=0
for rar in "$DL"/iem-cologne-major-2026-stage-2-*.rar; do
  [ -e "$rar" ] || continue
  n=$((n + 1))
  echo "=== [$n] $(basename "$rar") ==="
  bash "$REPO/scripts/cologne-export.sh" Stage2 "$rar" || { echo "!! FAIL: $rar"; failed=$((failed + 1)); }
done

echo "================================"
echo "Processed $n sources, $failed failed. Stage2 ZIP count:"
ls "$REPO/fixtures/demos/pro/IEM-Cologne-Major-2026/Stage2"/*.zip 2>/dev/null | wc -l
