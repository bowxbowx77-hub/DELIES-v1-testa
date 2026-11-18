#!/usr/bin/env python3
"""Serve the compiled UI and API on one origin."""

import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
os.chdir(root)
python = root / ".venv/bin/python"
if not (root / "dist/index.html").exists():
    sys.exit("Build the frontend first: npm ci && npm run build")
os.execv(
    str(python) if python.exists() else sys.executable,
    [
        str(python) if python.exists() else sys.executable,
        "-m",
        "gunicorn",
        "--bind",
        "0.0.0.0:" + os.getenv("PORT", "3000"),
        "--workers",
        os.getenv("WEB_CONCURRENCY", "2"),
        "--threads",
        "4",
        "--timeout",
        "240",
        "--umask",
        "077",
        "--no-control-socket",
        "--access-logfile",
        "-",
        "server.app:create_app()",
    ],
)
