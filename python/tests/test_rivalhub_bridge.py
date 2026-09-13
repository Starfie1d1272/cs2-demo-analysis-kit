from __future__ import annotations

from types import SimpleNamespace

import cs2dak.studio as studio_module
from cs2dak.studio import RIVALHUB_CREDENTIAL_ACCOUNT, RIVALHUB_CREDENTIAL_SERVICE, StudioApi


def _api(tmp_path):
    api = StudioApi()
    api._userdata = tmp_path
    return api


def test_rivalhub_bridge_rejects_non_web_urls_and_unknown_credentials(monkeypatch, tmp_path):
    api = _api(tmp_path)
    monkeypatch.setattr(studio_module.sys, "platform", "linux")

    assert not api.rivalhub_open_external_url("file:///tmp/rivalhub")
    assert not api.rivalhub_open_external_url("https:///missing-host")
    assert not api.rivalhub_open_external_url("https://user:pass@example.test/connect")
    assert api.rivalhub_credential_get(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT) is None
    assert not api.rivalhub_credential_set(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT, "token")
    assert not api.rivalhub_credential_delete(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT)


def test_rivalhub_bridge_uses_only_fixed_keychain_item(monkeypatch, tmp_path):
    api = _api(tmp_path)
    monkeypatch.setattr(studio_module.sys, "platform", "darwin")
    calls = []

    def fake_run(argv, **kwargs):
        calls.append(argv)
        return SimpleNamespace(returncode=0, stdout="secret-token\n")

    monkeypatch.setattr(studio_module.subprocess, "run", fake_run)

    assert api.rivalhub_credential_get(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT) == "secret-token"
    assert api.rivalhub_credential_set(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT, "new-token")
    assert api.rivalhub_credential_delete(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT)
    assert all(RIVALHUB_CREDENTIAL_SERVICE in call and RIVALHUB_CREDENTIAL_ACCOUNT in call for call in calls)
    assert api.rivalhub_credential_get("other.service", RIVALHUB_CREDENTIAL_ACCOUNT) is None
    assert len(calls) == 3


def test_rivalhub_bridge_uses_windows_credential_manager(monkeypatch, tmp_path):
    api = _api(tmp_path)
    monkeypatch.setattr(studio_module.sys, "platform", "win32")
    calls = []

    def fake_get(service, account):
        calls.append(("get", service, account))
        return "windows-token"

    def fake_set(service, account, value):
        calls.append(("set", service, account, value))
        return True

    def fake_delete(service, account):
        calls.append(("delete", service, account))
        return True

    monkeypatch.setattr(studio_module, "_windows_credential_get", fake_get)
    monkeypatch.setattr(studio_module, "_windows_credential_set", fake_set)
    monkeypatch.setattr(studio_module, "_windows_credential_delete", fake_delete)

    assert api.rivalhub_credential_get(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT) == "windows-token"
    assert api.rivalhub_credential_set(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT, "new-token")
    assert api.rivalhub_credential_delete(RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT)
    assert calls == [
        ("get", RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT),
        ("set", RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT, "new-token"),
        ("delete", RIVALHUB_CREDENTIAL_SERVICE, RIVALHUB_CREDENTIAL_ACCOUNT),
    ]
