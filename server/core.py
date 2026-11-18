"""SQLite metadata, opaque sessions and workspace queries."""

import hashlib
import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from flask import abort, current_app, g, request

QUOTA = 1024**3
DAY = 86400
STYLES = ("violet", "lime", "blue", "amber", "rose", "cyan")
LICENSES = ("MIT", "Apache-2.0", "BSD-3-Clause", "GPL-3.0-only", "Unlicensed")
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT COLLATE NOCASE UNIQUE,password TEXT,created INTEGER NOT NULL,color TEXT NOT NULL DEFAULT 'lime');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS repos(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users ON DELETE CASCADE,name TEXT COLLATE NOCASE NOT NULL,description TEXT NOT NULL DEFAULT '',visibility TEXT NOT NULL CHECK(visibility IN ('public','private')),license TEXT NOT NULL,style TEXT NOT NULL,created INTEGER NOT NULL,updated INTEGER NOT NULL,deleted INTEGER,views INTEGER NOT NULL DEFAULT 0,downloads INTEGER NOT NULL DEFAULT 0,starter INTEGER NOT NULL DEFAULT 0,UNIQUE(owner,name));
CREATE INDEX IF NOT EXISTS repo_owner ON repos(owner,deleted,updated);
CREATE INDEX IF NOT EXISTS repo_public ON repos(visibility,deleted,updated);
CREATE TABLE IF NOT EXISTS versions(id INTEGER PRIMARY KEY,repo TEXT NOT NULL REFERENCES repos ON DELETE CASCADE,number INTEGER NOT NULL,created INTEGER NOT NULL,message TEXT NOT NULL,UNIQUE(repo,number));
CREATE TABLE IF NOT EXISTS files(version INTEGER NOT NULL REFERENCES versions ON DELETE CASCADE,path TEXT NOT NULL,sha TEXT NOT NULL,size INTEGER NOT NULL,PRIMARY KEY(version,path));
CREATE INDEX IF NOT EXISTS file_blob ON files(sha);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,repo TEXT REFERENCES repos ON DELETE SET NULL,subject TEXT NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL,created INTEGER NOT NULL,seen INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id,id DESC);
CREATE TABLE IF NOT EXISTS repo_summary(repo TEXT PRIMARY KEY REFERENCES repos ON DELETE CASCADE,version INTEGER NOT NULL,files INTEGER NOT NULL,size INTEGER NOT NULL,language TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS holdings(owner TEXT NOT NULL REFERENCES users ON DELETE CASCADE,sha TEXT NOT NULL,size INTEGER NOT NULL,PRIMARY KEY(owner,sha));
CREATE TABLE IF NOT EXISTS limits(bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,expires INTEGER NOT NULL);
"""


def now():
    return int(time.time() * 1000)


def uid():
    return uuid.uuid4().hex


def root():
    return Path(current_app.config["DATA_DIR"])


def connect(path):
    db = sqlite3.connect(path, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA secure_delete=ON")
    db.execute("PRAGMA busy_timeout=30000")
    return db


def init(path):
    path = Path(path)
    for folder in (path, path / "blobs", path / "stage"):
        folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    db = connect(path / "vault.sqlite3")
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    # Upgrade an existing store once. No dashboard poll scans historical manifests.
    db.execute("BEGIN IMMEDIATE")
    try:
        if db.execute("PRAGMA user_version").fetchone()[0] < 1:
            db.execute(
                "INSERT OR IGNORE INTO holdings SELECT DISTINCT r.owner,f.sha,f.size FROM files f JOIN versions v ON v.id=f.version JOIN repos r ON r.id=v.repo"
            )
            for repo in db.execute("SELECT id FROM repos"):
                v = db.execute(
                    "SELECT id,number FROM versions WHERE repo=? ORDER BY number DESC LIMIT 1",
                    (repo["id"],),
                ).fetchone()
                if v:
                    rows = {
                        f["path"]: (f["sha"], f["size"])
                        for f in db.execute(
                            "SELECT * FROM files WHERE version=?", (v["id"],)
                        )
                    }
                    update_summary(db, repo["id"], v["number"], rows)
            db.execute("PRAGMA user_version=1")
        db.commit()
    finally:
        db.close()
    os.chmod(path / "vault.sqlite3", 0o600)


def db():
    if "db" not in g:
        g.db = connect(root() / "vault.sqlite3")
    return g.db


@contextmanager
def write():
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise


def one(sql, args=()):
    return db().execute(sql, args).fetchone()


def allrows(sql, args=()):
    return [dict(x) for x in db().execute(sql, args)]


def current_user(required=True):
    if "viewer" not in g:
        key = hashlib.sha256(request.cookies.get("dv_session", "").encode()).hexdigest()
        g.viewer = one(
            "SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE token=? AND expires>?",
            (key, now()),
        )
    if g.viewer is None and required:
        abort(401, "Your session has expired. Reload the workspace or sign in again.")
    return g.viewer


def public_user(user):
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "guest": user["email"] is None,
        "created": user["created"],
        "color": user["color"],
    }


def secure_cookie():
    # Browser-supplied same-origin metadata also works behind a TLS preview proxy.
    return (
        current_app.config["HTTPS_ONLY"]
        or request.is_secure
        or request.host.partition(":")[0].endswith(".e2b.app")
        or (
            request.headers.get("Sec-Fetch-Site") == "same-origin"
            and request.headers.get("Origin", "").startswith("https://")
        )
    )


def issue_session(user_id, response):
    token = secrets.token_urlsafe(40)
    with write() as conn:
        old = hashlib.sha256(request.cookies.get("dv_session", "").encode()).hexdigest()
        conn.execute("DELETE FROM sessions WHERE token=? OR expires<?", (old, now()))
        conn.execute(
            "INSERT INTO sessions VALUES(?,?,?)",
            (
                hashlib.sha256(token.encode()).hexdigest(),
                user_id,
                now() + 30 * DAY * 1000,
            ),
        )
    secure = secure_cookie()
    response.set_cookie(
        "dv_session",
        token,
        httponly=True,
        secure=secure,
        samesite="None" if secure else "Lax",
        partitioned=secure,
        max_age=30 * DAY,
        path="/",
    )
    return response


def throttle(key, count, seconds):
    if current_app.testing:
        return
    bucket = hashlib.sha256(
        (key + "|" + (request.remote_addr or "")).encode()
    ).hexdigest()
    with write() as conn:
        conn.execute("DELETE FROM limits WHERE expires<=?", (now(),))
        conn.execute(
            "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1",
            (bucket, now() + seconds * 1000),
        )
        hits = one("SELECT hits FROM limits WHERE bucket=?", (bucket,))[0]
    if hits > count:
        abort(429, "Too many requests. Please try again later.")


def event(user_id, kind, subject, detail, repo=None, seen=0):
    db().execute(
        "INSERT INTO events(user_id,repo,subject,kind,detail,created,seen) VALUES(?,?,?,?,?,?,?)",
        (user_id, repo, subject, kind, detail, now(), seen),
    )


def access(rid, owner=False, trash=False):
    r = one("SELECT * FROM repos WHERE id=?", (rid,))
    user = current_user(False)
    mine = user is not None and r is not None and r["owner"] == user["id"]
    if (
        not r
        or bool(r["deleted"]) != trash
        or (not mine and (owner or trash or r["visibility"] != "public"))
    ):
        abort(404, "Repository not found, or you do not have access.")
    return r


def latest(rid):
    return one(
        "SELECT * FROM versions WHERE repo=? ORDER BY number DESC LIMIT 1", (rid,)
    )


def manifest(vid):
    return {
        r["path"]: (r["sha"], r["size"])
        for r in db().execute(
            "SELECT * FROM files WHERE version=? ORDER BY path", (vid,)
        )
    }


LANG = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".py": "Python",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".css": "CSS",
    ".html": "HTML",
    ".rs": "Rust",
    ".go": "Go",
    ".rb": "Ruby",
    ".java": "Java",
    ".cpp": "C++",
    ".c": "C",
    ".vue": "Vue",
    ".md": "Markdown",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
}


def update_summary(conn, rid, number, files):
    counts = {}
    for path in files:
        lang = LANG.get(Path(path).suffix.lower())
        if lang:
            counts[lang] = counts.get(lang, 0) + 1
    primary = {
        k: v for k, v in counts.items() if k not in ("Markdown", "JSON", "YAML", "TOML")
    } or counts
    language = max(primary, key=primary.get) if primary else "Files"
    conn.execute(
        "INSERT OR REPLACE INTO repo_summary VALUES(?,?,?,?,?)",
        (rid, number, len(files), sum(v[1] for v in files.values()), language),
    )


def serialize_repo(r):
    data = dict(r)
    summary = one(
        "SELECT s.version,s.files,s.size,s.language,u.name AS author FROM repo_summary s JOIN users u ON u.id=? WHERE s.repo=?",
        (r["owner"], r["id"]),
    )
    data.update(dict(summary))
    return data


def space(user_id):
    return one("SELECT COALESCE(SUM(size),0) FROM holdings WHERE owner=?", (user_id,))[
        0
    ]


def workspace(user):
    repos = [
        serialize_repo(r)
        for r in db().execute(
            "SELECT * FROM repos WHERE owner=? AND deleted IS NULL ORDER BY updated DESC,rowid DESC",
            (user["id"],),
        )
    ]
    return {
        "user": public_user(user),
        "repos": repos,
        "events": allrows(
            "SELECT * FROM events WHERE user_id=? ORDER BY id DESC LIMIT 12",
            (user["id"],),
        ),
        "storage": space(user["id"]),
        "quota": QUOTA,
        "trash": one(
            "SELECT COUNT(*) FROM repos WHERE owner=? AND deleted IS NOT NULL",
            (user["id"],),
        )[0],
        "unread": one(
            "SELECT COUNT(*) FROM events WHERE user_id=? AND seen=0", (user["id"],)
        )[0],
    }
