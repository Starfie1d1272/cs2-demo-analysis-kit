"""DAK Studio Web Installer — 极简 tkinter GUI。

从 R2 拉取 install-manifest.json，下载 runtime + bundled-events + requiredTris，
解压/放置到安装目录，创建快捷方式。不作断点续传、wizard、卸载器。
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import tkinter as tk
import tkinter.filedialog
import tkinter.messagebox
import tkinter.ttk as ttk
import urllib.request
import zipfile
from pathlib import Path

from cs2dak import __version__ as INSTALLER_VERSION
from cs2dak import updater

# R2 端点（稳定，不随版本变化）
MANIFEST_URL_LATEST = "https://dakupdate.starfie1d.top/releases/install-manifest.json"
MANIFEST_URL_VERSIONED = f"https://dakupdate.starfie1d.top/releases/v{INSTALLER_VERSION}/install-manifest.json"

USER_AGENT = f"DAK-Studio-Installer/{INSTALLER_VERSION}"


def fmt_mb(n: int) -> str:
    return f"{n / 1024 / 1024:.0f} MB"


def download_with_progress(url: str, dest: str, expected_sha256: str | None = None,
                          expected_size: int | None = None,
                          on_progress=None, should_cancel=None) -> None:
    """单文件下载；镜像 fallback 由调用方遍历 urls[]。"""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        part = dest + ".part"
        try:
            with open(part, "wb") as f:
                while True:
                    if should_cancel and should_cancel():
                        raise RuntimeError("已取消")
                    chunk = resp.read(1 << 20)  # 1 MiB
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if on_progress and total > 0:
                        on_progress(downloaded, total)
            # sha256 校验
            if expected_sha256:
                import hashlib
                actual = hashlib.sha256()
                with open(part, "rb") as f:
                    while True:
                        chunk = f.read(1 << 20)
                        if not chunk:
                            break
                        actual.update(chunk)
                if actual.hexdigest() != expected_sha256:
                    os.unlink(part)
                    raise RuntimeError(f"sha256 校验失败：{url}")
            if expected_size and os.path.getsize(part) != expected_size:
                os.unlink(part)
                raise RuntimeError(f"文件大小不匹配：{url}")
            os.replace(part, dest)
        except Exception:
            if os.path.exists(part):
                os.unlink(part)
            raise


def create_shortcut(target: str, shortcut_path: str, description: str = "") -> None:
    """创建 Windows .lnk 快捷方式。"""
    try:
        import pythoncom
        from win32com.client import Dispatch

        pythoncom.CoInitialize()
        shell = Dispatch("WScript.Shell")
        shortcut = shell.CreateShortCut(shortcut_path)
        shortcut.Targetpath = target
        shortcut.WorkingDirectory = os.path.dirname(target)
        shortcut.Description = description or "DAK Studio 战术分析工作台"
        shortcut.Save()
    except Exception:
        # 快捷方式创建失败不阻塞安装
        pass


class SimpleInstaller:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"DAK Studio v{INSTALLER_VERSION} 安装器")
        self.root.geometry("640x500")
        self.root.resizable(False, False)
        self.root.configure(bg="#0f1720")
        self._setup_style()
        self.manifest = None
        self.install_dir = tk.StringVar(value="")
        self.cancelled = False

        # 头
        header = ttk.Frame(self.root, style="Panel.TFrame")
        header.pack(fill="x", padx=28, pady=(24, 12))
        ttk.Label(header, text="DAK Studio", style="Title.TLabel").pack(anchor="w", padx=18, pady=(16, 2))
        ttk.Label(header, text="本地 demo 工作台安装器", style="Subtitle.TLabel").pack(anchor="w", padx=18)
        ttk.Label(header, text=f"安装器 v{INSTALLER_VERSION} · 从官方镜像下载运行时、赛事包和地图数据", style="Muted.TLabel").pack(anchor="w", padx=18, pady=(8, 16))

        # 目录选择
        dir_frame = ttk.Frame(self.root, style="App.TFrame")
        dir_frame.pack(fill="x", padx=28, pady=(8, 5))
        ttk.Label(dir_frame, text="安装目录", style="Label.TLabel").pack(anchor="w")
        path_row = ttk.Frame(dir_frame, style="App.TFrame")
        path_row.pack(fill="x", pady=(6, 0))
        ttk.Entry(path_row, textvariable=self.install_dir, width=54).pack(side="left", fill="x", expand=True, padx=(0, 8))
        ttk.Button(path_row, text="浏览…", command=self._pick_dir).pack(side="left")

        # 状态/进度区域
        self.status_var = tk.StringVar(value="准备好安装")
        self.progress_var = tk.DoubleVar(value=0)
        self.detail_var = tk.StringVar(value="")

        status_frame = ttk.Frame(self.root, style="Panel.TFrame")
        status_frame.pack(fill="x", padx=28, pady=(14, 8))
        ttk.Label(status_frame, textvariable=self.status_var, style="Status.TLabel", wraplength=560, justify="left").pack(anchor="w", padx=18, pady=(16, 8))
        self.progress_bar = ttk.Progressbar(status_frame, variable=self.progress_var, maximum=100, length=560)
        self.progress_bar.pack(fill="x", padx=18)
        ttk.Label(status_frame, textvariable=self.detail_var, style="Muted.TLabel", wraplength=560).pack(anchor="w", padx=18, pady=(8, 16))

        # 按钮
        btn_frame = ttk.Frame(self.root, style="App.TFrame")
        btn_frame.pack(fill="x", padx=28, pady=(10, 20))
        self.start_btn = ttk.Button(btn_frame, text="开始安装", command=self._start_install)
        self.start_btn.pack(side="left", padx=(0, 8))
        self.cancel_btn = ttk.Button(btn_frame, text="取消", command=self._cancel, state="disabled")
        self.cancel_btn.pack(side="left", padx=8)
        self.launch_btn = ttk.Button(btn_frame, text="启动 DAK Studio", command=self._launch, state="disabled")
        self.launch_btn.pack(side="right")

        # 默认安装目录
        if sys.platform == "win32":
            local = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
            default_dir = os.path.join(local, "Programs", "DAK Studio")
        else:
            default_dir = os.path.join(str(Path.home()), "DAK-Studio")
        self.install_dir.set(default_dir)

    def _setup_style(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass
        bg = "#0f1720"
        panel = "#17212b"
        text = "#e8edf2"
        muted = "#96a3af"
        accent = "#60d394"
        style.configure("App.TFrame", background=bg)
        style.configure("Panel.TFrame", background=panel)
        style.configure("Title.TLabel", background=panel, foreground=text, font=("", 22, "bold"))
        style.configure("Subtitle.TLabel", background=panel, foreground=text, font=("", 11, "bold"))
        style.configure("Muted.TLabel", background=panel, foreground=muted)
        style.configure("Label.TLabel", background=bg, foreground=text, font=("", 10, "bold"))
        style.configure("Status.TLabel", background=panel, foreground=text)
        style.configure("TButton", padding=(12, 6))
        style.configure("Horizontal.TProgressbar", troughcolor="#0b1118", background=accent, bordercolor="#0b1118", lightcolor=accent, darkcolor=accent)

    def _pick_dir(self):
        path = tkinter.filedialog.askdirectory(title="选择 DAK Studio 安装目录")
        if path:
            self.install_dir.set(path)

    def _cancel(self):
        self.cancelled = True
        self.status_var.set("正在取消…")

    def _set_ui_state(self, installing: bool, done: bool = False):
        self.start_btn.config(state="disabled" if installing or done else "normal")
        self.cancel_btn.config(state="normal" if installing else "disabled")
        self.launch_btn.config(state="normal" if done else "disabled")

    def _start_install(self):
        install_dir = self.install_dir.get().strip()
        if not install_dir:
            tkinter.messagebox.showerror("错误", "请选择安装目录")
            return
        try:
            os.makedirs(install_dir, exist_ok=True)
        except Exception as exc:
            tkinter.messagebox.showerror("错误", f"无法创建安装目录：{exc}")
            return

        self.cancelled = False
        self._set_ui_state(installing=True)
        threading.Thread(target=self._install_run, args=(install_dir,), daemon=True).start()

    def _install_run(self, install_dir: str):
        try:
            # 1. Fetch manifest
            self._update("正在获取安装清单…", 5)
            manifest = self._fetch_manifest()
            self.manifest = manifest

            runtime = manifest["runtime"]
            app_version = manifest.get("appVersion", INSTALLER_VERSION)
            events = manifest.get("bundledEvents", [])
            tris = manifest.get("requiredTris", {})
            total_size = runtime["size"] + sum(e["size"] for e in events) + sum(t["size"] for t in tris.values())

            # Show summary
            summary = (
                f"版本:          DAK Studio v{app_version}\n"
                f"运行时:        {fmt_mb(runtime['size'])}\n"
                f"内置赛事:     {fmt_mb(sum(e['size'] for e in events))}  ({len(events)} 个包)\n"
                f"地图数据:     {fmt_mb(sum(t['size'] for t in tris.values()))}  ({len(tris)} 张地图)\n"
                f"─────────────────────────\n"
                f"总计:         {fmt_mb(total_size)}"
            )
            self.root.after(0, lambda: self.status_var.set(f"准备下载：\n{summary}"))

            if not tkinter.messagebox.askyesno("确认安装", f"将从网络下载以下内容到 {install_dir}：\n\n{summary}\n\n继续？"):
                self._update("已取消", 0)
                self.root.after(0, lambda: self._set_ui_state(installing=False, done=False))
                return

            if self.cancelled:
                return

            # 2. Download runtime
            self._update("下载运行时…", 10)
            runtime_dest = os.path.join(install_dir, runtime["name"])
            self._download_asset(runtime, runtime_dest, "运行时")

            if self.cancelled:
                return

            # 3. Extract runtime & resolve app root (where dak-studio.exe lives)
            self._update("解压运行时…", 50)
            self._extract_runtime(runtime_dest, install_dir)
            app_root = self._app_root(install_dir)
            if not app_root:
                raise RuntimeError("解压后未找到 dak-studio.exe，安装包可能不完整")
            self._launch_exe = os.path.join(app_root, "dak-studio.exe")

            # 4. Download bundled events → app_root/assets/
            userdata = os.path.join(app_root, "userdata")
            assets = os.path.join(app_root, "assets")
            os.makedirs(userdata, exist_ok=True)
            bundled_dir = os.path.join(assets, "bundled-events")
            os.makedirs(bundled_dir, exist_ok=True)
            for idx, evt in enumerate(events):
                if self.cancelled:
                    return
                self._update(f"下载赛事包 {idx + 1}/{len(events)}：{evt['slug']}…", 55 + int(20 * idx / max(len(events), 1)))
                dest = os.path.join(bundled_dir, f"{evt['slug']}.zip")
                self._download_asset(evt, dest, evt["slug"])

            # Write manifest.json for bundled events
            events_manifest = {
                "version": "cs2-demo-analysis-kit/events-manifest-1.0",
                "events": [
                    {"slug": e["slug"], "name": e.get("name", e["slug"]), "size": e["size"],
                     "sha256": e["sha256"], "urls": e["urls"], "packageVersion": "cs2-demo-analysis-kit/event-package-1.0"}
                    for e in events
                ]
            }
            with open(os.path.join(bundled_dir, "manifest.json"), "w", encoding="utf-8") as f:
                json.dump(events_manifest, f, ensure_ascii=False, indent=2)

            # 5. Download required tris → app_root/assets/tris/
            tris_dir = os.path.join(assets, "tris")
            os.makedirs(tris_dir, exist_ok=True)
            tri_count = len(tris)
            for idx, (map_name, entry) in enumerate(tris.items()):
                if self.cancelled:
                    return
                self._update(f"下载地图数据 {idx + 1}/{tri_count}：{map_name}…", 75 + int(20 * idx / max(tri_count, 1)))
                dest = os.path.join(tris_dir, entry.get("name", f"{map_name}.tri"))
                self._download_asset(entry, dest, map_name)

            # 6. Write install-manifest.json → app_root/assets/
            self._update("写入安装清单…", 95)
            with open(os.path.join(assets, "install-manifest.json"), "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, indent=2)

            # 7. Create shortcuts (Windows only) — use resolved app_root exe
            if sys.platform == "win32" and self._launch_exe:
                self._update("创建快捷方式…", 97)
                start_menu = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs")
                shortcut_dir = os.path.join(start_menu, "DAK Studio")
                os.makedirs(shortcut_dir, exist_ok=True)
                create_shortcut(self._launch_exe, os.path.join(shortcut_dir, "DAK Studio.lnk"), "DAK Studio 战术分析工作台")

            # Done
            self._update("安装完成！", 100)
            self.root.after(0, lambda: self._set_ui_state(installing=False, done=True))

        except Exception as exc:
            self._update(f"安装失败：{exc}", 0)
            self.root.after(0, lambda: self._set_ui_state(installing=False, done=False))
            tkinter.messagebox.showerror("安装失败", str(exc))

    def _fetch_manifest(self) -> dict:
        """按优先级拉 manifest：latest → versioned → 报错。"""
        urls = [MANIFEST_URL_LATEST, MANIFEST_URL_VERSIONED]
        last_err = None
        for url in urls:
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
                with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue
        raise RuntimeError(f"无法获取安装清单：{last_err}")

    def _download_asset(self, entry: dict, dest: str, label: str) -> None:
        """下载单个资产（skip if same hash）。"""
        expected_sha256 = entry.get("sha256")
        expected_size = entry.get("size")

        # 跳过已存在且 hash 匹配的文件
        if os.path.isfile(dest) and expected_sha256:
            import hashlib
            h = hashlib.sha256()
            with open(dest, "rb") as f:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    h.update(chunk)
            if h.hexdigest() == expected_sha256:
                self.root.after(0, lambda: self.detail_var.set(f"  {label}：已存在，跳过"))
                return
            else:
                os.unlink(dest)

        urls = entry.get("urls", [])
        last_err = None
        for url in urls:
            try:
                def _progress(dl, total):
                    if total > 0:
                        self.root.after(0, lambda: self.detail_var.set(
                            f"  {label}：{dl / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MB"
                        ))
                download_with_progress(
                    url,
                    dest,
                    expected_sha256=expected_sha256,
                    expected_size=expected_size,
                    on_progress=_progress,
                    should_cancel=lambda: self.cancelled,
                )
                return
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue
        raise RuntimeError(f"下载 {label} 失败：{last_err}")

    @staticmethod
    def _extract_runtime(zip_path: str, install_dir: str) -> None:
        """解压 runtime zip 到安装目录。zip 内有一个顶层 onedir。"""
        with zipfile.ZipFile(zip_path) as zf:
            updater.safe_extract_zip(zf, Path(install_dir))
        # 如果所有内容在单个子目录中，不 flatten（保持 onedir 结构）
        # 运行时 zip 的顶层就是 onedir 目录，extractall 到 install_dir 后结构：
        #   install_dir/dak-studio/...

    @staticmethod
    def _app_root(install_dir: str) -> str | None:
        """解压 runtime zip 后找到 dak-studio.exe 所在目录。

        runtime zip 内含一个顶层 onedir（如 dak-studio/），dak-studio.exe 在其中。
        返回该目录的绝对路径，找不到则返回 None。
        """
        for root, dirs, files in os.walk(install_dir):
            for f in files:
                if f.lower() in ("dak-studio.exe", "dak studio.exe"):
                    return root
        return None

    def _launch(self):
        exe = getattr(self, "_launch_exe", None)
        if not exe:
            exe = self._app_root(self.install_dir.get())
            if exe:
                exe = os.path.join(exe, "dak-studio.exe")
        if exe and os.path.isfile(exe):
            subprocess.Popen([exe], cwd=os.path.dirname(exe))  # noqa: S603
        self.root.destroy()

    def _update(self, status: str, progress: float):
        self.root.after(0, lambda: self.status_var.set(status))
        self.root.after(0, lambda: self.progress_var.set(progress))

    def run(self):
        self.root.mainloop()


def main():
    app = SimpleInstaller()
    app.run()


if __name__ == "__main__":
    main()
