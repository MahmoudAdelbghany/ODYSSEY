#!/usr/bin/env python3
"""Check Markdown links. Local links must resolve; external links must answer.

Usage: python3 scripts/check_links.py [--external]
Scans all *.md files outside node_modules/, external/, dist/ and docs/history/.
docs/history/ is archived material; its links are reported separately and do
not fail the check.
"""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = ("node_modules", "external", "dist", ".agents", ".claude", "demo")
LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)")


def files():
    for p in ROOT.rglob("*.md"):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in SKIP:
            continue
        yield p


def main():
    external = "--external" in sys.argv
    bad, archived, urls = [], [], {}
    for f in files():
        text = f.read_text(errors="ignore")
        for target in LINK.findall(text):
            if target.startswith(("http://", "https://")):
                urls.setdefault(target, f.relative_to(ROOT))
                continue
            if target.startswith(("#", "mailto:")) or "<" in target:
                continue
            path = (f.parent / target.split("#")[0]).resolve()
            if not path.exists():
                entry = f"{f.relative_to(ROOT)} -> {target}"
                (archived if "docs/history" in str(f) else bad).append(entry)
    for e in bad:
        print("BROKEN", e)
    print(f"local: {len(bad)} broken, {len(archived)} broken in docs/history (archived)")
    if external:
        failed = 0
        for url, where in sorted(urls.items()):
            if "docs/history" in str(where):
                continue
            try:
                req = urllib.request.Request(url, method="GET", headers={"User-Agent": "odyssey-link-check/1.0"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    code = r.status
            except Exception as exc:  # noqa: BLE001
                code = getattr(exc, "code", type(exc).__name__)
            if not (isinstance(code, int) and code < 400):
                failed += 1
                print("EXTERNAL", code, url, "in", where)
        print(f"external: {len(urls)} checked, {failed} failed")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
