#!/usr/bin/env python3
"""Serve the project's static dist directory on loopback without dependencies."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import BoundedSemaphore


PROJECT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = (PROJECT_DIR / "dist").resolve()
HOST = "127.0.0.1"
DEFAULT_PORT = 8088
MAX_WORKERS = 32
REQUEST_TIMEOUT_SECONDS = 15
CHARSET_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}
CSP_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; "
    "base-uri 'none'; form-action 'self'"
)
SECURITY_HEADERS = (
    ("Content-Security-Policy", CSP_POLICY),
    ("X-Content-Type-Options", "nosniff"),
    ("X-Frame-Options", "DENY"),
    ("Referrer-Policy", "strict-origin-when-cross-origin"),
    ("Permissions-Policy", "camera=(), microphone=(), geolocation=()"),
)
OVERLOADED_RESPONSE = (
    b"HTTP/1.1 503 Service Unavailable\r\n"
    b"Connection: close\r\n"
    b"Content-Length: 0\r\n"
    b"Cache-Control: no-store\r\n"
    + f"Content-Security-Policy: {CSP_POLICY}\r\n".encode("ascii")
    + b"X-Content-Type-Options: nosniff\r\n"
    + b"X-Frame-Options: DENY\r\n"
    + b"Referrer-Policy: strict-origin-when-cross-origin\r\n"
    + b"Permissions-Policy: camera=(), microphone=(), geolocation=()\r\n\r\n"
)


class BoundedThreadingHTTPServer(ThreadingHTTPServer):
    """Keep slow or excessive clients from creating unbounded request threads."""

    request_queue_size = 64
    daemon_threads = True

    def __init__(self, server_address, request_handler, *, max_workers=MAX_WORKERS, request_timeout=REQUEST_TIMEOUT_SECONDS):
        if max_workers < 1:
            raise ValueError("max_workers must be at least 1")
        if request_timeout <= 0:
            raise ValueError("request_timeout must be positive")
        self._request_slots = BoundedSemaphore(max_workers)
        self.request_timeout = request_timeout
        super().__init__(server_address, request_handler)

    def get_request(self):
        request, client_address = super().get_request()
        request.settimeout(self.request_timeout)
        return request, client_address

    def process_request(self, request, client_address):
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(OVERLOADED_RESPONSE)
            except OSError:
                pass
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


class StaticHandler(SimpleHTTPRequestHandler):
    """Serve only files contained by dist, with caching and listings disabled."""

    server_version = "StaticSite"
    sys_version = ""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
    }

    def translate_path(self, path: str) -> str:
        translated = Path(super().translate_path(path)).resolve()
        try:
            translated.relative_to(DIST_DIR)
        except ValueError:
            return str(DIST_DIR / "__outside_dist__")
        return str(translated)

    def list_directory(self, path: str):
        self.send_error(404, "Directory listing is disabled.")
        return None

    def guess_type(self, path: str) -> str:
        charset_type = CHARSET_TYPES.get(Path(path).suffix.lower())
        return charset_type or super().guess_type(path)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        for name, value in SECURITY_HEADERS:
            self.send_header(name, value)
        super().end_headers()

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"{self.address_string()} - {format_string % args}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve the static site from dist on loopback.")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"listen port (default: {DEFAULT_PORT})")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    return args


def main() -> None:
    if not DIST_DIR.is_dir():
        raise SystemExit(f"Static site directory does not exist: {DIST_DIR}")

    args = parse_args()
    handler = partial(StaticHandler, directory=str(DIST_DIR))
    server = BoundedThreadingHTTPServer((HOST, args.port), handler)
    print(f"Serving {DIST_DIR} at http://{HOST}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping static server.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
