"""db.py - schemat bazy quiz.db, pakiety startowe i import starej horror_quiz.db."""
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "quiz.db"
LEGACY_DB = BASE / "horror_quiz.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS packs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#F26B1D',
    cover_frame_id INTEGER,
    sort        INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS movies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id     INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    year        INTEGER,
    query       TEXT,                 -- własne zapytanie YouTube (opcjonalne)
    yt_url      TEXT,                 -- bezpośredni link YouTube (opcjonalny)
    video_id    TEXT,
    video_title TEXT,
    video_url   TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',   -- pending / ok / error
    error       TEXT,
    updated     REAL,
    UNIQUE (pack_id, title, year)
);
CREATE TABLE IF NOT EXISTS frames (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    ts_seconds  REAL,
    image       BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS frames_movie ON frames(movie_id);
CREATE TABLE IF NOT EXISTS picks (
    movie_id        INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
    easy_frame_id   INTEGER REFERENCES frames(id) ON DELETE SET NULL,
    medium_frame_id INTEGER REFERENCES frames(id) ON DELETE SET NULL,
    hard_frame_id   INTEGER REFERENCES frames(id) ON DELETE SET NULL
);
"""

HORRORS = [
    ("The Exorcist", 1973), ("Halloween", 1978), ("The Shining", 1980),
    ("A Nightmare on Elm Street", 1984), ("The Thing", 1982), ("Alien", 1979),
    ("Psycho", 1960), ("Hereditary", 2018), ("Midsommar", 2019), ("Get Out", 2017),
    ("The Conjuring", 2013), ("Insidious", 2010), ("Sinister", 2012), ("It", 2017),
    ("A Quiet Place", 2018), ("The Babadook", 2014), ("It Follows", 2014),
    ("The Witch", 2015), ("Scream", 1996), ("The Ring", 2002), ("Saw", 2004),
    ("The Texas Chain Saw Massacre", 1974), ("Poltergeist", 1982), ("The Omen", 1976),
    ("Rosemary's Baby", 1968), ("Smile", 2022), ("Barbarian", 2022),
    ("Talk to Me", 2022), ("The Descent", 2005), ("Train to Busan", 2016),
]
MARVEL = [
    ("Iron Man", 2008), ("The Incredible Hulk", 2008), ("Iron Man 2", 2010), ("Thor", 2011),
    ("Captain America: The First Avenger", 2011), ("The Avengers", 2012),
    ("Iron Man 3", 2013), ("Thor: The Dark World", 2013),
    ("Captain America: The Winter Soldier", 2014), ("Guardians of the Galaxy", 2014),
    ("Avengers: Age of Ultron", 2015), ("Ant-Man", 2015),
    ("Captain America: Civil War", 2016), ("Doctor Strange", 2016),
    ("Guardians of the Galaxy Vol. 2", 2017), ("Spider-Man: Homecoming", 2017),
    ("Thor: Ragnarok", 2017), ("Black Panther", 2018), ("Avengers: Infinity War", 2018),
    ("Captain Marvel", 2019), ("Avengers: Endgame", 2019), ("Spider-Man: Far From Home", 2019),
    ("Black Widow", 2021), ("Shang-Chi and the Legend of the Ten Rings", 2021),
    ("Spider-Man: No Way Home", 2021), ("Deadpool & Wolverine", 2024),
]
ACTION = [
    ("Die Hard", 1988), ("Terminator 2: Judgment Day", 1991), ("Speed", 1994),
    ("The Matrix", 1999), ("Gladiator", 2000), ("Kill Bill: Volume 1", 2003),
    ("The Bourne Ultimatum", 2007), ("The Dark Knight", 2008), ("Taken", 2008),
    ("Inception", 2010), ("The Raid", 2011), ("Skyfall", 2012),
    ("Edge of Tomorrow", 2014), ("John Wick", 2014), ("Mad Max: Fury Road", 2015),
    ("Mission: Impossible - Fallout", 2018), ("Top Gun: Maverick", 2022),
    ("Heat", 1995), ("Face/Off", 1997), ("Casino Royale", 2006),
]
SEED_PACKS = [
    ("horrory", "Horrory", "Klasyki i nowe koszmary. Zgadniesz po jednym kadrze?", "#E2541B", HORRORS,
     {("It", 2017): "IT 2017 official trailer Pennywise"}),
    ("marvel", "Marvel", "Kinowe uniwersum Marvela od Iron Mana do multiwersum.", "#C8262D", MARVEL, {}),
    ("akcja", "Akcja", "Wybuchy, pościgi i jedno zdanie przed walką.", "#F29A1D", ACTION, {}),
]
SEED_EN = {
    "horrory": ("Horror", "Classics and new nightmares. Can you name it from one shot?"),
    "marvel": ("Marvel", "The Marvel Cinematic Universe, from Iron Man to the multiverse."),
    "akcja": ("Action", "Explosions, car chases and one last line before the fight."),
}


def norm_title(t) -> str:
    """Klucz do wykrywania duplikatów: bez wielkości liter, ogonków, interpunkcji, 'the/a/an' i spacji."""
    t = str(t or "").replace("ł", "l").replace("Ł", "L")
    t = unicodedata.normalize("NFKD", t)
    t = "".join(c for c in t if not unicodedata.combining(c)).lower().replace("&", " and ")
    t = re.sub(r"[^a-z0-9]+", " ", t).strip()
    t = re.sub(r"^(the|a|an) ", "", t)
    return t.replace(" ", "")


def split_title_year(t, year=None):
    """'Shining (1980)' -> ('Shining', 1980), gdy rok nie podany osobno."""
    t = str(t or "").strip()
    m = re.fullmatch(r"(.+?)\s*[\(\[]?\s*((?:19|20)\d\d)\s*[\)\]]?", t)
    if m and not year:
        return m[1].strip(" -,"), int(m[2])
    return t, (int(year) if year else None)


def find_duplicate(con, pack_id, title, year, exclude_id=None):
    """Zwraca istniejący wiersz, jeśli film już jest w pakiecie (ten sam tytuł; rok zgodny albo nie podany)."""
    n = norm_title(title)
    for r in con.execute("SELECT id,title,year FROM movies WHERE pack_id=? AND norm_title=?", (pack_id, n)):
        if r["id"] == exclude_id:
            continue
        if year is None or r["year"] is None or int(r["year"]) == int(year):
            return r
    return None


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.replace("ł", "l").replace("Ł", "L"))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-") or "pakiet"


def connect(path=None) -> sqlite3.Connection:
    con = sqlite3.connect(path or DB_PATH, timeout=30, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def _cols(con, table):
    return {r[1] for r in con.execute(f"PRAGMA table_info({table})")}


def migrate(con):
    """Dokłada nowe kolumny, uzupełnia klucze tytułów i usuwa duplikaty (zostaje wiersz z kadrami/wyborami)."""
    with con:
        pc = _cols(con, "packs")
        for c in ("name_en", "description_en"):
            if c not in pc:
                con.execute(f"ALTER TABLE packs ADD COLUMN {c} TEXT NOT NULL DEFAULT ''")
        mc = _cols(con, "movies")
        if "norm_title" not in mc:
            con.execute("ALTER TABLE movies ADD COLUMN norm_title TEXT")
        if "tried_ids" not in mc:
            con.execute("ALTER TABLE movies ADD COLUMN tried_ids TEXT NOT NULL DEFAULT ''")
        for slug, (n, d) in SEED_EN.items():
            con.execute("UPDATE packs SET name_en=? WHERE slug=? AND name_en=''", (n, slug))
            con.execute("UPDATE packs SET description_en=? WHERE slug=? AND description_en=''", (d, slug))
        for r in con.execute("SELECT id,title FROM movies").fetchall():
            con.execute("UPDATE movies SET norm_title=? WHERE id=?", (norm_title(r["title"]), r["id"]))
        removed = dedupe(con)
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS movies_norm_unique ON movies(pack_id, norm_title, IFNULL(year, -1))")
    if removed:
        print(f"Usunięto {removed} zduplikowanych filmów.")


def dedupe(con) -> int:
    rows = con.execute("""SELECT m.id, m.pack_id, m.norm_title, m.year, m.status,
        (SELECT COUNT(*) FROM frames f WHERE f.movie_id=m.id) nf,
        (SELECT COUNT(*) FROM picks p WHERE p.movie_id=m.id) np FROM movies m ORDER BY m.id""").fetchall()
    groups = {}
    for r in rows:
        groups.setdefault((r["pack_id"], r["norm_title"]), []).append(r)
    removed = 0
    for items in groups.values():
        if len(items) < 2:
            continue
        years = {r["year"] for r in items if r["year"] is not None}
        buckets = {y: [r for r in items if r["year"] == y] for y in years} or {None: list(items)}
        if years:  # wiersz bez roku łączy się z jedynym rokiem, a przy kilku - z pierwszym
            first = sorted(years)[0]
            buckets[first] += [r for r in items if r["year"] is None]
        for b in buckets.values():
            if len(b) < 2:
                continue
            b.sort(key=lambda r: (r["np"], r["nf"], r["status"] == "ok", -r["id"]), reverse=True)
            for r in b[1:]:
                con.execute("DELETE FROM movies WHERE id=?", (r["id"],))
                removed += 1
    return removed


def init_db(path=None, seed=True) -> sqlite3.Connection:
    con = connect(path)
    con.executescript(SCHEMA)
    migrate(con)
    if seed and not con.execute("SELECT 1 FROM packs LIMIT 1").fetchone():
        with con:
            for i, (slug, name, desc, color, movies, overrides) in enumerate(SEED_PACKS):
                en = SEED_EN.get(slug, ("", ""))
                pid = con.execute("INSERT INTO packs (slug,name,description,color,sort,name_en,description_en) "
                                  "VALUES (?,?,?,?,?,?,?)", (slug, name, desc, color, i, en[0], en[1])).lastrowid
                seen = set()
                for t, y in movies:
                    if (norm_title(t), y) in seen:
                        continue
                    seen.add((norm_title(t), y))
                    con.execute("INSERT OR IGNORE INTO movies (pack_id,title,year,query,norm_title) VALUES (?,?,?,?,?)",
                                (pid, t, y, overrides.get((t, y)), norm_title(t)))
        if (path is None) and LEGACY_DB.exists():
            import_legacy(con, LEGACY_DB)
    return con


def import_legacy(con: sqlite3.Connection, legacy: Path) -> int:
    """Przenosi filmy/kadry/wybory ze starej horror_quiz.db do pakietu Horrory."""
    old = sqlite3.connect(legacy)
    old.row_factory = sqlite3.Row
    pack = con.execute("SELECT id FROM packs WHERE slug='horrory'").fetchone()
    pack_id = pack["id"] if pack else con.execute(
        "INSERT INTO packs (slug,name,color) VALUES ('horrory','Horrory','#E2541B')").lastrowid
    n = 0
    with con:
        for m in old.execute("SELECT * FROM movies"):
            row = find_duplicate(con, pack_id, m["title"], m["year"])
            if row:
                row = con.execute("SELECT id, status FROM movies WHERE id=?", (row["id"],)).fetchone()
            if row and row["status"] == "ok":
                continue
            if row:
                mid = row["id"]
                con.execute("DELETE FROM frames WHERE movie_id=?", (mid,))
            else:
                mid = con.execute("INSERT INTO movies (pack_id,title,year,norm_title) VALUES (?,?,?,?)",
                                  (pack_id, m["title"], m["year"], norm_title(m["title"]))).lastrowid
            con.execute("UPDATE movies SET video_id=?,video_title=?,video_url=?,status=?,error=?,updated=? WHERE id=?",
                        (m["video_id"], m["video_title"], m["video_url"], m["status"], m["error"], time.time(), mid))
            idmap = {}
            for f in old.execute("SELECT * FROM frames WHERE movie_id=? ORDER BY position", (m["id"],)):
                idmap[f["id"]] = con.execute(
                    "INSERT INTO frames (movie_id,position,ts_seconds,image) VALUES (?,?,?,?)",
                    (mid, f["position"], f["ts_seconds"], f["image"])).lastrowid
            p = old.execute("SELECT * FROM picks WHERE movie_id=?", (m["id"],)).fetchone()
            if p:
                con.execute("INSERT OR REPLACE INTO picks VALUES (?,?,?,?)",
                            (mid, idmap.get(p["easy_frame_id"]), idmap.get(p["medium_frame_id"]),
                             idmap.get(p["hard_frame_id"])))
            n += 1
    old.close()
    print(f"Zaimportowano {n} filmów ze starej bazy {legacy.name} do pakietu Horrory.")
    return n


def game_frames(con, movie_id):
    """Zwraca (hard, medium, easy) id kadrów - z wyborów admina albo sensowny zapas."""
    p = con.execute("SELECT * FROM picks WHERE movie_id=?", (movie_id,)).fetchone()
    ids = [r["id"] for r in con.execute("SELECT id FROM frames WHERE movie_id=? ORDER BY position", (movie_id,))]
    if len(ids) < 3:
        return None
    if p and p["hard_frame_id"] and p["medium_frame_id"] and p["easy_frame_id"]:
        return [p["hard_frame_id"], p["medium_frame_id"], p["easy_frame_id"]]
    # zapas: kadry z początku trailera są zwykle trudniejsze, z końca bardziej "plakatowe"
    rest = [i for i in ids if not p or i not in (p["hard_frame_id"], p["medium_frame_id"], p["easy_frame_id"])]
    hard = (p and p["hard_frame_id"]) or rest[0]
    easy = (p and p["easy_frame_id"]) or rest[-1]
    medium = (p and p["medium_frame_id"]) or rest[len(rest) // 2]
    return [hard, medium, easy]
