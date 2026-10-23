"""Real TLS boundaries: trust, proxy tunnels and no replay of an uploaded POST."""
import contextlib
import http.client
import json
import select
import shutil
import socket
import socketserver
import ssl
import subprocess
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from cs2dak import uploader_transport as transport


@pytest.fixture(scope="module")
def certificate(tmp_path_factory):
    root = tmp_path_factory.mktemp("uploader-tls")
    executable = shutil.which("openssl")
    if executable is None:
        git_openssl = Path("C:/Program Files/Git/usr/bin/openssl.exe")
        if git_openssl.is_file():
            executable = str(git_openssl)
    assert executable, "TLS boundary tests require OpenSSL (included in Git for Windows)"
    key, cert = root / "key.pem", root / "cert.pem"
    subprocess.run([
        executable, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
        "-keyout", str(key), "-out", str(cert), "-subj", "/CN=localhost",
        "-addext", "subjectAltName=DNS:localhost",
        "-addext", "basicConstraints=critical,CA:TRUE",
        "-addext", "keyUsage=critical,digitalSignature,keyEncipherment,keyCertSign",
        "-addext", "extendedKeyUsage=serverAuth",
    ], check=True, capture_output=True)
    return key, cert


@pytest.fixture
def trust_certificate(certificate, monkeypatch):
    original = transport.tls_context

    def trusted(minimum):
        context = original(minimum)
        context.load_verify_locations(cafile=str(certificate[1]))
        return context

    monkeypatch.setattr(transport, "tls_context", trusted)


@contextlib.contextmanager
def tls_server(certificate, version, *, drop_response=False, redirect=False):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = context.maximum_version = version
    context.load_cert_chain(str(certificate[1]), str(certificate[0]))
    context.set_alpn_protocols(["http/1.1"])
    names = []
    context.set_servername_callback(lambda _socket, name, _context: names.append(name))

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            self.server.requests.append({
                "body": body, "authorization": self.headers.get("Authorization"),
                "idempotency": self.headers.get("Idempotency-Key"),
                "tls": self.connection.version(), "alpn": self.connection.selected_alpn_protocol(),
            })
            if drop_response:
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            self.send_response(307 if redirect else 200)
            if redirect:
                self.send_header("Location", "https://other.invalid/evidence")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

        def log_message(self, *args):
            pass

    class Server(ThreadingHTTPServer):
        def get_request(self):
            raw, address = super().get_request()
            self.accepted += 1
            try:
                return context.wrap_socket(raw, server_side=True), address
            except BaseException:
                raw.close()
                raise

    server = Server(("127.0.0.1", 0), Handler)
    server.accepted = 0
    server.requests = []
    server.names = names
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def post(server, *, hostname="localhost", handler=None):
    handlers = [urllib.request.ProxyHandler({}), transport.UploaderHTTPSHandler()]
    if handler is not None:
        handlers.append(handler)
    request = urllib.request.Request(
        f"https://{hostname}:{server.server_port}/evidence", data=b'{"demo":"fixture"}',
        headers={"Authorization": "Bearer fixture-token", "Idempotency-Key": "fixture-key"})
    return urllib.request.build_opener(*handlers).open(request, timeout=5)


@pytest.mark.parametrize("version,connections", [
    (ssl.TLSVersion.TLSv1_3, 1), (ssl.TLSVersion.TLSv1_2, 2),
])
def test_tls_negotiation_sends_post_exactly_once(certificate, trust_certificate, version, connections):
    with tls_server(certificate, version) as server:
        with post(server) as response:
            assert json.load(response) == {"ok": True}
        assert server.accepted == connections
        assert server.names == ["localhost"]
        assert server.requests == [{
            "body": b'{"demo":"fixture"}', "authorization": "Bearer fixture-token",
            "idempotency": "fixture-key", "tls": version.name.replace("_", "."),
            "alpn": "http/1.1",
        }]


@pytest.mark.parametrize("trusted,hostname", [(False, "localhost"), (True, "127.0.0.1")])
def test_invalid_certificate_never_retries_or_sends_request(
        certificate, monkeypatch, trusted, hostname):
    if trusted:
        original = transport.tls_context

        def factory(minimum):
            context = original(minimum)
            context.load_verify_locations(cafile=str(certificate[1]))
            return context

        monkeypatch.setattr(transport, "tls_context", factory)
    with tls_server(certificate, ssl.TLSVersion.TLSv1_3) as server:
        with pytest.raises(urllib.error.URLError) as error:
            post(server, hostname=hostname)
        assert isinstance(error.value.reason, ssl.SSLCertVerificationError)
        assert server.accepted == 1
        assert server.requests == []


def test_response_disconnect_never_replays_post(certificate, trust_certificate):
    with tls_server(certificate, ssl.TLSVersion.TLSv1_3, drop_response=True) as server:
        with pytest.raises(http.client.RemoteDisconnected):
            post(server)
        assert server.accepted == 1
        assert len(server.requests) == 1


def test_redirect_does_not_forward_uploaded_credentials(certificate, trust_certificate):
    from cs2dak.rivalhub_uploader import NoRedirect
    with tls_server(certificate, ssl.TLSVersion.TLSv1_3, redirect=True) as server:
        with pytest.raises(urllib.error.HTTPError) as error:
            post(server, handler=NoRedirect())
        assert error.value.code == 307
        error.value.close()
        assert server.accepted == 1
        assert len(server.requests) == 1


@contextlib.contextmanager
def connect_proxy(*, deny=False):
    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            line = self.rfile.readline().decode().strip()
            headers = http.client.parse_headers(self.rfile)
            self.server.tunnels.append((line, headers.get("Proxy-Authorization")))
            if deny:
                self.wfile.write(b"HTTP/1.1 407 Proxy Authentication Required\r\n\r\n")
                return
            method, target, _protocol = line.split()
            assert method == "CONNECT"
            host, port = target.rsplit(":", 1)
            assert host == "localhost"
            with socket.create_connection((host, int(port)), timeout=5) as upstream:
                self.wfile.write(b"HTTP/1.1 200 Connection established\r\n\r\n")
                self.wfile.flush()
                peers = {self.connection: upstream, upstream: self.connection}
                while True:
                    readable, _, _ = select.select(list(peers), [], [], 5)
                    if not readable:
                        return
                    for source in readable:
                        try:
                            data = source.recv(65536)
                            if not data:
                                return
                            peers[source].sendall(data)
                        except OSError:
                            return

    class Server(socketserver.ThreadingTCPServer):
        daemon_threads = True

    proxy = Server(("127.0.0.1", 0), Handler)
    proxy.tunnels = []
    thread = threading.Thread(target=proxy.serve_forever, daemon=True)
    thread.start()
    try:
        yield proxy
    finally:
        proxy.shutdown()
        proxy.server_close()
        thread.join(timeout=5)


def test_tls12_proxy_fallback_preserves_tunnel_sni_and_post(certificate, trust_certificate):
    with tls_server(certificate, ssl.TLSVersion.TLSv1_2) as server, connect_proxy() as proxy:
        connection = transport.UploaderHTTPSConnection(
            "127.0.0.1", port=proxy.server_address[1], timeout=5)
        connection.set_tunnel("localhost", server.server_port,
                              headers={"Proxy-Authorization": "Basic fixture"})
        try:
            connection.request("POST", "/evidence", body=b"fixture",
                               headers={"Authorization": "Bearer device"})
            assert connection.getresponse().status == 200
        finally:
            connection.close()
        assert len(proxy.tunnels) == 2
        assert all(item[1] == "Basic fixture" for item in proxy.tunnels)
        assert server.names == ["localhost"]
        assert len(server.requests) == 1
        assert server.requests[0]["authorization"] == "Bearer device"
        assert server.requests[0]["body"] == b"fixture"


def test_proxy_rejection_is_not_retried():
    with connect_proxy(deny=True) as proxy:
        connection = transport.UploaderHTTPSConnection(
            "127.0.0.1", port=proxy.server_address[1], timeout=5)
        connection.set_tunnel("localhost", 443)
        try:
            with pytest.raises(OSError, match="407"):
                connection.request("POST", "/evidence", body=b"must-not-send")
        finally:
            connection.close()
        assert len(proxy.tunnels) == 1
