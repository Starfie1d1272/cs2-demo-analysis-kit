"""Credential adapter failures without reading the host credential vault."""
import ctypes
from unittest.mock import Mock

import pytest

from cs2dak.credentials import _windows_credential_get
from cs2dak.diagnostics import safe_exception


@pytest.mark.parametrize("code", [1168, 5, 1312, 0])
def test_windows_read_distinguishes_absent_and_operational_failure(monkeypatch, code):
    api = Mock()
    api.CredReadW.return_value = False
    monkeypatch.setattr(ctypes, "WinDLL", Mock(return_value=api), raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: code, raising=False)
    if code == 1168:
        assert _windows_credential_get("private-service", "private-account") is None
    else:
        with pytest.raises(OSError) as failure:
            _windows_credential_get("private-service", "private-account")
        assert failure.value.errno == code
        detail = str(safe_exception(failure.value, "credential_read"))
        assert "CREDENTIAL_READ" in detail
        assert "private-service" not in detail and "private-account" not in detail
    api.CredFree.assert_not_called()


def test_decode_failure_does_not_expose_blob_or_exception_context(monkeypatch):
    api = Mock()
    blob = (ctypes.c_ubyte * 3).from_buffer_copy(b"xyz")
    kept = []

    def read(_target, _type, _flags, output):
        entry = output._obj._type_()
        entry.blob_size = 3
        entry.blob = ctypes.cast(blob, ctypes.POINTER(ctypes.c_ubyte))
        kept.append(entry)
        ctypes.cast(output, ctypes.POINTER(type(output._obj)))[0] = ctypes.pointer(entry)
        return True

    api.CredReadW.side_effect = read
    monkeypatch.setattr(ctypes, "WinDLL", Mock(return_value=api), raising=False)
    with pytest.raises(ValueError, match="CREDENTIAL_DECODE") as failure:
        _windows_credential_get("service", "account")
    assert failure.value.__context__ is None
    assert "xyz" not in str(safe_exception(failure.value))
    api.CredFree.assert_called_once()


@pytest.mark.parametrize("operation", ["set", "delete"])
@pytest.mark.parametrize("code", [5, 1312, 1168])
def test_windows_mutation_preserves_failure_code(monkeypatch, operation, code):
    from cs2dak import credentials
    api = Mock()
    api.CredWriteW.return_value = api.CredDeleteW.return_value = False
    monkeypatch.setattr(ctypes, "WinDLL", Mock(return_value=api), raising=False)
    monkeypatch.setattr(ctypes, "get_last_error", lambda: code, raising=False)
    call = getattr(credentials, f"_windows_credential_{operation}")
    args = ("private-service", "private-account", "private-token") if operation == "set" else ("private-service", "private-account")
    if operation == "delete" and code == 1168:
        assert call(*args) is True
        return
    with pytest.raises(OSError) as failure:
        call(*args)
    assert failure.value.errno == code
    detail = str(safe_exception(failure.value))
    assert all(secret not in detail for secret in args)
    assert f"CREDENTIAL_{'WRITE' if operation == 'set' else 'DELETE'}" in detail


@pytest.mark.parametrize("operation", ["get", "set", "delete"])
@pytest.mark.parametrize("code", [0, 44, 36, 128])
def test_macos_exit_status_is_not_always_absent(monkeypatch, operation, code):
    from types import SimpleNamespace

    from cs2dak import credentials
    run = Mock(return_value=SimpleNamespace(returncode=code, stdout="private-token\n", stderr="private-stderr"))
    monkeypatch.setattr(credentials.subprocess, "run", run)
    call = getattr(credentials, f"_macos_credential_{operation}")
    args = ("private-service", "private-account", "private-token") if operation == "set" else ("private-service", "private-account")
    if code == 0:
        assert call(*args) == ("private-token" if operation == "get" else True)
    elif code == 44 and operation != "set":
        assert call(*args) == (None if operation == "get" else True)
    else:
        with pytest.raises(RuntimeError) as failure:
            call(*args)
        assert f"退出码 {code}" in str(failure.value)
        assert all(secret not in str(safe_exception(failure.value)) for secret in (*args, "private-stderr"))
    assert run.call_args.kwargs["timeout"] == 30


@pytest.mark.parametrize("kind", ["timeout", "os", "decode"])
def test_macos_command_exceptions_do_not_retain_secret_context(monkeypatch, kind):
    from cs2dak import credentials
    faults = {
        "timeout": credentials.subprocess.TimeoutExpired(["security", "private-token"], 30, output="private-output", stderr="private-stderr"),
        "os": OSError(5, "private-token"),
        "decode": UnicodeDecodeError("utf-8", b"private-token", 0, 1, "private-stderr"),
    }
    monkeypatch.setattr(credentials.subprocess, "run", Mock(side_effect=faults[kind]))
    with pytest.raises(RuntimeError) as failure:
        credentials._macos_credential_set("private-service", "private-account", "private-token")
    assert failure.value.__context__ is None
    assert failure.value.__cause__ is None
    detail = str(safe_exception(failure.value))
    assert all(secret not in detail for secret in ["private-service", "private-account", "private-token", "private-stderr", "private-output"])
