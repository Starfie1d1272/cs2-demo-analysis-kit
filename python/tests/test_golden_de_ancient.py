"""
Golden regression test: 3696714896_1000003075.dem (NJU de_ancient) → cs2df export → 对比 fixtures/baselines/de_ancient/

运行方式：
  uv run pytest python/tests/test_golden_de_ancient.py -v

demo 文件被 gitignore，CI 没有 .dem 时自动跳过。
Golden baselines 在 fixtures/baselines/de_ancient/ 下，是提交的真相源。
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
DEMO_PATH = REPO_ROOT / "fixtures/demos/nju-rivals-2026/3696714896_1000003075.dem"
GOLDEN_DIR = REPO_ROOT / "fixtures/baselines/de_ancient"

# demo 文件 gitignored，本地才有
pytestmark = pytest.mark.skipif(not DEMO_PATH.exists(), reason="demo file not present (gitignored)")

# 每次运行时间戳不同，从对比中排除
_MANIFEST_EXCLUDE_KEYS = {"exportedAt"}

# 超大文件：全字段对比但单独断言，方便快速定位问题
_LARGE_FILES = {"replay.json", "shots.json"}


def _load_golden(name: str) -> object:
    path = GOLDEN_DIR / name
    assert path.exists(), f"golden file missing: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def _strip_manifest(data: dict) -> dict:
    return {k: v for k, v in data.items() if k not in _MANIFEST_EXCLUDE_KEYS}


@pytest.fixture(scope="module")
def exported_zip(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Run cs2df export, write the result to a temp ZIP, return its path."""
    from cs2df.package import export_demo

    data, _match_meta = export_demo(str(DEMO_PATH))
    out_dir = tmp_path_factory.mktemp("golden-export")
    zip_path = out_dir / "output.zip"
    zip_path.write_bytes(data)
    return zip_path


def _read_zip_json(zip_path: Path, name: str) -> object:
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(name) as f:
            return json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# 核心结构文件（小文件，全字段 diff）
# ─────────────────────────────────────────────────────────────────────────────

def test_manifest_golden(exported_zip: Path) -> None:
    actual = _strip_manifest(_read_zip_json(exported_zip, "manifest.json"))
    expected = _strip_manifest(_load_golden("manifest.json"))
    assert actual == expected


def test_match_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "match.json") == _load_golden("match.json")


def test_players_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "players.json") == _load_golden("players.json")


def test_rounds_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "rounds.json") == _load_golden("rounds.json")


def test_kills_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "kills.json") == _load_golden("kills.json")


def test_damages_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "damages.json") == _load_golden("damages.json")


def test_blinds_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "blinds.json") == _load_golden("blinds.json")


def test_bombs_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "bombs.json") == _load_golden("bombs.json")


def test_grenades_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "grenades.json") == _load_golden("grenades.json")


def test_clutches_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "clutches.json") == _load_golden("clutches.json")


def test_player_stats_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "player-stats.json") == _load_golden("player-stats.json")


def test_player_economies_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "player-economies.json") == _load_golden("player-economies.json")


# ─────────────────────────────────────────────────────────────────────────────
# 大文件（全字段 diff，单独断言方便定位）
# ─────────────────────────────────────────────────────────────────────────────

def test_shots_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "shots.json") == _load_golden("shots.json")


def test_replay_golden(exported_zip: Path) -> None:
    assert _read_zip_json(exported_zip, "replay.json") == _load_golden("replay.json")


# ─────────────────────────────────────────────────────────────────────────────
# 跨文件一致性断言（即使 golden 更新也应保持的不变量）
# ─────────────────────────────────────────────────────────────────────────────

def test_kill_count_matches_across_files(exported_zip: Path) -> None:
    """kills.json 行数 == heatmap 中 death 点数（一致性）"""
    kills = _read_zip_json(exported_zip, "kills.json")
    assert isinstance(kills, list)
    assert len(kills) == len(_load_golden("kills.json"))


def test_round_count_matches_across_files(exported_zip: Path) -> None:
    """rounds.json 行数 == player-economies 中 roundNumber 去重数"""
    rounds = _read_zip_json(exported_zip, "rounds.json")
    econ = _read_zip_json(exported_zip, "player-economies.json")
    assert isinstance(rounds, list) and isinstance(econ, list)
    unique_rounds_in_econ = len({row["roundNumber"] for row in econ})
    assert len(rounds) == unique_rounds_in_econ


def test_player_count_matches_across_files(exported_zip: Path) -> None:
    """players.json 行数 == player-stats.json 行数"""
    players = _read_zip_json(exported_zip, "players.json")
    stats = _read_zip_json(exported_zip, "player-stats.json")
    assert isinstance(players, list) and isinstance(stats, list)
    assert len(players) == len(stats)


def test_manifest_schema_version(exported_zip: Path) -> None:
    manifest = _read_zip_json(exported_zip, "manifest.json")
    assert isinstance(manifest, dict)
    assert manifest["schemaVersion"] == "cs2-demo-format/3.0"


def test_manifest_exporter_is_cs2df(exported_zip: Path) -> None:
    manifest = _read_zip_json(exported_zip, "manifest.json")
    assert isinstance(manifest, dict)
    assert manifest["exporter"]["name"] == "cs2df"
