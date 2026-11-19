"""Isolated HTTPS for pocket browser tests. No public listener or production data."""

import subprocess
import sys
import tempfile
from pathlib import Path

from flask import Flask, send_from_directory
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from werkzeug.serving import run_simple

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from server.app import create_app

with tempfile.TemporaryDirectory() as temp:
    key = Path(temp) / "test.key"
    cert = Path(temp) / "test.crt"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            "1",
            "-subj",
            "/CN=localhost",
        ],
        check=True,
        capture_output=True,
    )
    api = create_app({"DATA_DIR": Path(temp) / "data"})
    static = Flask("pocket-test-assets", static_folder=None)

    @static.get("/")
    @static.get("/<path:name>")
    def assets(name="index.html"):
        return send_from_directory(ROOT / "mobile/build/www", name)

    run_simple(
        "127.0.0.1",
        4186,
        DispatcherMiddleware(api, {"/pocket": static}),
        ssl_context=(str(cert), str(key)),
    )
