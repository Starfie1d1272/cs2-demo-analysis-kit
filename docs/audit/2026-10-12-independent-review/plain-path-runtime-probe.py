"""Replay synthetic brace-bearing paths through actual diagnostic entry points."""
import importlib.util
import json
import logging
import subprocess
import tempfile
import types
from pathlib import Path

raw = r'failed C:\Users\{}\synthetic-private\demo.dem'
for revision in ("08b565d0", "b01785c8", "working-tree"):
    module = types.ModuleType("synthetic_diagnostics")
    if revision == "working-tree":
        source = Path(importlib.util.find_spec("cs2dak.diagnostics").origin).read_text()
    else:
        source = subprocess.check_output(
            ["git", "show", f"{revision}:python/src/cs2dak/diagnostics.py"], text=True)
    exec(compile(source, f"{revision}-diagnostics.py", "exec"), module.__dict__)  # noqa: S102 - pinned repository source.
    print(revision, "sanitize_text", "secret_present=", "synthetic-private" in module.sanitize_text(raw))
    for formatter in ("%(message)s", "%(levelname)s %(message)s",
                      "%(asctime)s %(levelname)s %(name)s %(message)s"):
        for entry in ("error", "log_failure", "exception", "raw_json"):
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                logger = logging.getLogger("cs2dak.synthetic")
                logger.propagate = False
                handler = logging.FileHandler(root / "runtime.log", encoding="utf-8")
                handler.setFormatter(module.SafeFormatter(formatter))
                logger.addHandler(handler)
                try:
                    if entry == "error":
                        logger.error("%s", raw)
                    elif entry == "log_failure":
                        module.log_failure(logger, ValueError(raw))
                    elif entry == "raw_json":
                        logger.error("failure %s", json.dumps({"message": raw}))
                    else:
                        try:
                            raise ValueError(raw)
                        except ValueError:
                            logger.exception("request failed")
                    module.export_logs(logger, root / "export.log")
                    for name in ("runtime.log", "export.log"):
                        content = (root / name).read_text()
                        print(revision, entry, formatter, name,
                              "secret_present=", "synthetic-private" in content,
                              "idempotent=", module.sanitize_text(content, 16000) == content)
                finally:
                    logger.removeHandler(handler)
                    handler.close()
