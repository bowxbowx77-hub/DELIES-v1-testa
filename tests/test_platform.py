"""Integration tests against real SQLite databases and temporary blob stores."""

import hashlib
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from scripts.maintenance import backup, gc, restore
from server.app import create_app

HEAD = {"X-DevVault-Request": "workspace"}


class PlatformTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.data = Path(self.tmp.name) / "data"
        self.app = create_app({"TESTING": True, "DATA_DIR": self.data})
        self.c = self.app.test_client()
        self.w = self.c.post("/api/session/start", headers=HEAD).json
        self.user = self.w["user"]["id"]

    def repo(self, name="project", visibility="private", readme=True):
        r = self.c.post(
            "/api/repos",
            json={"name": name, "visibility": visibility, "readme": readme},
            headers=HEAD,
        )
        self.assertEqual(r.status_code, 201, r.json)
        return "/api/repos/" + r.json["id"]

    def post(self, path, data=None):
        return self.c.post(path, json=data or {}, headers=HEAD)

    def upload(self, rid, files, **opts):
        return self.c.post(
            rid + "/upload",
            data={"files": [(io.BytesIO(buf), name) for name, buf in files], **opts},
            headers=HEAD,
        )

    def register(self):
        r = self.post(
            "/api/auth/register",
            {
                "email": "dev@example.org",
                "password": "a long password 123",
                "name": "Test Developer",
            },
        )
        self.assertEqual(r.status_code, 200, r.json)

    def test_starters_and_real_counters(self):
        self.assertEqual(len(self.w["repos"]), 5)
        self.assertEqual(sum(r["downloads"] for r in self.w["repos"]), 0)
        unique = {p.name: p.stat().st_size for p in (self.data / "blobs").glob("*/*")}
        self.assertEqual(self.w["storage"], sum(unique.values()))
        self.assertEqual(self.post("/api/session/start").json["user"]["id"], self.user)
        self.assertEqual(
            self.c.get("/api/workspace").json["repos"][0]["name"], "orbit-ui"
        )
        self.assertEqual(
            self.c.get("/api/public?q=orbit").json["repos"][0]["name"], "orbit-ui"
        )

    def test_auth_registration_login_rotation_and_password_change(self):
        old = self.c.get_cookie("dv_session").value
        self.register()
        self.assertNotEqual(self.c.get_cookie("dv_session").value, old)
        other = self.app.test_client()
        other.set_cookie("dv_session", old)
        self.assertEqual(other.get("/api/workspace").status_code, 401)
        self.assertEqual(self.c.get("/api/workspace").json["user"]["id"], self.user)
        self.assertEqual(
            self.c.patch(
                "/api/account", headers=HEAD, json={"name": "New name", "color": "rose"}
            ).status_code,
            200,
        )
        creds = {"email": "dev@example.org", "password": "a long password 123"}
        self.assertEqual(
            other.post("/api/auth/login", headers=HEAD, json=creds).status_code, 200
        )
        self.assertEqual(
            self.post(
                "/api/account/password",
                {"current": creds["password"], "password": "another long password"},
            ).status_code,
            200,
        )
        self.assertEqual(other.get("/api/workspace").status_code, 401)
        self.assertEqual(self.post("/api/auth/logout").status_code, 200)
        self.assertEqual(self.c.get("/api/workspace").status_code, 401)
        self.assertEqual(self.post("/api/auth/login", creds).status_code, 401)
        self.assertEqual(
            self.post(
                "/api/auth/login", {**creds, "password": "another long password"}
            ).status_code,
            200,
        )
        self.assertEqual(self.c.get("/api/workspace").json["user"]["name"], "New name")

    def test_ownership_visibility_and_stable_url(self):
        rid = self.repo()
        other = self.app.test_client()
        self.assertEqual(other.get(rid).status_code, 404)
        self.assertEqual(other.get(rid + "/download").status_code, 404)
        other.post("/api/session/start", headers=HEAD)
        self.assertEqual(other.get(rid + "/file?path=README.md").status_code, 404)
        self.assertEqual(
            other.patch(rid, json={"name": "no"}, headers=HEAD).status_code, 404
        )
        self.assertEqual(
            self.c.patch(
                rid,
                json={
                    "name": "renamed",
                    "visibility": "public",
                    "description": "hello",
                },
                headers=HEAD,
            ).status_code,
            200,
        )
        public = other.get(rid + "?visit=1").json
        self.assertFalse(public["owner"])
        self.assertEqual(public["repo"]["views"], 1)
        self.assertEqual(public["repo"]["name"], "renamed")
        self.assertEqual(other.delete(rid, headers=HEAD).status_code, 404)
        self.assertEqual(
            other.get("/api/public?q=renamed").json["repos"][0]["id"],
            rid.rsplit("/", 1)[1],
        )
        response = other.get(rid + "/download")
        self.assertEqual(response.status_code, 200)
        response.close()
        self.assertEqual(self.c.get(rid).json["repo"]["downloads"], 1)
        self.c.patch(rid, json={"visibility": "private"}, headers=HEAD)
        self.assertEqual(other.get(rid + "?version=1").status_code, 404)
        self.assertEqual(other.get("/api/public?q=renamed").json["repos"], [])

    def test_zip_import_version_restore_export(self):
        rid = self.repo()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("src/index.ts", 'export const status = "ready";')
            z.writestr("docs/guide.md", "# Guide")
        r = self.upload(
            rid, [("project.zip", archive.getvalue())], message="Add sources", base="1"
        )
        self.assertEqual(r.status_code, 201, r.json)
        r = self.upload(
            rid,
            [("index.ts", b'export const status = "updated";')],
            paths=json.dumps(["src/index.ts"]),
            base="2",
        )
        self.assertEqual(r.json["number"], 3)
        old = self.c.get(rid + "/file?path=src/index.ts&version=2").json["text"]
        self.assertIn("ready", old)
        self.assertEqual(
            self.post(rid + "/restore-version", {"number": 2, "base": 3}).json[
                "number"
            ],
            4,
        )
        self.assertEqual(self.c.get(rid + "/file?path=src/index.ts").json["text"], old)
        d = self.c.get(rid + "/download")
        self.assertEqual(d.mimetype, "application/zip")
        self.assertIn("attachment", d.headers["Content-Disposition"])
        with zipfile.ZipFile(io.BytesIO(d.data)) as z:
            self.assertEqual(z.read("src/index.ts").decode(), old)
            self.assertIn("docs/guide.md", z.namelist())
        d.close()
        self.assertEqual(len(self.c.get(rid).json["versions"]), 4)

    def test_file_management_and_stale_version(self):
        rid = self.repo()
        r = self.post(
            rid + "/files",
            {
                "operation": "rename",
                "path": "README.md",
                "target": "docs/README.md",
                "base": 1,
            },
        )
        self.assertEqual(r.json["number"], 2)
        self.assertEqual(
            self.upload(rid, [("note.txt", b"notes")], base="1").status_code, 409
        )
        self.assertEqual(
            self.post(
                rid + "/files",
                {"operation": "delete", "path": "docs/README.md", "base": 2},
            ).json["number"],
            3,
        )
        self.assertEqual(self.c.get(rid).json["files"], [])
        self.assertEqual(
            self.c.get(rid + "?version=1").json["files"][0]["path"], "README.md"
        )

    def test_atomic_validation_and_limits(self):
        rid = self.repo()
        tests = [
            ([("good.txt", b"hello"), ("blocked.exe", b"not an executable")], {}),
            ([("a.txt", b"text")], {"paths": '["/absolute.txt"]'}),
            ([("bad.zip", b"not a zip")], {}),
            ([(".env", b"KEY=example")], {}),
            (
                [("folder", b"file"), ("nested.txt", b"child")],
                {"paths": '["folder","folder/nested.txt"]'},
            ),
        ]
        for files, opts in tests:
            with self.subTest(files=files):
                self.assertEqual(self.upload(rid, files, **opts).status_code, 400)
        with patch("server.storage.MAX_FILE", 3):
            self.assertEqual(self.upload(rid, [("long.txt", b"1234")]).status_code, 413)
        self.assertEqual(len(self.c.get(rid).json["versions"]), 1)
        self.assertEqual(list((self.data / "stage").iterdir()), [])
        self.app.config["SCAN_UPLOADS"] = True
        with patch("server.storage.subprocess.run", side_effect=FileNotFoundError):
            self.assertEqual(
                self.upload(rid, [("plain.txt", b"plain")]).status_code, 503
            )
        self.assertEqual(len(self.c.get(rid).json["versions"]), 1)

    def test_code_is_only_data(self):
        rid = self.repo()
        source = b"<p>preview as text</p>"
        self.assertEqual(self.upload(rid, [("page.html", source)]).status_code, 201)
        preview = self.c.get(rid + "/file?path=page.html")
        self.assertEqual(preview.mimetype, "application/json")
        self.assertEqual(preview.json["text"], source.decode())
        attachment = self.c.get(rid + "/file?path=page.html&download=1")
        self.assertIn("attachment", attachment.headers["Content-Disposition"])
        self.assertEqual(attachment.mimetype, "application/octet-stream")
        self.assertEqual(attachment.headers["X-Content-Type-Options"], "nosniff")
        attachment.close()

    def test_trash_restore_and_reference_safe_purge(self):
        r1 = self.repo("first", "public", False)
        r2 = self.repo("second", "private", False)
        data = b"shared test file"
        sha = hashlib.sha256(data).hexdigest()
        p = self.data / "blobs" / sha[:2] / sha
        for rid in (r1, r2):
            self.upload(rid, [("shared.txt", data)])
        self.c.delete(r1, headers=HEAD)
        self.assertEqual(self.c.get(r1).status_code, 404)
        self.assertEqual(self.c.get("/api/trash").json["repos"][0]["name"], "first")
        self.assertEqual(self.post(r1 + "/restore").status_code, 200)
        self.assertEqual(
            self.c.get(r1 + "/file?path=shared.txt").json["text"], data.decode()
        )
        for rid, name in [(r1, "first"), (r2, "second")]:
            self.c.delete(rid, headers=HEAD)
            self.assertEqual(
                self.c.delete(
                    rid + "/purge", headers=HEAD, json={"confirm": "wrong"}
                ).status_code,
                400,
            )
            self.assertEqual(
                self.c.delete(
                    rid + "/purge", headers=HEAD, json={"confirm": name}
                ).status_code,
                200,
            )
            self.assertEqual(p.exists(), rid == r1)
        self.assertEqual(self.c.get("/api/trash").json["repos"], [])

    def test_csrf_cookie_and_notifications(self):
        self.assertEqual(
            self.c.post("/api/repos", json={"name": "not-saved"}).status_code, 403
        )
        self.assertEqual(
            self.c.post(
                "/api/repos",
                headers={**HEAD, "Origin": "https://unrelated.example"},
                json={"name": "not-saved"},
            ).status_code,
            403,
        )
        self.assertTrue(self.c.get_cookie("dv_session").http_only)
        self.assertEqual(self.c.get("/api/workspace").json["unread"], 1)
        self.post("/api/events/read")
        self.assertEqual(self.c.get("/api/workspace").json["unread"], 0)
        self.assertTrue(
            all(
                e["kind"] == "version"
                for e in self.c.get("/api/events?kind=version").json["events"]
            )
        )

    def test_quota_rollback_and_deduplicated_accounting(self):
        r1 = self.repo("alpha", readme=False)
        r2 = self.repo("beta", readme=False)
        before = self.c.get("/api/workspace").json["storage"]
        data = b"a unique file for both repositories"
        with patch("server.storage.QUOTA", before + len(data) - 1):
            self.assertEqual(self.upload(r1, [("file.txt", data)]).status_code, 413)
        self.assertEqual(self.c.get(r1).json["repo"]["version"], 1)
        self.assertEqual(self.c.get("/api/workspace").json["storage"], before)
        for rid in (r1, r2):
            self.assertEqual(self.upload(rid, [("file.txt", data)]).status_code, 201)
        self.assertEqual(
            self.c.get("/api/workspace").json["storage"], before + len(data)
        )
        self.c.delete(r1, headers=HEAD)
        self.c.delete(r1 + "/purge", headers=HEAD, json={"confirm": "alpha"})
        self.assertEqual(
            self.c.get("/api/workspace").json["storage"], before + len(data)
        )
        self.c.delete(r2, headers=HEAD)
        self.c.delete(r2 + "/purge", headers=HEAD, json={"confirm": "beta"})
        self.assertEqual(self.c.get("/api/workspace").json["storage"], before)

    def test_many_file_archive(self):
        rid = self.repo(readme=False)
        package = io.BytesIO()
        with zipfile.ZipFile(package, "w", zipfile.ZIP_DEFLATED) as archive:
            for i in range(1500):
                archive.writestr(f"notes/{i // 100}/note-{i}.txt", f"Note {i}")
        result = self.upload(rid, [("notebook.zip", package.getvalue())])
        self.assertEqual(result.status_code, 201, result.json)
        self.assertEqual(result.json["files"], 1500)
        details = self.c.get(rid).json
        self.assertEqual(details["repo"]["files"], len(details["files"]))
        self.assertEqual(
            details["repo"]["size"], sum(f["size"] for f in details["files"])
        )
        latest = self.c.get("/api/workspace").json["repos"][0]
        self.assertEqual(latest["files"], 1500)

    def test_account_input_errors_and_persistent_rate_limit(self):
        self.assertEqual(
            self.post(
                "/api/auth/register",
                {"name": "User", "email": "invalid", "password": "password!!"},
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post(
                "/api/auth/register",
                {"name": "User", "email": "valid@example.org", "password": "short"},
            ).status_code,
            400,
        )
        self.assertEqual(
            self.post("/api/repos", {"name": "bad path/name"}).status_code, 400
        )
        self.repo("same")
        self.assertEqual(self.post("/api/repos", {"name": "SAME"}).status_code, 409)
        self.app.testing = False
        for _ in range(12):
            self.assertEqual(
                self.post(
                    "/api/auth/login",
                    {"email": "a@example.org", "password": "incorrect"},
                ).status_code,
                401,
            )
        self.assertEqual(
            self.post(
                "/api/auth/login", {"email": "a@example.org", "password": "incorrect"}
            ).status_code,
            429,
        )

    def test_backup_restore_and_restart(self):
        self.register()
        rid = self.repo()
        self.upload(rid, [("main.py", b'print("hello")')])
        tmp = Path(self.tmp.name)
        archive = tmp / "backup.tar.gz"
        dest = tmp / "restored"
        self.assertGreater(backup(self.data, archive), 0)
        with self.assertRaises(ValueError):
            backup(self.data, archive)
        self.assertGreater(restore(archive, dest), 0)
        with self.assertRaises(ValueError):
            restore(archive, dest)
        restored = create_app({"TESTING": True, "DATA_DIR": dest}).test_client()
        restored.set_cookie("dv_session", self.c.get_cookie("dv_session").value)
        self.assertEqual(restored.get("/api/workspace").status_code, 401)
        restored.post(
            "/api/auth/login",
            headers=HEAD,
            json={"email": "dev@example.org", "password": "a long password 123"},
        )
        self.assertEqual(
            restored.get(rid + "/file?path=main.py").json["text"], 'print("hello")'
        )
        self.assertEqual(restored.get(rid).json["repo"]["version"], 2)
        self.assertEqual(gc(dest), 0)
        restarted = create_app({"TESTING": True, "DATA_DIR": self.data}).test_client()
        restarted.set_cookie("dv_session", self.c.get_cookie("dv_session").value)
        self.assertEqual(restarted.get(rid).status_code, 200)


if __name__ == "__main__":
    unittest.main()
