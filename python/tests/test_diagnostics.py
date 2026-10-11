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
        content = destination.read_text()
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
        content = destination.read_text()
        assert 'latest TLS failure' in content
        assert 'hidden' not in content
        assert ('older log content omitted' in content) == (size > 4 * 1024 * 1024)
    finally:
        logger.removeHandler(handler)
        handler.close()
