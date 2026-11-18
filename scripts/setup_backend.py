#!/usr/bin/env python3
"""Install the pinned backend into a project-local virtual environment."""

import hashlib
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
if sys.version_info < (3, 11):  # noqa: UP036 - helpful message on unsupported hosts
    sys.exit("DEVVAULT needs Python 3.11 or newer.")
py = root / ".venv/bin/python"
stamp = root / ".venv/devvault-lock"
lock = root / "requirements.lock"
version = hashlib.sha256(lock.read_bytes()).hexdigest()
if not py.is_file():
    subprocess.check_call([sys.executable, "-m", "venv", str(root / ".venv")])
if not stamp.is_file() or stamp.read_text() != version:
    subprocess.check_call(
        [
            str(py),
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "-r",
            str(lock),
        ]
    )
    stamp.write_text(version)
