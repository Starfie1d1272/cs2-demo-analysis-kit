import json
import sqlite3
import zipfile

from cs2dak.studio import StudioApi


def _api(tmp_path):
    api = StudioApi()
    api._userdata = tmp_path
    return api


def test_backup_restore_round_trip(tmp_path):
    api = _api(tmp_path)
    api.storage_record_put("demos", "demo-1", {"id": "demo-1", "tags": ["event"]})
    api.storage_blob_put("demos", "demo-1", "AQID")

    backup = api.storage_backup()
    assert backup["ok"] is True
    with zipfile.ZipFile(backup["path"]) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["version"] == "cs2-demo-analysis-kit/library-backup-1.0"
        assert manifest["demoCount"] == 1

    api.storage_record_delete("demos", "demo-1")
    api.storage_blob_delete("demos", "demo-1")
    restored = api.storage_restore(backup["path"])
    assert restored == {"ok": True, "path": backup["path"], "restartRequired": True}
    assert api.storage_record_get("demos", "demo-1")["tags"] == ["event"]
    assert api.storage_blob_get("demos", "demo-1") == "AQID"


def test_repair_removes_orphans_and_overview_reports_usage(tmp_path):
    api = _api(tmp_path)
    api.storage_record_put("demos", "missing", {"id": "missing"})
    api.storage_blob_put("demos", "orphan", "AQID")

    repaired = api.storage_repair()
    assert repaired["ok"] is True
    assert repaired["removedMissingBlobRecords"] == 1
    assert repaired["removedOrphanBlobs"] == 1
    assert api.storage_record_get("demos", "missing") is None
    assert api.storage_blob_get("demos", "orphan") is None

    overview = api.storage_overview()
    assert overview["ok"] is True
    assert {row["id"] for row in overview["categories"]} >= {"database", "demos", "cache", "tris"}
    assert sqlite3.connect(tmp_path / "studio.sqlite").execute("pragma integrity_check").fetchone()[0] == "ok"
