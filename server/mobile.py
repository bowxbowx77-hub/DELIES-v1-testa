"""First-party Android sessions. Cookie-free authentication and exact-origin CORS for the bundled APK."""

import hashlib
import re
import secrets

from flask import abort, jsonify, request
from werkzeug.security import check_password_hash

from .core import event, now, one, public_user, throttle, uid, write

POCKET_ORIGIN = "https://pocket.devvault.invalid"


def pocket_channel():
    # This is an origin boundary, NOT authentication. A non-browser client can
    # choose any Origin; all private data and writes still require the bearer.
    return request.headers.get("Origin") == POCKET_ORIGIN


def allowed_path():
    path = request.path
    return path in {
        "/api/health",
        "/api/mobile/register",
        "/api/mobile/login",
        "/api/mobile/logout",
        "/api/workspace",
        "/api/public",
        "/api/repos",
    } or bool(re.fullmatch(r"/api/repos/[0-9a-f]{32}(/(upload|file|download))?", path))


def session_key():
    auth = request.headers.get("Authorization", "")
    if auth:
        token = auth.removeprefix("Bearer ")
        if token == auth or not re.fullmatch(r"dvm_[A-Za-z0-9_-]{54}", token):
            abort(401, "Invalid mobile session.")
        return hashlib.sha256(("mobile:" + token).encode()).hexdigest()
    if pocket_channel() or request.headers.get("X-DevVault-Client") == "pocket":
        return ""  # The Pocket channel never consults an ambient browser cookie.
    return hashlib.sha256(request.cookies.get("dv_session", "").encode()).hexdigest()


def install(app, dummy_hash, body, text, password):
    @app.before_request
    def pocket_guard():
        if not pocket_channel():
            return
        if not allowed_path():
            abort(403, "Route unavailable to the Pocket origin.")
        if (
            request.method != "OPTIONS"
            and request.headers.get("X-DevVault-Client") != "pocket"
        ):
            abort(403, "A Pocket client header is required.")
        return

    @app.after_request
    def pocket_cors(response):
        if request.path.startswith("/api/"):
            response.vary.add("Origin")
        if pocket_channel() and allowed_path():
            response.headers["Access-Control-Allow-Origin"] = POCKET_ORIGIN
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PATCH, OPTIONS"
            )
            response.headers["Access-Control-Allow-Headers"] = (
                "Content-Type, Authorization, X-DevVault-Request, X-DevVault-Client"
            )
            response.headers["Access-Control-Max-Age"] = "600"
        return response

    def issue(conn, user):
        token = "dvm_" + secrets.token_urlsafe(40)
        expires = now() + 12 * 3600 * 1000
        hashed = hashlib.sha256(("mobile:" + token).encode()).hexdigest()
        conn.execute("DELETE FROM sessions WHERE expires<=?", (now(),))
        conn.execute(
            "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
            (hashed, user["id"], expires),
        )
        return jsonify(token=token, expires=expires, user=public_user(user))

    @app.post("/api/mobile/register")
    def mobile_register():
        throttle("register", 12, 3600)
        obj = body()
        name = text(obj, "name", 40, True)
        email = text(obj, "email", 254, True).lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            abort(400, "Enter a valid email address.")
        hashed = password(obj.get("password"))
        key = uid()
        with write() as conn:
            if one("SELECT 1 FROM users WHERE email=?", (email,)):
                abort(409, "This email already has an account.")
            conn.execute(
                "INSERT INTO users(id,name,email,password,created) VALUES(?,?,?,?,?)",
                (key, name, email, hashed, now()),
            )
            event(key, "account", name, "Account registered from Pocket")
            return issue(conn, one("SELECT * FROM users WHERE id=?", (key,))), 201

    @app.post("/api/mobile/login")
    def mobile_login():
        throttle("signin", 12, 900)
        obj = body()
        email = text(obj, "email", 254, True).lower()
        pwd = obj.get("password")
        user = one("SELECT * FROM users WHERE email=?", (email,))
        if not isinstance(pwd, str) or len(pwd) > 128:
            abort(400, "Invalid password.")
        ok = check_password_hash(user["password"] if user else dummy_hash, pwd)
        if not user or not ok:
            abort(401, "Email or password is incorrect.")
        with write() as conn:
            if not one(
                "SELECT 1 FROM users WHERE id=? AND password=?",
                (user["id"], user["password"]),
            ):
                abort(401, "Please sign in again.")
            event(user["id"], "account", user["name"], "Signed in with Pocket")
            return issue(conn, user)

    @app.post("/api/mobile/logout")
    def mobile_logout():
        if not request.headers.get("Authorization", "").startswith("Bearer "):
            abort(401, "Mobile token required.")
        with write() as conn:
            conn.execute("DELETE FROM sessions WHERE token=?", (session_key(),))
        return jsonify(ok=True)
