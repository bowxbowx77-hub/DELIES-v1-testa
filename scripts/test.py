#!/usr/bin/env python3
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
os.chdir(root)
py = (
    str(root / ".venv/bin/python")
    if (root / ".venv/bin/python").exists()
    else sys.executable
)
os.execv(py, [py, "-m", "unittest", "discover", "-s", "tests", "-v"])
