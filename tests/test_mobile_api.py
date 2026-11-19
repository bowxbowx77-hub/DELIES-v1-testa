"""Pocket uses scoped bearer credentials, never a cookie copied out of a browser."""

import hashlib
import io
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path

from server.app import create_app
from server.core import now

HEAD = {"X-DevVault-Request": "workspace"}
ACCOUNT = {
    "name": "Pocket QA",
    "email": "pocket@example.test",
    "password": "correct horse pocket",
}


class PocketAPITest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name)
        self.app = create_app({"TESTING": True, "DATA_DIR": self.path})
        self.mobile = self.app.test_client(use_cookies=False)
        res = self.mobile.post("/api/mobile/register", headers=HEAD, json=ACCOUNT)
        self.assertEqual(res.status_code, 201, res.json)
        self.assertNotIn("Set-Cookie", res.headers)
        self.token = res.json["token"]
        self.h = {**HEAD, "Authorization": "Bearer " + self.token}
        self.assertRegex(self.token, r"\Advm_[A-Za-z0-9_-]{54}\Z")
        self.assertTrue(now() + 43_100_000 < res.json["expires"] <= now() + 43_200_000)

    def test_session_boundaries_and_revocation(self):
        wrong = {**ACCOUNT, "password": "not that password"}
        self.assertEqual(
            self.mobile.post("/api/mobile/login", json=wrong, headers=HEAD).status_code,
            401,
        )
        db = sqlite3.connect(self.path / "vault.sqlite3")
        self.addCleanup(db.close)
        key = hashlib.sha256(("mobile:" + self.token).encode()).hexdigest()
        self.assertEqual(db.execute("SELECT token FROM sessions").fetchone()[0], key)
        self.assertEqual(
            self.mobile.get("/api/workspace", headers=self.h).json["repos"], []
        )
        browser = self.app.test_client()
        browser.set_cookie("dv_session", self.token)
        self.assertEqual(browser.get("/api/workspace").status_code, 401)
        self.assertEqual(
            self.mobile.get(
                "/api/workspace", headers={"Authorization": "Bearer broken"}
            ).status_code,
            401,
        )
        self.assertEqual(
            self.mobile.post("/api/mobile/logout", headers=HEAD).status_code, 401
        )
        self.assertEqual(
            self.mobile.post("/api/mobile/logout", headers=self.h).status_code, 200
        )
        self.assertEqual(
            self.mobile.get("/api/workspace", headers=self.h).status_code, 401
        )
        r = self.mobile.post("/api/mobile/login", headers=HEAD, json=ACCOUNT)
        self.assertEqual(r.status_code, 200)
        self.assertNotEqual(self.token, r.json["token"])
        db.execute("UPDATE sessions SET expires=?", (now() - 1,))
        db.commit()
        self.assertEqual(
            self.mobile.get(
                "/api/workspace", headers={"Authorization": "Bearer " + r.json["token"]}
            ).status_code,
            401,
        )

    def test_private_first_publication_and_download(self):
        rid = (
            "/api/repos/"
            + self.mobile.post(
                "/api/repos", json={"name": "phone", "readme": False}, headers=self.h
            ).json["id"]
        )
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as z:
            z.writestr("src/main.rb", 'puts "pocket"')
        out.seek(0)
        r = self.mobile.post(
            rid + "/upload?base=1&message=sent-from-device",
            headers=self.h,
            data={"files": (out, "snapshot.zip")},
        )
        self.assertEqual(r.status_code, 201, r.json)
        outsider = self.app.test_client(use_cookies=False)
        self.assertEqual(outsider.get(rid).status_code, 404)
        detail = self.mobile.get(rid, headers=self.h).json
        self.assertEqual(detail["versions"][0]["message"], "sent-from-device")
        self.assertEqual(detail["files"][0]["path"], "src/main.rb")
        self.assertEqual(
            self.mobile.patch(
                rid, headers=self.h, json={"visibility": "public"}
            ).status_code,
            200,
        )
        self.assertFalse(outsider.get(rid + "?visit=1").json["owner"])
        response = outsider.get(rid + "/download?version=2")
        with zipfile.ZipFile(io.BytesIO(response.data)) as z:
            self.assertEqual(z.read("src/main.rb"), b'puts "pocket"')
        response.close()
        self.assertEqual(outsider.get(rid).json["repo"]["downloads"], 1)
        self.assertEqual(outsider.delete(rid, headers=HEAD).status_code, 404)

    def test_exact_origin_cookie_isolation_and_snapshot_conflict(self):
        origin = "https://pocket.devvault.invalid"
        cors = {
            **HEAD,
            "Origin": origin,
            "Sec-Fetch-Site": "cross-site",
            "X-DevVault-Client": "pocket",
        }
        secure = {**cors, "Authorization": "Bearer " + self.token}
        pre = self.mobile.options(
            "/api/mobile/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-DevVault-Client,Content-Type",
            },
        )
        self.assertEqual(pre.headers.get("Access-Control-Allow-Origin"), origin)
        self.assertNotIn("Access-Control-Allow-Credentials", pre.headers)
        other = self.mobile.options(
            "/api/mobile/login", headers={"Origin": "https://other.invalid"}
        )
        self.assertNotIn("Access-Control-Allow-Origin", other.headers)
        web = self.app.test_client()
        self.assertEqual(web.post("/api/session/start", headers=HEAD).status_code, 200)
        self.assertEqual(web.get("/api/workspace", headers=cors).status_code, 401)
        self.assertEqual(web.post("/api/session/start", headers=cors).status_code, 403)
        self.assertEqual(
            self.mobile.get("/api/workspace", headers=secure).status_code, 200
        )
        rid = (
            "/api/repos/"
            + self.mobile.post(
                "/api/repos",
                headers=secure,
                json={"name": "stable-remote", "readme": False},
            ).json["id"]
        )

        def snap(base, name, visibility):
            return self.mobile.post(
                rid + "/upload",
                headers=secure,
                data={
                    "base": str(base),
                    "snapshot_visibility": visibility,
                    "files": (io.BytesIO(b"snapshot body"), name),
                },
            )

        self.assertEqual(snap(1, "one.txt", "public").json["snapshot"], True)
        self.assertEqual(snap(1, "stale.txt", "private").status_code, 409)
        self.assertEqual(self.mobile.get(rid).json["repo"]["visibility"], "public")
        self.assertEqual(snap(2, "two.txt", "private").status_code, 201)
        self.assertEqual(self.mobile.get(rid).status_code, 404)
        self.assertEqual(
            [f["path"] for f in self.mobile.get(rid, headers=secure).json["files"]],
            ["two.txt"],
        )
        self.assertEqual(
            self.mobile.get(rid + "?version=2", headers=secure).json["files"][0][
                "path"
            ],
            "one.txt",
        )
