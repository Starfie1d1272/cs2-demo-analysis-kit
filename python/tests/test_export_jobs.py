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


def test_export_dependency_failure_reaches_terminal_state(monkeypatch, tmp_path: Path) -> None:
    import builtins

    original_import = builtins.__import__

    def missing_dependency(name, *args, **kwargs):
        if name == "cs2df.package":
            raise ModuleNotFoundError("No module named 'cs2df.package'")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", missing_dependency)
    api = StudioApi()
    job = _ExportJob(str(tmp_path / "source.dem"))
    api._run_export_job(job)
    assert job.state == "error"
    assert job.diagnostic["stage"] == "export.dependencies"
    assert "cs2df.package" in job.error

    source = tmp_path / "source.zip"
    source.write_bytes(b"zip")
    zip_job = _ExportJob(str(source))
    api._run_export_job(zip_job)
    assert zip_job.state == "done"
    zip_job.result_path.unlink()


def test_export_cleanup_failure_does_not_replace_primary(monkeypatch, tmp_path: Path) -> None:
    source = tmp_path / "absent.zip"
    job = _ExportJob(str(source))
    job.result_path = tmp_path / "staged.zip"

    def failed_cleanup(*args, **kwargs):
        raise PermissionError("cleanup failed")

    monkeypatch.setattr(Path, "unlink", failed_cleanup)
    StudioApi()._run_export_job(job)
    assert job.state == "error"
    assert job.diagnostic["type"] == "FileNotFoundError"
    assert "cleanup failed" not in job.error
    assert job.result_path is None


def test_export_native_panic_is_terminal_but_control_signals_propagate(monkeypatch, tmp_path: Path) -> None:
    import builtins

    import pytest

    original_import = builtins.__import__
    panic_type = type("PanicException", (BaseException,), {"__module__": "pyo3_runtime"})
    other_panic = type("PanicException", (BaseException,), {"__module__": "another_runtime"})
    for failure in [panic_type("native parse panic"), KeyboardInterrupt(), SystemExit(7), other_panic()]:
        def failed_import(name, *args, failure=failure, **kwargs):
            if name == "cs2df.package":
                raise failure
            return original_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", failed_import)
        job = _ExportJob(str(tmp_path / "source.dem"))
        if isinstance(failure, panic_type):
            StudioApi()._run_export_job(job)
            assert job.state == "error"
            assert job.error == "native parse panic"
            assert job.diagnostic["type"] == "PanicException"
        else:
            with pytest.raises(type(failure)):
                StudioApi()._run_export_job(job)
        monkeypatch.setattr(builtins, "__import__", original_import)


def test_missing_export_job_is_a_query_uncertainty_not_parser_failure() -> None:
    status = StudioApi().get_export_status("missing-job")
    assert status["id"] == "missing-job"
    assert status["code"] == "EXPORT_JOB_NOT_FOUND"
    assert status["error"] == "未知任务"
