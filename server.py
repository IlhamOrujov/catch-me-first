#!/usr/bin/env python3
"""
Catch Me First — no-cache, multi-threaded dev server + VRoid bridge.
Run:  python3 server.py            (defaults to port 8123)
      python3 server.py 8080       (custom port)

Serves this folder with no-cache headers (so edits always show up) and handles
requests concurrently (so big model files + all the JS modules load in parallel
instead of queuing — a single-threaded server chokes on the VRMs).

VRoid bridge
------------
Drop a .vrm exported from VRoid Studio into ./vroid-drop/ and the game's
Character Studio auto-detects it (poll GET /vroid/list) and can hot-load it —
edit in VRoid, export, and she updates on the site with no refresh.

Optionally point it straight at VRoid Studio's export folder so you don't even
copy files:
      VROID_WATCH="/Users/you/VRoidStudio/exports" python3 server.py
Any .vrm in that folder is mirrored into ./vroid-drop/ automatically.
"""
import sys, os, json, shutil, glob, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

VROID_DIR = os.path.join(HERE, "vroid-drop")
VROID_WATCH = os.environ.get("VROID_WATCH")          # optional external export folder
os.makedirs(VROID_DIR, exist_ok=True)

CODE_EXT = (".js", ".mjs", ".html", ".htm", ".css", ".json")


def _sync_watch():
    """Mirror new/updated .vrm files from VROID_WATCH into ./vroid-drop/."""
    if not VROID_WATCH or not os.path.isdir(VROID_WATCH):
        return
    for src in glob.glob(os.path.join(VROID_WATCH, "*.vrm")):
        dst = os.path.join(VROID_DIR, os.path.basename(src))
        try:
            if not os.path.exists(dst) or os.path.getmtime(src) > os.path.getmtime(dst):
                shutil.copy2(src, dst)
        except OSError:
            pass


def _vroid_list():
    _sync_watch()
    items = []
    for p in glob.glob(os.path.join(VROID_DIR, "*.vrm")):
        try:
            st = os.stat(p)
            items.append({
                "name": os.path.basename(p),
                "url": "/vroid-drop/" + os.path.basename(p),
                "mtime": int(st.st_mtime * 1000),
                "size": st.st_size,
            })
        except OSError:
            pass
    items.sort(key=lambda x: x["mtime"], reverse=True)   # newest first
    return {"models": items, "watch": bool(VROID_WATCH), "ts": int(time.time() * 1000)}


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # code = never cache (edits show instantly); big assets (models/textures) =
        # cache a day so reloads don't re-download the whole apartment every time.
        # vroid-drop = never cache (so a freshly-exported model always loads fresh).
        path = self.path.split("?")[0].lower()
        if path.endswith(CODE_EXT) or path.endswith("/") or path.startswith("/vroid"):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        # allow the deployed site / other tools to poll the bridge
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/vroid/list":
            try:
                payload = json.dumps(_vroid_list()).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True
            except Exception as e:
                self.send_error(500, f"vroid bridge error: {e}")
            return
        return super().do_GET()

    def do_POST(self):
        # Developer Mode "notes for Claude" → append to DEV-NOTES.md in the repo,
        # so notes the user leaves in-game are waiting here for the next session.
        route = self.path.split("?")[0]
        if route in ("/dev/note", "/dev/save"):
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length) or b"{}")
                if route == "/dev/note":
                    text = str(data.get("text", "")).strip()
                    if text:
                        stamp = time.strftime("%Y-%m-%d %H:%M")
                        with open(os.path.join(HERE, "DEV-NOTES.md"), "a", encoding="utf-8") as f:
                            f.write(f"\n### {stamp}\n{text}\n")
                else:  # /dev/save — arbitrary named file under dev-exports/
                    name = os.path.basename(str(data.get("name", "scene.json")))
                    os.makedirs(os.path.join(HERE, "dev-exports"), exist_ok=True)
                    with open(os.path.join(HERE, "dev-exports", name), "w", encoding="utf-8") as f:
                        f.write(str(data.get("body", "")))
                payload = json.dumps({"ok": True}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except (BrokenPipeError, ConnectionResetError):
                self.close_connection = True
            except Exception as e:
                self.send_error(500, f"dev endpoint error: {e}")
            return
        self.send_error(404)

    def log_message(self, *args):
        pass  # quiet

    def handle_one_request(self):
        # a browser that cancels a request (common for big files) closes the socket;
        # swallow the resulting broken-pipe noise instead of crashing the handler
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True


ThreadingHTTPServer.allow_reuse_address = True
ThreadingHTTPServer.daemon_threads = True
httpd = ThreadingHTTPServer(("", PORT), Handler)
print(f"\n  Catch Me First ♡  →  http://localhost:{PORT}")
print(f"  (no-cache, multi-threaded dev server)")
print(f"  VRoid bridge: drop .vrm into {VROID_DIR}" + (f"\n  watching: {VROID_WATCH}" if VROID_WATCH else "") + "\n")
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\n  bye ♡")
