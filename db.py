"""db.py - schemat bazy quiz.db, pakiety startowe i import starej horror_quiz.db."""
import os
import re
import sqlite3
import time
import unicodedata
from pathlib import Path

BASE = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("QUIZ_DB") or BASE / "quiz.db")
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
CREATE TABLE IF NOT EXISTS posters (
    movie_id INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
    image BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS picks (
    movie_id        INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
    easy_frame_id   INTEGER REFERENCES frames(id) ON DELETE SET NULL,
    medium_frame_id INTEGER REFERENCES frames(id) ON DELETE SET NULL,
    hard_frame_id   INTEGER REFERENCES frames(id) ON DELETE SET NULL
);
"""

SCHEMA4 = """
CREATE TABLE IF NOT EXISTS quotes (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
    text     TEXT NOT NULL,
    lang     TEXT NOT NULL DEFAULT ''          -- '', 'pl' albo 'en'
);
CREATE INDEX IF NOT EXISTS quotes_movie ON quotes(movie_id);
CREATE TABLE IF NOT EXISTS questions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id   INTEGER NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    prompt_pl TEXT NOT NULL DEFAULT '',
    prompt_en TEXT NOT NULL DEFAULT '',
    answers   TEXT NOT NULL DEFAULT '[]',     -- JSON: [{"text": "...", "aliases": ["..."]}]
    created   REAL
);
CREATE INDEX IF NOT EXISTS questions_pack ON questions(pack_id);
"""

SCHEMA5 = """
CREATE TABLE IF NOT EXISTS actor_photos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    key       TEXT NOT NULL UNIQUE,
    name      TEXT NOT NULL DEFAULT '',
    source    TEXT NOT NULL DEFAULT '',
    source_id TEXT NOT NULL DEFAULT '',
    image     BLOB NOT NULL,
    url       TEXT NOT NULL DEFAULT '',
    updated   REAL
);
CREATE INDEX IF NOT EXISTS actor_photos_name ON actor_photos(name);
"""

# Hot buzz: krótki fragment muzyki z filmu (mp3), trzymany w bazie jak kadry
SCHEMA6 = """
CREATE TABLE IF NOT EXISTS music (
    movie_id    INTEGER PRIMARY KEY REFERENCES movies(id) ON DELETE CASCADE,
    audio       BLOB NOT NULL,
    mime        TEXT NOT NULL DEFAULT 'audio/mpeg',
    start_s     REAL,
    dur         REAL,
    video_id    TEXT NOT NULL DEFAULT '',
    video_title TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    updated     REAL
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
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
        # faza 3: polskie tytuły, aliasy, cytaty, dane z TMDB
        for c in ("pl_title", "aliases", "quotes", "cast_json"):
            if c not in mc:
                con.execute(f"ALTER TABLE movies ADD COLUMN {c} TEXT NOT NULL DEFAULT ''")
        if "tmdb_id" not in mc:
            con.execute("ALTER TABLE movies ADD COLUMN tmdb_id INTEGER")
        # faza 4: identyfikatory IMDb/Filmweb, źródła danych, cytaty i pytania licytacji
        for c, typ in (("imdb_id", "TEXT"), ("filmweb_id", "INTEGER"), ("cast_source", "TEXT")):
            if c not in mc:
                con.execute(f"ALTER TABLE movies ADD COLUMN {c} {typ}")
        poc = _cols(con, "posters")
        for c in ("source", "url"):
            if c not in poc:
                con.execute(f"ALTER TABLE posters ADD COLUMN {c} TEXT NOT NULL DEFAULT ''")
        if "updated" not in poc:
            con.execute("ALTER TABLE posters ADD COLUMN updated REAL")
        con.executescript(SCHEMA4)
        con.executescript(SCHEMA5)
        # stare cytaty (kolumna movies.quotes, jeden w linii) -> tabela quotes, jednorazowo
        for r in con.execute("SELECT id, quotes FROM movies WHERE quotes<>''").fetchall():
            for q in split_list(r["quotes"]):
                con.execute("INSERT INTO quotes (movie_id, text, lang) VALUES (?,?,'')", (r["id"], q))
            con.execute("UPDATE movies SET quotes='' WHERE id=?", (r["id"],))
        if "modes_off" not in pc:
            con.execute("ALTER TABLE packs ADD COLUMN modes_off TEXT NOT NULL DEFAULT ''")
        pkc = _cols(con, "picks")
        if "zoom_frame_id" not in pkc:
            con.execute("ALTER TABLE picks ADD COLUMN zoom_frame_id INTEGER REFERENCES frames(id) ON DELETE SET NULL")
        fc = _cols(con, "frames")
        if "kind" not in fc:
            con.execute("ALTER TABLE frames ADD COLUMN kind TEXT NOT NULL DEFAULT 'kadry'")
        # faza 7: Bomba (kategorie w tabeli questions z kind='bomba') i Hot buzz (muzyka)
        qc = _cols(con, "questions")
        if "kind" not in qc:
            con.execute("ALTER TABLE questions ADD COLUMN kind TEXT NOT NULL DEFAULT 'licytacja'")
        mc = _cols(con, "movies")
        if "music_on" not in mc:
            con.execute("ALTER TABLE movies ADD COLUMN music_on INTEGER NOT NULL DEFAULT 0")
        for c in ("music_url", "music_error"):
            if c not in mc:
                con.execute(f"ALTER TABLE movies ADD COLUMN {c} TEXT NOT NULL DEFAULT ''")
        con.executescript(SCHEMA6)
        seed_bombs(con)
        con.execute("CREATE TABLE IF NOT EXISTS tmdb_cache ("
                    "key TEXT PRIMARY KEY, body TEXT NOT NULL, updated REAL)")
        for slug, (n, d) in SEED_EN.items():
            con.execute("UPDATE packs SET name_en=? WHERE slug=? AND name_en=''", (n, slug))
            con.execute("UPDATE packs SET description_en=? WHERE slug=? AND description_en=''", (d, slug))
        for r in con.execute("SELECT id,title FROM movies").fetchall():
            con.execute("UPDATE movies SET norm_title=? WHERE id=?", (norm_title(r["title"]), r["id"]))
        removed = dedupe(con)
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS movies_norm_unique ON movies(pack_id, norm_title, IFNULL(year, -1))")
    if removed:
        print(f"Usunięto {removed} zduplikowanych filmów.")


# ---------------------------------------------------------------- Bomba: domyślne kategorie
# (PL, EN, przykładowe odpowiedzi dla gospodarza - jedna na linię). Gracze mówią tytuły na głos,
# gospodarz klika "dobra"/"zła", więc przykłady to tylko ściąga, nie zamknięta lista.
BOMB_SEEDS = {
    "horror": [
        ("Horrory z duchami", "Horror films with ghosts", "The Conjuring\nInsidious\nThe Others\nPoltergeist\nThe Ring"),
        ("Horrory o opętaniu", "Horror films about possession", "The Exorcist\nThe Conjuring\nThe Exorcism of Emily Rose\nInsidious"),
        ("Horrory z zabójcą w masce", "Horror films with a masked killer", "Halloween\nScream\nFriday the 13th\nThe Texas Chain Saw Massacre\nThe Strangers"),
        ("Horrory o nawiedzonym domu", "Haunted house horror films", "The Conjuring\nPoltergeist\nThe Amityville Horror\nThe Others\nInsidious"),
        ("Horrory z przerażającym dzieckiem", "Horror films with a creepy child", "The Omen\nThe Exorcist\nThe Ring\nOrphan"),
        ("Horrory z potworem albo kosmitą", "Horror films with a monster or an alien", "Alien\nThe Thing\nA Quiet Place\nThe Descent"),
        ("Horrory z 2010 roku i nowsze", "Horror films from 2010 or later", "Get Out\nHereditary\nIt Follows\nThe Babadook\nSmile"),
    ],
    "marvel": [
        ("Filmy z Iron Manem", "Films featuring Iron Man", "Iron Man\nThe Avengers\nCaptain America: Civil War\nSpider-Man: Homecoming\nAvengers: Endgame"),
        ("Filmy z Kapitanem Ameryką", "Films featuring Captain America", "Captain America: The First Avenger\nThe Avengers\nCaptain America: The Winter Soldier\nAvengers: Endgame"),
        ("Filmy z Thorem", "Films featuring Thor", "Thor\nThor: The Dark World\nThor: Ragnarok\nThe Avengers\nAvengers: Infinity War"),
        ("Filmy, w których pojawia się Spider-Man", "Films where Spider-Man appears", "Captain America: Civil War\nSpider-Man: Homecoming\nAvengers: Infinity War\nSpider-Man: No Way Home"),
        ("Filmy z Kamieniem Nieskończoności", "Films featuring an Infinity Stone", "Captain America: The First Avenger\nThe Avengers\nGuardians of the Galaxy\nDoctor Strange\nAvengers: Infinity War"),
        ("Filmy Marvela z liczbą w tytule", "Marvel films with a number in the title", "Iron Man 2\nIron Man 3\nGuardians of the Galaxy Vol. 2\nDeadpool 2"),
    ],
    "action": [
        ("Filmy akcji z Tomem Cruise'em", "Action films starring Tom Cruise", "Top Gun: Maverick\nMission: Impossible - Fallout\nEdge of Tomorrow\nJack Reacher\nCollateral"),
        ("Filmy o Jamesie Bondzie", "James Bond films", "Skyfall\nCasino Royale\nGoldenEye\nSpectre\nNo Time to Die"),
        ("Filmy akcji z Keanu Reevesem", "Action films starring Keanu Reeves", "The Matrix\nJohn Wick\nSpeed\nPoint Break"),
        ("Filmy akcji z pościgiem samochodowym", "Action films with a car chase", "Mad Max: Fury Road\nBaby Driver\nRonin\nThe French Connection"),
        ("Filmy akcji z lat 80. i 90.", "Action films from the 80s and 90s", "Die Hard\nTerminator 2: Judgment Day\nSpeed\nHeat\nFace/Off"),
        ("Filmy akcji o zemście", "Revenge action films", "John Wick\nKill Bill: Volume 1\nGladiator\nMan on Fire"),
    ],
    "animation": [
        ("Filmy Pixara", "Pixar films", "Toy Story\nFinding Nemo\nUp\nInside Out\nCoco"),
        ("Filmy DreamWorks Animation", "DreamWorks Animation films", "Shrek\nKung Fu Panda\nMadagascar\nHow to Train Your Dragon"),
        ("Animacje z gadającymi zwierzętami", "Animated films with talking animals", "The Lion King\nZootopia\nMadagascar\nKung Fu Panda\nFinding Nemo"),
        ("Animacje Disneya z księżniczką", "Disney animated films with a princess", "Frozen\nMoana\nTangled\nThe Little Mermaid\nMulan"),
        ("Animacje, które mają sequel", "Animated films that have a sequel", "Toy Story\nShrek\nFrozen\nFinding Nemo\nInside Out"),
    ],
    "thriller": [
        ("Thrillery z seryjnym mordercą", "Thrillers with a serial killer", "Se7en\nThe Silence of the Lambs\nZodiac\nMemories of Murder"),
        ("Filmy Davida Finchera", "David Fincher films", "Se7en\nFight Club\nZodiac\nGone Girl\nThe Social Network"),
        ("Thrillery z twistem na końcu", "Thrillers with a twist ending", "The Sixth Sense\nShutter Island\nFight Club\nThe Usual Suspects\nMemento"),
        ("Filmy Alfreda Hitchcocka", "Alfred Hitchcock films", "Psycho\nVertigo\nRear Window\nThe Birds\nNorth by Northwest"),
        ("Thrillery o porwaniu", "Kidnapping thrillers", "Prisoners\nTaken\nGone Baby Gone\nSplit\nRansom"),
    ],
    "scifi": [
        ("Filmy o kosmitach", "Films about aliens", "Alien\nArrival\nIndependence Day\nE.T. the Extra-Terrestrial\nDistrict 9"),
        ("Filmy o podróżach w czasie", "Time travel films", "Back to the Future\nTerminator 2: Judgment Day\nLooper\nEdge of Tomorrow\n12 Monkeys"),
        ("Filmy o robotach albo sztucznej inteligencji", "Films about robots or artificial intelligence", "Ex Machina\nThe Terminator\nBlade Runner\nI, Robot\nWALL-E"),
        ("Filmy, których akcja dzieje się w kosmosie", "Films set in space", "Gravity\nInterstellar\nThe Martian\nAlien\n2001: A Space Odyssey"),
        ("Filmy Christophera Nolana", "Christopher Nolan films", "Inception\nInterstellar\nTenet\nThe Prestige\nMemento"),
    ],
    "generic": [
        ("Filmy z liczbą w tytule", "Films with a number in the title", "2001: A Space Odyssey\nThe Sixth Sense\n12 Angry Men\n21 Jump Street"),
        ("Filmy z imieniem bohatera w tytule", "Films with a character's name in the title", "Forrest Gump\nJohn Wick\nRocky\nAmélie"),
        ("Filmy z kolorem w tytule", "Films with a colour in the title", "The Green Mile\nBlack Panther\nBlue Velvet\nThe Color Purple"),
        ("Filmy, które dostały Oscara za najlepszy film", "Best Picture Oscar winners", "Gladiator\nThe Silence of the Lambs\nParasite\nTitanic\nOppenheimer"),
    ],
    "pack": [
        ("Filmy z tego pakietu z jednowyrazowym tytułem", "Films from this pack with a one-word title", ""),
        ("Filmy z tego pakietu sprzed 2000 roku", "Films from this pack released before 2000", ""),
    ],
}
BOMB_KEYWORDS = [("horror", ("horror",)), ("marvel", ("marvel", "mcu")), ("action", ("akcj", "action")),
                 ("animation", ("anim", "pixar", "disney", "dreamworks")), ("thriller", ("thriller",)),
                 ("scifi", ("sci-fi", "scifi", "sci fi", "science fiction", "fantastyka"))]


def bomb_seed_group(pack) -> str:
    text = " ".join(str(pack[k] or "") for k in ("slug", "name", "name_en") if k in pack.keys()).lower()
    for group, words in BOMB_KEYWORDS:
        if any(w in text for w in words):
            return group
    return "generic"


def seed_bombs(con):
    """Jednorazowo na pakiet: domyślne kategorie Bomby (PL+EN). Znacznik w meta, więc usunięte nie wracają."""
    import json
    for p in con.execute("SELECT * FROM packs").fetchall():
        key = f"bomb_seed:{p['id']}"
        if con.execute("SELECT 1 FROM meta WHERE k=?", (key,)).fetchone():
            continue
        if not con.execute("SELECT 1 FROM questions WHERE pack_id=? AND kind='bomba'", (p["id"],)).fetchone():
            group = bomb_seed_group(p)
            rows = BOMB_SEEDS[group] + BOMB_SEEDS["pack"] + (BOMB_SEEDS["generic"][:2] if group != "generic" else [])
            for pl, en, ex in rows:
                con.execute("INSERT INTO questions (pack_id, prompt_pl, prompt_en, answers, created, kind) "
                            "VALUES (?,?,?,?,?, 'bomba')",
                            (p["id"], pl, en, json.dumps(parse_answers(ex), ensure_ascii=False), time.time()))
        con.execute("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", (key, str(int(time.time()))))


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
        with con:
            seed_bombs(con)
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
                upsert_picks(con, mid,
                             easy=idmap.get(p["easy_frame_id"]),
                             medium=idmap.get(p["medium_frame_id"]),
                             hard=idmap.get(p["hard_frame_id"]),
                             zoom=idmap.get(p["zoom_frame_id"]) if "zoom_frame_id" in p.keys() else None)
            n += 1
    old.close()
    print(f"Zaimportowano {n} filmów ze starej bazy {legacy.name} do pakietu Horrory.")
    return n


def save_music(con, movie_id, audio, *, start_s=None, dur=None, video_id="", video_title="", url="", mime="audio/mpeg"):
    con.execute("INSERT INTO music (movie_id, audio, mime, start_s, dur, video_id, video_title, url, updated) "
                "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(movie_id) DO UPDATE SET audio=excluded.audio, mime=excluded.mime, "
                "start_s=excluded.start_s, dur=excluded.dur, video_id=excluded.video_id, video_title=excluded.video_title, "
                "url=excluded.url, updated=excluded.updated",
                (movie_id, audio, mime, start_s, dur, video_id or "", video_title or "", url or "", time.time()))


def kadry_frame_ids(con, movie_id):
    """Kadry do trybu Kadry (bez kadrów wgranych specjalnie do Zoomu)."""
    return [r["id"] for r in con.execute(
        "SELECT id FROM frames WHERE movie_id=? AND IFNULL(kind,'kadry')!='zoom' ORDER BY position", (movie_id,))]


def game_frames(con, movie_id):
    """Zwraca (hard, medium, easy) id kadrów - z wyborów admina albo sensowny zapas."""
    p = con.execute("SELECT * FROM picks WHERE movie_id=?", (movie_id,)).fetchone()
    ids = kadry_frame_ids(con, movie_id)
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


def game_zoom_frame(con, movie_id):
    """Kadr do Zoomu: wybór admina albo zapas (środkowy kadr z Kadry)."""
    p = con.execute("SELECT * FROM picks WHERE movie_id=?", (movie_id,)).fetchone()
    zid = p["zoom_frame_id"] if p and "zoom_frame_id" in p.keys() else None
    if zid:
        row = con.execute("SELECT id FROM frames WHERE id=? AND movie_id=?", (zid, movie_id)).fetchone()
        if row:
            return row["id"]
    fr = game_frames(con, movie_id)
    return fr[1] if fr else None


def upsert_picks(con, movie_id, **fields):
    """Aktualizuje wybory kadrów. Klucze: easy, medium, hard, zoom (None kasuje pole, brak klucza zostawia)."""
    allowed = {"easy": "easy_frame_id", "medium": "medium_frame_id", "hard": "hard_frame_id", "zoom": "zoom_frame_id"}
    row = con.execute("SELECT * FROM picks WHERE movie_id=?", (movie_id,)).fetchone()
    vals = {}
    for col in allowed.values():
        vals[col] = row[col] if row and col in row.keys() else None
    for k, col in allowed.items():
        if k in fields:
            vals[col] = fields[k]
    con.execute(
        "INSERT INTO picks (movie_id, easy_frame_id, medium_frame_id, hard_frame_id, zoom_frame_id) "
        "VALUES (?,?,?,?,?) ON CONFLICT(movie_id) DO UPDATE SET "
        "easy_frame_id=excluded.easy_frame_id, medium_frame_id=excluded.medium_frame_id, "
        "hard_frame_id=excluded.hard_frame_id, zoom_frame_id=excluded.zoom_frame_id",
        (movie_id, vals["easy_frame_id"], vals["medium_frame_id"], vals["hard_frame_id"], vals["zoom_frame_id"]))


# ---------------------------------------------------------- lokalna konfiguracja (poza gitem)
CONFIG_PATH = BASE / "config.local.json"


def get_config() -> dict:
    import json
    try:
        return json.loads(CONFIG_PATH.read_text("utf-8"))
    except (OSError, ValueError):
        return {}


def set_config(**kw):
    import json
    c = get_config()
    c.update(kw)
    c = {k: v for k, v in c.items() if v not in (None, "")}
    CONFIG_PATH.write_text(json.dumps(c, indent=2), "utf-8")
    try:
        os.chmod(CONFIG_PATH, 0o600)
    except OSError:
        pass


def tmdb_key() -> str:
    return os.environ.get("TMDB_API_KEY") or get_config().get("tmdb_key", "")


def split_list(s) -> list:
    """Aliasy / cytaty: jeden na linię (aliasy można też rozdzielać średnikiem)."""
    return [x.strip() for x in str(s or "").replace("\r", "").split("\n") if x.strip()]


def split_aliases(s) -> list:
    return [x.strip() for x in re.split(r"[\n;]", str(s or "")) if x.strip()]


def actor_photo_key(source="", source_id="", name=""):
    sid = str(source_id or "").strip()
    if source and sid:
        return f"{source}:{sid}"
    n = norm_title(name)
    return f"name:{n}" if n else ""


def shrink_headshot(data, max_edge=256, quality=80):
    """Mały JPEG (headshot). Pillow jest opcjonalny: bez niego zapisujemy oryginał, jeśli mieści się w 150 KB."""
    if not data:
        raise ValueError("empty image")
    try:
        from io import BytesIO
        from PIL import Image
        im = Image.open(BytesIO(data))
        im = im.convert("RGB")
        im.thumbnail((max_edge, int(max_edge * 1.35)))
        buf = BytesIO()
        im.save(buf, "JPEG", quality=quality, optimize=True)
        out = buf.getvalue()
        if out:
            return out
    except Exception:
        pass
    if len(data) <= 400_000:
        return data
    raise ValueError("photo too large (zainstaluj Pillow, żeby je zmniejszyć)")



def photo_row_ok(con, photo_id):
    """Czy photo_id wskazuje na prawdziwy zapisany obrazek (nie placeholder)."""
    if not photo_id:
        return False
    try:
        row = con.execute("SELECT image FROM actor_photos WHERE id=?", (int(photo_id),)).fetchone()
    except Exception:
        return False
    if not row:
        return False
    try:
        import webscrape
        return webscrape.is_real_headshot(row["image"])
    except Exception:
        return bool(row["image"] and len(row["image"]) >= 800)

def enrich_cast_photos(con, cast):
    """Dodaje photo_ok i photo_reason do listy obsady, bez ustawiania fałszywego photo_id."""
    out = []
    for c in cast or []:
        if not isinstance(c, dict):
            out.append(c)
            continue
        rec = dict(c)
        pid = rec.get("photo_id")
        url = rec.get("photo_url") or rec.get("url") or ""
        if pid and photo_row_ok(con, pid):
            rec["photo_ok"] = True
            rec["photo_reason"] = ""
        else:
            rec["photo_ok"] = False
            if pid:
                rec["photo_reason"] = "zdjęcie nie zapisane"
                rec.pop("photo_id", None)
            elif url and ("t.gif" in url or "front/assets" in url):
                rec["photo_reason"] = "placeholder Filmweb"
            elif not url:
                rec["photo_reason"] = "brak zdjęcia"
            else:
                rec["photo_reason"] = "nie udało się pobrać"
        out.append(rec)
    return out

def save_actor_photo(con, *, key, name, source="", source_id="", image=None, url=""):
    """Zapisuje zdjęcie aktora z deduplikacją po kluczu źródła albo znormalizowanym imieniu. Zwraca id."""
    name = (name or "").strip()[:80]
    key = (key or actor_photo_key(source, source_id, name) or "").strip()
    if not key or not image:
        raise ValueError("actor photo key/image required")
    import webscrape
    if not webscrape.is_real_headshot(image):
        raise ValueError("not a real headshot")
    image = shrink_headshot(image)
    if not webscrape.is_real_headshot(image):
        raise ValueError("not a real headshot")
    now = time.time()
    name_key = actor_photo_key("", "", name) if name else ""
    row = con.execute("SELECT id, key FROM actor_photos WHERE key=?", (key,)).fetchone()
    if not row and name_key and name_key != key:
        row = con.execute("SELECT id, key FROM actor_photos WHERE key=?", (name_key,)).fetchone()
    if row:
        new_key = key if ":" in key and not key.startswith("name:") else row["key"]
        con.execute(
            "UPDATE actor_photos SET key=?, name=COALESCE(NULLIF(?, ''), name), source=COALESCE(NULLIF(?, ''), source), "
            "source_id=COALESCE(NULLIF(?, ''), source_id), image=?, url=COALESCE(NULLIF(?, ''), url), updated=? "
            "WHERE id=?",
            (new_key, name, source or "", str(source_id or ""), image, url or "", now, row["id"]))
        return row["id"]
    con.execute(
        "INSERT INTO actor_photos (key, name, source, source_id, image, url, updated) VALUES (?,?,?,?,?,?,?)",
        (key, name, source or "", str(source_id or ""), image, url or "", now))
    return con.execute("SELECT last_insert_rowid()").fetchone()[0]


def bump_actor_photo_seq(con, last_id):
    if not last_id:
        return
    row = con.execute("SELECT seq FROM sqlite_sequence WHERE name='actor_photos'").fetchone()
    if row is None:
        con.execute("INSERT INTO sqlite_sequence (name, seq) VALUES ('actor_photos', ?)", (int(last_id),))
    elif row[0] < int(last_id):
        con.execute("UPDATE sqlite_sequence SET seq=? WHERE name='actor_photos'", (int(last_id),))


def save_poster(con, movie_id, data, source="", url=""):
    con.execute("INSERT INTO posters (movie_id, image, source, url, updated) VALUES (?,?,?,?,?) "
                "ON CONFLICT(movie_id) DO UPDATE SET image=excluded.image, source=excluded.source, "
                "url=excluded.url, updated=excluded.updated", (movie_id, data, source, url, time.time()))


def parse_answers(text):
    """Odpowiedzi licytacji: jedna w linii, aliasy po średniku: "Iron Man; IM"."""
    out, seen = [], set()
    for line in str(text or "").replace("\r", "").split("\n"):
        parts = [x.strip() for x in line.split(";") if x.strip()]
        if not parts:
            continue
        k = norm_title(parts[0])
        if not k or k in seen:
            continue
        seen.add(k)
        out.append({"text": parts[0][:120], "aliases": [a[:120] for a in parts[1:6]]})
    return out[:300]
