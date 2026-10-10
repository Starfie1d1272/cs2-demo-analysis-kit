"""Real pywebview reflection boundary, without importing a native backend."""
import json
import threading
from types import SimpleNamespace
from unittest.mock import Mock

from cs2dak import rivalhub_uploader as uploader


def test_real_webview_reflection_never_reads_native_window(tmp_path, monkeypatch):
    import webview
    from webview import util
    touched, scripts = [], []

    class NativeWindow:
        @property
        def native(self):
            touched.append("native")
            raise AssertionError("native getter must never be reflected")

        def run_js(self, script):
            scripts.append(script)

        create_file_dialog = Mock(return_value=None)

    class InlineThread:
        def __init__(self, target):
            self.target = target

        def start(self):
            self.target()

    monkeypatch.setattr(util, "Thread", InlineThread)
    monkeypatch.setattr(util, "load_js_files", lambda *args: ("bootstrap", "%(functions)s"))
    class Event:
        def __init__(self):
            self.count = 0
            self._callbacks = []

        def __iadd__(self, callback):
            self._callbacks.append(callback)
            return self

        def set(self):
            self.count += 1
            for callback in self._callbacks:
                callback()

    window = NativeWindow()
    window._functions = {}
    window._expose_lock = threading.Lock()
    window.events = SimpleNamespace(before_load=Event(), _pywebviewready=Event(), loaded=Event())

    def create_window(*args, js_api, **kwargs):
        window._js_api = js_api
        return window

    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path))
    monkeypatch.setattr(webview, "create_window", create_window)
    monkeypatch.setattr(webview, "start", lambda **kwargs: util.inject_pywebview("edgechromium", window))
    monkeypatch.setattr(uploader, "__file__", str(tmp_path / "rivalhub_uploader.py"))
    (tmp_path / "rivalhub_uploader_web").mkdir()
    (tmp_path / "rivalhub_uploader_web" / "index.html").write_text("<html></html>")
    handlers = list(uploader.log.handlers)
    try:
        # Drive the actual production assignment in main, rather than duplicating its private name.
        uploader.main()
        api = window._js_api
        assert touched == []
        methods = {value["func"] for value in json.loads(scripts[-1])}
        expected = {
            "connection", "configure", "save_connection", "open_website", "request",
            "select_demos", "hash_demo", "start_export", "export_status", "read_chunk",
            "cleanup", "record", "export_logs", "report_ui_error",
        }
        assert methods == expected | {"close"}
        assert window.events._pywebviewready.count == 1
        assert api.select_demos() == []
        assert api.export_logs() is False
        calls = window.create_file_dialog.call_args_list
        assert calls[0].args[0] == webview.FileDialog.OPEN
        assert calls[1].args[0] == webview.FileDialog.SAVE
    finally:
        for handler in list(uploader.log.handlers):
            if handler not in handlers:
                uploader.log.removeHandler(handler)
                import logging
                logging.getLogger("pywebview").removeHandler(handler)
                handler.close()
