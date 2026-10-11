"""Synthetic exact-revision comparison; run with uv run from python/."""
import importlib.util
import logging
import subprocess
import tempfile
import types
from pathlib import Path

for revision in ("519db1cf", "08b565d0", "working-tree"):
    module = types.ModuleType("synthetic_diagnostics")
    if revision == "working-tree":
        spec = importlib.util.find_spec("cs2dak.diagnostics")
        source = Path(spec.origin).read_text()
    else:
        source = subprocess.check_output(
            ["git", "show", f"{revision}:python/src/cs2dak/diagnostics.py"], text=True)
    exec(compile(source, f"{revision}-diagnostics.py", "exec"), module.__dict__)  # noqa: S102 - only pinned repository source, synthetic inputs.
    for entry in ("log_failure", "exception"):
        for reason in ("connection refused", "连接失败"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                logger = logging.getLogger("synthetic-probe")
                logger.propagate = False
                handler = logging.FileHandler(root / "runtime.log", encoding="utf-8")
                handler.setFormatter(module.SafeFormatter("%(levelname)s %(message)s"))
                logger.addHandler(handler)
                try:
                    exc = ValueError(f'password="secret words" reason={reason}')
                    if entry == "log_failure":
                        module.log_failure(logger, exc, "request")
                    else:
                        try:
                            raise exc
                        except ValueError:
                            logger.exception("request failed")
                    module.export_logs(logger, root / "export.log")
                    for name in ("runtime.log", "export.log"):
                        content = (root / name).read_text()
                        print(revision, entry, reason, name,
                              "secret_present=", "secret words" in content,
                              "reason_present=", "reason=" + reason in content,
                              "idempotent=", module.sanitize_text(content, 16000) == content)
                finally:
                    logger.removeHandler(handler)
                    handler.close()
