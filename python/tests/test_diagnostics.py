"""Privacy and evidence preservation under failures without desktop dependencies."""
import logging
from logging.handlers import RotatingFileHandler

import pytest

from cs2dak.diagnostics import (
    SafeFormatter,
    export_logs,
    log_failure,
    safe_exception,
    safe_metadata,
    sanitize_text,
)


def test_redaction_precedes_bounds_and_retains_reason():
    raw = ('TLS certificate verify failed https://user:pass@host/path?token=url-secret '
           'Bearer bearer-secret token="json-secret" C:\\Users\\Alice\\demo.dem\n'
           '/home/alice/private/demo.dem eyJabc.def.ghi')
    text = sanitize_text(raw)
    assert 'TLS certificate verify failed' in text
    for secret in ('user:pass', 'url-secret', 'bearer-secret', 'json-secret', 'Alice', 'alice', 'eyJabc'):
        assert secret not in text
    assert len(sanitize_text('x' * 10000, 20)) == 21


def test_python_managed_chain_is_bounded_and_cycles_are_safe():
    class ManagedError(Exception):
        pass
    outer = ManagedError('Loader.Initialize failed token=outer-secret')
    inner = ValueError('bad architecture C:\\Users\\Alice\\runtime.dll')
    outer.InnerException = inner
    inner.__context__ = outer
    failure = safe_exception(outer, 'startup.netfx')
    assert failure['stage'] == 'startup.netfx'
    assert len(failure['causes']) == 2
    assert 'bad architecture' in failure['cause']
    assert 'outer-secret' not in str(failure)
    assert 'Alice' not in str(failure)
    assert '具体原因仍需' in failure['guidance']
    root = outer
    for _ in range(30):
        item = RuntimeError('nested')
        root.__cause__ = item
        root = item
    assert len(safe_exception(outer)['causes']) == 8


def test_formatter_redacts_traceback_and_export_preserves_rotations(tmp_path):
    logger = logging.getLogger('safe-diagnostic-test')
    path = tmp_path / 'actual.log'
    handler = RotatingFileHandler(path, maxBytes=10000, backupCount=2)
    handler.setFormatter(SafeFormatter('%(message)s'))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    try:
        try:
            raise ValueError('TLS token=secret-one /home/alice/file.dem')
        except ValueError as exc:
            logger.exception('Bearer secret-two')
            log_failure(logger, exc, 'request')
        path.with_name('actual.log.1').write_text('older token=old-secret\n')
        destination = tmp_path / 'export.log'
        assert export_logs(logger, destination)
        content = destination.read_text(encoding="utf-8")
        assert 'ValueError' in content and 'TLS' in content and 'older' in content
        for secret in ('secret-one', 'secret-two', 'old-secret', 'alice'):
            assert secret not in content
        before = path.read_bytes()
        with pytest.raises(ValueError):
            export_logs(logger, path)
        with pytest.raises(ValueError):
            export_logs(logger, path.with_name('actual.log.2'))
        assert path.read_bytes() == before
    finally:
        logger.removeHandler(handler)
        handler.close()


def test_metadata_has_no_arbitrary_payload_escape():
    data = safe_metadata({'message': 'timeout token=hidden', 'body': {'secret': 'raw'},
                          'cause': 'x' * 20000, 'status': 503, 'attempt': True})
    assert data['message'] == 'timeout token=[redacted]'
    assert len(data['cause']) == 4001
    assert data['status'] == 503
    assert 'body' not in data and 'attempt' not in data


@pytest.mark.parametrize('raw,secrets', [
    ('{"pollToken": "poll-secret", "accessToken": "access-secret"}', ('poll-secret', 'access-secret')),
    ('{"token":"first\\"second", "Cookie":"sid=abc; refresh=xyz"}', ('first', 'second', 'abc', 'xyz')),
    ('Cookie: session=abc; token=xyz\nTLS failed', ('abc', 'xyz')),
    ('Set-Cookie: session=abc; Secure; HttpOnly', ('abc',)),
    ("{'password': 'a b c'}", ('a b c',)),
])
def test_structured_and_cookie_secrets_are_redacted(raw, secrets):
    safe = sanitize_text(raw)
    for secret in secrets:
        assert secret not in safe


def test_diagnostics_survive_broken_exception_and_storage():
    class Broken(Exception):
        def __str__(self):
            raise ValueError('broken string')

        @property
        def InnerException(self):
            raise RuntimeError('broken getter')

    class BrokenHandler(logging.Handler):
        def emit(self, record):
            raise OSError('disk full')

        def flush(self):
            raise OSError('disk full')

    logger = logging.getLogger('broken-diagnostic-storage')
    handler = BrokenHandler()
    logger.addHandler(handler)
    try:
        failure = log_failure(logger, Broken(), 'parse')
        assert failure['type'] == 'Broken'
        assert failure['message'] == '[unprintable]'
        assert failure['stage'] == 'parse'
    finally:
        logger.removeHandler(handler)
        # Logging shutdown flushes registered handlers too.
        handler.flush = lambda: None
        handler.close()


def test_safe_stack_has_location_without_source_code_or_locals():
    try:
        raise ValueError('failure')  # source-only-secret
    except ValueError as exc:
        failure = safe_exception(exc, 'parse')
        record = logging.LogRecord('test', logging.ERROR, __file__, 1, 'failed', (),
                                   (type(exc), exc, exc.__traceback__))
        record.exc_text = 'cached unsafe traceback source-only-secret'
        formatted = SafeFormatter().format(record)
    assert failure['causes'][0]['frames'][0]['file'] == 'test_diagnostics.py'
    assert 'test_safe_stack_has_location' in formatted
    assert 'source-only-secret' not in formatted
    assert '/workspace' not in formatted


@pytest.mark.parametrize('raw,secrets', [
    ('Authorization: Basic dXNlcjpwYXNz', ('dXNlcjpwYXNz',)),
    ('cannot read C:/Users/Alice/private.dem', ('Alice', 'private.dem')),
    ('cannot read /Users/Alice Smith/private.dem', ('Alice', 'Smith', 'private.dem')),
])
def test_authorization_and_paths_with_spaces(raw, secrets):
    safe = sanitize_text(raw)
    for secret in secrets:
        assert secret not in safe


@pytest.mark.parametrize('size', [2 * 1024 * 1024, 5 * 1024 * 1024])
def test_export_preserves_latest_failure_in_large_logs(tmp_path, size):
    logger = logging.getLogger('large-diagnostic-export')
    source = tmp_path / 'studio.log'
    handler = RotatingFileHandler(source, maxBytes=2 * 1024 * 1024, backupCount=2)
    logger.addHandler(handler)
    try:
        source.write_bytes(b'older normal line\n' * (size // 18) + b'latest TLS failure token=hidden\n')
        destination = tmp_path / 'export.log'
        assert export_logs(logger, destination)
        content = destination.read_text(encoding="utf-8")
        assert 'latest TLS failure' in content
        assert 'hidden' not in content
        assert ('older log content omitted' in content) == (size > 4 * 1024 * 1024)
    finally:
        logger.removeHandler(handler)
        handler.close()


def test_runtime_credentials_are_redacted_through_log_and_export(tmp_path):
    import logging

    from cs2dak.diagnostics import SafeFormatter, export_logs

    logger = logging.getLogger("independent-audit")
    handler = logging.FileHandler(tmp_path / "runtime.log", encoding="utf-8")
    handler.setFormatter(SafeFormatter("%(message)s"))
    logger.addHandler(handler)
    try:
        for message in ("credential=synthetic-private", "passwd=synthetic-private", "password=two synthetic words", "password='two; synthetic words'",
                        r'password="https://a\";synthetic-private" reason=连接失败',
                        'password="secret words" reason=connection refused'):
            logger.error(message)
        assert export_logs(logger, tmp_path / "shared.log")
        for path in (tmp_path / "runtime.log", tmp_path / "shared.log"):
            content = path.read_text()
            assert "synthetic-private" not in content
            assert "synthetic words" not in content
            assert "redacted" in content
            assert "reason=连接失败" in content
            assert "reason=connection refused" in content
            assert "secret words" not in content
    finally:
        logger.removeHandler(handler)
        handler.close()


@pytest.mark.parametrize("raw", [
    "password=[redacted]synthetic-private",
    "password=[redacted] synthetic-private",
    "password=[redacted] reason=synthetic-private",
    "credential=[redacted]\t synthetic-private",
    "password=[redacted]synthetic-private; reason=连接失败",
    "password=[redacted] synthetic-private; reason=connection refused",
])
def test_literal_redaction_marker_cannot_hide_suffix_in_real_export(tmp_path, raw):
    logger = logging.getLogger("marker-boundary")
    handler = logging.FileHandler(tmp_path / "runtime.log", encoding="utf-8")
    handler.setFormatter(SafeFormatter("%(message)s"))
    logger.addHandler(handler)
    try:
        logger.error("TLS failed %s", raw)
        assert export_logs(logger, tmp_path / "shared.log")
        for path in (tmp_path / "runtime.log", tmp_path / "shared.log"):
            content = path.read_text()
            assert "synthetic-private" not in content
            assert "TLS failed" in content
            if "; reason=" in raw:
                assert raw[raw.index("; reason="):] in content
            assert sanitize_text(content) == content
    finally:
        logger.removeHandler(handler)
        handler.close()


@pytest.mark.parametrize("entry", ["log_failure", "exception", "raw_json"])
@pytest.mark.parametrize("raw, reason", [
    ('password="secret words" reason=connection refused', 'connection refused'),
    (r'password="https://a\";synthetic-private" reason=连接失败', '连接失败'),
    ('password=[redacted] synthetic-private; reason=connection refused', 'connection refused'),
    ('credential=[redacted]\t synthetic-private; reason=连接失败', '连接失败'),
    ('password=[redacted] reason=synthetic-private; reason=连接失败', '连接失败'),
])
def test_structured_failure_roundtrip_preserves_safe_causes(tmp_path, entry, raw, reason):
    import json

    logger = logging.getLogger("structured-roundtrip")
    handler = logging.FileHandler(tmp_path / "runtime.log", encoding="utf-8")
    handler.setFormatter(SafeFormatter("%(levelname)s %(message)s"))
    logger.addHandler(handler)
    try:
        if entry == "log_failure":
            log_failure(logger, ValueError(raw), "request")
        elif entry == "exception":
            try:
                raise ValueError(raw)
            except ValueError:
                logger.exception("request failed")
        else:
            # No trust in a JSON payload or in a literal redaction marker.
            logger.error("failure %s", json.dumps({"message": raw, "password": "synthetic-private",
                                                  "nested": [{"credential": "secret words",
                                                              "user_password": "synthetic-private"}]},
                                                 ensure_ascii=False))
        assert export_logs(logger, tmp_path / "shared.log")
        for path in (tmp_path / "runtime.log", tmp_path / "shared.log"):
            content = path.read_text()
            assert "secret words" not in content
            assert "synthetic-private" not in content
            assert "https://a" not in content
            assert "reason=" + reason in content
            assert sanitize_text(content, 16000) == content
            line = next(line for line in content.splitlines() if '{"' in line)
            detail = json.loads(line[line.index("{"):])
            assert "reason=" + reason in detail["message"]
            if entry != "raw_json":
                assert "reason=" + reason in detail["causes"][0]["message"]
                assert "reason=" + reason in detail["cause"]
                assert detail["type"] == "ValueError"
    finally:
        logger.removeHandler(handler)
        handler.close()


@pytest.mark.parametrize("raw", [
    'password="secret words\nsynthetic-private" reason=连接失败',
    'password={"ordinary": "synthetic-private"}; reason=connection refused',
    'password="{\nsynthetic-private\n}" reason=连接失败',
])
def test_json_looking_or_multiline_credential_remains_private(raw):
    safe = sanitize_text(raw)
    assert "synthetic-private" not in safe
    assert "secret words" not in safe
    assert "reason=" in safe
    assert sanitize_text(safe) == safe


def test_mixed_plain_and_structured_lines_share_one_export_policy():
    import json

    raw = ('password="secret words" reason=连接失败\n'
           + "failure " + json.dumps({"message": 'password="secret words" reason=connection refused'})
           + '\ncredential=[redacted] synthetic-private; reason=连接失败\n')
    safe = sanitize_text(raw)
    assert "secret words" not in safe and "synthetic-private" not in safe
    assert "reason=connection refused" in safe and "reason=连接失败" in safe
    assert sanitize_text(safe) == safe


@pytest.mark.parametrize("formatter", ["%(message)s", "%(levelname)s %(message)s",
                                        "%(asctime)s %(levelname)s %(name)s %(message)s"])
@pytest.mark.parametrize("raw", [
    r'failed C:\Users\{}\synthetic-private\demo.dem',
    r'failed C:\Users\{}\{}\synthetic-private\demo.dem',
    r'failed C:\Users\failure {}\synthetic-private\demo.dem',
    'password="line one\nfailure {}\nsynthetic-private"; reason=连接失败',
])
def test_free_text_braces_are_not_structured_log_boundaries(tmp_path, formatter, raw):
    import json

    assert "synthetic-private" not in sanitize_text(raw)
    logger = logging.getLogger("plain-path-boundary")
    handler = logging.FileHandler(tmp_path / "runtime.log", encoding="utf-8")
    handler.setFormatter(SafeFormatter(formatter))
    logger.addHandler(handler)
    try:
        logger.error("%s", raw)
        logger.error("failure %s", json.dumps({"message": raw, "credential": "synthetic-private"},
                                              ensure_ascii=False))
        log_failure(logger, ValueError('password="secret words" reason=connection refused'))
        try:
            raise ValueError('password="secret words" reason=连接失败')
        except ValueError:
            logger.exception("request failed")
        assert export_logs(logger, tmp_path / "shared.log")
        for path in (tmp_path / "runtime.log", tmp_path / "shared.log"):
            content = path.read_text()
            assert "synthetic-private" not in content
            assert "secret words" not in content
            assert "reason=connection refused" in content
            assert "reason=连接失败" in content
            assert sanitize_text(content, 16000) == content
    finally:
        logger.removeHandler(handler)
        handler.close()


@pytest.mark.parametrize("prefix", [
    "failure ", "frontend diagnostic ", "export job synthetic-job failed: ",
    "demo=synthetic phase=failed code=bad diagnostic=",
    'ui startup error message="failed" stack="ignored" diagnostic=',
])
def test_production_structured_log_boundaries_preserve_causes(tmp_path, prefix):
    import json

    logger = logging.getLogger("cs2dak.synthetic")
    handler = logging.FileHandler(tmp_path / "runtime.log", encoding="utf-8")
    handler.setFormatter(SafeFormatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(handler)
    try:
        logger.error("%s%s", prefix, json.dumps({
            "message": 'password="secret words" reason=connection refused',
            "cause": 'password="secret words" reason=连接失败',
            "nested": {"message": r'failed C:\Users\{}\synthetic-private\demo.dem'},
        }, ensure_ascii=False))
        assert export_logs(logger, tmp_path / "shared.log")
        for path in (tmp_path / "runtime.log", tmp_path / "shared.log"):
            content = path.read_text()
            assert "synthetic-private" not in content and "secret words" not in content
            assert "reason=connection refused" in content and "reason=连接失败" in content
            assert sanitize_text(content, 16000) == content
    finally:
        logger.removeHandler(handler)
        handler.close()
