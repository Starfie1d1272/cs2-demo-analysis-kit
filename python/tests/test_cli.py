"""Exercise the installed console script, including its no-argument shortcut."""

import shutil
import subprocess

from cs2dak import __version__


def test_installed_version_entry_points():
    executable = shutil.which("cs2dak")
    assert executable is not None
    for args in ([], ["version"]):
        result = subprocess.run([executable, *args], capture_output=True, text=True, check=False)
        assert result.returncode == 0, result.stderr
        assert result.stdout == f"{__version__}\n"
        assert result.stderr == ""


def test_installed_help_and_invalid_command():
    executable = shutil.which("cs2dak")
    assert executable is not None
    for args in (["--help"], ["version", "--help"]):
        result = subprocess.run([executable, *args], capture_output=True, text=True, check=False)
        assert result.returncode == 0, result.stderr
        assert "version" in result.stdout
        assert result.stderr == ""
        assert __version__ not in result.stdout
    result = subprocess.run([executable, "export"], capture_output=True, text=True, check=False)
    assert result.returncode == 2
    assert result.stdout == ""
    assert "No such command" in result.stderr
