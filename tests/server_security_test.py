"""Focused security checks for the loopback static HTTP handler."""

from __future__ import annotations

import http.client
import socket
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from unittest.mock import patch


PROJECT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_DIR / "scripts"))
import serve  # noqa: E402


class StaticServerSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.dist = self.root / "dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<h1>ok</h1>", encoding="utf-8")
        (self.dist / "app.js").write_text("export {};", encoding="utf-8")
        (self.dist / "data.json").write_text("{}", encoding="utf-8")
        (self.dist / "docs").mkdir()
        (self.dist / "docs" / "public.txt").write_text("public", encoding="utf-8")
        self.outside = self.root / "private.txt"
        self.outside.write_text("outside-secret-marker", encoding="utf-8")

        self.dist_patch = patch.object(serve, "DIST_DIR", self.dist.resolve())
        self.dist_patch.start()
        handler = serve.partial(serve.StaticHandler, directory=str(self.dist))
        self.server = serve.BoundedThreadingHTTPServer((serve.HOST, 0), handler)
        self.port = self.server.server_address[1]
        self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.server_thread.start()

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(timeout=2)
        self.dist_patch.stop()
        self.temp_dir.cleanup()

    def request(self, method: str, path: str):
        connection = http.client.HTTPConnection(serve.HOST, self.port, timeout=3)
        connection.request(method, path)
        response = connection.getresponse()
        body = response.read()
        headers = {name.lower(): value for name, value in response.getheaders()}
        status = response.status
        connection.close()
        return status, headers, body

    def test_security_headers_and_server_banner(self) -> None:
        status, headers, _ = self.request("GET", "/")
        self.assertEqual(status, 200)
        csp = headers["content-security-policy"]
        self.assertIn("default-src 'self'", csp)
        self.assertIn("script-src 'self'", csp)
        self.assertIn("style-src 'self'", csp)
        self.assertNotIn("unsafe-inline", csp)
        self.assertIn("connect-src 'self'", csp)
        self.assertIn("object-src 'none'", csp)
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("base-uri 'none'", csp)
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertEqual(headers["x-frame-options"], "DENY")
        self.assertEqual(headers["referrer-policy"], "strict-origin-when-cross-origin")
        self.assertNotIn("python", headers["server"].lower())

    def test_static_assets_keep_explicit_mime_types(self) -> None:
        for path, expected_type in (
            ("/app.js", "application/javascript; charset=utf-8"),
            ("/data.json", "application/json; charset=utf-8"),
        ):
            with self.subTest(path=path):
                status, headers, _ = self.request("GET", path)
                self.assertEqual(status, 200)
                self.assertEqual(headers["content-type"], expected_type)

    def test_traversal_and_double_encoded_traversal_stay_inside_dist(self) -> None:
        for path in ("/%2e%2e/private.txt", "/%252e%252e/private.txt"):
            with self.subTest(path=path):
                status, _, body = self.request("GET", path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"outside-secret-marker", body)

    def test_symlink_to_file_outside_dist_is_rejected(self) -> None:
        link = self.dist / "private-link.txt"
        try:
            link.symlink_to(self.outside)
        except (OSError, NotImplementedError) as error:
            self.skipTest(f"Symlinks unavailable in this environment: {error}")
        status, _, body = self.request("GET", "/private-link.txt")
        self.assertEqual(status, 404)
        self.assertNotIn(b"outside-secret-marker", body)

    def test_directory_listing_is_disabled(self) -> None:
        status, _, body = self.request("GET", "/docs/")
        self.assertEqual(status, 404)
        self.assertNotIn(b"public.txt", body)

    def test_only_get_and_head_are_served(self) -> None:
        status, _, body = self.request("HEAD", "/")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        status, headers, _ = self.request("POST", "/")
        self.assertEqual(status, 501)
        self.assertIn("content-security-policy", headers)

    def test_server_rejects_requests_over_worker_limit(self) -> None:
        request_started = threading.Event()
        finish_request = threading.Event()

        class BlockingHandler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                request_started.set()
                finish_request.wait(timeout=2)
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, format_string: str, *args: object) -> None:
                return

        server = serve.BoundedThreadingHTTPServer(
            (serve.HOST, 0), BlockingHandler, max_workers=1, request_timeout=1
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        first = socket.create_connection((serve.HOST, server.server_address[1]), timeout=2)
        second = None
        try:
            first.sendall(b"GET / HTTP/1.1\r\nHost: localhost\r\n\r\n")
            self.assertTrue(request_started.wait(timeout=1))
            second = socket.create_connection((serve.HOST, server.server_address[1]), timeout=2)
            response = second.recv(2048)
            self.assertIn(b"HTTP/1.1 503 Service Unavailable", response)
            self.assertIn(b"Content-Security-Policy:", response)
        finally:
            finish_request.set()
            first.close()
            if second is not None:
                second.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_server_closes_idle_partial_request_after_timeout(self) -> None:
        server = serve.BoundedThreadingHTTPServer(
            (serve.HOST, 0), serve.partial(serve.StaticHandler, directory=str(self.dist)),
            max_workers=1, request_timeout=0.15,
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = socket.create_connection((serve.HOST, server.server_address[1]), timeout=2)
        try:
            client.sendall(b"GET / HTTP/1.1\r\nHost:")
            client.settimeout(1)
            self.assertEqual(client.recv(1), b"")
        finally:
            client.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
