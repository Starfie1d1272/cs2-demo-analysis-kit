#!/usr/bin/env bash
# 通用赛事单源导出：.rar/.dem → 解压 → cs2df 导出 v3 ZIP → 放入 <outRoot>/<stage>/。
# 任何赛事通用，输出根目录与阶段名全部参数化（旧 cologne-export.sh 的泛化版）。
#
# 用法：
#   bash scripts/event-export.sh <outRoot> <stage> <demo.rar|demo.dem> [输出名前缀(无扩展名)]
#
# - <outRoot>：赛事 demo 根目录（如 fixtures/demos/pro/IEM-Cologne-Major-2026），相对路径按仓库根解析。
# - <stage>：阶段子目录名（如 Stage1 / Playoff）。
# - 接受 .rar（含 1 或多张 .dem）或单个 .dem。
# - rar 内按 base 名（去 -pN 后缀）分组：同图被 GOTV 切成 -p1/-p2/… 的多段会
#   合并成一份完整 ZIP（cs2df export part1 part2 … 做 tick 偏移 + 重新派生）；
#   BO3 的不同图（-m1/-m2/-m3）各导出一份。
# - 每份带 --research（对枪/反应所需）。装配器按 ZIP 内 match.json 匹配系列，文件名只需唯一。
# - 目标目录 fixtures/demos/**/*.zip 已 gitignore。已存在同名 ZIP 时跳过。
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUTROOT_ARG="${1:?需要 outRoot：赛事 demo 根目录}"
STAGE="${2:?需要阶段：如 Stage1/Playoff}"
SRC="${3:?需要 .rar 或 .dem 路径}"
PREFIX="${4:-}"
COMPRESS_LEVEL="${5:-9}"  # cs2df 内部 ZIP 压缩等级，默认 9（最高）；event-export.mjs 由 spec.export.compressLevel 透传

verify_cs2df_version() {
  local ver
  ver="$("$CS2DF_BIN" --version 2>&1 || true)"
  case "$ver" in
    *" 5."*|5.*) return 0 ;;
    *)
      echo "错误：需要 cs2df 5.x 原生二进制，当前为：${ver:-unknown} ($CS2DF_BIN)" >&2
      exit 1
      ;;
  esac
}

resolve_cs2df() {
  if [ -n "${CS2DF_BIN:-}" ]; then
    if [ -x "$CS2DF_BIN" ] || command -v "$CS2DF_BIN" >/dev/null 2>&1; then
      verify_cs2df_version
      return 0
    fi
    echo "错误：CS2DF_BIN 不可执行：$CS2DF_BIN" >&2
    exit 1
  fi
  if command -v cs2df >/dev/null 2>&1; then
    CS2DF_BIN="$(command -v cs2df)"
    verify_cs2df_version
    return 0
  fi
  cat >&2 <<'EOF'
错误：未找到原生 cs2df v5.0.0 二进制（已检查 CS2DF_BIN 与 PATH）。
请从 GitHub Releases 下载对应平台产物并加入 PATH 或设置 CS2DF_BIN：
  https://github.com/Starfie1d1272/cs2-demo-format/releases/tag/v5.0.0
  - macOS (Apple Silicon): cs2df-v5.0.0-aarch64-apple-darwin.tar.gz
  - Linux (x86_64):        cs2df-v5.0.0-x86_64-unknown-linux-gnu.tar.gz
  - Windows (x86_64):      cs2df-v5.0.0-x86_64-pc-windows-msvc.zip
示例：
  gh release download v5.0.0 -R Starfie1d1272/cs2-demo-format -p 'cs2df-v5.0.0-*.tar.gz'
  export CS2DF_BIN=/path/to/cs2df
EOF
  exit 1
}

resolve_cs2df

# outRoot 相对路径按仓库根解析
case "$OUTROOT_ARG" in
  /*) OUTDIR="$OUTROOT_ARG/$STAGE" ;;
  *)  OUTDIR="$REPO/$OUTROOT_ARG/$STAGE" ;;
esac
mkdir -p "$OUTDIR"

# .dem 原名 → 干净 base：去 -pN 分段后缀、去常见赛事/HLTV 前缀，sanitize 成 [a-z0-9-]。
clean_base() {
  # 注意 tr 保留集要含 \n，否则结尾换行被转成 -，多 base 会粘连。
  basename "$1" .dem \
    | sed -E 's/-p[0-9]+$//; s/^[a-z-]*-stage-[0-9]+-//' \
    | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-\n' '-' | sed -E 's/-+/-/g; s/^-|-$//g'
}

# write_date <name> <dem...>：取各段 .dem 的 mtime（比赛结束时间），写 ISO 8601 到 .date sidecar。
# 多段取最早（min）；unar 已正确还原归档内原始 mtime。
write_date() {
  local name="$1"; shift
  local datefile="$OUTDIR/$name.date"
  local min_epoch=""
  for d in "$@"; do
    # macOS stat: -f %m = epoch seconds
    local ts; ts=$(stat -f '%m' "$d" 2>/dev/null) || continue
    if [ -z "$min_epoch" ] || [ "$ts" -lt "$min_epoch" ]; then min_epoch="$ts"; fi
  done
  if [ -n "$min_epoch" ]; then
    # ISO 8601 UTC（macOS date -r <epoch> -u）
    date -u -r "$min_epoch" '+%Y-%m-%dT%H:%M:%SZ' > "$datefile"
  fi
}

# do_export <name> <dem...>：>1 段则合并，否则单导；已存在则跳过，但仍补写缺失的 .date。
do_export() {
  local name="$1"; shift
  local out="$OUTDIR/$name.zip"
  # 总是写 .date（幂等：覆盖最新导出时间）
  write_date "$name" "$@"
  if [ -f "$out" ]; then echo "  · 跳过（已存在）：$STAGE/$name.zip"; return; fi
  if [ "$#" -gt 1 ]; then echo "  → 合并 $# 段 → $STAGE/$name.zip"; else echo "  → 导出 → $STAGE/$name.zip"; fi
  "$CS2DF_BIN" export "$@" -o "$out" --research --compress-level "$COMPRESS_LEVEL"
}

case "$SRC" in
  *.dem)
    echo "[dem] $(basename "$SRC")"
    do_export "${PREFIX:+$PREFIX-}$(clean_base "$SRC")" "$SRC"
    ;;
  *)
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    echo "[解压] $(basename "$SRC")"
    unar -q -o "$tmp" "$SRC" >/dev/null
    dems="$(find "$tmp" -name '*.dem' | sort)"
    [ -n "$dems" ] || { echo "未找到 .dem"; exit 1; }
    # 按 base 分组（同 base 的多个 .dem = 同图分段，合并）。bash 3.2 无关联数组、
    # set -u 展开空数组会报错，故用换行串收集，按行词分割传参（tmp 路径无空格）。
    bases="$(echo "$dems" | while IFS= read -r d; do clean_base "$d"; done | sort -u)"
    while IFS= read -r base; do
      [ -n "$base" ] || continue
      part_rows="$(echo "$dems" | while IFS= read -r d; do
        if [ "$(clean_base "$d")" = "$base" ]; then
          pnum="$(basename "$d" .dem | sed -nE 's/.*-p([0-9]+)$/\1/p')"
          printf '%s\t%s\n' "${pnum:-}" "$d"
        fi
      done)"
      part_count="$(printf '%s\n' "$part_rows" | wc -l | tr -d ' ')"
      if [ "$part_count" -gt 1 ]; then
        if printf '%s\n' "$part_rows" | grep -q $'^\t'; then
          echo "错误：$SRC 内多个 .dem 映射到 $base 但缺少 -pN 分段后缀，拒绝合并" >&2
          exit 1
        fi
        unique_pnums="$(printf '%s\n' "$part_rows" | cut -f1 | sort -n -u | wc -l | tr -d ' ')"
        if [ "$unique_pnums" -ne "$part_count" ]; then
          echo "错误：$SRC 内 $base 存在重复的 -pN 分段编号，拒绝合并" >&2
          exit 1
        fi
      fi
      parts="$(printf '%s\n' "$part_rows" | sort -t $'\t' -k1,1n | cut -f2-)"
      # shellcheck disable=SC2086
      do_export "${PREFIX:+$PREFIX-}$base" $parts
    done <<< "$bases"
    ;;
esac

echo "完成 → $OUTDIR"
