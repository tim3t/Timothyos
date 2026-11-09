#!/usr/bin/env python3
"""Build js/app.js from its parts in js/src/ (2.73.1).

Usage: python3 tools/build_app.py           write js/app.js
       python3 tools/build_app.py --check   exit 1 if js/app.js isn't the build of js/src

The app is still one file to the iPad: one script, one function, one shared scope, served by
GitHub Pages as it always was. Only the source is split, a part per station or concern, so each
is easier to read and change. The parts are joined in file-name order, nothing added between
them except this tool's one-line notice at the very top; 00-head.js opens the app's function and
99-foot.js closes it, so the parts in between are its body, at their usual two-space indent.

Edit js/src/, never js/app.js (the next build would undo it; tests/app_build.test.js fails
until the two match).
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "js" / "src"
OUT = ROOT / "js" / "app.js"
NOTICE = "/* BUILT FILE: made from js/src/ by tools/build_app.py. Edit the parts there, then run the build; changes made here are lost. */\n"


def build():
    parts = sorted(p for p in SRC.glob("*.js"))
    if not parts or parts[0].name != "00-head.js" or parts[-1].name != "99-foot.js":
        sys.exit("js/src/ needs 00-head.js first and 99-foot.js last")
    text = NOTICE
    for p in parts:
        t = p.read_text()
        if not t.endswith("\n"):
            sys.exit(f"{p.relative_to(ROOT)}: must end with a newline")
        text += t
    return text


def main():
    text = build()
    if "--check" in sys.argv[1:]:
        if OUT.read_text() != text:
            sys.exit("js/app.js is not the build of js/src/: edit js/src/, then run python3 tools/build_app.py")
        print("js/app.js matches js/src/")
        return
    OUT.write_text(text)
    print(f"js/app.js built from {len(sorted(SRC.glob('*.js')))} parts, {text.count(chr(10))} lines")


if __name__ == "__main__":
    main()
