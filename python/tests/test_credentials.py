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
