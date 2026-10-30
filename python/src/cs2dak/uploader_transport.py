"""Session-scoped HTTP transport; mutations are never replayed here."""
import ssl
import threading
import urllib.parse
import urllib.request

import urllib3


class UploaderTransport:
    def __init__(self):
        self._lock = threading.Lock()
        self._pool = None
        self._route = None
        self._closed = False

    def request(self, origin, path, method, headers, body):
        # Match urllib's environment/system proxy discovery and bypass rules.
        url = urllib.parse.urlsplit(origin)
        proxy = None if urllib.request.proxy_bypass(url.netloc) else urllib.request.getproxies().get(url.scheme)
        route = (origin, proxy)
        with self._lock:
            if self._closed:
                raise OSError("上传器已关闭")
            if route != self._route:
                if self._pool:
                    self._pool.clear()
                context = ssl.create_default_context()
                options = {"num_pools": 1, "maxsize": 1, "ssl_context": context}
                if proxy:
                    if "://" not in proxy:
                        proxy = "http://" + proxy
                    parsed = urllib.parse.urlsplit(proxy)
                    proxy_headers = None
                    if parsed.username is not None:
                        auth = urllib.parse.unquote(parsed.username) + ":" + urllib.parse.unquote(parsed.password or "")
                        proxy_headers = urllib3.make_headers(proxy_basic_auth=auth)
                        proxy = urllib.parse.urlunsplit(parsed._replace(netloc=parsed.netloc.rsplit("@", 1)[1]))
                    self._pool = urllib3.ProxyManager(proxy, proxy_headers=proxy_headers,
                                                     proxy_ssl_context=context, **options)
                else:
                    self._pool = urllib3.PoolManager(**options)
                self._route = route
            # Socket inactivity budgets, not an overall wall-clock deadline.
            read_timeout = 90 if path == "/evidence" else 15
            return self._pool.request(method, origin + "/api/integrations/dak" + path,
                                      headers=headers, body=body, retries=False, redirect=False,
                                      timeout=urllib3.Timeout(connect=10, read=read_timeout),
                                      preload_content=True)

    def close(self):
        with self._lock:
            self._closed = True
            if self._pool:
                self._pool.clear()
                self._pool = None
