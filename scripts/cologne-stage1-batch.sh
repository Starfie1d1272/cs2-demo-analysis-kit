#!/usr/bin/env bash
# 一次性把 stage1 全部 demo 导出到 Stage1/（已存在的 ZIP 自动跳过，可断点续跑）。
# 数据源：~/Downloads 的 iem-cologne-major-2026-stage-1-*.rar + IEM 根目录已下好的散 .dem。
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DL="$HOME/Downloads"
ROOT="$REPO/fixtures/demos/pro/IEM-Cologne-Major-2026"

n=0; fail=0
for rar in "$DL"/iem-cologne-major-2026-stage-1-*.rar; do
  [ -e "$rar" ] || continue
  n=$((n + 1))
  echo "=== [$n] $(basename "$rar") ==="
  bash "$REPO/scripts/cologne-export.sh" Stage1 "$rar" || { echo "!! 失败：$rar"; fail=$((fail + 1)); }
done

# IEM 根目录的散 .dem（已下好的 2-2 两场）
for dem in "$ROOT"/*.dem; do
  [ -e "$dem" ] || continue
  n=$((n + 1))
  echo "=== [$n] $(basename "$dem") ==="
  bash "$REPO/scripts/cologne-export.sh" Stage1 "$dem" || { echo "!! 失败：$dem"; fail=$((fail + 1)); }
done

echo "================================"
echo "处理 $n 个来源，失败 $fail。Stage1/ ZIP 数："
ls "$ROOT/Stage1"/*.zip 2>/dev/null | wc -l
