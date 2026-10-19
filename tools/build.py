"""Builds dist/glass-floorplan-card.js from src/*.js (in file-name order) and checks the syntax.

Usage:  python3 tools/build.py [version]      e.g. python3 tools/build.py 0.1.0
The version defaults to the one in VERSION (or "dev"). No Node needed: the syntax check runs the bundle through
JavaScriptCore via osascript on macOS (skipped elsewhere).
"""
import pathlib, re, subprocess, sys, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "src", ROOT / "dist" / "glass-floorplan-card.js"


def build(version):
    files = sorted(SRC.glob("*.js"), key=lambda f: f.name)
    body = "\n".join(f.read_text(encoding="utf-8") for f in files)
    body = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{version}';", body, count=1)
    # keep the licence banner on top, wrap the rest so nothing leaks into the page
    banner, _, rest = body.partition("*/")
    code = f"{banner}*/\n(() => {{\n{rest.lstrip()}\n}})();\n"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(code, encoding="utf-8")
    print(f"built {OUT.relative_to(ROOT)} ({len(code) / 1024:.0f} KB) from {len(files)} files, version {version}")
    return code


def check(path):
    if not shutil.which("osascript"):
        print("syntax check skipped (no osascript)")
        return True
    js = ("ObjC.import('Foundation');"
          f"var s = $.NSString.stringWithContentsOfFileEncodingError('{path}', $.NSUTF8StringEncoding, null).js;"
          "try { new Function(s); 'ok' } catch (e) { 'SyntaxError: ' + e.message + ' line ' + e.line }")
    r = subprocess.run(["osascript", "-l", "JavaScript", "-e", js], capture_output=True, text=True)
    out = (r.stdout or r.stderr).strip()
    print("syntax:", out)
    return out == "ok"


if __name__ == "__main__":
    ver_file = ROOT / "VERSION"
    version = sys.argv[1] if len(sys.argv) > 1 else (ver_file.read_text().strip() if ver_file.exists() else "dev")
    build(version)
    sys.exit(0 if check(OUT) else 1)
