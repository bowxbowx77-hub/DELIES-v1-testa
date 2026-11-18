#!/usr/bin/env python3
"""Vite HMR + private, same-origin proxied development API."""

import os
import signal
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
os.chdir(root)
py = root / ".venv/bin/python"
if not py.exists():
    sys.exit("Create .venv and install requirements.txt first. See README.md.")
api = subprocess.Popen(
    [
        str(py),
        "-m",
        "flask",
        "--app",
        "server.app:create_app",
        "run",
        "--host",
        "127.0.0.1",
        "--port",
        "8000",
    ]
)
ui = subprocess.Popen(
    [
        "node",
        "node_modules/vite/bin/vite.js",
        "--host",
        "0.0.0.0",
        "--port",
        os.getenv("PORT", "5173"),
        "--strictPort",
    ]
)


def stop(*_):
    api.terminate()
    ui.terminate()


signal.signal(signal.SIGTERM, stop)
try:
    while all(p.poll() is None for p in (api, ui)):
        try:
            ui.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass
except KeyboardInterrupt:
    pass
finally:
    stop()
    api.wait()
    ui.wait()
sys.exit(ui.returncode if ui.returncode > 0 else max(0, api.returncode))
