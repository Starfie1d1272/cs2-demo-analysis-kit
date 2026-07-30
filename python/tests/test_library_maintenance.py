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


def test_record_prefix_and_batch_write_are_scoped_and_atomic(tmp_path):
    api = _api(tmp_path)
    api.storage_record_put_many("facts", [["m1:a", {"row": 1}], ["m1:b", {"row": 2}]])
    api.storage_record_put("facts", "m2:a", {"row": 3})

    assert api.storage_record_get_prefix("facts", "m1:") == [
        ["m1:a", {"row": 1}],
        ["m1:b", {"row": 2}],
    ]


def test_record_prefix_treats_match_separator_and_wildcards_literally(tmp_path):
    api = _api(tmp_path)
    api.storage_record_put_many(
        "facts",
        [
            ["m1\trow", {"row": "m1"}],
            ["m10\trow", {"row": "m10"}],
            ["a_b\trow", {"row": "underscore"}],
            ["aXb\trow", {"row": "plain"}],
            ["a%b\trow", {"row": "percent"}],
        ],
    )

    assert api.storage_record_get_prefix("facts", "m1\t") == [["m1\trow", {"row": "m1"}]]
    assert api.storage_record_get_prefix("facts", "a_b\t") == [
        ["a_b\trow", {"row": "underscore"}]
    ]
    assert api.storage_record_get_prefix("facts", "a%b\t") == [
        ["a%b\trow", {"row": "percent"}]
    ]

    api.storage_record_delete_prefix("facts", "a_b\t")
    assert api.storage_record_get("facts", "a_b\trow") is None
    assert api.storage_record_get("facts", "aXb\trow") == {"row": "plain"}
    assert api.storage_record_get("facts", "a%b\trow") == {"row": "percent"}


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
    assert {row["id"] for row in overview["categories"]} >= {"database", "demos", "cache", "bundledEvents", "tris"}
    assert sqlite3.connect(tmp_path / "studio.sqlite").execute("pragma integrity_check").fetchone()[0] == "ok"


def test_storage_layout_migrates_assets_out_of_userdata(tmp_path):
    legacy = tmp_path / "userdata"
    (legacy / "bundled-events").mkdir(parents=True)
    (legacy / "bundled-events" / "manifest.json").write_text("{}", encoding="utf-8")
    (legacy / "tris").mkdir()
    (legacy / "tris" / "de_nuke.tri").write_bytes(b"tri")
    (legacy / "install-manifest.json").write_text("{}", encoding="utf-8")
    (legacy / "updates").mkdir()
    (legacy / "updates" / "patch.zip").write_bytes(b"zip")
    (legacy / "studio.log").write_text("log", encoding="utf-8")

    api = _api(legacy)
    from cs2dak.studio import _migrate_storage_layout
    _migrate_storage_layout(api._userdata)

    assert not (legacy / "bundled-events").exists()
    assert (tmp_path / "assets" / "bundled-events" / "manifest.json").is_file()
    assert (tmp_path / "assets" / "tris" / "de_nuke.tri").is_file()
    assert (tmp_path / "assets" / "install-manifest.json").is_file()
    assert (tmp_path / "updates" / "downloads" / "patch.zip").is_file()
    assert (tmp_path / "cache" / "logs" / "studio.log").is_file()
