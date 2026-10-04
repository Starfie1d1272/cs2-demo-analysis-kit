from pathlib import Path

import pytest

from cs2dak.studio import _studio_userdata


def test_explicit_userdata_does_not_touch_home(monkeypatch, tmp_path):
    destination = tmp_path / "isolated" / "userdata"
    monkeypatch.setenv("DAK_STUDIO_DATA_DIR", str(destination))
    monkeypatch.setattr(Path, "home", lambda: pytest.fail("must not access the home directory"))
    assert _studio_userdata() == destination
    assert destination.is_dir()


def test_relative_userdata_is_rejected(monkeypatch):
    monkeypatch.setenv("DAK_STUDIO_DATA_DIR", "relative/userdata")
    with pytest.raises(ValueError, match="absolute"):
        _studio_userdata()
