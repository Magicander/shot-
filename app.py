"""
app.py - kadr* quiz filmowy: gra dla znajomych + panel /admin (tylko biblioteka standardowa).

    pip install -U "yt-dlp[default]" opencv-python    # potrzebne tylko do pobierania kadrów
    python app.py                    # http://127.0.0.1:8000 (otwiera przeglądarkę)
    python app.py --lan              # nasłuch na 0.0.0.0 - znajomi w tej samej sieci
    python app.py --port 9000 --no-browser
    python app.py --export quiz.sql  # zrzut bazy do pliku .sql

Hasło admina: zmienna środowiskowa QUIZ_ADMIN_PASSWORD (domyślnie jak ustalone).
"""
import argparse
import hmac
import json
import os
import random
import re
import secrets
import socket
import string
import threading
import time
import unicodedata
import webbrowser
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import db

STATIC = db.BASE / "static"
ADMIN_PASSWORD = os.environ.get("QUIZ_ADMIN_PASSWORD", "SK45jh@WP")
SESSION_TTL = 12 * 3600
MAX_PLAYERS = 16
tmdb_thread = None

sessions = {}               # token -> expiry
sessions_lock = threading.Lock()
rooms = {}
rooms_lock = threading.Lock()
scrape_progress = None      # scraper.Progress, tworzony leniwie (import cv2 tylko gdy trzeba)
scrape_thread = None


# --------------------------------------------------------------------- pokoje gry
from rooms import Room, norm_title, is_match, load_pack, availability, MODES  # noqa: E402,F401


def new_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(random.choice(alphabet) for _ in range(4))
        if c not in rooms:
            return c


def pack_avail(con, pack):
    movies = load_pack(con, pack["id"])
    return movies, availability(dict(pack), movies, bool(db.tmdb_key()))


def cleanup_rooms():
    while True:
        time.sleep(300)
        with rooms_lock:
            for c in [c for c, r in rooms.items() if time.time() - r.touched > 4 * 3600]:
                del rooms[c]


# ---------------------------------------------------------------------- HTTP
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
        ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon"}


EN_ERRORS = {
    "Za duże żądanie": "Request too large",
    "Zły format danych": "Bad data format",
    "Nie ma takiej strony": "Page not found",
    "Brak kadru": "Frame not found",
    "Nie ma takiego pakietu": "No such pack",
    "Ten pakiet nie ma jeszcze gotowych filmów": "This pack has no ready movies yet",
    "Nie ma takiego adresu": "No such address",
    "Nie ma pokoju o tym kodzie": "No room with this code",
    "Pokój jest pełny": "The room is full",
    "Nie jesteś w tym pokoju": "You are not in this room",
    "Tylko gospodarz może to zrobić": "Only the host can do that",
    "Złe hasło": "Wrong password",
    "Zaloguj się": "Please log in",
    "Podaj nazwę pakietu": "Enter a pack name",
    "Nie ma pakietu": "No such pack",
    "Nie ma filmu": "No such movie",
    "Ten sam kadr nie może mieć dwóch ról": "The same frame cannot have two roles",
    "Kadr nie należy do tego filmu": "This frame does not belong to this movie",
    "Scraper już działa": "The scraper is already running",
    "Podaj tytuł": "Enter a title",
    "Brak plakatu": "Poster not found",
    "Najpierw wpisz klucz TMDB w ustawieniach": "Enter a TMDB key in the settings first",
    "Klucz TMDB nie działa": "This TMDB key does not work",
}


def detect_lang(headers):
    c = SimpleCookie(headers.get("Cookie") or "")
    if "kadr_lang" in c and c["kadr_lang"].value in ("pl", "en"):
        return c["kadr_lang"].value
    al = (headers.get("Accept-Language") or "").strip().lower()
    return "pl" if al.startswith("pl") else "en"


PAGE_META = {
    "pl": {"BRAND": "kadr", "LANG": "pl", "TITLE": "kadr* - zgadnij film po kadrze",
           "DESC": "Quiz filmowy dla znajomych. Zgadnijcie film po jednym kadrze z trailera.",
           "ADMIN_TITLE": "kadr* panel"},
    "en": {"BRAND": "shot", "LANG": "en", "TITLE": "shot* - guess the movie from one frame",
           "DESC": "A movie quiz for friends. Guess the film from a single frame of its trailer.",
           "ADMIN_TITLE": "shot* admin"},
}


class ApiError(Exception):
    def __init__(self, code, msg):
        super().__init__(msg)
        self.code, self.msg = code, msg


class Handler(BaseHTTPRequestHandler):
    server_version = "kadr"

    def log_message(self, *args):
        pass

    # --- pomocnicze
    def send(self, code, body: bytes, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def json(self, obj, code=200, extra=None):
        self.send(code, json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8",
                  {"Cache-Control": "no-store", **(extra or {})})

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ApiError(413, "Za duże żądanie")
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except json.JSONDecodeError:
            raise ApiError(400, "Zły format danych")

    def is_admin(self):
        c = SimpleCookie(self.headers.get("Cookie") or "")
        tok = c["kadr_admin"].value if "kadr_admin" in c else ""
        with sessions_lock:
            exp = sessions.get(tok)
            if exp and exp > time.time():
                return True
            sessions.pop(tok, None)
        return False

    def static(self, name):
        p = (STATIC / name).resolve()
        if not str(p).startswith(str(STATIC.resolve())) or not p.is_file():
            raise ApiError(404, "Nie ma takiej strony")
        data = p.read_bytes()
        if p.suffix == ".html":
            txt = data.decode("utf-8")
            for k, v in PAGE_META[self.lang].items():
                txt = txt.replace("{{%s}}" % k, v)
            data = txt.encode("utf-8")
        self.send(200, data, MIME.get(p.suffix, "application/octet-stream"),
                  {"Cache-Control": "no-cache", "Vary": "Accept-Language, Cookie"})

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        u = urlparse(self.path)
        path, q = u.path.rstrip("/") or "/", {k: v[0] for k, v in parse_qs(u.query).items()}
        con = None
        self.lang = detect_lang(self.headers)
        if self.headers.get("X-Lang") in ("pl", "en"):
            self.lang = self.headers.get("X-Lang")
        try:
            if method == "GET" and (path == "/" or re.fullmatch(r"/r/[A-Za-z0-9]{4}", path)):
                return self.static("index.html")
            if method == "GET" and path == "/admin":
                return self.static("admin.html")
            if method == "GET" and path.startswith("/static/"):
                return self.static(path[len("/static/"):])
            con = db.connect()
            m = re.fullmatch(r"/frame/(\d+)\.jpg", path)
            if m and method == "GET":
                row = con.execute("SELECT image FROM frames WHERE id=?", (int(m[1]),)).fetchone()
                if not row:
                    raise ApiError(404, "Brak kadru")
                return self.send(200, bytes(row["image"]), "image/jpeg", {"Cache-Control": "max-age=86400"})
            m = re.fullmatch(r"/poster/(\d+)\.jpg", path)
            if m and method == "GET":
                row = con.execute("SELECT image FROM posters WHERE movie_id=?", (int(m[1]),)).fetchone()
                if not row:
                    raise ApiError(404, "Brak plakatu")
                return self.send(200, bytes(row["image"]), "image/jpeg", {"Cache-Control": "max-age=86400"})
            if path.startswith("/api/admin"):
                return self.admin_api(method, path, q, con)
            if path.startswith("/api/"):
                return self.game_api(method, path, q, con)
            raise ApiError(404, "Nie ma takiej strony")
        except ApiError as e:
            self.json({"error": EN_ERRORS.get(e.msg, e.msg) if self.lang == "en" else e.msg, "key": e.msg}, e.code)
        except (ValueError, KeyError, TypeError) as e:
            self.json({"error": ("Bad data: " if self.lang == "en" else "Złe dane: ") + str(e)}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            if con:
                con.close()

    # --- gra
    def game_api(self, method, path, q, con):
        if method == "GET" and path == "/api/packs":
            out = []
            for p in con.execute("SELECT * FROM packs ORDER BY sort, id"):
                allm, avail = pack_avail(con, p)
                movies = [mv for mv in allm if mv["frames"]]
                total = len(allm)
                thumbs = ([p["cover_frame_id"]] if p["cover_frame_id"] else []) + \
                         [mv["frames"][2] for mv in movies]
                out.append({"id": p["id"], "slug": p["slug"], "name": p["name"],
                            "description": p["description"], "color": p["color"],
                            "name_en": p["name_en"] or p["name"], "description_en": p["description_en"] or p["description"],
                            "playable": len(movies), "total": total, "thumbs": list(dict.fromkeys(thumbs))[:3],
                            "modes": [k for k in MODES if avail[k]["ok"]]})
            return self.json(out)
        m = re.fullmatch(r"/api/packs/(\d+)/titles", path)
        if m:
            rows = con.execute("SELECT title, pl_title FROM movies WHERE pack_id=?", (int(m[1]),)).fetchall()
            out = {r["title"] for r in rows}
            if self.lang == "pl":
                out |= {r["pl_title"] for r in rows if r["pl_title"]}
            return self.json(sorted(out, key=str.lower))
        if method == "POST" and path == "/api/rooms":
            d = self.body()
            pack = con.execute("SELECT * FROM packs WHERE id=?", (int(d["pack_id"]),)).fetchone()
            if not pack:
                raise ApiError(404, "Nie ma takiego pakietu")
            movies, avail = pack_avail(con, pack)
            if not any(v["ok"] for v in avail.values()):
                raise ApiError(400, "Ten pakiet nie ma jeszcze gotowych filmów")
            with rooms_lock:
                code = new_code()
                r = rooms[code] = Room(code, dict(pack), movies, int(d.get("rounds") or 10), avail)
                if d.get("modes"):
                    r.configure(modes=d["modes"])
                p = r.add_player(d.get("name"))
            return self.json({"code": code, "pid": p["id"], "token": p["token"]})
        m = re.fullmatch(r"/api/rooms/([A-Za-z0-9]{4})(?:/(\w+))?", path)
        if not m:
            raise ApiError(404, "Nie ma takiego adresu")
        code, action = m[1].upper(), m[2]
        with rooms_lock:
            r = rooms.get(code)
            if not r:
                raise ApiError(404, "Nie ma pokoju o tym kodzie")
            r.touched = time.time()
            if method == "GET" and action == "peek":
                return self.json({"code": code, "pack": r.pack["name"], "phase": r.phase,
                                  "players": len(r.players)})
            if method == "POST" and action == "join":
                d = self.body()
                if len(r.players) >= MAX_PLAYERS:
                    raise ApiError(400, "Pokój jest pełny")
                p = r.add_player(d.get("name"))
                return self.json({"code": code, "pid": p["id"], "token": p["token"]})
            d = q if method == "GET" else self.body()
            p = r.players.get(d.get("pid") or "")
            if not p or not hmac.compare_digest(p["token"], str(d.get("token") or "")):
                raise ApiError(403, "Nie jesteś w tym pokoju")
            p["seen"] = time.time()
            is_host = p["id"] == r.host
            if method == "GET" and action is None:
                return self.json(r.state(p, self.lang))
            if method == "POST" and action == "guess":
                return self.json(r.answer(p, d, self.lang))
            if method == "POST" and action in ("start", "next", "again", "kick", "setup"):
                if not is_host:
                    raise ApiError(403, "Tylko gospodarz może to zrobić")
                if action == "setup":
                    r.configure(d.get("modes"), d.get("rounds"))
                elif action == "start" and r.phase in ("lobby", "final"):
                    r.start()
                elif action == "next" and r.phase in ("round", "reveal"):
                    r.next()
                elif action == "again":
                    r.phase = "lobby"
                    for pl in r.players.values():
                        pl.update(score=0, history=[], got=None)
                    r.version += 1
                elif action == "kick":
                    victim = d.get("victim")
                    if victim in r.players and victim != r.host:
                        r.event("leave", r.players.pop(victim)["name"])
                return self.json(r.state(p, self.lang))
            if method == "POST" and action == "leave":
                r.players.pop(p["id"], None)
                r.event("leave", p["name"])
                if r.host == p["id"]:
                    r.host = next(iter(r.players), None)
                return self.json({"ok": True})
        raise ApiError(404, "Nie ma takiego adresu")

    # --- admin
    def admin_api(self, method, path, q, con):
        global scrape_progress, scrape_thread, tmdb_thread
        if path == "/api/admin/login" and method == "POST":
            d = self.body()
            time.sleep(0.4)                   # spowalnia zgadywanie hasła
            if not hmac.compare_digest(str(d.get("password") or "").encode(), ADMIN_PASSWORD.encode()):
                raise ApiError(401, "Złe hasło")
            tok = secrets.token_urlsafe(32)
            with sessions_lock:
                sessions[tok] = time.time() + SESSION_TTL
            return self.json({"ok": True}, extra={"Set-Cookie":
                             f"kadr_admin={tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_TTL}"})
        if path == "/api/admin/logout" and method == "POST":
            c = SimpleCookie(self.headers.get("Cookie") or "")
            if "kadr_admin" in c:
                with sessions_lock:
                    sessions.pop(c["kadr_admin"].value, None)
            return self.json({"ok": True}, extra={"Set-Cookie": "kadr_admin=; HttpOnly; Path=/; Max-Age=0"})
        if path == "/api/admin/me":
            return self.json({"admin": self.is_admin()})
        if not self.is_admin():
            raise ApiError(401, "Zaloguj się")

        if path == "/api/admin/stats":
            s = {r["status"]: r["n"] for r in con.execute("SELECT status, COUNT(*) n FROM movies GROUP BY status")}
            picked = con.execute("SELECT COUNT(*) FROM picks WHERE easy_frame_id AND medium_frame_id "
                                 "AND hard_frame_id").fetchone()[0]
            with rooms_lock:
                live = sum(1 for r in rooms.values() if time.time() - r.touched < 600)
                players = sum(len(r.players) for r in rooms.values() if time.time() - r.touched < 600)
            return self.json({"packs": con.execute("SELECT COUNT(*) FROM packs").fetchone()[0],
                              "movies": sum(s.values()), "ok": s.get("ok", 0), "pending": s.get("pending", 0),
                              "error": s.get("error", 0), "picked": picked,
                              "frames": con.execute("SELECT COUNT(*) FROM frames").fetchone()[0],
                              "db_mb": round(os.path.getsize(db.DB_PATH) / 1e6, 1),
                              "rooms": live, "players": players})
        if path == "/api/admin/packs":
            if method == "GET":
                rows = con.execute("""SELECT p.*, COUNT(m.id) total,
                    SUM(m.status='ok') ok, SUM(m.status='error') err, SUM(m.status='pending') pending,
                    SUM(pk.easy_frame_id IS NOT NULL AND pk.medium_frame_id IS NOT NULL AND pk.hard_frame_id IS NOT NULL) picked
                    FROM packs p LEFT JOIN movies m ON m.pack_id=p.id LEFT JOIN picks pk ON pk.movie_id=m.id
                    GROUP BY p.id ORDER BY p.sort, p.id""").fetchall()
                return self.json([dict(r) for r in rows])
            if method == "POST":
                d = self.body()
                name = str(d.get("name") or "").strip()[:40]
                if not name:
                    raise ApiError(400, "Podaj nazwę pakietu")
                slug = db.slugify(d.get("slug") or name)
                while con.execute("SELECT 1 FROM packs WHERE slug=?", (slug,)).fetchone():
                    slug += "-2"
                with con:
                    pid = con.execute("INSERT INTO packs (slug,name,description,color,name_en,description_en,sort) "
                                      "VALUES (?,?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM packs))",
                                      (slug, name, str(d.get("description") or "")[:300],
                                       valid_color(d.get("color")), str(d.get("name_en") or "").strip()[:40],
                                       str(d.get("description_en") or "")[:300])).lastrowid
                return self.json({"id": pid, "slug": slug})
        m = re.fullmatch(r"/api/admin/packs/(\d+)(?:/(\w+))?", path)
        if m:
            pid, sub = int(m[1]), m[2]
            if not con.execute("SELECT 1 FROM packs WHERE id=?", (pid,)).fetchone():
                raise ApiError(404, "Nie ma pakietu")
            if sub is None and method == "PUT":
                d = self.body()
                if "modes_off" in d:
                    off = ",".join(k for k in MODES if k in (d.get("modes_off") or []))
                    with con:
                        con.execute("UPDATE packs SET modes_off=? WHERE id=?", (off, pid))
                    if "name" not in d:
                        return self.json({"ok": True})
                with con:
                    con.execute("UPDATE packs SET name=?, description=?, color=?, cover_frame_id=?, name_en=?, "
                                "description_en=? WHERE id=?",
                                (str(d["name"]).strip()[:40] or "Pakiet", str(d.get("description") or "")[:300],
                                 valid_color(d.get("color")), d.get("cover_frame_id") or None,
                                 str(d.get("name_en") or "").strip()[:40], str(d.get("description_en") or "")[:300],
                                 pid))
                return self.json({"ok": True})
            if sub is None and method == "DELETE":
                with con:
                    con.execute("DELETE FROM packs WHERE id=?", (pid,))
                return self.json({"ok": True})
            if sub == "modes" and method == "GET":
                pack = con.execute("SELECT * FROM packs WHERE id=?", (pid,)).fetchone()
                _, avail = pack_avail(con, pack)
                return self.json({"avail": avail, "modes": MODES, "tmdb_key": bool(db.tmdb_key()),
                                  "modes_off": [k for k in (pack["modes_off"] or "").split(",") if k]})
            if sub == "pl_titles" and method == "POST":
                d = self.body()
                rows = parse_pl_titles(con, pid, str(d.get("text") or ""))
                saved = 0
                if d.get("apply"):
                    with con:
                        for r in rows:
                            if r["status"] == "matched":
                                con.execute("UPDATE movies SET pl_title=? WHERE id=?", (r["pl_title"], r["movie_id"]))
                                saved += 1
                return self.json({"rows": rows, "saved": saved,
                                  "matched": sum(r["status"] == "matched" for r in rows),
                                  "unmatched": sum(r["status"] != "matched" for r in rows)})
            if sub == "tmdb" and method == "POST":
                key = db.tmdb_key()
                if not key:
                    raise ApiError(400, "Najpierw wpisz klucz TMDB w ustawieniach")
                if (scrape_thread and scrape_thread.is_alive()) or (tmdb_thread and tmdb_thread.is_alive()):
                    raise ApiError(409, "Scraper już działa")
                import scraper
                import tmdb
                d = self.body()
                rows = [dict(r) for r in con.execute("SELECT id, title, year, tmdb_id FROM movies WHERE pack_id=? "
                                                     "ORDER BY id", (pid,))]
                if not d.get("redo"):
                    have = {r[0] for r in con.execute("SELECT movie_id FROM posters")}
                    rows = [r for r in rows if not (r["id"] in have and r["tmdb_id"])]
                scrape_progress = scraper.Progress(self.lang)
                tmdb_thread = threading.Thread(target=tmdb.run, args=(rows, scrape_progress, key,
                                                                      bool(d.get("fill_pl")), bool(d.get("redo"))),
                                               daemon=True)
                tmdb_thread.start()
                return self.json({"ok": True, "count": len(rows)})
            if sub == "movies" and method == "GET":
                rows = con.execute("""SELECT m.id, m.title, m.year, m.query, m.yt_url, m.status, m.error,
                    m.pl_title, m.aliases, m.quotes, m.tmdb_id, m.cast_json,
                    EXISTS(SELECT 1 FROM posters po WHERE po.movie_id=m.id) poster,
                    m.video_url, m.video_title, (SELECT COUNT(*) FROM frames f WHERE f.movie_id=m.id) nframes,
                    p.easy_frame_id easy, p.medium_frame_id medium, p.hard_frame_id hard
                    FROM movies m LEFT JOIN picks p ON p.movie_id=m.id WHERE m.pack_id=? ORDER BY m.id""",
                                   (pid,)).fetchall()
                return self.json([dict(r) for r in rows])
            if sub == "movies" and method == "POST":
                d = self.body()
                if "text" in d:
                    items = parse_bulk(d["text"])
                else:
                    if not str(d.get("title") or "").strip():
                        raise ApiError(400, "Podaj tytuł")
                    items = [db.split_title_year(d["title"], d.get("year"))]
                added, skipped = [], []
                with con:
                    for t, y in items:
                        t = t.strip()[:120]
                        if not t or not db.norm_title(t):
                            continue
                        dup = db.find_duplicate(con, pid, t, y)
                        if dup:
                            skipped.append({"title": t, "year": y, "existing": f"{dup['title']}" +
                                            (f" ({dup['year']})" if dup["year"] else "")})
                            continue
                        con.execute("INSERT INTO movies (pack_id,title,year,query,yt_url,norm_title) "
                                    "VALUES (?,?,?,?,?,?)", (pid, t, y, d.get("query") or None,
                                                             d.get("yt_url") or None, db.norm_title(t)))
                        added.append({"title": t, "year": y})
                return self.json({"added": len(added), "skipped": len(skipped), "parsed": len(items),
                                  "added_items": added, "skipped_items": skipped},
                                 409 if items and not added and skipped and "text" not in d else 200)
        m = re.fullmatch(r"/api/admin/movies/(\d+)", path)
        if m:
            mid = int(m[1])
            mv = con.execute("SELECT * FROM movies WHERE id=?", (mid,)).fetchone()
            if not mv:
                raise ApiError(404, "Nie ma filmu")
            if method == "GET":
                frames = con.execute("SELECT id, position, ts_seconds ts FROM frames WHERE movie_id=? "
                                     "ORDER BY position", (mid,)).fetchall()
                p = con.execute("SELECT * FROM picks WHERE movie_id=?", (mid,)).fetchone()
                pick = {"easy": p["easy_frame_id"], "medium": p["medium_frame_id"], "hard": p["hard_frame_id"]} \
                    if p else {"easy": None, "medium": None, "hard": None}
                mvd = {k: mv[k] for k in mv.keys()}
                return self.json({"movie": mvd, "frames": [dict(f) for f in frames], "pick": pick})
            if method == "PUT":
                d = self.body()
                title = str(d.get("title") or mv["title"]).strip()[:120]
                year = (int(d["year"]) if d.get("year") else None) if "year" in d else mv["year"]
                extra = {k: "\n".join(db.split_list(d[k]))[:4000] if k != "pl_title" else str(d[k]).strip()[:160]
                         for k in ("pl_title", "aliases", "quotes") if k in d}
                if extra:
                    with con:
                        for k, v in extra.items():
                            con.execute(f"UPDATE movies SET {k}=? WHERE id=?", (v, mid))
                    if "title" not in d:
                        return self.json({"ok": True})
                dup = db.find_duplicate(con, mv["pack_id"], title, year, exclude_id=mid)
                if dup:
                    ex = dup["title"] + (f" ({dup['year']})" if dup["year"] else "")
                    return self.json({"error": (f"This movie is already in the pack: {ex}" if self.lang == "en"
                                                else f"Ten film już jest w pakiecie: {ex}"),
                                      "key": "duplicate", "existing": ex}, 409)
                with con:
                    con.execute("UPDATE movies SET title=?, year=?, query=?, yt_url=?, norm_title=? WHERE id=?",
                                (title, year,
                                 (d.get("query") or "").strip() or None if "query" in d else mv["query"],
                                 (d.get("yt_url") or "").strip() or None if "yt_url" in d else mv["yt_url"],
                                 db.norm_title(title), mid))
                return self.json({"ok": True})
            if method == "DELETE":
                with con:
                    con.execute("DELETE FROM movies WHERE id=?", (mid,))
                return self.json({"ok": True})
        if path == "/api/admin/pick" and method == "POST":
            d = self.body()
            mid = int(d["movie_id"])
            ids = {r: (int(d[r]) if d.get(r) else None) for r in ("easy", "medium", "hard")}
            chosen = [v for v in ids.values() if v]
            if len(chosen) != len(set(chosen)):
                raise ApiError(400, "Ten sam kadr nie może mieć dwóch ról")
            valid = {r["id"] for r in con.execute("SELECT id FROM frames WHERE movie_id=?", (mid,))}
            if any(v not in valid for v in chosen):
                raise ApiError(400, "Kadr nie należy do tego filmu")
            with con:
                con.execute("""INSERT INTO picks VALUES (?,?,?,?) ON CONFLICT(movie_id) DO UPDATE SET
                    easy_frame_id=excluded.easy_frame_id, medium_frame_id=excluded.medium_frame_id,
                    hard_frame_id=excluded.hard_frame_id""", (mid, ids["easy"], ids["medium"], ids["hard"]))
            return self.json({"ok": True})
        if path == "/api/admin/settings":
            if method == "PUT":
                d = self.body()
                key = str(d.get("tmdb_key") or "").strip()
                if key and d.get("check", True):
                    import tmdb
                    try:
                        tmdb.check_key(key)
                    except Exception as e:  # noqa: BLE001
                        print("TMDB key check failed:", e)
                        raise ApiError(400, "Klucz TMDB nie działa")
                db.set_config(tmdb_key=key)
            k = db.tmdb_key()
            return self.json({"tmdb_key": bool(k), "tmdb_masked": (k[:4] + "..." + k[-4:]) if len(k) > 10 else "",
                              "from_env": bool(os.environ.get("TMDB_API_KEY"))})
        if path == "/api/admin/scrape":
            if method == "GET":
                return self.json(scrape_progress.snapshot() if scrape_progress else
                                 {"running": False, "log": [], "total": 0, "done": 0, "failed": 0})
            if method == "POST":
                try:
                    import scraper, cv2, yt_dlp  # noqa: F401
                except ImportError as e:
                    raise ApiError(500, (f"Missing library ({e.name}). Run" if self.lang == "en" else f"Brak biblioteki ({e.name}). Uruchom") + ': pip install -U "yt-dlp[default]" opencv-python')
                if (scrape_thread and scrape_thread.is_alive()) or (tmdb_thread and tmdb_thread.is_alive()):
                    raise ApiError(409, "Scraper już działa")
                d = self.body()
                rows = scraper.select_rows(con, d.get("pack_id"), d.get("movie_ids") or None,
                                           bool(d.get("redo")), bool(d.get("retry_failed")),
                                           int(d["limit"]) if d.get("limit") else None)
                scrape_progress = scraper.Progress(self.lang)
                frames_n = max(3, min(24, int(d.get("frames") or scraper.FRAMES_PER_MOVIE)))
                scrape_thread = threading.Thread(target=scraper.run, args=(rows, scrape_progress, frames_n),
                                                 daemon=True)
                scrape_thread.start()
                return self.json({"ok": True, "count": len(rows)})
        if path == "/api/admin/scrape/stop" and method == "POST":
            if scrape_progress:
                scrape_progress.stop.set()
                scrape_progress.log("Zatrzymuję po bieżącym kroku... / Stopping after the current step...")
            return self.json({"ok": True})
        if path == "/api/admin/export":
            dump = "\n".join(con.iterdump()).encode()
            return self.send(200, dump, "application/sql; charset=utf-8",
                             {"Content-Disposition": f'attachment; filename="quiz-{time.strftime("%Y%m%d")}.sql"'})
        raise ApiError(404, "Nie ma takiego adresu")


def parse_pl_titles(con, pack_id, text):
    """Linie "Original Title (rok) = Polski tytuł" albo "Original Title = Polski tytuł" -> podgląd dopasowań."""
    movies = [dict(r) for r in con.execute("SELECT id, title, year, pl_title, norm_title FROM movies WHERE pack_id=?",
                                           (pack_id,))]
    out, seen = [], set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        row = {"line": line[:300], "status": "unmatched", "movie_id": None}
        if "=" not in line:
            row["status"] = "bad_format"
            out.append(row)
            continue
        left, pl = (x.strip() for x in line.split("=", 1))
        title, year = db.split_title_year(left)
        row.update(title=title, year=year, pl_title=pl[:160])
        if not pl:
            row["status"] = "bad_format"
            out.append(row)
            continue
        nt = db.norm_title(title)
        hits = [m for m in movies if m["norm_title"] == nt and (year is None or m["year"] == year)]
        if len(hits) > 1:
            row["status"] = "ambiguous"
        elif hits:
            m = hits[0]
            if m["id"] in seen:
                row["status"] = "repeated"
            else:
                seen.add(m["id"])
                row.update(status="matched", movie_id=m["id"], movie=m["title"] + (f" ({m['year']})" if m["year"] else ""),
                           current=m["pl_title"])
        out.append(row)
    return out


def valid_color(c):
    c = str(c or "")
    return c if re.fullmatch(r"#[0-9A-Fa-f]{6}", c) else "#F26B1D"


def parse_bulk(text):
    out = []
    for line in str(text).splitlines():
        line = line.strip().lstrip("-*0123456789.) \t") if re.match(r"^\s*(\d+[.)]|[-*])\s", line) else line.strip()
        if not line:
            continue
        m = re.match(r"^(.*?)[\s,;-]*[(\[]?\s*((?:19|20)\d\d)\s*[)\]]?\s*$", line)
        out.append((m[1].strip(), int(m[2])) if m and m[1].strip() else (line, None))
    return out


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main():
    ap = argparse.ArgumentParser(description="kadr* - quiz filmowy")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1", help="adres nasłuchu (0.0.0.0 = cała sieć)")
    ap.add_argument("--lan", action="store_true", help="skrót dla --host 0.0.0.0")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--export", metavar="PLIK.sql", help="zrzut bazy do pliku .sql i wyjście")
    args = ap.parse_args()
    con = db.init_db()
    if args.export:
        Path(args.export).write_text("\n".join(con.iterdump()), encoding="utf-8")
        return print(f"Zapisano {Path(args.export).resolve()}  (wczytasz: sqlite3 nowa.db < {args.export})")
    con.close()
    host = "0.0.0.0" if args.lan else args.host
    server = ThreadingHTTPServer((host, args.port), Handler)
    server.daemon_threads = True
    threading.Thread(target=cleanup_rooms, daemon=True).start()
    url = f"http://127.0.0.1:{args.port}/"
    print(f"kadr* działa: {url}   panel: {url}admin   (Ctrl+C kończy)")
    if host == "0.0.0.0":
        print(f"Znajomi w tej samej sieci: http://{lan_ip()}:{args.port}/")
    if not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nKoniec.")


if __name__ == "__main__":
    main()
