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
    4. 从 *.old 把 userdata/assets/cache/updates 搬回新目录（便携式数据不能丢）；
    5. 全部持久目录迁移成功后启动新 exe；6. 保留 *.old 供恢复；7. 自删脚本。
  新程序移动失败时尝试回滚；持久目录迁移失败时停止启动和清理，
  保留新旧目录及接力日志，供人工恢复，不宣称跨目录事务。

  注意：staging 目录必须在 install_dir 外部（install_dir.parent），
  不能在 install_dir/userdata 内部——否则 bat 第一步 move install_dir 后
  new_dir 原路径也跟着消失，替换失败回滚。
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, Iterable

from cs2dak.diagnostics import SourceFailures, log_failure

CHUNK = 1 << 20  # 1 MiB
DOWNLOAD_TIMEOUT_S = 30
PERSISTENT_INSTALL_DIRS = ("userdata", "assets", "cache", "updates")


class UpdateError(SourceFailures):
    pass


def sha256_file(path: Path) -> str:
    """文件 sha256（小写 hex）。"""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def updates_dir(updates_root: Path) -> Path:
    """下载暂存目录：放在 updates/downloads，不污染用户资料库。"""
    path = updates_root / "downloads"
    path.mkdir(parents=True, exist_ok=True)
    return path


def safe_extract_zip(zf: zipfile.ZipFile, dest: Path) -> None:
    """Extract a zip without allowing entries to escape ``dest``."""
    root = dest.resolve()
    for member in zf.infolist():
        target = (dest / member.filename).resolve()
        if target != root and root not in target.parents:
            raise UpdateError(f"更新包包含非法路径：{member.filename}")
    zf.extractall(dest)


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
    failures = UpdateError("所有镜像下载失败", "update_download")
    for index, url in enumerate(url_list):
        if on_mirror:
            on_mirror(index, url)
        try:
            part.unlink(missing_ok=True)
            _download_one(url, part, on_progress)
            actual_size = part.stat().st_size
            if expected_size and actual_size != expected_size:
                raise ValueError(f"大小不符（期望 {expected_size}，实际 {actual_size}）")
            if expected_sha256:
                actual = sha256_file(part)
                if actual.lower() != expected_sha256.lower():
                    raise ValueError("sha256 校验失败")
            part.replace(dest)
            return dest
        except Exception as exc:  # noqa: BLE001 - 任何失败都转移到下一个镜像
            failures.add(index + 1, exc)
            continue
        finally:
            try:
                part.unlink(missing_ok=True)
            except OSError as cleanup_error:
                log_failure(logging.getLogger("cs2dak.updater"), cleanup_error, "update_download.cleanup")
    raise failures from None


def _find_app_root(extract_dir: Path, exe_name: str) -> Path:
    """在解压目录里定位含目标 exe 的应用根目录（zip 顶层通常是 dak-studio/）。"""
    direct = extract_dir / exe_name
    if direct.exists():
        return extract_dir
    for candidate in extract_dir.iterdir():
        if candidate.is_dir() and (candidate / exe_name).exists():
            return candidate
    raise UpdateError(f"更新包内未找到 {exe_name}")


def install_runtime_archive(zip_path: Path, install_dir: Path, exe_name: str = "dak-studio.exe") -> Path:
    """将 runtime ZIP 的 app root 内容安装到选定目录并返回新 exe。

    runtime ZIP 可以带一个顶层 onedir，也可以直接包含 exe。最终安装目录
    始终就是用户选择的目录；userdata/assets/cache/updates 由用户持有，升级时
    不会被 runtime 内容覆盖。
    """
    install_dir = install_dir.resolve()
    install_dir.mkdir(parents=True, exist_ok=True)
    install_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".dak-runtime-", dir=str(install_dir.parent)) as temp:
        extract_dir = Path(temp) / "extract"
        extract_dir.mkdir()
        with zipfile.ZipFile(zip_path) as zf:
            safe_extract_zip(zf, extract_dir)
        archive_root = _find_app_root(extract_dir, exe_name)
        configured = os.environ.get("DAK_STUDIO_DATA_DIR")
        if configured:
            try:
                relative_data = Path(configured).expanduser().absolute().relative_to(install_dir)
            except ValueError:
                relative_data = None
            incoming = {path.name.lower() for path in archive_root.iterdir() if path.name.lower() not in PERSISTENT_INSTALL_DIRS}
            if relative_data is not None and (not relative_data.parts or relative_data.parts[0].lower() in incoming):
                raise UpdateError("自定义资料位置会被运行时文件覆盖；安装已停止，未删除原资料。请保留原目录、备份 SQLite 和 Demo ZIP 并联系支持确认安全迁移位置。", "install_runtime.custom_data")

        # 清理旧 installer 产生的 install_dir/<top-level>/... 嵌套 runtime。
        nested_root = install_dir / archive_root.name
        if nested_root != install_dir and (nested_root / exe_name).is_file():
            preserved = [name for name in PERSISTENT_INSTALL_DIRS if (nested_root / name).exists()]
            if preserved:
                raise UpdateError(
                    f"旧嵌套安装目录包含持久资料（{', '.join(preserved)}）；"
                    "安装已停止，未删除旧目录；请备份旧目录及外层安装目录的资料，"
                    "保留原始 ZIP 和 SQLite，并联系支持确认迁移位置后重试。",
                    "install_runtime.persistent_data",
                )
            # Unknown files may be custom user data. Installing the outer runtime
            # does not require deleting the obsolete nested application.

        for source in archive_root.iterdir():
            if source.name in PERSISTENT_INSTALL_DIRS:
                continue
            target = install_dir / source.name
            if target.is_dir() and not target.is_symlink():
                shutil.rmtree(target)
            elif target.exists() or target.is_symlink():
                target.unlink()
            if source.is_dir():
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)

    target_exe = install_dir / exe_name
    if not target_exe.is_file():
        raise UpdateError(f"安装后未找到 {exe_name}")
    return target_exe


def _relaunch_bat(pid: int, install_dir: Path, new_dir: Path, exe_name: str) -> str:
    """生成接力替换批处理脚本内容。保留用户数据、资产、缓存与更新暂存。"""
    ts = time.strftime("%Y%m%d%H%M%S")
    old_dir = install_dir.parent / f"{install_dir.name}.old-{ts}"
    target_exe = install_dir / exe_name
    migrate = "\n".join(f'''if not exist "{old_dir}\\{name}" goto migrated_{name}
if exist "{install_dir}\\{name}" goto migrationfailed
move "{old_dir}\\{name}" "{install_dir}\\{name}" >> "%LOG%" 2>&1
if errorlevel 1 goto migrationfailed
if exist "{old_dir}\\{name}" goto migrationfailed
if not exist "{install_dir}\\{name}\\" goto migrationfailed
:migrated_{name}''' for name in PERSISTENT_INSTALL_DIRS)
    return f"""@echo off
setlocal
set "LOG=%~dp0apply-update.log"
echo [%date% %time%] start update relay >> "%LOG%"
rem 等当前进程退出（最多 ~30s）
set /a tries=0
:waitloop
set "DAK_PID_FOUND="
for /f "tokens=1,2 delims=," %%A in ('tasklist /FI "PID eq {pid}" /FO CSV /NH 2^>nul') do if "%%~B"=="{pid}" set "DAK_PID_FOUND=1"
if not defined DAK_PID_FOUND goto exited
set /a tries+=1
if %tries% geq 60 goto exited
timeout /t 1 /nobreak >nul
goto waitloop
:exited
timeout /t 2 /nobreak >nul
rem 1) 旧目录改名（释放后可改名）
echo [%date% %time%] move old "{install_dir}" to "{old_dir}" >> "%LOG%"
set /a tries=0
if exist "{old_dir}" goto fail
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
rem 3) 搬回持久目录；失败保留所有目录，禁止启动新版本或删除旧目录
{migrate}
rem 4) 启动新版本
echo [%date% %time%] start "{target_exe}" >> "%LOG%"
start "" "{target_exe}"
rem 5) 保留旧目录；非白名单文件与自定义资料不能由成功清理删除
echo [%date% %time%] Old installation retained for recovery: "{old_dir}". >> "%LOG%"
goto done
:migrationfailed
echo [%date% %time%] Persistent data migration failed. Update stopped; new app was not started. >> "%LOG%"
echo Keep both directories: "{old_dir}" and "{install_dir}". >> "%LOG%"
echo Back up userdata/assets/cache/updates from BOTH locations before merging or retrying. Do not delete either directory. >> "%LOG%"
echo Contact support with this log; restore each preserved directory to its original install location after closing all app processes. >> "%LOG%"
start "" notepad.exe "%LOG%"
exit /b 1
:rollback
echo [%date% %time%] new move failed, rollback >> "%LOG%"
move "{old_dir}" "{install_dir}" >nul 2>&1
start "" "{target_exe}"
goto done
:fail
echo [%date% %time%] old move failed, restart existing app >> "%LOG%"
start "" "{target_exe}"
:done
del "%~f0" >nul 2>&1 & exit /b 0
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
        safe_extract_zip(zf, extract_dir)
    new_dir = _find_app_root(extract_dir, exe_name)
    bat_text = _relaunch_bat(pid, install_dir, new_dir, exe_name)
    bat_path = stage_root / "apply-update.bat"
    bat_path.write_text(bat_text, encoding="utf-8")

    import subprocess

    NO_WINDOW = 0x08000000  # CREATE_NO_WINDOW
    NEW_GROUP = 0x00000200  # CREATE_NEW_PROCESS_GROUP
    subprocess.Popen(  # noqa: S603 - 受控本地脚本
        ["cmd", "/c", str(bat_path)],
        creationflags=NO_WINDOW | NEW_GROUP,
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
