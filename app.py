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
import rooms as rooms_lib  # noqa: E402
from rooms import Room, norm_title, is_match, load_pack, availability, pack_data, MODES  # noqa: E402,F401


def new_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        c = "".join(random.choice(alphabet) for _ in range(4))
        if c not in rooms:
            return c


def pack_avail(con, pack):
    movies = load_pack(con, pack["id"])
    return movies, availability(pack_data(con, pack), movies, bool(db.tmdb_key()))


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
    "Nie udało się pobrać": "Could not fetch",
    "To nie jest obraz (JPEG, PNG albo WebP)": "This is not an image (JPEG, PNG or WebP)",
    "Podaj treść cytatu": "Enter the quote text",
    "Podaj pytanie (PL albo EN)": "Enter the question (PL or EN)",
    "potrzeba pytania PL albo EN": "a PL or EN question is required",
    "Nie ma cytatu": "Quote not found",
    "Nie ma pytania": "Question not found",
    "Nieznane źródło": "Unknown source",
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
    "Wybierz przynajmniej jeden pakiet": "Pick at least one pack",
    "Nie udało się dobrać pary aktorów": "Could not pick an actor pair",
    "Nie udało się dobrać pary aktorów w Filmrun": "Could not pick a Filmrun actor pair",
    "Za mało filmów w wybranych pakietach": "Not enough movies in the selected packs",
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
        if n > 12_000_000:
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
                img = bytes(row["image"])
                ctype = "image/png" if img[:4] == b"\x89PNG" else "image/webp" if img[8:12] == b"WEBP" else "image/jpeg"
                return self.send(200, img, ctype, {"Cache-Control": "max-age=300"})
            m = re.fullmatch(r"/actor/(\d+)\.jpg", path)
            if m and method == "GET":
                row = con.execute("SELECT image FROM actor_photos WHERE id=?", (int(m[1]),)).fetchone()
                if not row:
                    raise ApiError(404, "Brak zdjęcia")
                img = bytes(row["image"])
                ctype = "image/png" if img[:4] == b"\x89PNG" else "image/webp" if img[8:12] == b"WEBP" else "image/jpeg"
                return self.send(200, img, ctype, {"Cache-Control": "max-age=3600"})
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
            custom = rooms_lib.custom_list_entry(con)
            # tryby Custom zliczane z całej puli (host i tak wybierze podzbiór)
            try:
                all_ids = [p["id"] for p in out]
                cp, cm = rooms_lib.merge_packs(con, all_ids) if all_ids else (None, [])
                if cp:
                    av = rooms_lib.availability(cp, cm, bool(db.tmdb_key()))
                    custom["modes"] = [k for k in MODES if av[k]["ok"]]
                    custom["playable"] = sum(1 for m in cm if m["frames"])
                    custom["total"] = len(cm)
            except ValueError:
                pass
            out.append(custom)
            return self.json(out)
        if method == "GET" and path == "/api/most/status":
            import most
            key = bool(db.tmdb_key())
            return self.json({"tmdb": key, "ok": True})
        m = re.fullmatch(r"/api/most/(person|movie)/(\d+)(?:/(movies|cast))?", path)
        if m and method == "GET":
            return self.most_lookup(m.group(1), int(m.group(2)), m.group(3), con)
        m = re.fullmatch(r"/api/packs/(custom|\d+)/titles", path)
        if m:
            if m.group(1) == "custom":
                raw = q.get("packs") or ""
                ids = [x for x in str(raw).split(",") if x.strip().isdigit()]
                try:
                    _, movies = rooms_lib.merge_packs(con, ids)
                except ValueError:
                    movies = []
                rows = [(m["title"], m.get("pl_title")) for m in movies]
            else:
                rows = [(r["title"], r["pl_title"]) for r in
                        con.execute("SELECT title, pl_title FROM movies WHERE pack_id=?", (int(m.group(1)),))]
            out = {t for t, _ in rows}
            if self.lang == "pl":
                out |= {pl for _, pl in rows if pl}
            return self.json(sorted(out, key=str.lower))
        if method == "POST" and path == "/api/rooms":
            d = self.body()
            kind = d.get("kind") or ("most" if d.get("pack_id") in ("most", "filmrun") else
                                     "custom" if d.get("pack_id") == "custom" else "pack")
            if kind in ("filmrun", "bridge"):
                kind = "most"
            with rooms_lock:
                code = new_code()
                if kind == "most":
                    movies = []
                    seen = set()
                    for row in con.execute("SELECT * FROM packs ORDER BY sort, id"):
                        for mv in rooms_lib.load_pack(con, row["id"]):
                            key = (db.norm_title(mv["title"]), mv.get("year") or -1)
                            if key in seen:
                                continue
                            seen.add(key)
                            movies.append(mv)
                    pack = {"id": "most", "slug": "filmrun", "name": "Filmrun", "name_en": "Filmrun",
                            "color": "#F26B1D", "questions": [], "modes_off": ""}
                    avail = {"most": {"ok": True, "have": 1, "need": 1, "reason": None}}
                    r = rooms[code] = Room(code, pack, movies, int(d.get("rounds") or 3), avail, kind="most")
                elif kind == "custom":
                    try:
                        pack, movies = rooms_lib.merge_packs(con, d.get("pack_ids") or d.get("packs") or [])
                    except ValueError:
                        raise ApiError(400, "Wybierz przynajmniej jeden pakiet")
                    avail = rooms_lib.availability(pack, movies, bool(db.tmdb_key()), rooms_lib.norm_settings(d.get("settings")))
                    if not any(v["ok"] for v in avail.values()):
                        raise ApiError(400, "Za mało filmów w wybranych pakietach")
                    r = rooms[code] = Room(code, pack, movies, int(d.get("rounds") or 10), avail, kind="custom")
                else:
                    pack = con.execute("SELECT * FROM packs WHERE id=?", (int(d["pack_id"]),)).fetchone()
                    if not pack:
                        raise ApiError(404, "Nie ma takiego pakietu")
                    movies, avail = pack_avail(con, pack)
                    if not any(v["ok"] for v in avail.values()):
                        raise ApiError(400, "Ten pakiet nie ma jeszcze gotowych filmów")
                    r = rooms[code] = Room(code, pack_data(con, pack), movies, int(d.get("rounds") or 10), avail)
                if d.get("modes") and kind != "most":
                    r.configure(modes=d["modes"])
                if d.get("settings"):
                    r.configure(settings=d["settings"])
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
                    r.configure(d.get("modes"), d.get("rounds"), d.get("settings"))
                elif action == "start" and r.phase in ("lobby", "final"):
                    try:
                        r.start()
                    except LookupError as e:
                        msg = "Nie udało się dobrać pary aktorów w Filmrun"
                        raise ApiError(400, msg)
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
                                  "questions": con.execute("SELECT COUNT(*) FROM questions WHERE pack_id=?",
                                                           (pid,)).fetchone()[0],
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
            r = self.mode_editor_api(method, sub, pid, con)
            if r is not None:
                return r
            if sub == "movies" and method == "GET":
                rows = con.execute("""SELECT m.id, m.title, m.year, m.query, m.yt_url, m.status, m.error,
                    m.pl_title, m.aliases, m.tmdb_id, m.cast_json, m.cast_source, m.imdb_id, m.filmweb_id,
                    (SELECT COUNT(*) FROM quotes q WHERE q.movie_id=m.id) nquotes,
                    (SELECT po.source || '|' || IFNULL(po.updated, 0) FROM posters po WHERE po.movie_id=m.id) poster_meta,
                    EXISTS(SELECT 1 FROM posters po WHERE po.movie_id=m.id) poster,
                    m.video_url, m.video_title, (SELECT COUNT(*) FROM frames f WHERE f.movie_id=m.id) nframes,
                    p.easy_frame_id easy, p.medium_frame_id medium, p.hard_frame_id hard, p.zoom_frame_id zoom
                    FROM movies m LEFT JOIN picks p ON p.movie_id=m.id WHERE m.pack_id=? ORDER BY m.id""",
                                   (pid,)).fetchall()
                out = []
                for r in rows:
                    d = dict(r)
                    try:
                        cast = json.loads(d.get("cast_json") or "[]")
                    except Exception:
                        cast = []
                    if cast:
                        d["cast_json"] = json.dumps(db.enrich_cast_photos(con, cast), ensure_ascii=False)
                    out.append(d)
                return self.json(out)
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
        m = re.fullmatch(r"/api/admin/actors(?:/(\d+))?", path)
        if m:
            return self.actor_photo_api(method, int(m[1]) if m[1] else None, con)
        m = re.fullmatch(r"/api/admin/movies/(\d+)/(poster|cast|quotes|zoom)", path)
        if m:
            return self.movie_data_api(method, int(m[1]), m[2], con)
        m = re.fullmatch(r"/api/admin/(quotes|questions)/(\d+)", path)
        if m:
            return self.item_api(method, m[1], int(m[2]), con)
        m = re.fullmatch(r"/api/admin/movies/(\d+)", path)
        if m:
            mid = int(m[1])
            mv = con.execute("SELECT * FROM movies WHERE id=?", (mid,)).fetchone()
            if not mv:
                raise ApiError(404, "Nie ma filmu")
            if method == "GET":
                frames = con.execute("SELECT id, position, ts_seconds ts, IFNULL(kind,'kadry') kind FROM frames WHERE movie_id=? "
                                     "ORDER BY position, id", (mid,)).fetchall()
                p = con.execute("SELECT * FROM picks WHERE movie_id=?", (mid,)).fetchone()
                pick = {"easy": p["easy_frame_id"], "medium": p["medium_frame_id"], "hard": p["hard_frame_id"],
                        "zoom": p["zoom_frame_id"] if "zoom_frame_id" in p.keys() else None} \
                    if p else {"easy": None, "medium": None, "hard": None, "zoom": None}
                mvd = {k: mv[k] for k in mv.keys()}
                return self.json({"movie": mvd, "frames": [dict(f) for f in frames], "pick": pick})
            if method == "PUT":
                d = self.body()
                title = str(d.get("title") or mv["title"]).strip()[:120]
                year = (int(d["year"]) if d.get("year") else None) if "year" in d else mv["year"]
                extra = {k: "\n".join(db.split_list(d[k]))[:4000] if k != "pl_title" else str(d[k]).strip()[:160]
                         for k in ("pl_title", "aliases") if k in d}
                if "quotes" in d:
                    with con:
                        con.execute("DELETE FROM quotes WHERE movie_id=?", (mid,))
                        for qt in db.split_list(d["quotes"])[:200]:
                            con.execute("INSERT INTO quotes (movie_id, text, lang) VALUES (?,?,'')", (mid, qt[:500]))
                    if not extra and "title" not in d:
                        return self.json({"ok": True})
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
            zoom = int(d["zoom"]) if d.get("zoom") else None
            if zoom and zoom not in valid:
                raise ApiError(400, "Kadr nie należy do tego filmu")
            fields = dict(easy=ids["easy"], medium=ids["medium"], hard=ids["hard"])
            if "zoom" in d:
                fields["zoom"] = zoom
            with con:
                db.upsert_picks(con, mid, **fields)
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


    # --- edytory trybów (faza 4)
    def start_web_job(self, kind, rows, source, n, fill_pl, photos_only=False):
        global scrape_progress, tmdb_thread
        import scraper
        import webscrape
        scrape_progress = scraper.Progress(self.lang)
        tmdb_thread = threading.Thread(
            target=webscrape.run,
            kwargs={"rows": rows, "progress": scrape_progress, "kind": kind, "source": source,
                    "n": n, "fill_pl": fill_pl, "photos_only": photos_only},
            daemon=True)
        tmdb_thread.start()

    def mode_editor_api(self, method, sub, pid, con):
        import webscrape
        if sub == "web" and method == "POST":
            d = self.body()
            kind = d.get("kind")
            source = d.get("source") or "auto"
            if kind not in ("poster", "cast") or source not in webscrape.SOURCES:
                raise ApiError(400, "Nieznane źródło")
            if source == "tmdb" and not db.tmdb_key():
                raise ApiError(400, "Najpierw wpisz klucz TMDB w ustawieniach")
            if job_busy():
                raise ApiError(409, "Scraper już działa")
            rows = movie_rows(con, pid, d.get("movie_ids"))
            photos_only = bool(d.get("photos_only"))
            if photos_only:
                kind = "cast"
            if not d.get("redo") and not d.get("movie_ids"):
                if kind == "poster":
                    have = {r[0] for r in con.execute("SELECT movie_id FROM posters")}
                    rows = [r for r in rows if r["id"] not in have]
                elif photos_only:
                    need = []
                    for r in rows:
                        try:
                            cs = json.loads(r.get("cast_json") or "[]")
                        except ValueError:
                            cs = []
                        if cs and any(not c.get("photo_id") for c in cs):
                            need.append(r)
                    rows = need
                else:
                    have = {r[0] for r in con.execute("SELECT id FROM movies WHERE cast_json NOT IN ('', '[]')")}
                    rows = [r for r in rows if r["id"] not in have]
            n = max(3, min(15, int(d.get("n") or webscrape.DEFAULT_N)))
            self.start_web_job(kind, rows, source, n, bool(d.get("fill_pl")), photos_only=photos_only)
            return self.json({"ok": True, "count": len(rows)})
        if sub == "quotes" and method == "GET":
            rows = con.execute("SELECT id, title, year, pl_title FROM movies WHERE pack_id=? ORDER BY title COLLATE NOCASE",
                               (pid,)).fetchall()
            qs = {}
            for q in con.execute("SELECT q.* FROM quotes q JOIN movies m ON m.id=q.movie_id WHERE m.pack_id=? "
                                 "ORDER BY q.id", (pid,)):
                qs.setdefault(q["movie_id"], []).append({"id": q["id"], "text": q["text"], "lang": q["lang"]})
            return self.json([dict(r, quotes=qs.get(r["id"], [])) for r in rows])
        if sub == "quotes" and method == "POST":
            d = self.body()
            rows = parse_quotes(con, pid, str(d.get("text") or ""))
            saved = 0
            if d.get("apply"):
                with con:
                    for r in rows:
                        if r["status"] == "matched":
                            con.execute("INSERT INTO quotes (movie_id, text, lang) VALUES (?,?,?)",
                                        (r["movie_id"], r["quote"], r["lang"]))
                            saved += 1
            return self.json({"rows": rows, "saved": saved, "matched": sum(r["status"] == "matched" for r in rows),
                              "unmatched": sum(r["status"] != "matched" for r in rows)})
        if sub == "questions" and method == "GET":
            out = []
            for r in con.execute("SELECT * FROM questions WHERE pack_id=? ORDER BY id", (pid,)):
                out.append({"id": r["id"], "prompt_pl": r["prompt_pl"], "prompt_en": r["prompt_en"],
                            "answers": json.loads(r["answers"] or "[]")})
            return self.json(out)
        if sub == "questions" and method == "POST":
            d = self.body()
            if "bulk" in d:
                rows = parse_questions(d["bulk"])
                saved = 0
                if d.get("apply"):
                    with con:
                        for r in rows:
                            if r["status"] == "ok":
                                self.insert_question(con, pid, r)
                                saved += 1
                return self.json({"rows": rows, "saved": saved, "ok": sum(r["status"] == "ok" for r in rows)})
            q = self.question_from(d)
            with con:
                qid = self.insert_question(con, pid, q)
            return self.json({"id": qid})
        if sub == "answers_auto" and method == "GET":
            lines = []
            for r in con.execute("SELECT title, pl_title, aliases FROM movies WHERE pack_id=? ORDER BY title COLLATE NOCASE",
                                 (pid,)):
                parts = [r["title"]] + ([r["pl_title"]] if r["pl_title"] else []) + db.split_aliases(r["aliases"])
                lines.append("; ".join(dict.fromkeys(parts)))
            return self.json({"text": "\n".join(lines)})
        return None

    @staticmethod
    def question_from(d, existing=None):
        pl, en = str(d.get("prompt_pl") or "").strip()[:200], str(d.get("prompt_en") or "").strip()[:200]
        if not pl and not en:
            raise ApiError(400, "Podaj pytanie (PL albo EN)")
        if "answers_text" in d or "answers" in d:
            ans = db.parse_answers(d["answers_text"]) if "answers_text" in d else \
                db.parse_answers("\n".join("; ".join([a["text"]] + list(a.get("aliases") or [])) for a in d.get("answers") or []))
        elif existing is not None:
            ans = existing
        else:
            ans = []
        return {"prompt_pl": pl, "prompt_en": en, "answers": ans}

    @staticmethod
    def insert_question(con, pid, q):
        return con.execute("INSERT INTO questions (pack_id, prompt_pl, prompt_en, answers, created) VALUES (?,?,?,?,?)",
                           (pid, q["prompt_pl"], q["prompt_en"], json.dumps(q["answers"], ensure_ascii=False),
                            time.time())).lastrowid

    def actor_photo_api(self, method, aid, con):
        import base64
        import webscrape
        if method == "GET" and aid:
            row = con.execute("SELECT id, key, name, source, source_id, url, updated, length(image) AS bytes "
                              "FROM actor_photos WHERE id=?", (aid,)).fetchone()
            if not row:
                raise ApiError(404, "Brak zdjęcia")
            return self.json(dict(row))
        if method == "POST" or (method == "PUT" and aid):
            d = self.body()
            name = str(d.get("name") or "").strip()[:80]
            if d.get("data"):
                raw = str(d["data"])
                data = base64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw)
                src, url = "upload", ""
            else:
                url = str(d.get("url") or "").strip()
                try:
                    data = webscrape.fetch_image(url)
                except Exception:
                    raise ApiError(400, "Nie udało się pobrać")
                src = "url"
            if not webscrape.is_image(data):
                raise ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)")
            key = db.actor_photo_key(src, "", name) or (f"upload:{aid}" if aid else f"upload:{int(time.time()*1000)}")
            with con:
                if aid:
                    row = con.execute("SELECT id FROM actor_photos WHERE id=?", (aid,)).fetchone()
                    if not row:
                        raise ApiError(404, "Brak zdjęcia")
                    data = db.shrink_headshot(data)
                    con.execute("UPDATE actor_photos SET image=?, url=COALESCE(NULLIF(?, ''), url), "
                                "source=?, name=COALESCE(NULLIF(?, ''), name), updated=? WHERE id=?",
                                (data, url, src, name, time.time(), aid))
                    pid = aid
                else:
                    pid = db.save_actor_photo(con, key=key, name=name, source=src, image=data, url=url)
            return self.json({"ok": True, "id": pid})
        if method == "DELETE" and aid:
            with con:
                con.execute("DELETE FROM actor_photos WHERE id=?", (aid,))
            return self.json({"ok": True})
        raise ApiError(404, "Nie ma takiego adresu")

    def most_lookup(self, kind, nid, sub, con):
        import most
        most.ensure_cache_table(con)
        key = db.tmdb_key()
        lang = self.lang
        if key:
            try:
                if kind == "person" and sub in (None, "movies"):
                    p = most.person_detail(con, key, nid, lang)
                    return self.json({"person": p, "movies": most.person_movies(con, key, nid)})
                if kind == "movie" and sub in (None, "cast"):
                    movies = []  # detail optional
                    return self.json({"movie": {"kind": "movie", "id": nid}, "cast": most.movie_cast(con, key, nid)})
            except Exception as e:
                print("most lookup tmdb:", e)
                raise ApiError(502, "Nie udało się pobrać")
        # lokalny fallback
        movies = []
        for row in con.execute("SELECT * FROM packs"):
            movies.extend(load_pack(con, row["id"]))
        g = most.local_graph(movies)
        node = (kind, int(nid))
        meta = (g.get("_meta") or {}).get(node) or {}
        neigh = []
        for k, i in g.get(node) or []:
            md = (g.get("_meta") or {}).get((k, i)) or {}
            if k == "person":
                neigh.append({"kind": "person", "id": i, "name": md.get("name") or "", "photo": md.get("photo")})
            else:
                neigh.append({"kind": "movie", "id": i, "title": md.get("title") or "", "year": md.get("year"),
                              "poster": md.get("poster")})
        if kind == "person":
            p = {"kind": "person", "id": nid, "name": meta.get("name") or "", "photo": meta.get("photo")}
            p["link"] = most.ext_links(p, lang)
            return self.json({"person": p, "movies": neigh, "local": True})
        return self.json({"movie": {"kind": "movie", "id": nid, **meta}, "cast": neigh, "local": True})

    def movie_data_api(self, method, mid, what, con):

        import base64
        import webscrape
        mv = con.execute("SELECT * FROM movies WHERE id=?", (mid,)).fetchone()
        if not mv:
            raise ApiError(404, "Nie ma filmu")
        row = movie_rows(con, ids=[mid])[0]
        if what == "zoom":
            if method == "DELETE":
                with con:
                    cur = con.execute("SELECT zoom_frame_id FROM picks WHERE movie_id=?", (mid,)).fetchone()
                    db.upsert_picks(con, mid, zoom=None)
                    if cur and cur["zoom_frame_id"]:
                        con.execute("DELETE FROM frames WHERE id=? AND movie_id=? AND IFNULL(kind,'kadry')='zoom'",
                                    (cur["zoom_frame_id"], mid))
                return self.json({"ok": True})
            d = self.body()
            if method in ("POST", "PUT") and d.get("frame_id"):
                fid = int(d["frame_id"])
                ok = con.execute("SELECT id FROM frames WHERE id=? AND movie_id=?", (fid, mid)).fetchone()
                if not ok:
                    raise ApiError(400, "Kadr nie należy do tego filmu")
                with con:
                    db.upsert_picks(con, mid, zoom=fid)
                return self.json({"ok": True, "zoom": fid})
            if method in ("POST", "PUT") and d.get("data"):
                import base64 as b64
                raw = str(d["data"])
                data = b64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw)
                if not webscrape.is_image(data):
                    raise ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)")
                # trzymaj w rozsądnym rozmiarze (kadr, nie plakat 4K)
                try:
                    data = db.shrink_headshot(data, max_edge=720, quality=85)
                except Exception:
                    if len(data) > 400_000:
                        raise ApiError(400, "Za duże żądanie")
                pos = (con.execute("SELECT COALESCE(MAX(position),0)+1 FROM frames WHERE movie_id=?", (mid,)).fetchone()[0])
                with con:
                    con.execute("INSERT INTO frames (movie_id, position, ts_seconds, image, kind) VALUES (?,?,?,?,?)",
                                (mid, pos, None, data, "zoom"))
                    fid = con.execute("SELECT last_insert_rowid()").fetchone()[0]
                    db.upsert_picks(con, mid, zoom=fid)
                return self.json({"ok": True, "zoom": fid})
            raise ApiError(400, "Zły format danych")
        if what == "poster":
            if method == "DELETE":
                with con:
                    con.execute("DELETE FROM posters WHERE movie_id=?", (mid,))
                return self.json({"ok": True})
            d = self.body()
            if method == "POST":            # pobierz z serwisu (od razu, bez kolejki)
                src = d.get("source") or "auto"
                if src not in webscrape.SOURCES:
                    raise ApiError(400, "Nieznane źródło")
                log = []
                try:
                    data, meta, used = webscrape.fetch_one("poster", src, row, log=log.append)
                except Exception as e:  # noqa: BLE001
                    return self.json({"ok": False, "error": str(e), "log": log}, 502)
                webscrape.save(con, "poster", mid, data, meta, used)
                return self.json({"ok": True, "source": used, "log": log, "note": meta.get("note") or ""})
            if method == "PUT":             # ręcznie: link do obrazka albo plik (data URL)
                if d.get("data"):
                    raw = str(d["data"])
                    data = base64.b64decode(raw.split(",", 1)[1] if raw.startswith("data:") else raw)
                    src, url = "upload", ""
                else:
                    url = str(d.get("url") or "").strip()
                    try:
                        data = webscrape.fetch_image(url)
                    except Exception as e:  # noqa: BLE001
                        print("poster url failed:", e)
                        raise ApiError(400, "Nie udało się pobrać")
                    src = "url"
                if not webscrape.is_image(data):
                    raise ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)")
                with con:
                    db.save_poster(con, mid, data, src, url)
                return self.json({"ok": True})
        if what == "cast":
            d = self.body()
            if method == "POST":
                src = d.get("source") or "auto"
                if src not in webscrape.SOURCES:
                    raise ApiError(400, "Nieznane źródło")
                log = []
                n = max(3, min(15, int(d.get("n") or webscrape.DEFAULT_N)))
                if d.get("photos_only"):
                    try:
                        with con:
                            st = webscrape.fill_photos(con, dict(mv) | row, src, n, log.append)
                    except Exception as e:  # noqa: BLE001
                        return self.json({"ok": False, "error": str(e), "log": log}, 502)
                    return self.json({"ok": True, "photos": st, "log": log})
                try:
                    data, meta, used = webscrape.fetch_one("cast", src, row, n, log=log.append)
                except Exception as e:  # noqa: BLE001
                    return self.json({"ok": False, "error": str(e), "log": log}, 502)
                webscrape.save(con, "cast", mid, data, meta, used)
                return self.json({"ok": True, "source": used, "log": log})
            if method == "PUT":
                cast = []
                for c in (d.get("cast") or [])[:20]:
                    name = str(c.get("name") or "").strip()[:80]
                    if not name:
                        continue
                    rec = {"name": name, "character": str(c.get("character") or "").strip()[:80]}
                    if str(c.get("billing") or "").isdigit():
                        rec["billing"] = int(c["billing"])
                    if str(c.get("photo_id") or "").isdigit():
                        rec["photo_id"] = int(c["photo_id"])
                    cast.append(rec)
                with con:
                    con.execute("UPDATE movies SET cast_json=?, cast_source=CASE WHEN ?='' THEN '' ELSE "
                                "COALESCE(NULLIF(cast_source,''),'manual') END WHERE id=?",
                                (json.dumps(cast, ensure_ascii=False) if cast else "", "x" if cast else "", mid))
                return self.json({"ok": True})
        if what == "quotes" and method == "POST":
            d = self.body()
            text = str(d.get("text") or "").strip()[:500]
            if not text:
                raise ApiError(400, "Podaj treść cytatu")
            lang = d.get("lang") if d.get("lang") in ("pl", "en") else ""
            with con:
                qid = con.execute("INSERT INTO quotes (movie_id, text, lang) VALUES (?,?,?)", (mid, text, lang)).lastrowid
            return self.json({"id": qid})
        raise ApiError(404, "Nie ma takiego adresu")

    def item_api(self, method, kind, iid, con):
        table = "quotes" if kind == "quotes" else "questions"
        if not con.execute(f"SELECT 1 FROM {table} WHERE id=?", (iid,)).fetchone():
            raise ApiError(404, "Nie ma cytatu" if kind == "quotes" else "Nie ma pytania")
        if method == "DELETE":
            with con:
                con.execute(f"DELETE FROM {table} WHERE id=?", (iid,))
            return self.json({"ok": True})
        if method == "PUT":
            d = self.body()
            with con:
                if kind == "quotes":
                    text = str(d.get("text") or "").strip()[:500]
                    if not text:
                        raise ApiError(400, "Podaj treść cytatu")
                    con.execute("UPDATE quotes SET text=?, lang=? WHERE id=?",
                                (text, d.get("lang") if d.get("lang") in ("pl", "en") else "", iid))
                else:
                    row = con.execute("SELECT answers FROM questions WHERE id=?", (iid,)).fetchone()
                    existing = json.loads((row["answers"] if row else None) or "[]")
                    q = self.question_from(d, existing=existing)
                    con.execute("UPDATE questions SET prompt_pl=?, prompt_en=?, answers=? WHERE id=?",
                                (q["prompt_pl"], q["prompt_en"], json.dumps(q["answers"], ensure_ascii=False), iid))
            return self.json({"ok": True})
        raise ApiError(404, "Nie ma takiego adresu")

def job_busy():
    return bool((scrape_thread and scrape_thread.is_alive()) or (tmdb_thread and tmdb_thread.is_alive()))


def movie_rows(con, pack_id=None, ids=None):
    sql = "SELECT id, title, year, pl_title, imdb_id, filmweb_id, tmdb_id, cast_json, cast_source FROM movies WHERE "
    if ids:
        rows = con.execute(sql + f"id IN ({','.join('?' * len(ids))}) ORDER BY id", [int(i) for i in ids])
    else:
        rows = con.execute(sql + "pack_id=? ORDER BY id", (pack_id,))
    return [dict(r) for r in rows]


def match_movie(movies, title, year):
    """Dopasowanie po tytule oryginalnym albo polskim (+ opcjonalny rok)."""
    nt = db.norm_title(title)
    if not nt:
        return None, "bad_format"
    hits = [m for m in movies if nt in (m["norm_title"], db.norm_title(m["pl_title"]))
            and (year is None or m["year"] == year)]
    if not hits and year is None:
        return None, "unmatched"
    if len(hits) > 1:
        return None, "ambiguous"
    return (hits[0], "matched") if hits else (None, "unmatched")


def parse_quotes(con, pack_id, text):
    """Linie "Tytuł filmu (rok) = cytat", opcjonalnie z tagiem języka na początku cytatu: "[pl] ..."."""
    movies = [dict(r) for r in con.execute("SELECT id, title, year, pl_title, norm_title FROM movies WHERE pack_id=?",
                                           (pack_id,))]
    existing = {(r["movie_id"], r["text"].strip().lower()) for r in con.execute(
        "SELECT q.movie_id, q.text FROM quotes q JOIN movies m ON m.id=q.movie_id WHERE m.pack_id=?", (pack_id,))}
    out, seen = [], set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        row = {"line": line[:600], "status": "unmatched", "movie_id": None}
        if "=" not in line:
            row["status"] = "bad_format"
            out.append(row)
            continue
        left, qt = (x.strip() for x in line.split("=", 1))
        lang = ""
        mm = re.match(r"^\[(pl|en)\]\s*(.*)$", qt, re.I)
        if mm:
            lang, qt = mm[1].lower(), mm[2].strip()
        qt = qt.strip().strip('"„”“').strip()
        title, year = db.split_title_year(left)
        row.update(title=title, year=year, quote=qt[:500], lang=lang)
        if not qt:
            row["status"] = "bad_format"
            out.append(row)
            continue
        mv, st = match_movie(movies, title, year)
        row["status"] = st
        if mv:
            key = (mv["id"], qt.lower())
            if key in existing or key in seen:
                row["status"] = "duplicate"
            else:
                seen.add(key)
            row.update(movie_id=mv["id"], movie=mv["title"] + (f" ({mv['year']})" if mv["year"] else ""))
        out.append(row)
    return out


def parse_questions(text):
    """Bloki oddzielone pustą linią. Pierwsza linia: "Pytanie PL | Question EN".
    Kolejne linie (stare odpowiedzi) są zachowywane, ale nie są wymagane."""
    out = []
    for block in re.split(r"\n\s*\n", str(text or "").replace("\r", "").strip()):
        lines = [x.strip() for x in block.split("\n") if x.strip()]
        if not lines:
            continue
        head = lines[0]
        pl, _, en = head.partition("|")
        ans = db.parse_answers("\n".join(lines[1:]))
        row = {"prompt_pl": pl.strip()[:200], "prompt_en": en.strip()[:200], "answers": ans,
               "status": "ok" if (pl.strip() or en.strip()) else "bad_format"}
        out.append(row)
    return out


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
