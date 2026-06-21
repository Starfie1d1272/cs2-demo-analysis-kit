import base64
import json
import time
import zipfile
from pathlib import Path

from cs2dak.studio import StudioApi


def _event_archive(path: Path, map_bytes: bytes = b"demo-zip") -> None:
    package = {
        "version": "cs2-demo-analysis-kit/event-package-1.0",
        "source": "manual",
        "exportedAt": "2026-06-21T00:00:00Z",
        "event": {"slug": "test", "name": "Test", "kind": "major", "stages": []},
        "teams": [],
        "series": [],
    }
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("event-package.json", json.dumps(package))
        archive.writestr("maps/map-1.zip", map_bytes)


def test_event_archive_is_read_one_inner_map_at_a_time(tmp_path: Path) -> None:
    source = tmp_path / "event.zip"
    payload = b"0123456789" * 100
    _event_archive(source, payload)
    api = StudioApi()

    opened = api.event_package_open(str(source))
    assert opened["ok"] is True
    assert opened["maps"] == [{"name": "maps/map-1.zip", "size": len(payload)}]

    chunks = []
    offset = 0
    while True:
        result = api.event_package_map_chunk(opened["sessionId"], "maps/map-1.zip", offset, 113)
        assert result["ok"] is True
        data = base64.b64decode(result["data"])
        chunks.append(data)
        offset += len(data)
        if result["done"]:
            break
    assert b"".join(chunks) == payload
    api.event_package_close(opened["sessionId"])
    assert opened["sessionId"] not in api._event_sessions


def test_event_archive_rejects_missing_manifest(tmp_path: Path) -> None:
    source = tmp_path / "bad.zip"
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("maps/map.zip", b"x")
    result = StudioApi().event_package_open(str(source))
    assert result["ok"] is False
    assert "event-package.json" in result["error"]


def test_event_members_use_independent_temp_files(tmp_path: Path) -> None:
    source = tmp_path / "event.zip"
    package = {"event": {"slug": "test"}}
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("event-package.json", json.dumps(package))
        archive.writestr("maps/a.zip", b"abcdefgh")
        archive.writestr("maps/b.zip", b"12345678")
    api = StudioApi()
    opened = api.event_package_open(str(source))
    first_a = api.event_package_map_chunk(opened["sessionId"], "maps/a.zip", 0, 4)
    first_b = api.event_package_map_chunk(opened["sessionId"], "maps/b.zip", 0, 4)
    last_a = api.event_package_map_chunk(opened["sessionId"], "maps/a.zip", 4, 4)
    assert base64.b64decode(first_a["data"]) + base64.b64decode(last_a["data"]) == b"abcdefgh"
    assert base64.b64decode(first_b["data"]) == b"1234"
    api.event_package_close(opened["sessionId"])


def test_event_download_jobs_are_isolated_and_cleaned_after_import(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.zip"
    _event_archive(source)
    payload = source.read_bytes()

    def fake_download(_urls, destination, **kwargs):
        destination.write_bytes(payload)
        kwargs["on_progress"](len(payload))

    api = StudioApi()
    api._userdata = tmp_path / "userdata"
    monkeypatch.setattr("cs2dak.studio.updater.download_with_fallback", fake_download)
    jobs = [api.event_download_start(["https://example.test/e.zip"], "0" * 64, len(payload), "same") for _ in range(2)]
    for job in jobs:
        for _ in range(100):
            if api.event_download_status(job["jobId"])["state"] == "ready":
                break
            time.sleep(0.01)
    paths = [api._event_download_jobs[job["jobId"]].staged_path for job in jobs]
    assert paths[0] != paths[1]
    opened = api.event_download_open(jobs[0]["jobId"])
    assert paths[0].exists()
    api.event_package_close(opened["sessionId"])
    assert not paths[0].exists()
    api.event_download_cancel(jobs[1]["jobId"])


def test_event_resource_prepare_keeps_native_path_and_reads_metadata(tmp_path: Path) -> None:
    source = tmp_path / "map.zip"
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("match.json", json.dumps({
            "mapName": "de_mirage",
            "teamA": {"name": "A", "score": 13},
            "teamB": {"name": "B", "score": 9},
        }))
    api = StudioApi()
    api._userdata = tmp_path / "userdata"
    session = api.event_maker_start()["sessionId"]
    result = api.event_resource_prepare(session, str(source))
    assert result["ok"] is True
    assert Path(result["path"]).is_file()
    assert result["mapName"] == "de_mirage"
    assert result["teamAName"] == "A"
    assert len(result["sha256"]) == 64
    api.event_maker_cleanup(session)
    assert not Path(result["path"]).exists()
