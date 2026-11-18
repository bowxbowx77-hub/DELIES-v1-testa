"""Bounded upload staging, content-addressed storage and immutable file manifests."""

import hashlib
import json
import os
import re
import shutil
import stat
import struct
import subprocess
import tempfile
import unicodedata
import zipfile
import zlib
from pathlib import Path

from flask import abort, current_app, request

from .core import QUOTA, db, latest, now, one, root, space, update_summary

MIB = 1024 * 1024
MAX_FILE, MAX_PROJECT, MAX_FILES = 32 * MIB, 128 * MIB, 2000
DENIED = {
    ".exe",
    ".dll",
    ".com",
    ".msi",
    ".scr",
    ".lnk",
    ".sys",
    ".bat",
    ".cmd",
    ".pif",
    ".apk",
    ".dmg",
    ".iso",
    ".so",
    ".dylib",
    ".pyd",
    ".class",
    ".jar",
    ".wasm",
    ".vbs",
    ".ps1",
    ".hta",
    ".chm",
    ".pem",
    ".p12",
    ".pfx",
    ".rar",
    ".7z",
    ".gz",
    ".xz",
    ".tar",
    ".bz2",
    ".zip",
}
MAGIC = (
    b"MZ",
    b"\x7fELF",
    b"\xfe\xed\xfa\xce",
    b"\xcf\xfa\xed\xfe",
    b"\xfe\xed\xfa\xcf",
    b"\xca\xfe\xba\xbe",
    b"PK\x03\x04",
    b"Rar!\x1a\x07",
    b"7z\xbc\xaf\x27\x1c",
    b"\x1f\x8b",
    b"\x00asm",
)


def safe_path(text, archive=False):
    if not isinstance(text, str):
        abort(400, "Invalid file path.")
    name = unicodedata.normalize("NFC", text)
    parts = name.split("/")
    if (
        len(name.encode()) > 512
        or len(parts) > 24
        or "\\" in name
        or ":" in name
        or re.search(r"[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]", name)
        or any(
            p in ("", ".", "..") or len(p.encode()) > 200 or p.endswith((" ", "."))
            for p in parts
        )
    ):
        abort(400, "An unsafe or overly long file path was rejected.")
    if any(
        p.lower() in (".git", ".svn", ".hg", "id_rsa", "id_ed25519", ".ssh", ".aws")
        or (
            p.lower().startswith(".env")
            and p.lower() not in (".env.example", ".env.sample")
        )
        for p in parts
    ):
        abort(400, "Remove credentials and version-control metadata before uploading.")
    suffix = Path(name).suffix.lower()
    if suffix in DENIED and not (archive and suffix == ".zip"):
        abort(400, f"File type {suffix} is not accepted. Upload source files instead.")
    return name


def blob(sha):
    return root() / "blobs" / sha[:2] / sha


def put_bytes(data):
    sha = hashlib.sha256(data).hexdigest()
    p = blob(sha)
    if not p.exists():
        p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=p.parent, delete=False) as f:
            f.write(data)
        os.replace(f.name, p)
    return sha, len(data)


def check_manifest(files):
    if len(files) > MAX_FILES or sum(size for _, size in files.values()) > MAX_PROJECT:
        abort(413, "A repository version can contain up to 2,000 files and 128 MiB.")
    folded = {p.casefold() for p in files}
    if len(folded) != len(files):
        abort(400, "File names must also be unique on case-insensitive systems.")
    for p in folded:
        bits = p.split("/")
        if any("/".join(bits[:n]) in folded for n in range(1, len(bits))):
            abort(400, "A file and a folder cannot have the same path.")


def save_version(rid, files, message):
    check_manifest(files)
    prev = latest(rid)
    n = prev["number"] + 1 if prev else 1
    if n > 500:
        abort(
            409,
            "This repository has reached its 500-version limit. Archive it and create a new repository.",
        )
    stamp = now()
    vid = (
        db()
        .execute(
            "INSERT INTO versions(repo,number,created,message) VALUES(?,?,?,?)",
            (rid, n, stamp, message),
        )
        .lastrowid
    )
    db().executemany(
        "INSERT INTO files VALUES(?,?,?,?)",
        ((vid, p, sha, size) for p, (sha, size) in files.items()),
    )
    db().execute("UPDATE repos SET updated=? WHERE id=?", (stamp, rid))
    owner = one("SELECT owner FROM repos WHERE id=?", (rid,))[0]
    db().executemany(
        "INSERT OR IGNORE INTO holdings VALUES(?,?,?)",
        ((owner, sha, size) for sha, size in set(files.values())),
    )
    update_summary(db(), rid, n, files)
    if space(owner) > QUOTA:
        abort(
            413,
            "Workspace storage is full. Permanently remove unused repositories to free space.",
        )
    return n


def bounded_zip(stream):
    """Limit central directory metadata before ZipFile allocates its member list."""
    stream.seek(0, 2)
    length = stream.tell()
    stream.seek(max(0, length - 65557))
    tail = stream.read(65557)
    pos = tail.rfind(b"PK\x05\x06")
    stream.seek(0)
    if pos < 0 or len(tail) - pos < 22:
        abort(400, "Invalid ZIP directory.")
    _, disk, first, on_disk, total, size, offset, comment = struct.unpack_from(
        "<4s4H2IH", tail, pos
    )
    if (
        disk
        or first
        or on_disk != total
        or offset + size > length
        or pos + 22 + comment != len(tail)
    ):
        abort(400, "Multipart or invalid ZIP directories are not supported.")
    if total > MAX_FILES or size > 2 * MIB:
        abort(413, "The ZIP directory exceeds the metadata limit.")


def stage_upload(file_list, raw_paths, staging):
    if (
        shutil.disk_usage(staging).free
        < 64 * MIB + min(request.content_length or 0, MAX_PROJECT) * 2
    ):
        abort(503, "Not enough free space on the storage server. Nothing was saved.")
    if not file_list:
        abort(400, "Choose at least one file, folder, or ZIP archive.")
    try:
        paths = json.loads(raw_paths) if raw_paths else [f.filename for f in file_list]
    except (ValueError, TypeError):
        abort(400, "Invalid file path list.")
    if (
        not isinstance(paths, list)
        or len(file_list) != len(paths)
        or len(paths) > MAX_FILES
    ):
        abort(400, "The list of upload paths is invalid.")
    changes, staged, total = {}, {}, 0

    def consume(path, stream):
        nonlocal total
        path = safe_path(path)
        if path in changes or len(changes) >= MAX_FILES:
            abort(400, "Duplicate path or too many files in this upload.")
        digest, size = hashlib.sha256(), 0
        with tempfile.NamedTemporaryFile(dir=staging, delete=False) as output:
            tail = b""
            while chunk := stream.read(128 * 1024):
                if not size and chunk.startswith(MAGIC):
                    abort(
                        400,
                        "Compiled executables and nested archives are not accepted.",
                    )
                size += len(chunk)
                total += len(chunk)
                if size > MAX_FILE or total > MAX_PROJECT:
                    abort(
                        413,
                        "Expanded files exceed the upload limit (32 MiB per file, 128 MiB per project).",
                    )
                sample = tail + chunk
                if b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE" in sample or re.search(
                    rb"-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----",
                    sample,
                ):
                    abort(
                        400,
                        "Upload rejected: a security signature or private key was detected.",
                    )
                tail = chunk[-100:]
                digest.update(chunk)
                output.write(chunk)
        sha = digest.hexdigest()
        changes[path] = (sha, size)
        staged[sha] = Path(output.name)

    for f, raw in zip(file_list, paths):
        name = safe_path(raw, archive=True)
        if not name.lower().endswith(".zip"):
            consume(name, f.stream)
            continue
        try:
            bounded_zip(f.stream)
            with zipfile.ZipFile(f.stream) as archive:
                infos = archive.infolist()
                if (
                    len(infos) > MAX_FILES
                    or sum(i.file_size for i in infos) + total > MAX_PROJECT
                ):
                    abort(413, "ZIP contents exceed the project limits.")
                for info in infos:
                    path = safe_path(info.orig_filename.rstrip("/"))
                    typ = stat.S_IFMT(info.external_attr >> 16)
                    if typ not in (0, stat.S_IFREG, stat.S_IFDIR) or info.flag_bits & 1:
                        abort(
                            400,
                            "ZIP links, special files and encrypted entries are not supported.",
                        )
                    if info.compress_type not in (
                        zipfile.ZIP_STORED,
                        zipfile.ZIP_DEFLATED,
                    ):
                        abort(
                            400, "Use stored or deflate compression for ZIP archives."
                        )
                    if info.is_dir():
                        continue
                    if info.file_size > MAX_FILE or (
                        info.file_size > MIB
                        and info.file_size / max(info.compress_size, 1) > 250
                    ):
                        abort(413, "Unsafe ZIP expansion ratio or oversized entry.")
                    with archive.open(info) as stream:
                        consume(path, stream)
        except (
            zipfile.BadZipFile,
            NotImplementedError,
            RuntimeError,
            EOFError,
            ValueError,
            zlib.error,
        ):
            abort(
                400, "This ZIP is damaged, encrypted, or uses unsupported compression."
            )
    if not changes:
        abort(400, "No files were found in the upload.")
    if current_app.config["SCAN_UPLOADS"]:
        try:
            scan = subprocess.run(
                ["clamscan", "--no-summary", "--recursive", str(staging)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=180,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            abort(503, "The upload scanner is unavailable. Nothing was saved.")
        if scan.returncode:
            abort(
                400 if scan.returncode == 1 else 503,
                "Security scan failed. Nothing was saved.",
            )
    return changes, staged


def promote(staged):
    # Called under the same SQLite writer lock as the manifest commit / garbage collector.
    for sha, temp in staged.items():
        target = blob(sha)
        if not target.exists():
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.replace(temp, target)


def collect(candidates):
    for sha in candidates:
        if not one("SELECT 1 FROM files WHERE sha=? LIMIT 1", (sha,)):
            blob(sha).unlink(missing_ok=True)
