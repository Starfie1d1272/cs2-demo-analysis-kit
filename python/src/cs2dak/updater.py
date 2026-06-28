"""应用内更新：镜像失败转移下载 + sha256 校验 + Windows side-by-side 替换。

职责边界：
- 纯函数（``sha256_file`` / ``download_with_fallback`` / ``updates_dir``）跨平台、可单测；
- ``apply_windows_update`` 是 Windows 专属、依赖真实进程与文件锁的接力替换，
  **在 macOS/CI 上无法端到端验证**——只做严格的参数构造与 guard，需 Windows 冒烟测试。

替换策略（Windows 无法删除正在运行的 exe）：
  下载 zip → 校验 → 解压到 install_dir.parent/.dak-update-<ts>/extract/
  → 写 .bat 接力脚本到同级目录：
    1. 等当前进程 PID 退出；
    2. 把旧安装目录改名为 *.old-<ts>；
    3. 把新目录移到原位；
    4. 从 *.old 把 userdata/ 搬回新目录（便携式数据不能丢）；
    5. 启动新 exe；6. 删除 *.old；7. 自删脚本。
  任一步失败回滚（把 *.old 改回原名），保证不变砖。

  注意：staging 目录必须在 install_dir 外部（install_dir.parent），
  不能在 install_dir/userdata 内部——否则 bat 第一步 move install_dir 后
  new_dir 原路径也跟着消失，替换失败回滚。
"""

from __future__ import annotations

import hashlib
import os
import sys
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, Iterable

CHUNK = 1 << 20  # 1 MiB
DOWNLOAD_TIMEOUT_S = 30


class UpdateError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    """文件 sha256（小写 hex）。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def updates_dir(userdata: Path) -> Path:
    """暂存目录：放在 userdata 下，不污染安装目录、且与资料库同盘（move 无跨盘拷贝）。"""
    path = userdata / "updates"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _download_one(url: str, dest: Path, on_progress: Callable[[int], None] | None) -> None:
    received = 0
    req = urllib.request.Request(url, headers={"User-Agent": "DAK-Studio-Updater"})
    with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT_S) as resp:  # noqa: S310 - https URLs from manifest
        with open(dest, "wb") as out:
            while True:
                block = resp.read(CHUNK)
                if not block:
                    break
                out.write(block)
                received += len(block)
                if on_progress:
                    on_progress(received)


def download_with_fallback(
    urls: Iterable[str],
    dest: Path,
    expected_sha256: str | None = None,
    expected_size: int | None = None,
    on_progress: Callable[[int], None] | None = None,
    on_mirror: Callable[[int, str], None] | None = None,
) -> Path:
    """按顺序尝试各 URL，下到 ``dest.part`` 校验通过后原子改名为 ``dest``。

    任一镜像网络失败或校验不符即试下一个；全部失败抛 ``UpdateError``。
    """
    part = dest.with_suffix(dest.suffix + ".part")
    url_list = list(urls)
    if not url_list:
        raise UpdateError("没有可用下载地址")
    last_err: str = ""
    for index, url in enumerate(url_list):
        if on_mirror:
            on_mirror(index, url)
        try:
            part.unlink(missing_ok=True)
            _download_one(url, part, on_progress)
            actual_size = part.stat().st_size
            if expected_size and actual_size != expected_size:
                last_err = f"大小不符（期望 {expected_size}，实际 {actual_size}）"
                continue
            if expected_sha256:
                actual = sha256_file(part)
                if actual.lower() != expected_sha256.lower():
                    last_err = "sha256 校验失败"
                    continue
            part.replace(dest)
            return dest
        except Exception as exc:  # noqa: BLE001 - 任何失败都转移到下一个镜像
            last_err = str(exc) or exc.__class__.__name__
            continue
        finally:
            part.unlink(missing_ok=True)
    raise UpdateError(f"所有镜像下载失败：{last_err}")


def _find_app_root(extract_dir: Path, exe_name: str) -> Path:
    """在解压目录里定位含目标 exe 的应用根目录（zip 顶层通常是 dak-studio/）。"""
    direct = extract_dir / exe_name
    if direct.exists():
        return extract_dir
    for candidate in extract_dir.iterdir():
        if candidate.is_dir() and (candidate / exe_name).exists():
            return candidate
    raise UpdateError(f"更新包内未找到 {exe_name}")


def _relaunch_bat(pid: int, install_dir: Path, new_dir: Path, exe_name: str) -> str:
    """生成接力替换批处理脚本内容。保留 install_dir/userdata。"""
    ts = time.strftime("%Y%m%d%H%M%S")
    old_dir = install_dir.parent / f"{install_dir.name}.old-{ts}"
    target_exe = install_dir / exe_name
    return f"""@echo off
setlocal
set "LOG=%~dp0apply-update.log"
echo [%date% %time%] start update relay >> "%LOG%"
rem 等当前进程退出（最多 ~30s）
set /a tries=0
:waitloop
tasklist /FI "PID eq {pid}" 2>nul | find "{pid}" >nul
if errorlevel 1 goto exited
set /a tries+=1
if %tries% geq 60 goto exited
timeout /t 1 /nobreak >nul
goto waitloop
:exited
timeout /t 2 /nobreak >nul
rem 1) 旧目录改名（释放后可改名）
echo [%date% %time%] move old "{install_dir}" to "{old_dir}" >> "%LOG%"
set /a tries=0
:moveold
move "{install_dir}" "{old_dir}" >> "%LOG%" 2>&1
if not errorlevel 1 goto oldmoved
set /a tries+=1
if %tries% geq 30 goto fail
timeout /t 1 /nobreak >nul
goto moveold
:oldmoved
rem 2) 新目录移到原位
echo [%date% %time%] move new "{new_dir}" to "{install_dir}" >> "%LOG%"
set /a tries=0
:movenew
move "{new_dir}" "{install_dir}" >> "%LOG%" 2>&1
if not errorlevel 1 goto newmoved
set /a tries+=1
if %tries% geq 30 goto rollback
timeout /t 1 /nobreak >nul
goto movenew
:newmoved
rem 3) 搬回 userdata（便携式数据不能丢）
if exist "{old_dir}\\userdata" move "{old_dir}\\userdata" "{install_dir}\\userdata" >nul 2>&1
rem 4) 启动新版本
echo [%date% %time%] start "{target_exe}" >> "%LOG%"
start "" "{target_exe}"
rem 5) 清理旧目录
rmdir /s /q "{old_dir}" >nul 2>&1
goto done
:rollback
echo [%date% %time%] new move failed, rollback >> "%LOG%"
move "{old_dir}" "{install_dir}" >nul 2>&1
start "" "{target_exe}"
goto done
:fail
echo [%date% %time%] old move failed, restart existing app >> "%LOG%"
start "" "{target_exe}"
:done
del "%~f0" >nul 2>&1
"""


def apply_windows_update(
    zip_path: Path,
    install_dir: Path,
    exe_name: str,
    pid: int,
) -> Path:
    """解压更新包并启动接力脚本；调用方随后退出进程让脚本接管。

    仅在 Windows 有意义。返回写出的 .bat 路径（供日志/测试）。

    关键：staging 目录必须放在 install_dir 外部（install_dir.parent），
    不能在 install_dir/userdata 内部——否则 bat 第一步 move install_dir 后，
    new_dir 原路径也跟着消失，替换失败回滚。
    """
    if sys.platform != "win32":
        raise UpdateError("应用内替换目前只支持 Windows")
    ts = time.strftime("%Y%m%d%H%M%S")
    stage_root = install_dir.parent / f".dak-update-{ts}"
    extract_dir = stage_root / "extract"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract_dir)
    new_dir = _find_app_root(extract_dir, exe_name)
    bat_text = _relaunch_bat(pid, install_dir, new_dir, exe_name)
    bat_path = stage_root / "apply-update.bat"
    bat_path.write_text(bat_text, encoding="utf-8")

    import subprocess

    DETACHED = 0x00000008  # DETACHED_PROCESS
    NEW_GROUP = 0x00000200  # CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(  # noqa: S603 - 受控本地脚本
        ["cmd", "/c", str(bat_path)],
        creationflags=DETACHED | NEW_GROUP,
        close_fds=True,
        cwd=str(stage_root),
    )
    return bat_path


def current_install_dir() -> Path:
    """打包后 = exe 同目录；开发模式回退到源码目录（无意义，仅占位）。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


def current_exe_name() -> str:
    return Path(sys.executable).name if getattr(sys, "frozen", False) else "dak-studio.exe"


def current_pid() -> int:
    return os.getpid()
