#!/usr/bin/env python3
"""Threaded static server — avoids dropped parallel ESM module fetches."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(os.environ.get("PORT", "8766"))
httpd = ThreadingHTTPServer(("127.0.0.1", port), SimpleHTTPRequestHandler)
print(f"Threaded server http://127.0.0.1:{port}/", flush=True)
httpd.serve_forever()
