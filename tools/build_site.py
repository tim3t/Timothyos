#!/usr/bin/env python3
"""Puts together what GitHub Pages serves: the app's own files and nothing else.

    python3 tools/build_site.py OUT_DIR     write the site into OUT_DIR (emptied first)
    python3 tools/build_site.py --check     build into a scratch folder and only check it

The CI workflow (.github/workflows/ci.yml) publishes this folder once the tests have passed. Notes, tests, tools,
the bridge's code and the split sources stay in the repository and are not published: the bridge is copied from
raw.githubusercontent.com (README: Updating the Google bridge), never from the site.

The check: every file the service worker keeps for offline use (sw.js SHELL_FILES), and every file index.html and
the manifest point at, is in the folder. A new top-level folder the app needs fails here until it is added to PARTS.
"""
import json, os, re, shutil, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# What the app is made of. Folders are copied whole; js is listed by hand so js/src (the split sources) stays out.
PARTS = ["index.html", "sw.js", "manifest.webmanifest", "version.json", ".nojekyll", "css", "fonts", "icons", "js/app.js", "js/vendor"]


def build(out):
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    for part in PARTS:
        src, dst = os.path.join(ROOT, part), os.path.join(out, part)
        if not os.path.exists(src):
            raise SystemExit("build_site: %s is missing from the repository" % part)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".DS_Store"))
        else:
            shutil.copy2(src, dst)


def needed():
    """Paths the app asks its own site for."""
    read = lambda p: open(os.path.join(ROOT, p), encoding="utf-8").read()
    sw = re.search(r"SHELL_FILES\s*=\s*\[(.*?)\]", read("sw.js"), re.S)
    if not sw:
        raise SystemExit("build_site: SHELL_FILES not found in sw.js")
    want = set(re.findall(r'"([^"]+)"', sw.group(1)))
    want |= set(re.findall(r'(?:src|href)="([^"#:]+)"', read("index.html")))
    want |= {i["src"] for i in json.loads(read("manifest.webmanifest")).get("icons", [])}
    want |= {"version.json", "js/app.js", "css/app.css"}
    return sorted(p.split("?")[0] for p in want if p not in ("./", "") and not p.startswith(("http", "//")))


def check(out):
    missing = [p for p in needed() if not os.path.isfile(os.path.join(out, p))]
    if missing:
        raise SystemExit("build_site: the app needs these and the site does not have them: " + ", ".join(missing))
    leaked = [p for p in ("CLAUDE.md", "README.md", "tests", "tools", "apps-script", "docs", "js/src") if os.path.exists(os.path.join(out, p))]
    if leaked:
        raise SystemExit("build_site: not meant to be published: " + ", ".join(leaked))
    n = sum(len(f) for _, _, f in os.walk(out))
    print("site: %d files, everything the app asks for is there" % n)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    if sys.argv[1] == "--check":
        with tempfile.TemporaryDirectory() as tmp:
            out = os.path.join(tmp, "site")
            build(out)
            check(out)
    else:
        build(sys.argv[1])
        check(sys.argv[1])
