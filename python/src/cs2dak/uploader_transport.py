"""Uploader HTTPS transport; retry negotiation only before sending application data."""
from __future__ import annotations

import http.client
import logging
import ssl
import urllib.request

log = logging.getLogger("rivalhub-uploader")


def tls_context(minimum: ssl.TLSVersion) -> ssl.SSLContext:
    context = ssl.create_default_context()
    context.minimum_version = minimum
    context.set_alpn_protocols(["http/1.1"])
    return context


class UploaderHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, **kwargs):
        self._preferred_tls = (ssl.TLSVersion.TLSv1_3 if ssl.HAS_TLSv1_3
                               else ssl.TLSVersion.TLSv1_2)
        super().__init__(host, context=tls_context(self._preferred_tls), **kwargs)

    def connect(self):
        contexts = [self._context]
        if self._preferred_tls == ssl.TLSVersion.TLSv1_3:
            contexts.append(tls_context(ssl.TLSVersion.TLSv1_2))
        for attempt, context in enumerate(contexts):
            # Preserve urllib's configured proxy and CONNECT authentication. Failures
            # establishing TCP or CONNECT are outside the TLS retry boundary.
            http.client.HTTPConnection.connect(self)
            try:
                self.sock = context.wrap_socket(
                    self.sock, server_hostname=self._tunnel_host or self.host)
            except (ssl.SSLError, ConnectionResetError, ConnectionAbortedError) as error:
                # HTTPConnection.close() also clears Request-sent state, which would
                # corrupt the pending request. Only release the failed connection.
                if self.sock is not None:
                    self.sock.close()
                    self.sock = None
                if isinstance(error, ssl.SSLCertVerificationError) or attempt + 1 == len(contexts):
                    raise
                log.info("tls handshake compatibility retry error=%s", type(error).__name__)
            else:
                log.info("tls connected version=%s attempt=%d", self.sock.version(), attempt + 1)
                return


class UploaderHTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, request):
        return self.do_open(UploaderHTTPSConnection, request)
