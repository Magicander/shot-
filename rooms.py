"""rooms.py - silnik gry: tryby rund, dopasowanie odpowiedzi, punktacja (tylko biblioteka standardowa)."""
import json
import random
import re
import secrets
import time
import unicodedata

import db

STAGE_SECONDS = 15          # Kadry: trudny -> średni -> łatwy, co 15 s
REVEAL_SECONDS = 9
STAGE_POINTS = [1000, 600, 300]
FIRST_BONUS = 100
MAX_PLAYERS = 16
MIN_QUOTES = 5              # Cytat wymaga co najmniej tylu cytatów w pakiecie
MAX_ROUNDS = 30

MODES = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "cytat"]
DURATION = {"kadry": 3 * STAGE_SECONDS, "zoom": 30, "plakat": 30, "cytat": 30, "rok": 25, "kolejnosc": 40}
ACTOR_SECONDS = 6
MAX_ACTORS = 6
BID_SECONDS = 15
ORDER_N = 4
TITLE_MODES = {"kadry", "zoom", "plakat", "aktorzy", "cytat"}


# ------------------------------------------------------------ dopasowanie odpowiedzi
def norm_title(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").replace("ł", "l").replace("Ł", "L"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    s = re.sub(r"^(the|a|an) ", "", s)
    s = re.sub(r" (19|20)\d\d$", "", s)
    return s.replace(" ", "")


def lev(a, b, cap=3):
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def distance(guess, title):
    """0 = trafienie dokładne, >0 = literówka w granicach tolerancji, None = brak."""
    g, t = norm_title(guess), norm_title(title)
    if not g or not t:
        return None
    if g == t:
        return 0
    allowed = 0 if len(t) < 4 else 1 if len(t) < 9 else 2 if len(t) < 16 else 3
    d = lev(g, t, allowed)
    return d if d <= allowed else None


def is_match(guess, title):
    return distance(guess, title) is not None


def names(movie, lang):
    """Akceptowane odpowiedzi: oryginał + aliasy, a w wersji PL również polski tytuł."""
    out = [movie["title"]] + movie.get("aliases", [])
    if lang == "pl" and movie.get("pl_title"):
        pl = movie["pl_title"]
        out.append(pl)
        # "Obcy - 8. pasażer Nostromo", "Dziedzictwo. Hereditary": wystarczy człon główny
        head = re.split(r"\s+[-\u2013:]\s+|:\s+|\.\s+", pl, maxsplit=1)[0].strip()
        if head != pl and len(norm_title(head)) >= 3:
            out.append(head)
    return out


def movie_distance(guess, movie, lang):
    ds = [d for d in (distance(guess, n) for n in names(movie, lang)) if d is not None]
    return min(ds) if ds else None


def best_movie(guess, movies, lang):
    """Najlepiej pasujący film z listy (dokładne trafienie wygrywa z literówką; remis = brak)."""
    scored = sorted((d, m["id"]) for m in movies for d in [movie_distance(guess, m, lang)] if d is not None)
    if not scored:
        return None
    if len(scored) > 1 and scored[0][0] == scored[1][0] and scored[0][0] > 0:
        return None
    return next(m for m in movies if m["id"] == scored[0][1])


# --------------------------------------------------------------------- dane pakietu
def load_pack(con, pack_id):
    movies = []
    posters = {r[0] for r in con.execute(
        "SELECT p.movie_id FROM posters p JOIN movies m ON m.id=p.movie_id WHERE m.pack_id=?", (pack_id,))}
    for m in con.execute("SELECT * FROM movies WHERE pack_id=? ORDER BY id", (pack_id,)).fetchall():
        fr = db.game_frames(con, m["id"]) if m["status"] == "ok" else None
        try:
            cast = json.loads(m["cast_json"] or "[]")
        except ValueError:
            cast = []
        movies.append({"id": m["id"], "title": m["title"], "year": m["year"], "pl_title": m["pl_title"] or "",
                       "aliases": db.split_aliases(m["aliases"]), "quotes": db.split_list(m["quotes"]),
                       "frames": fr, "poster": m["id"] in posters, "cast": cast})
    return movies


def availability(pack, movies, has_key):
    off = set(filter(None, (pack.get("modes_off") or "").split(",")))
    framed = sum(1 for m in movies if m["frames"])
    years = {m["year"] for m in movies if m["year"]}
    info = {
        "kadry": (framed, 1, "frames"),
        "zoom": (framed, 1, "frames"),
        "licytacja": (len(movies), 5, "movies"),
        "rok": (sum(1 for m in movies if m["year"]), 3, "years"),
        "kolejnosc": (len(years), ORDER_N, "years"),
        "plakat": (sum(1 for m in movies if m["poster"]), 3, "posters"),
        "aktorzy": (sum(1 for m in movies if len(m["cast"]) >= 3), 3, "cast"),
        "cytat": (sum(len(m["quotes"]) for m in movies), MIN_QUOTES, "quotes"),
    }
    out = {}
    for k in MODES:
        have, need, what = info[k]
        ok = have >= need and k not in off
        reason = None if ok else "disabled" if k in off else \
            ("tmdb_key" if what in ("posters", "cast") and not has_key else what)
        out[k] = {"ok": ok, "have": have, "need": need, "reason": reason}
    return out


# --------------------------------------------------------------------- pokój
class Room:
    def __init__(self, code, pack, movies, rounds, avail):
        self.code, self.pack, self.movies, self.avail = code, pack, movies, avail
        self.modes = [k for k in MODES if avail[k]["ok"]]
        self.rounds = max(1, min(int(rounds or 10), MAX_ROUNDS))
        self.players = {}
        self.host = None
        self.phase = "lobby"
        self.round = 0
        self.plan = []
        self.task = None
        self.t0 = 0
        self.feed = []
        self.created = self.touched = time.time()
        self.version = 0

    # --- gracze
    def add_player(self, name):
        name = re.sub(r"\s+", " ", name or "").strip()[:18] or "Gracz"
        taken = {p["name"].lower() for p in self.players.values()}
        base, n = name, 2
        while name.lower() in taken:
            name, n = f"{base} {n}", n + 1
        pid = secrets.token_hex(4)
        self.players[pid] = {"id": pid, "name": name, "score": 0, "token": secrets.token_urlsafe(12),
                             "seen": time.time(), "got": None, "ans": None, "wrong": 0, "history": []}
        if not self.host:
            self.host = pid
        self.event("join", name)
        return self.players[pid]

    def event(self, kind, name, pts=None):
        self.feed.append({"t": time.time(), "k": kind, "name": name, "pts": pts})
        del self.feed[:-12]
        self.version += 1

    def active(self):
        now = time.time()
        return [p for p in self.players.values() if now - p["seen"] < 20]

    # --- ustawienia
    def configure(self, modes=None, rounds=None):
        if self.phase not in ("lobby", "final"):
            return
        if modes is not None:
            chosen = [k for k in MODES if k in modes and self.avail[k]["ok"]]
            if chosen:
                self.modes = chosen
        if rounds is not None:
            self.rounds = max(1, min(int(rounds), MAX_ROUNDS))
        self.version += 1

    # --- przebieg
    def start(self):
        if not self.modes:
            raise ValueError("no modes")
        order = random.sample(self.modes, len(self.modes))
        used, self.plan = set(), []
        for i in range(self.rounds):
            t = self.make_task(order[i % len(order)], used)
            if t:
                self.plan.append(t)
        for p in self.players.values():
            p.update(score=0, history=[])
        self.round = 0
        self.feed = []
        self.begin_round()

    def pick(self, pool, used):
        fresh = [m for m in pool if m["id"] not in used] or pool
        m = random.choice(fresh)
        used.add(m["id"])
        return m

    def make_task(self, mode, used):
        ms = self.movies
        if mode in ("kadry", "zoom"):
            m = self.pick([x for x in ms if x["frames"]], used)
            t = {"mode": mode, "movie": m}
            if mode == "zoom":
                t.update(frame=m["frames"][1], ox=round(random.uniform(.3, .7), 3), oy=round(random.uniform(.3, .7), 3))
            return t
        if mode == "plakat":
            m = self.pick([x for x in ms if x["poster"]], used)
            return {"mode": mode, "movie": m, "style": random.choice(["pix", "tiles"]), "seed": random.randint(1, 10**6)}
        if mode == "aktorzy":
            m = self.pick([x for x in ms if len(x["cast"]) >= 3], used)
            cast = sorted(m["cast"][:MAX_ACTORS], key=lambda c: c.get("popularity") or 0)   # od najmniej znanych
            return {"mode": mode, "movie": m, "cast": [c["name"] for c in cast]}
        if mode == "cytat":
            m = self.pick([x for x in ms if x["quotes"]], used)
            return {"mode": mode, "movie": m, "quote": random.choice(m["quotes"])}
        if mode == "rok":
            m = self.pick([x for x in ms if x["year"]], used)
            return {"mode": mode, "movie": m}
        if mode == "kolejnosc":
            by_year = {}
            for x in random.sample(ms, len(ms)):
                if x["year"] and x["year"] not in by_year:
                    by_year[x["year"]] = x
            items = random.sample(list(by_year.values()), ORDER_N)
            return {"mode": mode, "items": items}
        if mode == "licytacja":
            return {"mode": mode, "bids": {}, "bidder": None, "bid": 0, "found": [], "type_end": None}
        return None

    @property
    def mode(self):
        return self.task["mode"] if self.task else None

    def duration(self):
        t = self.task
        if t["mode"] == "aktorzy":
            return ACTOR_SECONDS * len(t["cast"])
        return DURATION.get(t["mode"], 30)

    def begin_round(self):
        self.task = self.plan[self.round]
        self.phase, self.t0 = "round", time.time()
        for p in self.players.values():
            p["got"], p["ans"], p["wrong"] = None, None, 0
        self.version += 1

    def tick(self):
        now = time.time()
        if self.phase == "round":
            el, t, act = now - self.t0, self.task, self.active()
            if t["mode"] == "licytacja":
                if t["bidder"] is None:
                    if el >= BID_SECONDS or (act and all(p["id"] in t["bids"] for p in act)):
                        self.close_bids()
                elif now >= t["type_end"] or len(t["found"]) >= t["bid"]:
                    self.end_round()
            elif el >= self.duration() or (act and all(p["ans"] is not None or p["got"] for p in act)):
                self.end_round()
        elif self.phase == "reveal" and now - self.t0 >= REVEAL_SECONDS + (3 if self.mode in ("kolejnosc", "licytacja") else 0):
            self.next()

    def close_bids(self):
        t = self.task
        if not t["bids"]:
            t["bidder"] = ""
            return self.end_round()
        pid, (bid, _) = max(t["bids"].items(), key=lambda kv: (kv[1][0], -kv[1][1]))
        t.update(bidder=pid, bid=bid, type_end=time.time() + self.type_seconds(bid))
        self.event("bidwin", self.players[pid]["name"] if pid in self.players else "?", bid)

    @staticmethod
    def type_seconds(bid):
        return min(90, 15 + 5 * bid)

    def end_round(self):
        t = self.task
        pts = {pid: (p["got"] or {}).get("points", 0) for pid, p in self.players.items()}
        if t["mode"] == "rok":
            for pid, p in self.players.items():
                if p["ans"] is not None:
                    d = abs(int(p["ans"]) - t["movie"]["year"])
                    pts[pid] = 0 if d > 8 else int(round(1000 * 0.7 ** d))
        elif t["mode"] == "kolejnosc":
            right = [m["id"] for m in sorted(t["items"], key=lambda m: m["year"])]
            for pid, p in self.players.items():
                if p["ans"]:
                    pts[pid] = 250 * sum(1 for a, b in zip(p["ans"], right) if a == b)
        elif t["mode"] == "licytacja" and t["bidder"]:
            t["success"] = len(t["found"]) >= t["bid"]
            for pid in self.players:
                if t["success"]:
                    pts[pid] = 200 * t["bid"] if pid == t["bidder"] else 0
                else:
                    pts[pid] = 0 if pid == t["bidder"] else 100 * t["bid"]
        for pid, p in self.players.items():
            if t["mode"] not in TITLE_MODES:
                p["score"] += pts[pid]
                p["got"] = {"points": pts[pid]} if pts[pid] else None
            p["history"].append(pts[pid])
        self.phase, self.t0 = "reveal", time.time()
        self.version += 1

    def next(self):
        if self.phase == "round":
            return self.end_round()
        if self.round + 1 >= len(self.plan):
            self.phase = "final"
            self.version += 1
        else:
            self.round += 1
            self.begin_round()

    # --- odpowiedzi
    def answer(self, p, d, lang):
        if self.phase != "round":
            return {"ok": False}
        t, el = self.task, time.time() - self.t0
        mode = t["mode"]
        if mode in TITLE_MODES:
            if p["got"]:
                return {"ok": False}
            text = str(d.get("text") or "")[:120]
            if movie_distance(text, t["movie"], lang) is None:
                p["wrong"] += 1
                self.version += 1
                return {"ok": True, "correct": False}
            order = sum(1 for q in self.players.values() if q["got"])
            if mode == "kadry":
                stage = min(2, int(el // STAGE_SECONDS))
                within = (el - stage * STAGE_SECONDS) / STAGE_SECONDS
                pts = int(STAGE_POINTS[stage] * (1 - 0.5 * min(1, within)))
            elif mode == "aktorzy":
                k = min(len(t["cast"]), int(el // ACTOR_SECONDS) + 1)
                pts, stage = max(250, 1000 - 150 * (k - 1)), k
            else:
                pts, stage = int(1000 * (1 - 0.7 * min(1, el / self.duration()))), 0
            pts += FIRST_BONUS if order == 0 else 0
            p["got"] = {"points": pts, "stage": stage, "secs": round(el, 1), "order": order + 1}
            p["score"] += pts
            self.event("guess", p["name"], pts)
            self.tick()
            return {"ok": True, "correct": True, "points": pts}
        if mode == "rok":
            if p["ans"] is not None:
                return {"ok": False}
            y = int(d.get("year"))
            if not 1880 <= y <= 2100:
                raise ValueError("year")
            p["ans"] = y
            self.event("answered", p["name"])
            self.tick()
            return {"ok": True}
        if mode == "kolejnosc":
            if p["ans"] is not None:
                return {"ok": False}
            ids = [int(x) for x in d.get("order") or []]
            if sorted(ids) != sorted(m["id"] for m in t["items"]):
                raise ValueError("order")
            p["ans"] = ids
            self.event("answered", p["name"])
            self.tick()
            return {"ok": True}
        if mode == "licytacja":
            if t["bidder"] is None:
                if p["id"] in t["bids"]:
                    return {"ok": False}
                bid = max(1, min(int(d.get("bid")), len(self.movies)))
                t["bids"][p["id"]] = (bid, el)
                self.event("bid", p["name"])
                self.tick()
                return {"ok": True}
            if p["id"] != t["bidder"]:
                return {"ok": False}
            text = str(d.get("text") or "")[:120]
            left = [m for m in self.movies if m["id"] not in {f["id"] for f in t["found"]}]
            m = best_movie(text, left, lang)
            if not m:
                dup = best_movie(text, [x for x in self.movies if x not in left], lang)
                self.version += 1
                return {"ok": True, "correct": False, "duplicate": bool(dup)}
            t["found"].append({"id": m["id"], "title": m["title"], "pl_title": m["pl_title"], "year": m["year"]})
            self.version += 1
            self.tick()
            return {"ok": True, "correct": True, "title": m["title"]}
        return {"ok": False}

    # --- stan dla klienta
    @staticmethod
    def mview(m, lang, year=True):
        out = {"id": m["id"], "title": m["title"], "pl_title": m["pl_title"] if lang == "pl" else ""}
        if year:
            out["year"] = m["year"]
        return out

    @staticmethod
    def thumb(m):
        if m.get("frames"):
            return f"/frame/{m['frames'][2]}.jpg"
        if m.get("poster"):
            return f"/poster/{m['id']}.jpg"
        return None

    def state(self, me, lang="pl"):
        self.tick()
        now = time.time()
        players = sorted(self.players.values(), key=lambda p: (-p["score"], p["name"].lower()))
        t = self.task
        out = {
            "code": self.code, "phase": self.phase, "round": self.round + 1, "rounds": len(self.plan) or self.rounds,
            "pack": {k: self.pack.get(k) for k in ("id", "name", "name_en", "slug", "color")},
            "host": self.host, "me": me["id"] if me else None, "feed": self.feed[-6:],
            "stage_seconds": STAGE_SECONDS, "reveal_seconds": REVEAL_SECONDS,
            "modes": self.modes, "avail": self.avail, "all_modes": MODES, "min_quotes": MIN_QUOTES,
            "players": [{"id": p["id"], "name": p["name"], "score": p["score"],
                         "online": now - p["seen"] < 20,
                         "got": p["got"] if (self.phase != "round" or self.mode in TITLE_MODES) else None,
                         "done": p["ans"] is not None or bool(p["got"]),
                         "wrong": p["wrong"], "history": p["history"]} for p in players],
        }
        if self.phase not in ("round", "reveal"):
            return out
        el = now - self.t0
        mode = t["mode"]
        out["mode"] = mode
        if self.phase == "round":
            out.update(elapsed=round(el, 2))
            if mode != "licytacja":
                out.update(duration=self.duration(), left=round(self.duration() - el, 1))
            if mode == "kadry":
                stage = min(2, int(el // STAGE_SECONDS))
                out.update(stage=stage, frames=t["movie"]["frames"][:stage + 1])
            elif mode == "zoom":
                out.update(img=f"/frame/{t['frame']}.jpg", ox=t["ox"], oy=t["oy"])
            elif mode == "plakat":
                out.update(img=f"/poster/{t['movie']['id']}.jpg", style=t["style"], seed=t["seed"])
            elif mode == "aktorzy":
                k = min(len(t["cast"]), int(el // ACTOR_SECONDS) + 1)
                out.update(cast=t["cast"][:k], cast_total=len(t["cast"]), actor_seconds=ACTOR_SECONDS)
            elif mode == "cytat":
                out.update(quote=t["quote"], hint_year=t["movie"]["year"] if el >= self.duration() / 2 else None)
            elif mode == "rok":
                out.update(movie=self.mview(t["movie"], lang, year=False), img=self.thumb(t["movie"]),
                           mine=me and me["ans"])
            elif mode == "kolejnosc":
                out.update(items=[dict(self.mview(m, lang, year=False), img=self.thumb(m)) for m in t["items"]],
                           mine=me and me["ans"])
            elif mode == "licytacja":
                out.update(total=len(self.movies), bid_seconds=BID_SECONDS,
                           bidders=[self.players[pid]["name"] for pid in t["bids"] if pid in self.players],
                           my_bid=(t["bids"].get(me["id"]) or [None])[0] if me else None)
                if t["bidder"] is None:
                    out.update(sub="bid", left=round(BID_SECONDS - el, 1), duration=BID_SECONDS)
                else:
                    out.update(sub="type", bidder=t["bidder"], bid=t["bid"],
                               bidder_name=self.players.get(t["bidder"], {}).get("name", "?"),
                               duration=self.type_seconds(t["bid"]), left=round(t["type_end"] - now, 1),
                               elapsed=round(self.type_seconds(t["bid"]) - (t["type_end"] - now), 2),
                               found=[self.mview(f, lang) if lang == "pl" else dict(f, pl_title="") for f in t["found"]])
            return out
        # reveal
        out["left"] = round(REVEAL_SECONDS - el, 1)
        ans = {"mode": mode}
        if "movie" in t:
            m = t["movie"]
            ans.update(self.mview(m, lang), frames=m["frames"] or [], poster=m["poster"],
                       img=self.thumb(m))
            if mode == "aktorzy":
                ans["cast"] = t["cast"]
            if mode == "cytat":
                ans["quote"] = t["quote"]
            if mode == "zoom":
                ans["img"] = f"/frame/{t['frame']}.jpg"
            if mode == "plakat":
                ans["img"] = f"/poster/{m['id']}.jpg"
            if mode == "rok":
                ans["guesses"] = [{"name": p["name"], "year": p["ans"], "points": p["history"][-1] if p["history"] else 0}
                                  for p in players if p["ans"] is not None]
        if mode == "kolejnosc":
            right = sorted(t["items"], key=lambda m: m["year"])
            ans["items"] = [dict(self.mview(m, lang), img=self.thumb(m)) for m in right]
        if mode == "licytacja":
            ans.update(bidder_name=self.players.get(t["bidder"] or "", {}).get("name"), bid=t["bid"],
                       success=t.get("success", False), total=len(self.movies),
                       bids=[{"name": self.players[pid]["name"], "bid": b[0]} for pid, b in t["bids"].items()
                             if pid in self.players],
                       found=[dict(f, pl_title=f["pl_title"] if lang == "pl" else "") for f in t["found"]])
        out["answer"] = ans
        return out
