"""Real HTTP boundaries protect connection reuse and non-replay of writes."""
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import Mock

import pytest
import urllib3

from cs2dak import uploader_transport as transport
from cs2dak.uploader_transport import UploaderTransport


@pytest.fixture
def server(monkeypatch):
    monkeypatch.setattr(transport.urllib.request, "proxy_bypass", lambda host: True)
    calls = []
    connections = []

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def setup(self):
            super().setup()
            connections.append(self.connection)

        def do_POST(self):
            self.rfile.read(int(self.headers.get("Content-Length", 0)))
            calls.append((self.path, self.headers.get("Authorization")))
            if self.path.endswith("/evidence"):
                self.close_connection = True
                self.connection.shutdown(2)
                self.connection.close()
                return
            self.send_response(302 if self.path.endswith("/pairing/start") else 200)
            self.send_header("Content-Length", "2")
            self.send_header("Location", "/should-not-follow")
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *args):
            pass

    http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=http.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{http.server_port}", calls, connections
    http.shutdown()
    http.server_close()
    thread.join()


def test_reuse_redirect_and_uncertain_post_are_not_replayed(server):
    origin, calls, connections = server
    client = UploaderTransport()
    try:
        for _ in range(2):
            assert client.request(origin, "/pairing/poll", "POST", {}, b"{}").status == 200
        assert len(connections) == 1
        assert client.request(origin, "/pairing/start", "POST", {}, b"{}").status == 302
        with pytest.raises(urllib3.exceptions.HTTPError):
            client.request(origin, "/evidence", "POST", {"Authorization": "Bearer secret"}, b"{}")
        assert [path for path, _ in calls] == [
            "/api/integrations/dak/pairing/poll", "/api/integrations/dak/pairing/poll",
            "/api/integrations/dak/pairing/start", "/api/integrations/dak/evidence"]
        assert client.request(origin, "/pairing/poll", "POST", {}, b"{}").status == 200
        assert len(connections) == 2
    finally:
        client.close()
    with pytest.raises(OSError, match="已关闭"):
        client.request(origin, "/pairing/poll", "POST", {}, b"{}")


def test_proxy_bypass_origin_isolation_and_operation_budgets(monkeypatch):
    monkeypatch.setattr(transport.urllib.request, "proxy_bypass", lambda host: host == "local.example")
    monkeypatch.setattr(transport.urllib.request, "getproxies", lambda: {"https": "http://user:p%40ss@proxy.example:80"})
    proxy, direct = Mock(), Mock()
    proxy_factory, direct_factory = Mock(return_value=proxy), Mock(return_value=direct)
    monkeypatch.setattr(transport.urllib3, "ProxyManager", proxy_factory)
    monkeypatch.setattr(transport.urllib3, "PoolManager", direct_factory)
    client = UploaderTransport()
    try:
        for path, read in [("/pairing/poll", 15), ("/events", 15), ("/evidence", 90)]:
            client.request("https://remote.example", path, "POST", {}, b"{}")
            options = proxy.request.call_args.kwargs
            assert options["timeout"].connect_timeout == 10
            assert options["timeout"].read_timeout == read
            assert options["retries"] is False and options["redirect"] is False
        assert proxy_factory.call_count == 1
        args, kwargs = proxy_factory.call_args
        assert args == ("http://proxy.example:80",)
        assert kwargs["proxy_headers"] == urllib3.make_headers(proxy_basic_auth="user:p@ss")
        assert kwargs["ssl_context"].check_hostname
        assert kwargs["ssl_context"].verify_mode == transport.ssl.CERT_REQUIRED
        client.request("https://local.example", "/events", "GET", {}, None)
        proxy.clear.assert_called_once()
        direct_factory.assert_called_once()
    finally:
        client.close()
    direct.clear.assert_called_once()
