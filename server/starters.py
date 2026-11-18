"""Actual, editable starter projects; not fabricated dashboard metrics."""

STARTERS = [
    (
        "orbit-ui",
        "A minimal, token-driven component library.",
        "public",
        "violet",
        {
            "README.md": '# Orbit UI\n\nA minimal framework-free TypeScript component library. Import the button factory and include `styles/tokens.css` in your project.\n\n```ts\nimport { button } from "./src/button";\ndocument.body.append(button("Get started", () => console.log("Ready")));\n```\n',
            "src/button.ts": 'export function button(label: string, onClick: () => void): HTMLButtonElement {\n  const element = document.createElement("button");\n  element.type = "button";\n  element.className = "orbit-button";\n  element.textContent = label;\n  element.addEventListener("click", onClick);\n  return element;\n}\n',
            "src/index.ts": 'export { button } from "./button";\nexport { surface } from "./surface";\n',
            "src/surface.ts": 'export function surface(content: Node): HTMLElement {\n  const section = document.createElement("section");\n  section.className = "orbit-surface";\n  section.append(content);\n  return section;\n}\n',
            "styles/tokens.css": ":root {\n  --orbit-accent: #b0f581;\n  --orbit-surface: #191c1b;\n  --orbit-radius: 8px;\n}\n.orbit-button { background: var(--orbit-accent); border: 0; border-radius: var(--orbit-radius); padding: 8px 16px; }\n.orbit-surface { background: var(--orbit-surface); color: white; padding: 16px; }\n",
        },
    ),
    (
        "vault-cli",
        "Command-line tools for everyday workflows.",
        "public",
        "lime",
        {
            "README.md": "# Vault CLI\n\nA dependency-free file inventory utility. Run `python cli.py ./project` locally to print a sorted list of its files and sizes. Use `--json` for machine-readable output.\n",
            "cli.py": '"""Print a directory inventory. Nothing is written to disk."""\nimport argparse\nimport json\nfrom pathlib import Path\n\n\ndef inventory(root):\n    return [{"path": str(f.relative_to(root)), "bytes": f.stat().st_size}\n            for f in sorted(root.rglob("*")) if f.is_file() and not f.is_symlink()]\n\n\nif __name__ == "__main__":\n    parser = argparse.ArgumentParser(description=__doc__)\n    parser.add_argument("directory", type=Path)\n    parser.add_argument("--json", action="store_true")\n    args = parser.parse_args()\n    if not args.directory.is_dir():\n        parser.error("Choose an existing directory.")\n    rows = inventory(args.directory)\n    print(json.dumps(rows, indent=2) if args.json else "\\n".join(r["path"] for r in rows))\n',
            "tests/test_cli.py": "import tempfile\nimport unittest\nfrom pathlib import Path\nfrom cli import inventory\n\nclass InventoryTest(unittest.TestCase):\n    def test_empty(self):\n        with tempfile.TemporaryDirectory() as d:\n            self.assertEqual(inventory(Path(d)), [])\n",
        },
    ),
    (
        "signal-api",
        "A lightweight service for application signals.",
        "private",
        "blue",
        {
            "README.md": "# Signal API\n\nRun `node src/server.mjs` locally, then visit `/health` for the status or `/signal` for a timestamped sample. Requires Node 18 or later.\n",
            "src/server.mjs": 'import { createServer } from "node:http";\nimport { signal } from "./signal.mjs";\n\ncreateServer((req, res) => {\n  const path = new URL(req.url, "http://localhost").pathname;\n  const body = path === "/health" ? { status: "ok" } : path === "/signal" ? signal() : null;\n  res.writeHead(body ? 200 : 404, { "Content-Type": "application/json" });\n  res.end(JSON.stringify(body ?? { error: "Not found" }));\n}).listen(3000, "127.0.0.1");\n',
            "src/signal.mjs": 'export const signal = () => ({ name: "heartbeat", timestamp: new Date().toISOString() });\n',
            "package.json": '{\n  "name": "signal-api",\n  "version": "1.0.0",\n  "private": true,\n  "type": "module",\n  "scripts": { "start": "node src/server.mjs" }\n}\n',
        },
    ),
    (
        "dotfiles",
        "A versioned home for shell and editor configs.",
        "private",
        "amber",
        {
            "README.md": "# Dotfiles\n\nReview each file before copying it into your own configuration. `shell/aliases.sh` contains read-only listing shortcuts.\n",
            "shell/aliases.sh": '# List all entries, one per line.\nalias la="ls -A1"\n# Human-readable listing.\nalias ll="ls -lh"\n',
            ".editorconfig": "root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\n",
        },
    ),
    (
        "fieldnotes",
        "Technical notes, guides, and useful patterns.",
        "public",
        "rose",
        {
            "README.md": "# Fieldnotes\n\nA small, portable developer notebook.\n\n- [Project checklist](notes/checklist.md)\n- [Decision record](templates/decision.md)\n",
            "notes/checklist.md": "# Project checklist\n\n- Write down the problem and the intended audience.\n- Choose a license.\n- Add setup instructions.\n- Test the simplest end-to-end flow.\n- Make a backup and verify a restore.\n",
            "templates/decision.md": "# Decision record\n\n## Context\nWhat problem are we solving?\n\n## Decision\nWhich approach did we choose?\n\n## Consequences\nWhat gets easier? What gets harder?\n",
        },
    ),
]
