"""DEVVAULT HTTP API + the built React application. No uploaded code is executed."""

import codecs
import hashlib
import os
import re
import sqlite3
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, abort, g, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

from .core import (
    LICENSES,
    STYLES,
    access,
    allrows,
    current_user,
    db,
    event,
    init,
    issue_session,
    latest,
    manifest,
    now,
    one,
    root,
    secure_cookie,
    serialize_repo,
    throttle,
    uid,
    workspace,
    write,
)
from .mobile import install as install_mobile
from .mobile import pocket_channel
from .starters import STARTERS
from .storage import (
    MAX_PROJECT,
    MIB,
    blob,
    collect,
    promote,
    put_bytes,
    safe_path,
    save_version,
    stage_upload,
)

BASE = Path(__file__).resolve().parent.parent


def body():
    obj = request.get_json(silent=True)
    if not isinstance(obj, dict):
        abort(400, "Expected a JSON object.")
    return obj


def text(obj, key, limit, required=False, default=""):
    val = obj.get(key, default)
    if not isinstance(val, str) or len(val) > limit or (required and not val.strip()):
        abort(
            400, f"Enter a valid {key.replace('_', ' ')} (at most {limit} characters)."
        )
    return val.strip()


def repo_fields(obj):
    name = text(obj, "name", 64, True)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name):
        abort(
            400,
            "Use letters, numbers, hyphens, underscores, or dots for the repository name.",
        )
    vis, lic, style = (
        obj.get("visibility", "private"),
        obj.get("license", "MIT"),
        obj.get("style", "violet"),
    )
    if vis not in ("private", "public") or lic not in LICENSES or style not in STYLES:
        abort(400, "Invalid visibility, license, or repository icon.")
    return name, text(obj, "description", 420), vis, lic, style


def new_repo(user_id, fields, starter=False):
    rid, stamp = uid(), now()
    db().execute(
        "INSERT INTO repos(id,owner,name,description,visibility,license,style,created,updated,starter) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (rid, user_id, *fields, stamp, stamp, int(starter)),
    )
    return rid


def seed(user_id):
    for name, desc, vis, style, files in reversed(STARTERS):
        rid = new_repo(user_id, (name, desc, "private", "MIT", style), True)
        event(user_id, "created", name, "Repository created", rid, 1)
        initial = {"README.md": put_bytes(files["README.md"].encode())}
        save_version(rid, initial, "Initialize repository with a README")
        contents = {k: put_bytes(v.encode()) for k, v in files.items()}
        contents["LICENSE"] = put_bytes((BASE / "LICENSE").read_bytes())
        save_version(rid, contents, "Import starter project files")
        event(user_id, "version", name, "Version 2 saved", rid, 1)
        if vis == "public":
            db().execute("UPDATE repos SET visibility='public' WHERE id=?", (rid,))
            event(user_id, "published", name, "Repository published", rid, 1)
    event(user_id, "workspace", "Personal workspace", "Workspace initialized")


def selected_version(rid, number):
    if number in ("", None):
        return latest(rid)
    try:
        number = int(number)
    except (TypeError, ValueError, OverflowError):
        abort(400, "Invalid version number.")
    if not 1 <= number <= 500:
        abort(404, "Version not found.")
    ver = one("SELECT * FROM versions WHERE repo=? AND number=?", (rid, number))
    if not ver:
        abort(404, "Version not found.")
    return ver


def base_check(rid, base):
    if base is not None and str(base) != str(latest(rid)["number"]):
        abort(409, "The repository changed. Reload its latest version before saving.")


def password(value):
    if not isinstance(value, str) or not 10 <= len(value) <= 128:
        abort(400, "Use a password between 10 and 128 characters.")
    return generate_password_hash(value, method="scrypt:32768:8:1")


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATA_DIR=os.getenv("DEVVAULT_DATA", str(BASE / "vault-data")),
        MAX_CONTENT_LENGTH=MAX_PROJECT + 2 * MIB,
        MAX_FORM_PARTS=2200,
        MAX_FORM_MEMORY_SIZE=MIB,
        HTTPS_ONLY=os.getenv("DEVVAULT_HTTPS", "0") == "1",
        SCAN_UPLOADS=os.getenv("DEVVAULT_SCAN", "0") == "1",
    )
    if config:
        app.config.update(config)
    if os.getenv("DEVVAULT_TRUST_PROXY") == "1":
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    init(app.config["DATA_DIR"])
    dummy_hash = generate_password_hash(os.urandom(16).hex(), method="scrypt:32768:8:1")

    install_mobile(app, dummy_hash, body, text, password)

    @app.teardown_appcontext
    def close(_err):
        if "db" in g:
            g.db.close()

    @app.before_request
    def csrf():
        if request.path.startswith("/api/") and request.method not in (
            "GET",
            "HEAD",
            "OPTIONS",
        ):
            if request.headers.get("X-DevVault-Request") != "workspace" or (
                request.headers.get("Sec-Fetch-Site") == "cross-site"
                and not pocket_channel()
            ):
                abort(403, "A same-origin workspace request is required.")
            if request.endpoint != "upload":
                request.max_content_length = 32 * 1024
            origin = request.headers.get("Origin")
            if (
                origin
                and not pocket_channel()
                and urlsplit(origin).netloc != request.host
                and origin != os.getenv("DEVVAULT_ORIGIN")
                and request.headers.get("Sec-Fetch-Site") != "same-origin"
            ):
                abort(403, "Origin does not match this workspace.")

    @app.after_request
    def headers(res):
        res.headers["X-Content-Type-Options"] = "nosniff"
        res.headers["Referrer-Policy"] = "same-origin"
        if request.path.startswith("/api/"):
            res.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        res.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        res.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'"
        )
        if request.path.startswith("/api/") or not request.path.startswith("/assets/"):
            res.headers["Cache-Control"] = "no-store"
        if app.config["HTTPS_ONLY"]:
            res.headers["Strict-Transport-Security"] = "max-age=31536000"
        return res

    @app.errorhandler(HTTPException)
    def http_error(err):
        return jsonify(error=err.description), err.code

    @app.errorhandler(sqlite3.IntegrityError)
    def conflict(_err):
        return jsonify(
            error="That name is already in use. Choose a different one (also check Trash)."
        ), 409

    @app.errorhandler(500)
    def server_error(_err):
        return jsonify(
            error="The server could not complete this request. Please try again."
        ), 500

    @app.post("/api/session/start")
    def start():
        user = current_user(False)
        if user:
            return jsonify(workspace(user))
        throttle("workspace-create", 60, 3600)
        user_id = uid()
        with write() as conn:
            conn.execute(
                "INSERT INTO users(id,name,created) VALUES(?,?,?)",
                (user_id, "Developer", now()),
            )
            seed(user_id)
        return issue_session(
            user_id,
            jsonify(workspace(one("SELECT * FROM users WHERE id=?", (user_id,)))),
        )

    @app.get("/api/session")
    def session_state():
        user = current_user(False)
        return jsonify(workspace=workspace(user) if user else None)

    @app.get("/api/workspace")
    def index():
        return jsonify(workspace(current_user()))

    @app.post("/api/auth/register")
    def register():
        throttle("register", 12, 3600)
        user = current_user()
        obj = body()
        if user["email"]:
            abort(409, "This workspace already belongs to a registered account.")
        name = text(obj, "name", 40, True)
        email = text(obj, "email", 254, True).lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            abort(400, "Enter a valid email address.")
        password_hash = password(obj.get("password"))
        with write() as conn:
            if one("SELECT 1 FROM users WHERE email=?", (email,)):
                abort(409, "An account with this email already exists.")
            conn.execute(
                "UPDATE users SET name=?,email=?,password=? WHERE id=?",
                (name, email, password_hash, user["id"]),
            )
            conn.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            event(user["id"], "account", name, "Account registered")
        return issue_session(user["id"], jsonify(ok=True))

    @app.post("/api/auth/login")
    def login():
        throttle("signin", 12, 900)
        obj = body()
        user = one(
            "SELECT * FROM users WHERE email=?",
            (text(obj, "email", 254, True).lower(),),
        )
        supplied = obj.get("password", "")
        if not isinstance(supplied, str) or len(supplied) > 128:
            abort(400, "Invalid password.")
        match = check_password_hash(user["password"] if user else dummy_hash, supplied)
        if not user or not match:
            abort(401, "Email or password is incorrect.")
        with write():
            event(user["id"], "account", user["name"], "Signed in to workspace")
        return issue_session(user["id"], jsonify(ok=True))

    @app.post("/api/auth/logout")
    def logout():
        current_user()
        with write() as conn:
            conn.execute(
                "DELETE FROM sessions WHERE token=?",
                (
                    hashlib.sha256(
                        request.cookies.get("dv_session", "").encode()
                    ).hexdigest(),
                ),
            )
        res = jsonify(ok=True)
        secure = secure_cookie()
        res.delete_cookie(
            "dv_session",
            path="/",
            secure=secure,
            httponly=True,
            samesite="None" if secure else "Lax",
            partitioned=secure,
        )
        return res

    @app.patch("/api/account")
    def account():
        user = current_user()
        obj = body()
        name = text(obj, "name", 40, True)
        color = obj.get("color", user["color"])
        if color not in STYLES:
            abort(400, "Unknown avatar color.")
        with write() as conn:
            conn.execute(
                "UPDATE users SET name=?,color=? WHERE id=?", (name, color, user["id"])
            )
            event(user["id"], "account", name, "Profile updated")
        return jsonify(ok=True)

    @app.post("/api/account/password")
    def change_password():
        throttle("password", 10, 900)
        user = current_user()
        obj = body()
        old = obj.get("current", "")
        if not isinstance(old, str) or len(old) > 128:
            abort(400, "Invalid current password.")
        if not user["password"] or not check_password_hash(user["password"], old):
            abort(403, "Current password is incorrect.")
        hashed = password(obj.get("password"))
        with write() as conn:
            conn.execute("UPDATE users SET password=? WHERE id=?", (hashed, user["id"]))
            conn.execute("DELETE FROM sessions WHERE user_id=?", (user["id"],))
            event(user["id"], "account", user["name"], "Password changed")
        return issue_session(user["id"], jsonify(ok=True))

    @app.get("/api/health")
    def health():
        one("SELECT 1")
        return jsonify(status="online", storage="sqlite")

    @app.get("/api/public")
    def explore():
        user = current_user(False)
        user_id = user["id"] if user else ""
        q = (
            request.args.get("q", "")[:100]
            .replace("!", "!!")
            .replace("%", "!%")
            .replace("_", "!_")
        )
        pattern = "%" + q + "%"
        offset = min(2**62, max(0, request.args.get("offset", 0, type=int)))
        # Avoid repeat copies of the same unclaimed starter in the discovery feed.
        rows = list(
            db().execute(
                "SELECT r.* FROM repos r JOIN users u ON r.owner=u.id WHERE r.deleted IS NULL AND r.visibility='public' AND (r.starter=0 OR r.owner=? OR u.email IS NOT NULL) AND (r.name LIKE ? ESCAPE '!' OR r.description LIKE ? ESCAPE '!') ORDER BY r.updated DESC,r.id LIMIT 49 OFFSET ?",
                (user_id, pattern, pattern, offset),
            )
        )
        return jsonify(
            repos=[serialize_repo(r) for r in rows[:48]], more=len(rows) > 48
        )

    @app.get("/api/trash")
    def trashed():
        return jsonify(
            repos=[
                serialize_repo(r)
                for r in db().execute(
                    "SELECT * FROM repos WHERE owner=? AND deleted IS NOT NULL ORDER BY deleted DESC",
                    (current_user()["id"],),
                )
            ]
        )

    @app.post("/api/repos")
    def create_repo():
        user = current_user()
        obj = body()
        fields = repo_fields(obj)
        with write():
            if one("SELECT COUNT(*) FROM repos WHERE owner=?", (user["id"],))[0] >= 100:
                abort(409, "Workspace limit: 100 repositories, including Trash.")
            rid = new_repo(user["id"], fields)
            docs = (
                {"README.md": put_bytes(f"# {fields[0]}\n\n{fields[1]}\n".encode())}
                if obj.get("readme", True)
                else {}
            )
            save_version(rid, docs, "Initial version")
            event(user["id"], "created", fields[0], "Repository created", rid)
            if fields[2] == "public":
                event(user["id"], "published", fields[0], "Repository published", rid)
        return jsonify(id=rid), 201

    @app.get("/api/repos/<rid>")
    def get_repo(rid):
        r = access(rid)
        user = current_user(False)
        owner = bool(user and user["id"] == r["owner"])
        if request.method == "GET" and not owner and request.args.get("visit") == "1":
            with write() as conn:
                conn.execute("UPDATE repos SET views=views+1 WHERE id=?", (rid,))
            r = access(rid)
        ver = selected_version(rid, request.args.get("version"))
        return jsonify(
            repo=serialize_repo(r),
            owner=owner,
            versions=allrows(
                "SELECT number,created,message FROM versions WHERE repo=? ORDER BY number DESC",
                (rid,),
            ),
            selected=ver["number"],
            files=allrows(
                "SELECT path,size FROM files WHERE version=? ORDER BY path",
                (ver["id"],),
            ),
        )

    @app.patch("/api/repos/<rid>")
    def settings(rid):
        obj = body()
        with write() as conn:
            r = access(rid, True)
            fields = repo_fields({**dict(r), **obj})
            conn.execute(
                "UPDATE repos SET name=?,description=?,visibility=?,license=?,style=?,updated=?,starter=0 WHERE id=?",
                (*fields, now(), rid),
            )
            published = r["visibility"] != "public" and fields[2] == "public"
            event(
                r["owner"],
                "published" if published else "updated",
                fields[0],
                "Repository published" if published else "Settings updated",
                rid,
            )
        return jsonify(ok=True)

    @app.post("/api/repos/<rid>/upload")
    def upload(rid):
        access(rid, True)
        throttle("upload", 120, 3600)
        with tempfile.TemporaryDirectory(dir=root() / "stage") as stage:
            changes, staged = stage_upload(
                request.files.getlist("files"), request.form.get("paths"), stage
            )
            msg = (
                text(
                    request.form if "message" in request.form else request.args,
                    "message",
                    240,
                )
                or f"Upload {len(changes)} file(s)"
            )
            visibility = request.form.get("snapshot_visibility")
            if visibility is not None and (
                visibility not in {"public", "private"}
                or not request.headers.get("Authorization", "").startswith(
                    "Bearer dvm_"
                )
                or not request.form.get("base")
            ):
                abort(
                    400,
                    "A whole-snapshot publication requires Pocket auth, visibility and a base version.",
                )
            with write():
                r = access(rid, True)
                base_check(rid, request.form.get("base", request.args.get("base")))
                files = {} if visibility is not None else manifest(latest(rid)["id"])
                files.update(changes)
                number = save_version(rid, files, msg)
                if visibility is not None:
                    db().execute(
                        "UPDATE repos SET visibility=? WHERE id=?", (visibility, rid)
                    )
                    if visibility == "public" and r["visibility"] != "public":
                        event(
                            r["owner"],
                            "published",
                            r["name"],
                            "Published from Pocket",
                            rid,
                        )
                promote(staged)
                db().execute("UPDATE repos SET starter=0 WHERE id=?", (rid,))
                event(
                    r["owner"],
                    "upload",
                    r["name"],
                    f"{len(changes)} file(s) uploaded · v{number}",
                    rid,
                )
        return jsonify(
            number=number, files=len(changes), snapshot=visibility is not None
        ), 201

    @app.post("/api/repos/<rid>/files")
    def manage_file(rid):
        obj = body()
        path = text(obj, "path", 512, True)
        with write():
            r = access(rid, True)
            base_check(rid, obj.get("base"))
            files = manifest(latest(rid)["id"])
            if path not in files:
                abort(404, "File not found.")
            val = files.pop(path)
            if obj.get("operation") == "rename":
                target = safe_path(text(obj, "target", 512, True))
                if target in files or target == path:
                    abort(409, "Choose an unused, different file path.")
                files[target] = val
                msg = f"Rename {path} to {target}"
            elif obj.get("operation") == "delete":
                msg = f"Remove {path}"
            else:
                abort(400, "Unknown file operation.")
            n = save_version(rid, files, msg)
            event(r["owner"], "version", r["name"], f"Version {n} saved", rid)
        return jsonify(number=n)

    @app.post("/api/repos/<rid>/restore-version")
    def restore_version(rid):
        obj = body()
        with write():
            r = access(rid, True)
            base_check(rid, obj.get("base"))
            ver = selected_version(rid, obj.get("number"))
            if ver["number"] == latest(rid)["number"]:
                abort(409, "This is already the current version.")
            n = save_version(
                rid, manifest(ver["id"]), f"Restore version {ver['number']}"
            )
            event(
                r["owner"],
                "version",
                r["name"],
                f"Version {ver['number']} restored as v{n}",
                rid,
            )
        return jsonify(number=n)

    @app.get("/api/repos/<rid>/file")
    def preview(rid):
        access(rid)
        v = selected_version(rid, request.args.get("version"))
        f = one(
            "SELECT * FROM files WHERE version=? AND path=?",
            (v["id"], request.args.get("path", "")),
        )
        if not f:
            abort(404, "File not found.")
        if request.args.get("download") == "1":
            return send_file(
                blob(f["sha"]),
                mimetype="application/octet-stream",
                as_attachment=True,
                download_name=Path(f["path"]).name,
                conditional=False,
                etag=False,
            )
        with blob(f["sha"]).open("rb") as source:
            data = source.read(96 * 1024)
        try:
            content = (
                codecs.getincrementaldecoder("utf-8")().decode(
                    data, final=len(data) >= f["size"]
                )
                if b"\x00" not in data
                else None
            )
        except UnicodeDecodeError:
            content = None
        return jsonify(
            text=content,
            truncated=f["size"] > len(data),
            size=f["size"],
            path=f["path"],
        )

    @app.get("/api/repos/<rid>/download")
    def download(rid):
        r = access(rid)
        v = selected_version(rid, request.args.get("version"))
        throttle("download", 180, 3600)
        # The successful WSGI response owns this handle until streaming ends.
        tmp = tempfile.TemporaryFile(dir=root() / "stage")  # noqa: SIM115
        try:
            with zipfile.ZipFile(
                tmp, "w", zipfile.ZIP_DEFLATED, compresslevel=1
            ) as archive:
                for path, (sha, _) in manifest(v["id"]).items():
                    archive.write(blob(sha), arcname=path)
            length = tmp.tell()
            tmp.seek(0)
            with write() as conn:
                access(rid)
                if request.method == "GET":
                    conn.execute(
                        "UPDATE repos SET downloads=downloads+1 WHERE id=?", (rid,)
                    )
                    event(
                        r["owner"],
                        "download",
                        r["name"],
                        f"Version {v['number']} downloaded",
                        rid,
                    )
            res = send_file(
                tmp,
                mimetype="application/zip",
                as_attachment=True,
                download_name=f"{r['name']}-v{v['number']}.zip",
                conditional=False,
                etag=False,
            )
            res.content_length = length
            return res
        except BaseException:
            tmp.close()
            raise

    @app.delete("/api/repos/<rid>")
    def remove(rid):
        with write() as conn:
            r = access(rid, True)
            conn.execute("UPDATE repos SET deleted=? WHERE id=?", (now(), rid))
            event(r["owner"], "deleted", r["name"], "Moved to Trash", rid)
        return jsonify(ok=True)

    @app.post("/api/repos/<rid>/restore")
    def restore(rid):
        with write() as conn:
            r = access(rid, True, True)
            conn.execute(
                "UPDATE repos SET deleted=NULL,updated=? WHERE id=?", (now(), rid)
            )
            event(r["owner"], "restored", r["name"], "Repository restored", rid)
        return jsonify(ok=True)

    @app.delete("/api/repos/<rid>/purge")
    def purge(rid):
        obj = body()
        with write() as conn:
            r = access(rid, True, True)
            if obj.get("confirm") != r["name"]:
                abort(400, "Type the exact repository name to confirm deletion.")
            hashes = [
                f[0]
                for f in conn.execute(
                    "SELECT DISTINCT sha FROM files JOIN versions ON files.version=versions.id WHERE versions.repo=?",
                    (rid,),
                )
            ]
            conn.execute("DELETE FROM events WHERE repo=?", (rid,))
            conn.execute("DELETE FROM repos WHERE id=?", (rid,))
            conn.execute(
                "DELETE FROM holdings WHERE owner=? AND NOT EXISTS (SELECT 1 FROM files f JOIN versions v ON v.id=f.version JOIN repos r ON r.id=v.repo WHERE f.sha=holdings.sha AND r.owner=holdings.owner)",
                (r["owner"],),
            )
            event(r["owner"], "deleted", "Repository", "Repository permanently deleted")
        with write():
            collect(hashes)
        return jsonify(ok=True)

    @app.get("/api/events")
    def events():
        user = current_user()
        before = min(2**62, max(0, request.args.get("before", 2**62, type=int)))
        kind = request.args.get("kind", "")
        rows = allrows(
            "SELECT * FROM events WHERE user_id=? AND id<? AND (?='' OR kind=?) AND (?=0 OR seen=0) ORDER BY id DESC LIMIT 51",
            (user["id"], before, kind, kind, int(request.args.get("unread") == "1")),
        )
        return jsonify(events=rows[:50], more=len(rows) > 50)

    @app.post("/api/events/read")
    def read_events():
        user = current_user()
        with write() as conn:
            conn.execute(
                "UPDATE events SET seen=1 WHERE user_id=? AND seen=0", (user["id"],)
            )
        return jsonify(ok=True)

    @app.get("/")
    @app.get("/<path:path>")
    def ui(path=""):
        if path.startswith("api/"):
            abort(404, "Endpoint not found.")
        dist = BASE / "dist"
        if path.startswith("assets/") or path == "favicon.svg":
            return send_from_directory(dist, path)
        if not (dist / "index.html").is_file():
            abort(503, "Build the frontend using npm run build.")
        return send_from_directory(dist, "index.html")

    return app
