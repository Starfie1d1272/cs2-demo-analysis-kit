"""Best-effort CS2 demo playback helpers for the Studio desktop bridge."""

from __future__ import annotations

import ctypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import uuid
from ctypes import wintypes
from pathlib import Path


def launch_demo(path: Path, tick: int | None = None) -> dict:
    demo = path.expanduser()
    if not demo.is_file():
        return {"ok": False, "error": f"原始 demo 不存在：{path}"}
    if demo.suffix.lower() != ".dem":
        return {"ok": False, "error": f"只能直接播放 .dem 文件：{path}"}

    if sys.platform.startswith("win"):
        direct = _launch_windows_direct(demo, tick)
        if direct is not None:
            return direct

    command = f'+playdemo "{demo}"'
    url = "steam://rungameid/730//" + urllib.parse.quote(command, safe="")
    try:
        if sys.platform.startswith("win"):
            os.startfile(url)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", url])  # noqa: S603,S607
        else:
            subprocess.Popen(["xdg-open", url])  # noqa: S603,S607
    except Exception as exc:  # noqa: BLE001 - JS bridge must surface native launch failures
        return {"ok": False, "error": str(exc)}

    warning = None
    if tick is not None:
        warning = f"已启动 demo；当前平台未接入自动控制台注入，可在控制台辅助输入 demo_gototick {tick}"
    return {"ok": True, "warning": warning}


def _launch_windows_direct(demo: Path, tick: int | None) -> dict | None:
    cs2 = _find_cs2_exe()
    if cs2 is None:
        return None
    game_root = _game_root_from_cs2_exe(cs2)
    if game_root is None:
        return None

    csgo_dir = game_root / "csgo"
    cfg_dir = csgo_dir / "cfg"
    if not csgo_dir.is_dir():
        return None
    cfg_dir.mkdir(parents=True, exist_ok=True)
    _cleanup_old_windows_demo_files(csgo_dir, cfg_dir)
    stem = f"dak_studio_{uuid.uuid4().hex}"
    dest = csgo_dir / f"{stem}.dem"
    cfg = cfg_dir / f"{stem}.cfg"
    try:
        shutil.copy2(demo, dest)
        cfg.write_text(
            "\n".join((
                "con_enable 1",
                'bind "F10" "toggleconsole"',
                f'playdemo "{dest.name}"',
            )) + "\n",
            encoding="ascii",
        )
        env = os.environ.copy()
        env["SteamAppId"] = "730"
        env["SteamGameId"] = "730"
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)
        subprocess.Popen(  # noqa: S603
            [str(cs2), "-console", "-novid", "-insecure", "+exec", stem],
            cwd=str(game_root),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=creationflags,
        )
    except Exception:
        return None

    warning = None
    if tick is not None:
        _schedule_windows_tick_injection(tick)
        warning = f"已启动 CS2 并将在加载后尝试自动跳到 tick {tick}"
    return {"ok": True, "warning": warning}


def _cleanup_old_windows_demo_files(csgo_dir: Path, cfg_dir: Path) -> None:
    for folder, pattern in ((csgo_dir, "dak_studio_*.dem"), (cfg_dir, "dak_studio_*.cfg")):
        for path in folder.glob(pattern):
            try:
                path.unlink()
            except OSError:
                pass


def _game_root_from_cs2_exe(cs2: Path) -> Path | None:
    try:
        resolved = cs2.resolve()
        game = resolved.parents[2]
    except (IndexError, OSError):
        return None
    if (game / "csgo").is_dir() and (game / "bin" / "win64" / "cs2.exe").is_file():
        return game
    return None


def _find_cs2_exe() -> Path | None:
    candidates: list[Path] = []
    for library in _steam_library_paths():
        candidates.append(library / "steamapps" / "common" / "Counter-Strike Global Offensive" / "game" / "bin" / "win64" / "cs2.exe")
    for drive in "CDEFGHI":
        candidates.append(Path(f"{drive}:/Program Files (x86)/Steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/cs2.exe"))
        candidates.append(Path(f"{drive}:/SteamLibrary/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/cs2.exe"))
        candidates.append(Path(f"{drive}:/steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/cs2.exe"))
    seen: set[Path] = set()
    for path in candidates:
        normalized = Path(os.path.normcase(str(path)))
        if normalized in seen:
            continue
        seen.add(normalized)
        if path.is_file():
            return path
    return None


def _steam_library_paths() -> list[Path]:
    if not sys.platform.startswith("win"):
        return []
    roots: list[Path] = []
    try:
        import winreg

        for root_key in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
            for subkey in (r"Software\Valve\Steam", r"Software\WOW6432Node\Valve\Steam"):
                try:
                    with winreg.OpenKey(root_key, subkey) as key:
                        for value_name in ("SteamPath", "InstallPath"):
                            try:
                                value, _ = winreg.QueryValueEx(key, value_name)
                            except OSError:
                                continue
                            if value:
                                roots.append(Path(str(value)))
                except OSError:
                    continue
    except Exception:
        pass

    libraries: list[Path] = []
    for root in roots:
        libraries.append(root)
        vdf = root / "steamapps" / "libraryfolders.vdf"
        try:
            text = vdf.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for raw in re.findall(r'"path"\s+"([^"]+)"', text):
            libraries.append(Path(raw.replace("\\\\", "\\")))
    return libraries


def _schedule_windows_tick_injection(tick: int) -> None:
    def run() -> None:
        for delay in (8.0, 6.0, 6.0, 8.0, 10.0, 12.0):
            time.sleep(delay)
            if _inject_windows_console_sequence(["demo_pause", f"demo_gototick {int(tick)}", "demo_resume"]):
                return

    threading.Thread(target=run, name="dak-cs2-demo-seek", daemon=True).start()


def _inject_windows_console_sequence(lines: list[str]) -> bool:
    if not sys.platform.startswith("win"):
        return False
    hwnd = _find_cs2_hwnd()
    if not hwnd:
        return False
    if not _focus_hwnd(hwnd):
        return False
    user32 = ctypes.windll.user32
    time.sleep(0.15)
    _post_key_tap(hwnd, 0x79)  # F10, bound by the temporary cfg to toggleconsole.
    time.sleep(0.25)
    for line in lines:
        for ch in line:
            user32.PostMessageW(hwnd, 0x0102, ord(ch), 1)
            time.sleep(0.002)
        _post_enter(hwnd)
        time.sleep(0.12)
    for ch in "hideconsole":
        user32.PostMessageW(hwnd, 0x0102, ord(ch), 1)
        time.sleep(0.002)
    _post_enter(hwnd)
    return True


def _find_cs2_hwnd() -> int:
    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32
    process_query_limited_information = 0x1000
    found = 0

    def basename_for_hwnd(hwnd: int) -> str | None:
        pid = wintypes.DWORD(0)
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return None
        handle = kernel32.OpenProcess(process_query_limited_information, False, pid.value)
        if not handle:
            return None
        try:
            buf = ctypes.create_unicode_buffer(2048)
            size = wintypes.DWORD(len(buf))
            if not kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
                return None
            return os.path.basename(buf.value or "").lower()
        finally:
            kernel32.CloseHandle(handle)

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def enum(hwnd: int, _lparam: int) -> bool:
        nonlocal found
        if found or not user32.IsWindowVisible(hwnd):
            return False if found else True
        length = user32.GetWindowTextLengthW(hwnd) + 1
        buf = ctypes.create_unicode_buffer(length)
        user32.GetWindowTextW(hwnd, buf, length)
        if "Counter-Strike" in (buf.value or "") and basename_for_hwnd(hwnd) == "cs2.exe":
            found = hwnd
            return False
        return True

    user32.EnumWindows(enum, 0)
    return found


def _focus_hwnd(hwnd: int) -> bool:
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)
    user32.SetForegroundWindow(hwnd)
    user32.BringWindowToTop(hwnd)
    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        if user32.GetForegroundWindow() == hwnd:
            return True
        time.sleep(0.05)
    return False


def _post_key_tap(hwnd: int, vk: int) -> None:
    user32 = ctypes.windll.user32
    scan = int(user32.MapVirtualKeyW(vk, 0)) or 0
    lp_down = (scan << 16) | 1
    lp_up = (1 << 31) | (1 << 30) | (scan << 16) | 1
    user32.PostMessageW(hwnd, 0x0100, vk, lp_down)
    user32.PostMessageW(hwnd, 0x0101, vk, lp_up)


def _post_enter(hwnd: int) -> None:
    user32 = ctypes.windll.user32
    scan_enter = 0x1C
    lp_down = (scan_enter << 16) | 1
    lp_up = (1 << 31) | (1 << 30) | (scan_enter << 16) | 1
    user32.PostMessageW(hwnd, 0x0100, 0x0D, lp_down)
    user32.PostMessageW(hwnd, 0x0101, 0x0D, lp_up)
