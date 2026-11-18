#!/usr/bin/env python3
"""Short-lived, isolated HTTP server used only by Playwright."""

import os
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
py = root / ".venv/bin/python"
if py.exists() and Path(sys.prefix) != (root / ".venv"):
    os.execv(str(py), [str(py), __file__])
sys.path.insert(0, str(root))
from server.app import create_app

with tempfile.TemporaryDirectory(prefix="devvault-test-") as d:
    app = create_app({"DATA_DIR": d, "TESTING": True})
    app.run(host="127.0.0.1", port=4177, threaded=True, debug=False, use_reloader=False)
