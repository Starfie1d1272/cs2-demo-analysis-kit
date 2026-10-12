from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

import cs2dak
from cs2dak import studio, updater


def test_exact_legacy_native_check_reads_manual_manifest_without_touching_library(tmp_path, monkeypatch):
    snapshot = Path(__file__).with_name("legacy_update_v0_8_5.txt").read_bytes()
    assert hashlib.sha256(snapshot).hexdigest() == "4adf81248dbeb03e9349a5d3f26d7ee08e5ba61df3ffe7195cfc21542a0b39ff"
    namespace = {}
    exec(compile(snapshot, "legacy-studio-0.8.5", "exec"), namespace)  # noqa: S102 - fixed SHA-verified historical source fixture
    runtime = tmp_path / "dak-studio-windows-0.8.6.zip"
    installer = tmp_path / "DAK-Studio-Setup-0.8.6.exe"
    runtime.write_bytes(b"synthetic runtime")
    installer.write_bytes(b"synthetic installer")
    root = Path(__file__).resolve().parents[2]
    subprocess.run(["node", str(root / "scripts/gen-update-manifest.mjs"), "0.8.6", str(runtime),
                    str(tmp_path / "latest-v2.json"), "--legacy-out", str(tmp_path / "latest.json"),
                    "--installer", str(installer)], check=True)
    manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
    userdata = tmp_path / "install" / "userdata"
    userdata.mkdir(parents=True)
    (userdata / "studio.sqlite").write_bytes(b"original-db")
    (userdata / "demo.zip").write_bytes(b"original-zip")
    before = {p.name: p.read_bytes() for p in userdata.iterdir()}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self):
            return json.dumps(manifest).encode()

    seen = []

    def fetch(request, **_kwargs):
        seen.append(request.full_url)
        assert request.full_url.endswith("/releases/latest.json")
        return Response()

    monkeypatch.setattr(cs2dak, "__version__", "0.8.5")
    monkeypatch.setattr(namespace["urllib"].request, "urlopen", fetch)
    api = SimpleNamespace(_web_overlay_dir=lambda: tmp_path / "no-overlay")
    actual = namespace["check_update"](api)
    assert actual["version"] == "0.8.6"
    assert actual["assets"] == {}
    assert "手动下载" in actual["notes"]
    assert seen == ["https://dakupdate.starfie1d.top/releases/latest.json"]
    assert {p.name: p.read_bytes() for p in userdata.iterdir()} == before


def test_safe_native_capability_delegates_to_this_runtimes_checked_relay(monkeypatch, tmp_path):
    monkeypatch.setattr(studio, "_studio_userdata", lambda: tmp_path)
    api = studio.StudioApi()
    monkeypatch.setattr(api, "update_apply", lambda job_id: {"ok": True, "fixtureJob": job_id})
    assert api.update_apply_runtime_safe("fixture") == {"ok": True, "fixtureJob": "fixture"}


def test_manual_install_preserves_all_persistent_directories_and_library_bytes(tmp_path):
    import zipfile

    install = tmp_path / "install"
    for name in updater.PERSISTENT_INSTALL_DIRS:
        (install / name).mkdir(parents=True)
        (install / name / "original.bin").write_bytes(name.encode())
    (install / "userdata" / "studio.sqlite").write_bytes(b"original-db")
    (install / "userdata" / "demo.zip").write_bytes(b"original-zip")
    before = {str(p.relative_to(install)): p.read_bytes() for p in install.rglob("*") if p.is_file()}
    archive = tmp_path / "runtime.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("dak-studio/dak-studio.exe", b"new-runtime")
        for name in updater.PERSISTENT_INSTALL_DIRS:
            zf.writestr(f"dak-studio/{name}/original.bin", b"must-not-overwrite")
    updater.install_runtime_archive(archive, install)
    for path, content in before.items():
        assert (install / path).read_bytes() == content
