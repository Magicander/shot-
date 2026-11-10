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
MAX_ROUNDS = 30
TOP_N = 5                   # domyślna długość topki
TOP_N_MIN, TOP_N_MAX = 3, 8
TOP_OWN = 45                # sekundy na własną topkę
TOP_GUESS = 45              # sekundy na odgadywanie cudzej
MOST_TIME = 90              # sekundy na rundę Mostu

MODES = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "top"]
DURATION = {"kadry": 3 * STAGE_SECONDS, "zoom": 30, "plakat": 30, "top": TOP_OWN, "rok": 25, "kolejnosc": 40}
ACTOR_SECONDS = 6
MAX_ACTORS = 8
BID_SECONDS = 15
ORDER_N = 4
TITLE_MODES = {"kadry", "zoom", "plakat", "aktorzy"}


def cast_view(members):
    """Lista {name, photo} do gry. photo to /actor/{id}.jpg albo None."""
    out = []
    for c in members or []:
        if isinstance(c, str):
            out.append({"name": c, "photo": None})
            continue
        pid = c.get("photo_id")
        name = c.get("name") or ""
        out.append({"name": name, "photo": f"/actor/{int(pid)}.jpg" if pid else None})
    return out

VOICE_MODES = TITLE_MODES | {"licytacja"}   # tryby, w których można odpowiadać na głos
JUDGE_GRACE = 15            # po końcu czasu sędzia ma jeszcze tyle sekund na rozstrzygnięcie zgłoszeń
LIC_DONE_DELAY = 3          # licytacja na głos: chwila na cofnięcie ostatniego "+1" po osiągnięciu deklaracji
DEFAULTS = {"time": 0, "mode_time": {}, "order": "mix", "per_mode": False, "mode_rounds": {},
            "answer": "type", "mode_answer": {}, "judge": "rotate", "lic_answer": 30, "lic_bid": 10,
            "hints": True, "final_x": 1, "top_n": TOP_N, "top_own": TOP_OWN, "top_guess": TOP_GUESS,
            "most_time": MOST_TIME}


def _int(v, lo, hi, dflt):
    if isinstance(v, bool):
        return dflt
    try:
        v = int(float(v))
    except (TypeError, ValueError, OverflowError):
        return dflt
    return max(lo, min(v, hi))


def norm_settings(d):
    """Ustawienia gospodarza -> bezpieczny słownik (identycznie jak normSettings w cloudflare/src/game.js)."""
    d = d if isinstance(d, dict) else {}
    mt = d.get("mode_time") if isinstance(d.get("mode_time"), dict) else {}
    mr = d.get("mode_rounds") if isinstance(d.get("mode_rounds"), dict) else {}
    ma = d.get("mode_answer") if isinstance(d.get("mode_answer"), dict) else {}
    t = _int(d.get("time"), 0, 120, 0)
    return {
        "time": max(10, t) if t else 0,
        "mode_time": {k: max(10, _int(mt[k], 0, 120, 0)) for k in MODES
                      if k in mt and k != "licytacja" and _int(mt[k], 0, 120, 0) > 0},
        "order": "fixed" if d.get("order") == "fixed" else "mix",
        "per_mode": bool(d.get("per_mode")),
        "mode_rounds": {k: _int(mr[k], 1, 10, 1) for k in MODES if k in mr},
        "answer": "voice" if d.get("answer") == "voice" else "type",
        "mode_answer": {k: ma[k] for k in MODES if k in VOICE_MODES and ma.get(k) in ("type", "voice")},
        "judge": d.get("judge") if d.get("judge") in ("rotate", "host", "vote") else "rotate",
        "lic_answer": _int(d.get("lic_answer"), 10, 120, 30),
        "lic_bid": _int(d.get("lic_bid"), 5, 60, 10),
        "hints": d.get("hints") is not False,
        "final_x": _int(d.get("final_x"), 1, 3, 1),
        "top_n": _int(d.get("top_n"), TOP_N_MIN, TOP_N_MAX, TOP_N),
        "top_own": _int(d.get("top_own"), 15, 180, TOP_OWN),
        "top_guess": _int(d.get("top_guess"), 15, 180, TOP_GUESS),
        "most_time": _int(d.get("most_time"), 30, 180, MOST_TIME),
    }


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
    quotes = {}
    for q in con.execute("SELECT q.id, q.movie_id, q.text, q.lang FROM quotes q JOIN movies m ON m.id=q.movie_id "
                         "WHERE m.pack_id=? ORDER BY q.id", (pack_id,)):
        quotes.setdefault(q["movie_id"], []).append({"id": q["id"], "text": q["text"], "lang": q["lang"] or ""})
    for m in con.execute("SELECT * FROM movies WHERE pack_id=? ORDER BY id", (pack_id,)).fetchall():
        fr = db.game_frames(con, m["id"]) if m["status"] == "ok" else None
        try:
            cast = json.loads(m["cast_json"] or "[]")
        except ValueError:
            cast = []
        zf = db.game_zoom_frame(con, m["id"]) if m["status"] == "ok" else None
        movies.append({"id": m["id"], "title": m["title"], "year": m["year"], "pl_title": m["pl_title"] or "",
                       "aliases": db.split_aliases(m["aliases"]), "quotes": quotes.get(m["id"], []),
                       "frames": fr, "zoom_frame": zf, "poster": m["id"] in posters, "cast": cast})
    return movies


def load_questions(con, pack_id):
    out = []
    for r in con.execute("SELECT * FROM questions WHERE pack_id=? ORDER BY id", (pack_id,)):
        try:
            ans = json.loads(r["answers"] or "[]")
        except ValueError:
            ans = []
        if len(ans) >= 2 and (r["prompt_pl"] or r["prompt_en"]):
            out.append({"id": r["id"], "prompt_pl": r["prompt_pl"], "prompt_en": r["prompt_en"], "answers": ans})
    return out


def pack_data(con, pack):
    d = dict(pack)
    d["questions"] = load_questions(con, d["id"])
    return d


def fallback_question(movies):
    """Bez własnych pytań: "Ile filmów z tego pakietu wymienisz?" - odpowiedzi to filmy pakietu."""
    return {"id": 0, "prompt_pl": "Ile filmów z tego pakietu wymienisz?",
            "prompt_en": "How many films from this pack can you name?",
            "answers": [{"text": m["title"], "aliases": ([m["pl_title"]] if m["pl_title"] else []) + m["aliases"],
                         "pl": m["pl_title"]} for m in movies]}


def answer_distance(guess, a):
    ds = [d for d in (distance(guess, n) for n in [a["text"]] + list(a.get("aliases") or [])) if d is not None]
    return min(ds) if ds else None


def best_answer(guess, answers, idxs):
    scored = sorted((d, i) for i in idxs for d in [answer_distance(guess, answers[i])] if d is not None)
    if not scored:
        return None
    if len(scored) > 1 and scored[0][0] == scored[1][0] and scored[0][0] > 0:
        return None
    return scored[0][1]


def top_need(cfg=None):
    if not cfg:
        return TOP_N
    return _int(cfg.get("top_n"), TOP_N_MIN, TOP_N_MAX, TOP_N)


def top_score(guess, truth):
    """Za każdy film: N pkt za dokładne miejsce, -1 za każde miejsce odchyłki (min. 0). Maks. N*N."""
    n = len(truth)
    pos = {mid: i for i, mid in enumerate(truth)}
    return sum(max(0, n - abs(i - pos[mid])) for i, mid in enumerate(guess) if mid in pos)


def top_assign(pids, rng=None):
    """Cykl: każdy zgaduje dokładnie jednego innego. Przy 2 osobach — siebie nawzajem. Przy 1 — pusty."""
    ids = list(pids)
    if len(ids) < 2:
        return {}
    (rng or random).shuffle(ids)
    return {ids[i]: ids[(i + 1) % len(ids)] for i in range(len(ids))}


def merge_packs(con, pack_ids):
    """Składa multi-pakiet Custom z wybranych pakietów. Duplikaty tytułów (norm+rok) odpadają (zostaje pierwszy, z bogatszymi danymi jeśli się da)."""
    ids, seen_id = [], set()
    for x in pack_ids or []:
        try:
            i = int(x)
        except (TypeError, ValueError):
            continue
        if i > 0 and i not in seen_id:
            seen_id.add(i)
            ids.append(i)
    packs = []
    for i in ids:
        row = con.execute("SELECT * FROM packs WHERE id=?", (i,)).fetchone()
        if row:
            packs.append(dict(row))
    if not packs:
        raise ValueError("no packs")
    movies, questions, seen, qseen = [], [], {}, set()
    for p in packs:
        for m in load_pack(con, p["id"]):
            key = (db.norm_title(m["title"]), m.get("year") or -1)
            old = seen.get(key)
            if old is None:
                seen[key] = m
                movies.append(m)
            else:
                # zachowaj wersję z większą liczbą danych (kadry/obsada/plakat)
                score = lambda x: (1 if x.get("frames") else 0) + (1 if x.get("poster") else 0) + (1 if len(x.get("cast") or []) >= 3 else 0) + (1 if x.get("zoom_frame") else 0)
                if score(m) > score(old):
                    movies[movies.index(old)] = m
                    seen[key] = m
        for q in load_questions(con, p["id"]):
            if q["id"] not in qseen:
                qseen.add(q["id"])
                questions.append(q)
    names = [p["name"] for p in packs]
    pack = {
        "id": "custom", "slug": "custom", "name": "Custom", "name_en": "Custom",
        "description": " + ".join(names),
        "description_en": " + ".join(p.get("name_en") or p["name"] for p in packs),
        "color": packs[0]["color"] if packs else "#1B1712",
        "modes_off": "", "questions": questions, "source_ids": [p["id"] for p in packs],
    }
    return pack, movies


def custom_list_entry(con):
    """Wirtualny pakiet na końcu listy (nie jest wierszem w packs)."""
    n = con.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
    thumbs = [r[0] for r in con.execute(
        "SELECT f.id FROM frames f JOIN movies m ON m.id=f.movie_id "
        "WHERE IFNULL(f.kind,'kadry')!='zoom' ORDER BY m.pack_id, f.id LIMIT 6")]
    return {
        "id": "custom", "slug": "custom", "name": "Custom", "name_en": "Custom",
        "description": "Złóż własne multi-pakiet z kilku istniejących.",
        "description_en": "Build a multi-pack from the packs you already have.",
        "color": "#1B1712", "playable": n, "total": n, "thumbs": thumbs[:3],
        "modes": [k for k in MODES], "custom": True,
    }


def availability(pack, movies, has_key, cfg=None):
    off = set(filter(None, (pack.get("modes_off") or "").split(",")))
    framed = sum(1 for m in movies if m["frames"])
    zoomed = sum(1 for m in movies if m.get("zoom_frame") or m["frames"])
    years = {m["year"] for m in movies if m["year"]}
    tn = top_need(cfg)
    info = {
        "kadry": (framed, 1, "frames"),
        "zoom": (zoomed, 1, "frames"),
        "licytacja": (len(pack.get("questions") or []) or (1 if len(movies) >= 5 else 0), 1, "questions"),
        "rok": (sum(1 for m in movies if m["year"]), 3, "years"),
        "kolejnosc": (len(years), ORDER_N, "years"),
        "plakat": (sum(1 for m in movies if m["poster"]), 3, "posters"),
        "aktorzy": (sum(1 for m in movies if len(m["cast"]) >= 3), 3, "cast"),
        "top": (len(movies), tn, "movies"),
    }
    out = {}
    for k in MODES:
        have, need, what = info[k]
        ok = have >= need and k not in off
        reason = None if ok else "disabled" if k in off else what
        out[k] = {"ok": ok, "have": have, "need": need, "reason": reason}
    return out


# --------------------------------------------------------------------- pokój
class Room:
    def __init__(self, code, pack, movies, rounds, avail, kind="pack"):
        self.code, self.pack, self.movies, self.avail = code, pack, movies, avail
        self.kind = kind
        self.modes = ["most"] if kind == "most" else [k for k in MODES if avail.get(k, {}).get("ok")]
        self.rounds = max(1, min(int(rounds or 10), MAX_ROUNDS))
        self.cfg = norm_settings({})
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

    def on(self, p):
        return p is not None and time.time() - p["seen"] < 20

    # --- ustawienia
    def configure(self, modes=None, rounds=None, settings=None):
        if self.phase not in ("lobby", "final"):
            return
        if modes is not None:
            chosen = list(dict.fromkeys(k for k in modes if k in MODES and self.avail[k]["ok"]))
            if chosen:
                self.modes = chosen          # kolejność gospodarza (ważna przy order="fixed")
        if rounds is not None:
            self.rounds = _int(rounds, 1, MAX_ROUNDS, self.rounds)
        if settings is not None:
            self.cfg = norm_settings(settings)
            if self.kind != "most":
                self.avail = availability(self.pack, self.movies, False, self.cfg)
                if self.modes:
                    self.modes = [k for k in self.modes if self.avail.get(k, {}).get("ok")] or                                  [k for k in MODES if self.avail.get(k, {}).get("ok")]
        self.version += 1

    def total_rounds(self):
        c = self.cfg
        if c["per_mode"]:
            return min(MAX_ROUNDS, sum(c["mode_rounds"].get(k, 1) for k in self.modes))
        return self.rounds

    def plan_modes(self):
        c, ms = self.cfg, list(self.modes)
        if c["per_mode"]:
            seq = [k for k in ms for _ in range(c["mode_rounds"].get(k, 1))][:MAX_ROUNDS]
            return random.sample(seq, len(seq)) if c["order"] == "mix" else seq
        order = random.sample(ms, len(ms)) if c["order"] == "mix" else ms
        return [order[i % len(order)] for i in range(self.rounds)]

    def timing(self, t):
        """(czas rundy, krok): krok = czas etapu kadru / jednego aktora / tury licytacji."""
        mode, c = t["mode"], self.cfg
        if mode == "licytacja":
            return c["lic_answer"], c["lic_bid"]
        s = c["mode_time"].get(mode) or c["time"]
        if mode == "aktorzy":
            dur = s or ACTOR_SECONDS * len(t["cast"])
            return dur, round(dur / len(t["cast"]), 2)
        if mode == "top":
            return c["top_own"], c["top_guess"]
        if mode == "most":
            return s or c["most_time"], None
        dur = s or DURATION.get(mode, 30)
        return dur, (round(dur / 3, 2) if mode == "kadry" else None)

    def is_voice(self, mode):
        c = self.cfg
        return mode in VOICE_MODES and c["mode_answer"].get(mode, c["answer"]) == "voice"

    # --- przebieg
    def start(self):
        if self.kind != "most" and not self.modes:
            raise ValueError("no modes")
        used, self.plan = set(), []
        modes = self.plan_modes() if self.kind != "most" else ["most"] * self.rounds
        for mode in modes:
            t = self.make_task(mode, used)
            if t:
                t["dur"], t["step"] = self.timing(t)
                if mode == "top":
                    t["own_dur"], t["guess_dur"] = t["dur"], t["step"]
                    t["dur"] = t["own_dur"]
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
        if mode == "kadry":
            m = self.pick([x for x in ms if x["frames"]], used)
            return {"mode": mode, "movie": m}
        if mode == "zoom":
            m = self.pick([x for x in ms if x.get("zoom_frame") or x["frames"]], used)
            frame = m.get("zoom_frame") or (m["frames"][1] if m.get("frames") else None)
            return {"mode": mode, "movie": m, "frame": frame,
                    "ox": round(random.uniform(.3, .7), 3), "oy": round(random.uniform(.3, .7), 3)}
        if mode == "plakat":
            m = self.pick([x for x in ms if x["poster"]], used)
            return {"mode": mode, "movie": m, "style": random.choice(["pix", "tiles"]), "seed": random.randint(1, 10**6)}
        if mode == "aktorzy":
            m = self.pick([x for x in ms if len(x["cast"]) >= 3], used)
            raw = m["cast"][-MAX_ACTORS:]      # w bazie już w kolejności odsłaniania (gwiazda na końcu)
            return {"mode": mode, "movie": m, "cast": cast_view(raw)}
        if mode == "top":
            n = top_need(self.cfg)
            if len(ms) < n:
                return None
            items = random.sample(ms, n)
            return {"mode": mode, "items": items, "sub": "own", "own": {}, "guess": {}, "targets": {}}
        if mode == "most":
            import most
            pair = most.pick_pair(db.connect(), ms, lang="pl")
            return {"mode": mode, "start": pair["start"], "goal": pair["goal"],
                    "witness": pair.get("witness"), "paths": {}, "done_at": {}}
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
            qs = self.pack.get("questions") or []
            fresh = [q for q in qs if ("q", q["id"]) not in used] or qs
            q = random.choice(fresh) if fresh else fallback_question(ms)
            used.add(("q", q["id"]))
            return {"mode": mode, "q": q, "bids": [], "bidder": None, "bid": 0, "found": [], "type_end": None}
        return None

    @property
    def mode(self):
        return self.task["mode"] if self.task else None

    def duration(self):
        return self.task["dur"]

    def mult(self):
        return self.cfg["final_x"] if self.plan and self.round == len(self.plan) - 1 else 1

    def begin_round(self):
        t = self.task = self.plan[self.round]
        self.phase, self.t0 = "round", time.time()
        for p in self.players.values():
            p["got"], p["ans"], p["wrong"] = None, None, 0
        pl = list(self.players)
        t["voice"] = self.is_voice(t["mode"])
        t["judge0"] = pl[self.round % len(pl)] if pl else None     # sędzia rotuje co rundę
        if t["mode"] == "licytacja":
            s = random.randrange(len(pl)) if pl else 0
            t.update(order=pl[s:] + pl[:s], turn=0, passed=[], leader=None, bids=[], bid=0, bidder=None,
                     found=[], type_end=None, done_at=None, turn_end=self.t0 + t["step"])
        elif t["mode"] == "top":
            t.update(sub="own", own={}, guess={}, targets={})
            t["dur"] = t.get("own_dur") or self.cfg["top_own"]
        elif t["mode"] == "most":
            t.setdefault("paths", {})
            t.setdefault("done_at", {})
            for pid in pl:
                if pid not in t["paths"]:
                    t["paths"][pid] = [dict(t["start"])]
        elif t["voice"]:
            t.update(claims=[], peek=[])
        self.version += 1

    # --- sędziowanie (tryb "na głos")
    def online_ids(self):
        return [pid for pid, p in self.players.items() if self.on(p)]

    def judge(self):
        """Sędzia rundy (None = głosowanie). Rozłączony sędzia -> gospodarz -> pierwszy obecny."""
        if self.cfg["judge"] == "vote":
            return None
        j = self.host if self.cfg["judge"] == "host" else self.task.get("judge0")
        if not self.on(self.players.get(j)):
            j = self.host if self.on(self.players.get(self.host)) else next(iter(self.online_ids()), None)
        return j

    def voters(self, claimant):
        others = [pid for pid in self.online_ids() if pid != claimant]
        if not others:
            return [claimant]                  # gra solo: oceniasz się sam
        if self.cfg["judge"] == "vote":
            return others
        j = self.judge()
        return [j] if j and j != claimant else others

    def solo(self):
        return len(self.online_ids()) <= 1

    def plays(self, p):
        """Czy gracz zgaduje w tej rundzie na głos (sędzia nie zgaduje)."""
        t = self.task
        if p["id"] in t.get("peek", []):
            return False
        return self.cfg["judge"] == "vote" or self.solo() or p["id"] != self.judge()

    def pending(self, pid):
        return next((c for c in self.task.get("claims", []) if c["pid"] == pid and c["st"] == "wait"), None)

    def resolve(self, c):
        if c["pid"] not in self.players:
            c["st"] = "gone"
            return
        vs = self.voters(c["pid"])
        yes = sum(1 for v in vs if c["votes"].get(v) is True)
        no = sum(1 for v in vs if c["votes"].get(v) is False)
        if yes * 2 > len(vs):
            c["st"] = "ok"
            self.award(self.players[c["pid"]], c["el"])
        elif no * 2 >= len(vs) and no:
            c["st"] = "no"
            self.players[c["pid"]]["wrong"] += 1
            self.event("wrong", self.players[c["pid"]]["name"])

    def sees_solution(self, p):
        t = self.task
        if not p or not t.get("voice") or t["mode"] not in TITLE_MODES:
            return False
        if p["got"] or p["id"] in t["peek"]:
            return True
        if self.solo():
            return bool(self.pending(p["id"]))
        return self.cfg["judge"] != "vote" and p["id"] == self.judge()

    def lic_judge(self):
        t, b = self.task, self.task["bidder"]
        j = self.judge()
        if j is None or j == b:
            j = self.host if self.host != b and self.on(self.players.get(self.host)) else \
                next((pid for pid in self.online_ids() if pid != b), None)
        return j

    def can_count(self, p):
        t = self.task
        if not p or not t.get("voice") or not t["bidder"]:
            return False
        others = [pid for pid in self.online_ids() if pid != t["bidder"]]
        if not others:
            return p["id"] == t["bidder"]
        if self.cfg["judge"] == "vote":
            return p["id"] != t["bidder"]
        return p["id"] == self.lic_judge()

    # --- punkty
    def title_points(self, t, el):
        mode, step = t["mode"], t["step"]
        if mode == "kadry":
            stage = min(2, int(el // step))
            within = (el - stage * step) / step
            return int(STAGE_POINTS[stage] * (1 - 0.5 * min(1, within))), stage
        if mode == "aktorzy":
            k = min(len(t["cast"]), int(el // step) + 1)
            return max(250, 1000 - 150 * (k - 1)), k
        return int(1000 * (1 - 0.7 * min(1, el / t["dur"]))), 0

    def award(self, p, el):
        order = sum(1 for q in self.players.values() if q["got"])
        pts, stage = self.title_points(self.task, el)
        pts = (pts + (FIRST_BONUS if order == 0 else 0)) * self.mult()
        p["got"] = {"points": pts, "stage": stage, "secs": round(el, 1), "order": order + 1}
        p["score"] += pts
        self.event("guess", p["name"], pts)
        return pts

    def tick(self):
        now = time.time()
        if self.phase == "round":
            el, t, act = now - self.t0, self.task, self.active()
            if t["mode"] == "licytacja":
                if t["bidder"] is None:
                    self.lic_tick(now)
                elif now >= t["type_end"]:
                    self.end_round()
                elif not t["voice"] and len(t["found"]) >= t["bid"]:
                    self.end_round()
                elif t["voice"] and t["done_at"] and now >= t["done_at"] + LIC_DONE_DELAY:
                    self.end_round()
            elif t["voice"]:
                for c in t["claims"]:
                    if c["st"] == "wait":
                        self.resolve(c)
                if self.phase != "round":
                    return
                pend = [c for c in t["claims"] if c["st"] == "wait"]
                players = [p for p in act if self.plays(p)]
                if el >= self.duration() + JUDGE_GRACE:
                    for c in pend:
                        c["st"] = "late"
                    self.end_round()
                elif not pend and (el >= self.duration() or (players and all(p["got"] for p in players))):
                    self.end_round()
            elif t["mode"] == "top":
                if t.get("sub") == "own":
                    if el >= self.duration() or (act and all(p["id"] in t["own"] for p in act)):
                        self.top_to_guess()
                elif el >= self.duration() or (act and all(p["id"] in t["guess"] for p in act)):
                    self.end_round()
            elif t["mode"] == "most":
                if el >= self.duration() or (act and act and all(p["id"] in t.get("done_at", {}) for p in act)):
                    self.end_round()
            elif el >= self.duration() or (act and all(p["ans"] is not None or p["got"] for p in act)):
                self.end_round()
        elif self.phase == "reveal" and now - self.t0 >= REVEAL_SECONDS + (6 if self.mode in ("kolejnosc", "licytacja", "top", "most") else 0):
            self.next()

    # --- licytacja po kolei
    def lic_tick(self, now):
        t = self.task
        for _ in range(len(t["order"]) + 1):
            if self.phase != "round" or t["bidder"] is not None:
                return
            cur = t["order"][t["turn"]] if t["order"] else None
            p = self.players.get(cur)
            if cur is None:
                return self.lic_close()
            if p is None or not self.on(p) or now >= t["turn_end"]:
                self.lic_act(cur, None)            # czas minął / gracz wyszedł -> pas
            else:
                return

    def lic_act(self, pid, bid):
        t = self.task
        if bid is None:
            t["passed"].append(pid)
        else:
            t["bid"], t["leader"] = bid, pid
        t["bids"].append([pid, bid or 0])
        name = self.players[pid]["name"] if pid in self.players else "?"
        self.event("pass" if bid is None else "bid", name, bid)
        alive = [x for x in t["order"] if x not in t["passed"] and x in self.players]
        if not alive or alive == [t["leader"]] or (t["leader"] and t["bid"] >= len(t["q"]["answers"])):
            return self.lic_close()
        n = len(t["order"])
        for k in range(1, n + 1):
            j = (t["turn"] + k) % n
            if t["order"][j] in alive:
                t["turn"] = j
                break
        t["turn_end"] = time.time() + t["step"]

    def lic_close(self):
        t = self.task
        b = t["leader"] if t["leader"] in self.players else None
        if not b:
            t["bidder"] = ""
            return self.end_round()
        t.update(bidder=b, type_end=time.time() + t["dur"])
        self.event("bidwin", self.players[b]["name"], t["bid"])

    def end_round(self):
        t = self.task
        pts = {pid: (p["got"] or {}).get("points", 0) for pid, p in self.players.items()}
        x = self.mult()
        if t["mode"] == "rok":
            for pid, p in self.players.items():
                if p["ans"] is not None:
                    d = abs(int(p["ans"]) - t["movie"]["year"])
                    pts[pid] = (0 if d > 8 else int(round(1000 * 0.7 ** d))) * x
        elif t["mode"] == "kolejnosc":
            right = [m["id"] for m in sorted(t["items"], key=lambda m: m["year"])]
            for pid, p in self.players.items():
                if p["ans"]:
                    pts[pid] = 250 * sum(1 for a, b in zip(p["ans"], right) if a == b) * x
        elif t["mode"] == "licytacja" and t["bidder"]:
            t["success"] = len(t["found"]) >= t["bid"]
            for pid in self.players:
                if t["success"]:
                    pts[pid] = 200 * t["bid"] * x if pid == t["bidder"] else 0
                else:
                    pts[pid] = 0 if pid == t["bidder"] else 100 * t["bid"] * x
        elif t["mode"] == "top":
            self.top_lock_remaining()
            for pid, p in self.players.items():
                target = t["targets"].get(pid)
                guess, truth = t["guess"].get(pid), t["own"].get(target)
                pts[pid] = (top_score(guess, truth) * x) if guess and truth else 0
        elif t["mode"] == "most":
            import most
            finished = []
            for pid, at in (t.get("done_at") or {}).items():
                path = t.get("paths", {}).get(pid) or []
                if path and path[-1].get("kind") == "person" and int(path[-1]["id"]) == int(t["goal"]["id"]):
                    finished.append((at, pid, most.path_movies(path)))
            finished.sort()
            first_pid = finished[0][1] if finished else None
            for pid in self.players:
                path = t.get("paths", {}).get(pid) or []
                reached = bool(path and path[-1].get("kind") == "person" and int(path[-1]["id"]) == int(t["goal"]["id"]))
                pts[pid] = most.most_score(most.path_movies(path), reached, first=(pid == first_pid)) * x
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

    def top_lock_remaining(self):
        t = self.task
        default = [m["id"] for m in t["items"]]
        if t.get("sub") == "own" or not t.get("own"):
            for pid in self.players:
                t["own"].setdefault(pid, list(p["ans"] if (p := self.players.get(pid)) and p.get("ans") else default))
        if t.get("sub") == "guess":
            for pid, target in t.get("targets", {}).items():
                if pid not in t["guess"]:
                    t["guess"][pid] = list(t["own"].get(pid) or default)

    def top_to_guess(self):
        t = self.task
        default = [m["id"] for m in t["items"]]
        for pid in list(self.players):
            t["own"].setdefault(pid, list(self.players[pid]["ans"] or default))
            self.players[pid]["ans"] = None
        t["targets"] = top_assign(list(self.players))
        t["sub"] = "guess"
        t["dur"] = t.get("guess_dur") or self.cfg["top_guess"]
        self.t0 = time.time()
        self.version += 1
        if not t["targets"]:
            self.end_round()

    def most_answer(self, p, d):
        import most
        t = self.task
        if p["id"] in t.get("done_at", {}):
            return {"ok": False}
        path = t.setdefault("paths", {}).setdefault(p["id"], [dict(t["start"])])
        if d.get("undo"):
            if len(path) > 1:
                path.pop()
                self.version += 1
            return {"ok": True, "path": path}
        step = d.get("person") or d.get("movie") or d.get("step")
        if not step:
            return {"ok": False}
        kind = "person" if (d.get("person") or (isinstance(step, dict) and step.get("kind") == "person")) else "movie"
        if isinstance(step, dict):
            nxt = dict(step)
            nxt["kind"] = nxt.get("kind") or kind
        else:
            nxt = {"kind": kind, "id": int(step)}
        cur = path[-1]
        # lokalny fallback: sprawdź graf obsady, gdy brak TMDB
        key = db.tmdb_key()
        ok = False
        if key:
            try:
                con = db.connect()
                most.ensure_cache_table(con)
                ok = most.is_adjacent(con, key, cur, nxt)
                if ok and ("name" not in nxt and "title" not in nxt):
                    if nxt["kind"] == "person":
                        nxt = most.person_detail(con, key, nxt["id"])
                    else:
                        # dociągnij krótki widok z listy sąsiadów
                        for m in most.adjacent(con, key, cur):
                            if m["kind"] == nxt["kind"] and int(m["id"]) == int(nxt["id"]):
                                nxt = m
                                break
            except Exception as e:
                print("most step tmdb:", e)
                ok = False
        if not ok:
            # lokalny graf
            g = most.local_graph(self.movies)
            a = (cur["kind"], int(cur["id"]))
            b = (nxt["kind"], int(nxt["id"]))
            ok = b in (g.get(a) or [])
            if ok:
                meta = (g.get("_meta") or {}).get(b) or {}
                nxt = {**{"kind": b[0], "id": b[1]}, **meta}
        if not ok:
            return {"ok": False, "illegal": True}
        path.append(nxt)
        reached = nxt["kind"] == "person" and int(nxt["id"]) == int(t["goal"]["id"])
        if reached:
            t.setdefault("done_at", {})[p["id"]] = time.time()
            self.event("guess", p["name"])
        self.version += 1
        self.tick()
        return {"ok": True, "reached": reached, "path": path}

    # --- odpowiedzi
    def answer(self, p, d, lang):
        if self.phase != "round":
            return {"ok": False}
        t, el = self.task, time.time() - self.t0
        mode = t["mode"]
        if mode in TITLE_MODES and t["voice"]:
            if d.get("claim"):
                if p["got"] or self.pending(p["id"]) or el >= self.duration() or not self.plays(p):
                    return {"ok": False}
                t["claims"].append({"pid": p["id"], "el": round(el, 2), "st": "wait", "votes": {}})
                self.event("claim", p["name"])
                return {"ok": True}
            if d.get("peek"):
                if self.cfg["judge"] != "vote" or p["got"] or self.pending(p["id"]):
                    return {"ok": False}
                if p["id"] not in t["peek"]:
                    t["peek"].append(p["id"])
                self.version += 1
                self.tick()
                return {"ok": True}
            if d.get("judge"):
                c = self.pending(str(d.get("judge")))
                if not c or p["id"] not in self.voters(c["pid"]):
                    return {"ok": False}
                c["votes"][p["id"]] = bool(d.get("verdict"))
                self.resolve(c)
                self.version += 1
                self.tick()
                return {"ok": True, "state": c["st"]}
            return {"ok": False}
        if mode in TITLE_MODES:
            if p["got"]:
                return {"ok": False}
            text = str(d.get("text") or "")[:120]
            if movie_distance(text, t["movie"], lang) is None:
                p["wrong"] += 1
                self.version += 1
                return {"ok": True, "correct": False}
            pts = self.award(p, el)
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
            ans = t["q"]["answers"]
            if t["bidder"] is None:
                self.tick()
                if t["bidder"] is not None or self.phase != "round":
                    return {"ok": False}
                if t["order"][t["turn"]] != p["id"]:
                    return {"ok": False, "turn": False}
                if d.get("pass"):
                    self.lic_act(p["id"], None)
                    return {"ok": True}
                raw = _int(d.get("bid"), 1, len(ans), None)
                if raw is None:
                    raise ValueError("bid")
                if raw <= t["bid"]:
                    return {"ok": False, "low": True}
                self.lic_act(p["id"], raw)
                return {"ok": True}
            if t["voice"]:
                if not self.can_count(p):
                    return {"ok": False}
                f = t["found"]
                if "mark" in d:
                    i = _int(d.get("mark"), 0, len(ans) - 1, None)
                    if i is None:
                        return {"ok": False}
                    have = [k for k, x in enumerate(f) if x["i"] == i]
                    if have:
                        f.pop(have[0])
                    else:
                        f.append({"i": i, "text": ans[i]["text"], "pl": ans[i].get("pl") or ""})
                elif _int(d.get("count"), -1, 1, 0) > 0:
                    f.append({"i": None, "text": "", "pl": ""})
                elif _int(d.get("count"), -1, 1, 0) < 0 and f:
                    f.pop()
                else:
                    return {"ok": False}
                t["done_at"] = (t["done_at"] or time.time()) if len(f) >= t["bid"] else None
                self.version += 1
                self.tick()
                return {"ok": True, "count": len(f)}
            if p["id"] != t["bidder"]:
                return {"ok": False}
            text = str(d.get("text") or "")[:120]
            got = {f["i"] for f in t["found"]}
            i = best_answer(text, ans, [k for k in range(len(ans)) if k not in got])
            if i is None:
                dup = best_answer(text, ans, sorted(k for k in got if k is not None))
                t.setdefault("misses", 0)
                t["misses"] += 1
                self.version += 1
                return {"ok": True, "correct": False, "duplicate": dup is not None}
            t["found"].append({"i": i, "text": ans[i]["text"], "pl": ans[i].get("pl") or ""})
            self.version += 1
            self.tick()
            return {"ok": True, "correct": True, "title": ans[i]["text"]}
        if mode == "top":
            ids = [int(x) for x in d.get("order") or []]
            expect = sorted(m["id"] for m in t["items"])
            if sorted(ids) != expect:
                raise ValueError("order")
            bucket = "own" if t.get("sub") == "own" else "guess"
            if p["id"] in t[bucket]:
                return {"ok": False}
            t[bucket][p["id"]] = ids
            p["ans"] = ids
            self.event("answered", p["name"])
            self.tick()
            return {"ok": True}
        if mode == "most":
            return self.most_answer(p, d)
        return {"ok": False}

    # --- stan dla klienta
    @staticmethod
    def mview(m, lang, year=True):
        out = {"id": m["id"], "title": m["title"], "pl_title": m["pl_title"] if lang == "pl" else ""}
        if year:
            out["year"] = m["year"]
        return out

    @staticmethod
    def prompt(q, lang):
        return (q["prompt_en"] or q["prompt_pl"]) if lang == "en" else (q["prompt_pl"] or q["prompt_en"])

    @staticmethod
    def fview(f, lang):
        return {"title": f["text"], "pl_title": f.get("pl") if lang == "pl" else ""}

    @staticmethod
    def thumb(m):
        if m.get("frames"):
            return f"/frame/{m['frames'][2]}.jpg"
        if m.get("poster"):
            return f"/poster/{m['id']}.jpg"
        return None

    def pname(self, pid):
        return self.players[pid]["name"] if pid in self.players else None

    def state(self, me, lang="pl"):
        self.tick()
        now = time.time()
        players = sorted(self.players.values(), key=lambda p: (-p["score"], p["name"].lower()))
        t = self.task
        out = {
            "code": self.code, "phase": self.phase, "round": self.round + 1,
            "rounds": len(self.plan) if self.phase != "lobby" and self.plan else self.total_rounds(),
            "pack": {k: self.pack.get(k) for k in ("id", "name", "name_en", "slug", "color", "source_ids")
                     if k in self.pack or k in ("id", "name", "name_en", "slug", "color")},
            "kind": self.kind, "host": self.host, "me": me["id"] if me else None, "feed": self.feed[-6:],
            "stage_seconds": STAGE_SECONDS, "reveal_seconds": REVEAL_SECONDS,
            "modes": self.modes, "avail": self.avail, "all_modes": MODES if self.kind != "most" else ["most"],
            "min_top": top_need(self.cfg),
            "settings": self.cfg, "max_rounds": MAX_ROUNDS,
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
        out.update(mode=mode, voice=t["voice"], mult=self.mult())
        if self.phase == "round":
            out.update(elapsed=round(el, 2))
            if mode != "licytacja":
                out.update(duration=self.duration(), left=round(self.duration() - el, 1))
            if mode == "kadry":
                stage = min(2, int(el // t["step"]))
                out.update(stage=stage, frames=t["movie"]["frames"][:stage + 1], stage_seconds=t["step"])
            elif mode == "zoom":
                out.update(img=f"/frame/{t['frame']}.jpg", ox=t["ox"], oy=t["oy"])
            elif mode == "plakat":
                out.update(img=f"/poster/{t['movie']['id']}.jpg", style=t["style"], seed=t["seed"])
            elif mode == "aktorzy":
                k = min(len(t["cast"]), int(el // t["step"]) + 1)
                out.update(cast=t["cast"][:k], cast_total=len(t["cast"]), actor_seconds=t["step"])
            elif mode == "top":
                items = [dict(self.mview(m, lang), img=self.thumb(m)) for m in t["items"]]
                mine = (me and t.get("own" if t.get("sub") == "own" else "guess", {}).get(me["id"]))
                target = (me and t.get("targets", {}).get(me["id"]))
                out.update(sub=t.get("sub") or "own", items=items, mine=mine,
                           target={"id": target, "name": self.pname(target)} if target else None,
                           top_n=len(t["items"]),
                           score_hint="n-d")
            elif mode == "most":
                path = (me and t.get("paths", {}).get(me["id"])) or [t["start"]]
                cur = path[-1]
                out.update(start=t["start"], goal=t["goal"], path=path, current=cur,
                           finished=bool(me and me["id"] in t.get("done_at", {})))
            elif mode == "rok":
                out.update(movie=self.mview(t["movie"], lang, year=False), img=self.thumb(t["movie"]),
                           mine=me and me["ans"])
            elif mode == "kolejnosc":
                out.update(items=[dict(self.mview(m, lang, year=False), img=self.thumb(m)) for m in t["items"]],
                           mine=me and me["ans"])
            if mode in TITLE_MODES and t["voice"]:
                j = self.judge()
                vote = self.cfg["judge"] == "vote"
                mine = me and self.pending(me["id"])
                out.update(judge=None if vote else j, judge_name=None if vote else self.pname(j),
                           judge_mode=self.cfg["judge"], grace=JUDGE_GRACE,
                           claims=[{"pid": c["pid"], "name": self.pname(c["pid"]) or "?", "secs": round(c["el"], 1),
                                    "st": c["st"], "vote": c["votes"].get(me["id"]) if me else None,
                                    "can": bool(me and c["st"] == "wait" and me["id"] in self.voters(c["pid"]))}
                                   for c in t["claims"] if c["st"] in ("wait", "ok", "no")],
                           can_claim=bool(me and not me["got"] and not mine and el < self.duration() and self.plays(me)),
                           plays=bool(me and self.plays(me)),
                           can_peek=bool(me and vote and not me["got"] and not mine and me["id"] not in t["peek"]
                                         and not self.solo()),
                           solution={"title": t["movie"]["title"], "pl_title": t["movie"]["pl_title"],
                                     "year": t["movie"]["year"]} if self.sees_solution(me) else None)
            elif mode == "licytacja":
                ans = t["q"]["answers"]
                out.update(total=len(ans), prompt=self.prompt(t["q"], lang), bid_seconds=self.cfg["lic_bid"],
                           answer_seconds=t["dur"], bid=t["bid"],
                           history=[{"name": self.pname(pid) or "?", "bid": b} for pid, b in t["bids"]][-10:])
                if t["bidder"] is None:
                    cur = t["order"][t["turn"]] if t["order"] else None
                    out.update(sub="bid", turn=cur, turn_name=self.pname(cur),
                               starter=self.pname(t["order"][0]) if t["order"] else None,
                               leader=t["leader"], leader_name=self.pname(t["leader"]),
                               order=[{"id": pid, "name": self.players[pid]["name"], "passed": pid in t["passed"],
                                       "online": self.on(self.players[pid])} for pid in t["order"] if pid in self.players],
                               duration=t["step"], left=round(t["turn_end"] - now, 1),
                               elapsed=round(t["step"] - (t["turn_end"] - now), 2))
                else:
                    cc = self.can_count(me)
                    lj = None if self.cfg["judge"] == "vote" else self.lic_judge()
                    out.update(sub="type", bidder=t["bidder"], bidder_name=self.pname(t["bidder"]) or "?",
                               duration=t["dur"], left=round(t["type_end"] - now, 1),
                               elapsed=round(t["dur"] - (t["type_end"] - now), 2),
                               found=[self.fview(f, lang) for f in t["found"]], count=len(t["found"]),
                               misses=t.get("misses", 0), can_count=cc, counter_name=self.pname(lj),
                               closing=round(t["done_at"] + LIC_DONE_DELAY - now, 1) if t["done_at"] else None,
                               answers=[{"i": k, "title": a["text"], "pl_title": a.get("pl") or "",
                                         "found": any(f["i"] == k for f in t["found"])} for k, a in enumerate(ans)]
                               if cc else None)
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
        if mode == "top":
            by_id = {m["id"]: dict(self.mview(m, lang), img=self.thumb(m)) for m in t["items"]}
            def row(ids):
                return [by_id[i] for i in ids if i in by_id]
            ans["items"] = [by_id[m["id"]] for m in t["items"]]
            ans["tops"] = []
            for p in players:
                own = t["own"].get(p["id"])
                # kto zgadywał tę osobę
                guesser = next((g for g, tgt in t.get("targets", {}).items() if tgt == p["id"]), None)
                guessed = t["guess"].get(guesser) if guesser else None
                gname = self.pname(guesser) if guesser else None
                gpts = 0
                if guesser and guesser in self.players:
                    hist = self.players[guesser]["history"]
                    gpts = hist[-1] if hist else 0
                ans["tops"].append({
                    "id": p["id"], "name": p["name"], "own": row(own or []),
                    "guessed_by": gname, "guess": row(guessed or []),
                    "points": gpts,
                })
            if me:
                tgt = t.get("targets", {}).get(me["id"])
                ans["mine"] = {
                    "own": row(t["own"].get(me["id"]) or []),
                    "target": self.pname(tgt),
                    "guess": row(t["guess"].get(me["id"]) or []),
                    "truth": row(t["own"].get(tgt) or []),
                    "points": (me["history"][-1] if me["history"] else 0),
                }
        if mode == "most":
            import most
            ans.update(start=t["start"], goal=t["goal"])
            rows = []
            for p in players:
                path = t.get("paths", {}).get(p["id"]) or []
                reached = bool(path and path[-1].get("kind") == "person" and int(path[-1]["id"]) == int(t["goal"]["id"]))
                rows.append({"id": p["id"], "name": p["name"], "path": path,
                             "movies": most.path_movies(path), "reached": reached,
                             "points": p["history"][-1] if p["history"] else 0})
            ans["paths"] = rows
        if mode == "licytacja":
            got = {f["i"] for f in t["found"]}
            ans.update(bidder_name=self.pname(t["bidder"] or ""), bid=t["bid"],
                       success=t.get("success", False), total=len(t["q"]["answers"]), prompt=self.prompt(t["q"], lang),
                       missed=[self.fview({"text": a["text"], "pl": a.get("pl") or ""}, lang) for k, a in
                               enumerate(t["q"]["answers"]) if k not in got][:40],
                       bids=[{"name": self.pname(pid) or "?", "bid": b} for pid, b in t["bids"] if b],
                       found=[self.fview(f, lang) for f in t["found"] if f["i"] is not None], count=len(t["found"]))
        out["answer"] = ans
        return out
