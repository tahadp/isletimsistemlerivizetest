#!/usr/bin/env python3
"""Serve the project's static dist directory on loopback without dependencies."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


PROJECT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = (PROJECT_DIR / "dist").resolve()
HOST = "127.0.0.1"
DEFAULT_PORT = 8088
CHARSET_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}


class StaticHandler(SimpleHTTPRequestHandler):
    """Serve only files contained by dist, with caching and listings disabled."""

    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
    }

    def translate_path(self, path: str) -> str:
        requested_path = unquote(urlsplit(path).path)
        translated = Path(super().translate_path(requested_path)).resolve()
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
    server = ThreadingHTTPServer((HOST, args.port), handler)
    print(f"Serving {DIST_DIR} at http://{HOST}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Stopping static server.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
