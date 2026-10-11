"""Bounded diagnostics shared by the desktop shells; never export raw payloads."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from types import TracebackType


class SourceFailures(RuntimeError):
    """Bounded, redacted mirror history; source numbers never reveal URLs."""

    def __init__(self, message: str, stage: str = "download"):
        super().__init__(sanitize_text(message, 200))
        self.stage = stage
        self.failures: list[dict] = []
        self.omitted = 0

    def add(self, source: int, error: Exception) -> None:
        if len(self.failures) >= 8:
            self.omitted += 1
            return
        detail = safe_exception(error, self.stage)
        inner = "; ".join(f"{item['type']}: {item['message']}" for item in detail["causes"][1:3])
        self.failures.append({"source": source, "type": detail["type"],
                              "message": sanitize_text(detail["message"], 180),
                              "cause": sanitize_text(inner, 180)})

    def __str__(self) -> str:
        items = [f"源 {item['source']} {item['type']}：{item['message']}"
                 + (f"（内层：{item['cause']}）" if item["cause"] else "") for item in self.failures]
        if self.omitted:
            items.append(f"另有 {self.omitted} 个来源失败")
        return super().__str__() + ("；" + "；".join(items) if items else "")


_SECRET_KEY = (r"authorization|(?:access|refresh|device|poll|session|auth|id)[_-]?token|"
               r"token|password|passwd|credential|secret|pairing[_-]?code|device[_-]?code|client[_-]?secret|api[_-]?key")
_QUOTED_VALUE = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\''
_CREDENTIAL_SPAN = re.compile(
    rf"(?i)[\"']?(?:{_SECRET_KEY})[\"']?\s*[:=]\s*(?:{_QUOTED_VALUE}|[^\r\n,;}}]+)|"
    rf"[\"']?(?:set-cookie|cookie)[\"']?\s*[:=]\s*(?:{_QUOTED_VALUE}|[^\r\n]+)"
)

# Only complete, single-line objects at actual diagnostic log boundaries are
# decoded. A brace in a path or arbitrary prose never splits the plain value.
_STRUCTURED_LINE = re.compile(
    r"(?m)^(?:\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} )?"
    r"(?:(?:DEBUG|INFO|WARNING|ERROR|CRITICAL) (?:[A-Za-z0-9_.-]+ )?)?"
    r"(?:failure |frontend diagnostic |export job [A-Za-z0-9_-]+ failed: |"
    r"demo=[A-Za-z0-9_-]* phase=[A-Za-z0-9_-]* code=[A-Za-z0-9_-]* diagnostic=|"
    rf"ui startup error message=(?:{_QUOTED_VALUE}) stack=(?:{_QUOTED_VALUE}) diagnostic=)?"
    r"(?P<object>\{[^\r\n]*\})[ \t]*\r?$"
)


def sanitize_text(value, limit: int = 2000) -> str:
    try:
        text = str(value)
    except Exception:  # noqa: BLE001 - diagnostics must survive broken exception __str__.
        text = "[unprintable]"
    # JSON serialization escapes credential quotes inside message/cause strings.
    # Decode a complete object before applying the same plain-text policy to its
    # fields. No payload or marker is trusted; formatter and export both recheck.
    text = _sanitize_log_text(text)
    return text[:limit] + ("…" if len(text) > limit else "")


def _sanitize_json(value):
    if isinstance(value, dict):
        return {_sanitize_plain_text(key)[:16000]: "[redacted]"
                if re.search(rf"(?i)(?:{_SECRET_KEY}|set-cookie|cookie)$", key)
                else _sanitize_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, str):
        return _sanitize_plain_text(value)
    return value


def _sanitize_log_text(text: str) -> str:
    pieces = []
    cursor = 0
    credentials = iter(_CREDENTIAL_SPAN.finditer(text))
    credential = next(credentials, None)
    for line in _STRUCTURED_LINE.finditer(text):
        start = line.start("object")
        while credential is not None and credential.end() <= start:
            credential = next(credentials, None)
        # A protocol-looking line inside a quoted multiline credential remains
        # part of that complete secret value; it cannot create a trusted boundary.
        if credential is not None and credential.start() < start < credential.end():
            continue
        try:
            value = json.loads(line.group("object"))
            safe = json.dumps(_sanitize_json(value), ensure_ascii=False)
        except (ValueError, RecursionError):
            continue
        pieces.extend((_sanitize_plain_text(text[cursor:start]), safe))
        cursor = line.end()
    pieces.append(_sanitize_plain_text(text[cursor:]))
    return "".join(pieces)


def _sanitize_plain_text(text: str) -> str:
    secret_key = _SECRET_KEY
    # JSON quoted strings can contain escaped quotes; consume the complete value.
    quoted_value = _QUOTED_VALUE
    # Retain quoted boundaries for another pass; never trust a bare marker from input.
    def redact_credential(match):
        value = match.group(2)
        quote = value[0] if value.startswith(('"', "'")) else ""
        return match.group(1) + quote + "[redacted]" + quote

    text = re.sub(
        rf"(?i)([\"']?(?:{secret_key})[\"']?\s*[:=]\s*)({quoted_value}|[^\r\n,;}}]+)",
        redact_credential, text,
    )
    text = re.sub(
        rf"(?i)([\"']?(?:set-cookie|cookie)[\"']?\s*[:=]\s*)(?:{quoted_value}|[^\r\n]+)",
        r"\1[redacted]", text,
    )
    # Parse complete credential values before URL rules can alter escaped quotes.
    text = re.sub(r"(?i)\b(?:https?|file)://[^\s<>\"']+", "[url]", text)
    text = re.sub(r"(?i)\b(Bearer|Basic)\s+[^\s,;\"']+", r"\1 [redacted]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[redacted]", text)
    text = re.sub(r"(?i)(?:[a-z]:[\\/]|\\\\)[^\r\n\"'<>]+", "[path]", text)
    text = re.sub(r"(?<![\w:])/(?:[^/\r\n\"'<>]+/)+[^\r\n\"'<>:,]+", "[path]", text)
    text = re.sub(r"(?<![\w:])/(?:[^\s\"'<>:,]+/)*[^\s\"'<>:,]+", "[path]", text)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text


def _attribute(value, name):
    try:
        return getattr(value, name, None)
    except Exception:  # noqa: BLE001 - diagnostic accessors must not replace the first failure.
        return None


def _frames(exc) -> list[dict]:
    result = []
    current = _attribute(exc, "__traceback__")
    while isinstance(current, TracebackType) and len(result) < 24:
        code = current.tb_frame.f_code
        result.append({"file": sanitize_text(code.co_filename.replace("\\", "/").rsplit("/", 1)[-1], 200),
                       "function": sanitize_text(code.co_name, 100), "line": current.tb_lineno})
        current = current.tb_next
    return result


def _flush(logger):
    for handler in logger.handlers:
        try:
            handler.flush()
        except Exception:  # noqa: BLE001, S110 - unavailable diagnostic storage must not mask the failure.
            pass


def safe_exception(exc: BaseException, stage: str = "unknown") -> dict:
    causes = []
    pending = [(exc, "error")]
    seen = set()
    while pending and len(causes) < 8:
        error, relation = pending.pop(0)
        if id(error) in seen:
            continue
        seen.add(id(error))
        causes.append({"type": sanitize_text(type(error).__name__, 100),
                       "message": sanitize_text(error, 1000), "relation": relation, "frames": _frames(error)})
        for attr in ("__cause__", "__context__", "InnerException"):
            inner = _attribute(error, attr)
            if inner is not None:
                pending.append((inner, attr))
    result = {"stage": sanitize_text(stage, 100), "type": causes[0]["type"],
              "message": causes[0]["message"], "causes": causes,
              "cause": sanitize_text("; ".join(
                  f"{item['relation']} {item['type']}: {item['message']}" for item in causes), 4000)}
    if any("Loader.Initialize" in item["message"] or "ClrLoader" in item["message"] for item in causes):
        result["guidance"] = ("请保留诊断日志并重运行官方安装器修复完整应用；确认 .NET Framework 4.8 "
                              "和 WebView2 Runtime 已安装。Loader.Initialize 的具体原因仍需根据异常链排查。")
    return result


def safe_metadata(value) -> dict:
    """Accept only the narrow UI failure contract, never arbitrary JSON bodies."""
    if not isinstance(value, dict):
        return {}
    result = {}
    for key, limit in {"code": 80, "message": 1000, "cause": 4000, "requestId": 160,
                       "stage": 100, "fileId": 80}.items():
        if isinstance(value.get(key), str):
            result[key] = sanitize_text(value[key], limit)
    for key in ("status", "attempt"):
        number = value.get(key)
        if type(number) is int and 0 <= number <= 9999:
            result[key] = number
    return result


class SafeFormatter(logging.Formatter):
    def formatException(self, exc_info) -> str:
        return json.dumps(safe_exception(exc_info[1]), ensure_ascii=False)

    def format(self, record: logging.LogRecord) -> str:
        previous = record.exc_text
        record.exc_text = None
        try:
            return sanitize_text(super().format(record), 16000)
        finally:
            record.exc_text = previous


def log_failure(logger: logging.Logger, exc: BaseException, stage: str = "unknown") -> dict:
    failure = safe_exception(exc, stage)
    try:
        logger.error("failure %s", json.dumps(failure, ensure_ascii=False))
    except Exception:  # noqa: BLE001, S110 - logging I/O must not replace the original failure.
        pass
    _flush(logger)
    return failure


def export_logs(logger: logging.Logger, destination: Path, fallback: Path | None = None) -> bool:
    sources = []
    _flush(logger)
    for handler in logger.handlers:
        if isinstance(handler, logging.FileHandler):
            path = Path(handler.baseFilename)
            count = min(max(getattr(handler, "backupCount", 2), 0), 10)
            sources.extend([path.with_name(path.name + f".{i}")
                            for i in range(count, 0, -1)] + [path])
    if not sources and fallback is not None:
        sources = [fallback.with_name(fallback.name + f".{i}") for i in (2, 1)] + [fallback]
    destination = Path(destination)
    # Include absent rotations in this guard: they may become active while exporting.
    if any(destination.resolve() == source.resolve() or
           (destination.exists() and source.exists() and destination.samefile(source))
           for source in sources):
        raise ValueError("请选择其他文件名，不能覆盖正在使用的诊断日志")
    chunks = []
    for source in dict.fromkeys(sources):
        if source.is_file():
            limit = 4 * 1024 * 1024
            with source.open("rb") as stream:
                size = stream.seek(0, 2)
                omitted = size > limit
                stream.seek(max(0, size - limit))
                raw = stream.read(limit)
            if omitted:
                # Drop the cut first line so a partial credential cannot evade redaction.
                _, _, raw = raw.partition(b"\n")
            content = raw.decode("utf-8", errors="replace")
            marker = "[older log content omitted; newest complete lines retained]\n" if omitted else ""
            # Redaction can expand short matches. This bound retains the complete safe tail.
            chunks.append(f"--- {source.name} ---\n" + marker + sanitize_text(content, limit * 8))
    if not chunks:
        return False
    destination.write_text("\n".join(chunks), encoding="utf-8")
    return True
