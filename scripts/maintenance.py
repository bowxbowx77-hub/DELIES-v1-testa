#!/usr/bin/env python3
"""Server operator commands. Back up consistent metadata and the referenced blobs."""

import argparse
import hashlib
import json
import os
import re
import shutil
import sqlite3
import sys
import tarfile
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from server.core import connect


def backup(data: Path, output: Path):
    data = data.resolve()
    output = output.resolve()
    if not (data / "vault.sqlite3").is_file():
        raise ValueError("No DEVVAULT database in the source directory.")
    if output.exists():
        raise ValueError("Refusing to overwrite an existing backup.")
    if data in output.parents:
        raise ValueError("Store backups outside the live data directory.")
    output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=data / "stage") as tmp:
        snap = Path(tmp)
        dbfile = snap / "vault.sqlite3"
        lock = connect(data / "vault.sqlite3")
        source = connect(data / "vault.sqlite3")
        dest = connect(dbfile)
        try:
            # Freeze writers only while creating the DB snapshot and pinning immutable blobs.
            lock.execute("BEGIN IMMEDIATE")
            source.backup(dest)
            dest.execute("PRAGMA journal_mode=DELETE")
            dest.execute("DELETE FROM sessions")
            dest.execute("DELETE FROM limits")
            hashes = [
                row[0]
                for row in dest.execute("SELECT DISTINCT sha FROM files ORDER BY sha")
            ]
            for sha in hashes:
                src = data / "blobs" / sha[:2] / sha
                dst = snap / "blobs" / sha[:2] / sha
                dst.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                try:
                    os.link(src, dst)
                except OSError:
                    shutil.copyfile(src, dst)
        finally:
            lock.close()
            source.close()
            dest.close()
        (snap / "format.json").write_text(
            json.dumps({"format": 1, "created": int(time.time()), "blobs": len(hashes)})
        )
        fd, partial = tempfile.mkstemp(dir=output.parent, suffix=".partial")
        os.close(fd)
        try:
            with tarfile.open(
                partial, "w:gz", compresslevel=3, dereference=True
            ) as archive:
                for file in (
                    snap / "format.json",
                    dbfile,
                    *(snap / "blobs" / s[:2] / s for s in hashes),
                ):
                    archive.add(
                        file, arcname=str(file.relative_to(snap)), recursive=False
                    )
            os.link(
                partial, output
            )  # Atomic publish; never replaces an existing backup.
        finally:
            Path(partial).unlink(missing_ok=True)
    return len(hashes)


def restore(archive: Path, target: Path):
    target = target.resolve()
    if target.exists():
        raise ValueError(
            "Restore requires a new, nonexistent destination. Stop the service before switching its data directory."
        )
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as tmp:
        dest = Path(tmp) / "restored"
        dest.mkdir(mode=0o700)
        seen = set()
        blobs = set()
        with tarfile.open(archive, "r|gz") as tar:
            for member in tar:
                name = member.name
                match = re.fullmatch(r"blobs/([0-9a-f]{2})/([0-9a-f]{64})", name)
                if (
                    not member.isfile()
                    or name in seen
                    or (name not in ("vault.sqlite3", "format.json") and not match)
                ):
                    raise ValueError("Unexpected backup entry.")
                if match and match[1] != match[2][:2]:
                    raise ValueError("Invalid content address.")
                seen.add(name)
                out = dest / name
                out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                source = tar.extractfile(member)
                digest = hashlib.sha256()
                with out.open("xb") as f:
                    os.chmod(out, 0o600)
                    while buf := source.read(1024 * 1024):
                        f.write(buf)
                        digest.update(buf)
                if match:
                    if digest.hexdigest() != match[2]:
                        raise ValueError("A file failed its SHA-256 integrity check.")
                    blobs.add(match[2])
        if (
            "format.json" not in seen
            or "vault.sqlite3" not in seen
            or json.loads((dest / "format.json").read_text()).get("format") != 1
        ):
            raise ValueError("Unsupported or incomplete DEVVAULT backup.")
        conn = connect(dest / "vault.sqlite3")
        try:
            conn.execute("PRAGMA trusted_schema=OFF")
            if (
                conn.execute("PRAGMA integrity_check").fetchone()[0] != "ok"
                or conn.execute("PRAGMA foreign_key_check").fetchone()
            ):
                raise ValueError("Database integrity check failed.")
            refs = {
                r["sha"]: r["size"]
                for r in conn.execute("SELECT DISTINCT sha,size FROM files")
            }
            if blobs != set(refs):
                raise ValueError("The archive does not match its file manifest.")
            if any(
                (dest / "blobs" / s[:2] / s).stat().st_size != n
                for s, n in refs.items()
            ):
                raise ValueError("Incorrect stored file size.")
            conn.execute("DELETE FROM sessions")
            conn.execute("DELETE FROM limits")
        finally:
            conn.close()
        (dest / "format.json").unlink()
        (dest / "stage").mkdir(mode=0o700)
        (dest / "blobs").mkdir(mode=0o700, exist_ok=True)
        dest.rename(target)
    return len(blobs)


def gc(data: Path, apply=False):
    if not (data / "vault.sqlite3").is_file():
        raise ValueError("No source database.")
    conn = connect(data / "vault.sqlite3")
    try:
        conn.execute("BEGIN IMMEDIATE")
        refs = {r[0] for r in conn.execute("SELECT DISTINCT sha FROM files")}
        count = 0
        for p in (data / "blobs").glob("*/*"):
            if (
                p.is_file()
                and re.fullmatch("[0-9a-f]{64}", p.name)
                and p.name not in refs
            ):
                count += 1
                if apply:
                    p.unlink()
        conn.commit()
    finally:
        conn.close()
    return count


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data", type=Path, default=Path(os.getenv("DEVVAULT_DATA", "vault-data"))
    )
    cmds = parser.add_subparsers(dest="cmd", required=True)
    cmds.add_parser("backup").add_argument("output", type=Path)
    r = cmds.add_parser("restore")
    r.add_argument("archive", type=Path)
    r.add_argument("destination", type=Path)
    cmds.add_parser("gc").add_argument("--apply", action="store_true")
    args = parser.parse_args()
    try:
        if args.cmd == "backup":
            print(f"Backup complete: {backup(args.data, args.output)} unique blobs.")
        elif args.cmd == "restore":
            print(
                f"Restore verified: {restore(args.archive, args.destination)} unique blobs. Sign in again."
            )
        else:
            print(
                f"{gc(args.data, args.apply)} orphan blobs "
                + ("removed." if args.apply else "found (dry run).")
            )
    except (ValueError, OSError, sqlite3.Error, tarfile.TarError) as e:
        sys.exit(str(e))
