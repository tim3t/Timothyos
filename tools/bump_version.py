#!/usr/bin/env python3
"""Set the TimothyOS app version everywhere it appears.

Usage: python3 tools/bump_version.py 1.2.0

Updates js/app.js, sw.js, index.html (cache-busting ?v= and the top bar
label) and version.json, which the installed app checks to offer
"UPDATE READY". Run it for every release, or iPads keep the old files.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def sub(path, pattern, repl, count=0):
    p = ROOT / path
    text = p.read_text()
    new, n = re.subn(pattern, repl, text, count=count)
    if n == 0:
        sys.exit(f"{path}: pattern not found: {pattern}")
    p.write_text(new)


def main():
    if len(sys.argv) != 2 or not re.fullmatch(r"\d+\.\d+\.\d+", sys.argv[1]):
        sys.exit(__doc__)
    v = sys.argv[1]
    major_minor = ".".join(v.split(".")[:2])
    sub("js/app.js", r'var VERSION = "[\d.]+";', f'var VERSION = "{v}";', 1)
    sub("sw.js", r'var VERSION = "[\d.]+";', f'var VERSION = "{v}";', 1)
    sub("sw.js", r"\?v=[\d.]+", f"?v={v}")
    sub("index.html", r"\?v=[\d.]+", f"?v={v}")
    sub("index.html", r"<span>TIMOTHYOS [\d.]+</span>", f"<span>TIMOTHYOS {major_minor}</span>", 1)
    (ROOT / "version.json").write_text(json.dumps({"version": v}) + "\n")
    print(f"TimothyOS version set to {v}")


if __name__ == "__main__":
    main()
