from __future__ import annotations

import base64
from pathlib import Path

from cs2dak.studio import StudioApi, _ExportJob


def test_export_job_stages_zip_on_disk_and_deletes_it_after_last_chunk(tmp_path: Path) -> None:
    source = tmp_path / "source.zip"
    payload = bytes(range(256)) * 5
    source.write_bytes(payload)

    api = StudioApi()
    job = _ExportJob(str(source))
    api._jobs[job.id] = job
    api._run_export_job(job)

    assert job.state == "done"
    assert job.result_path is not None
    result_path = job.result_path
    assert result_path.is_file()
    assert not hasattr(job, "result_b64")
    assert api.get_export_status(job.id)["resultSize"] == len(payload)

    chunks: list[bytes] = []
    offset = 0
    while True:
        result = api.get_export_result_chunk(job.id, offset, 113)
        assert result["ok"] is True
        chunks.append(base64.b64decode(result["data"]))
        if result["done"]:
            break
        offset += 113

    assert b"".join(chunks) == payload
    assert not result_path.exists()
    assert job.id not in api._jobs


def test_export_job_status_waits_for_file_backed_result(tmp_path: Path) -> None:
    api = StudioApi()
    source = tmp_path / "source.zip"
    source.write_bytes(b"zip")
    job = _ExportJob(str(source))
    api._jobs[job.id] = job

    api._run_export_job(job)
    try:
        status = api.get_export_status(job.id)
        assert status["state"] == "done"
        assert status["resultSize"] == 3
        assert status["fileName"] == "source.zip"
    finally:
        if job.result_path is not None:
            job.result_path.unlink(missing_ok=True)
        api._jobs.pop(job.id, None)
