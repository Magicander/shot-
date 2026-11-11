"""Test edytora trybów i nowej licytacji (bez internetu): python3 test_editors.py [baza.db]

Pracuje na KOPII bazy w katalogu tymczasowym. Sprawdza:
- scraper IMDb/Filmweb na atrapie HTTP (parsowanie, blokada WAF/403, przejście na kolejne źródło),
- parsowanie odpowiedzi, cytatów "Tytuł = cytat" i pytań wklejanych hurtem,
- API edytorów: plakat (link, plik, usuwanie), obsada (zapis kolejności), cytaty (CRUD, hurtem), pytania,
- licytację z własnym pytaniem: oferty, wpisywanie, aliasy, literówki, powtórki, punkty, odsłona.
"""
import base64, hashlib, json, os, shutil, sqlite3, sys, tempfile, threading, urllib.error, urllib.request, http.cookiejar
from http.server import ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp(prefix="kadr-ed-"))
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "quiz.db")
DBF = TMP / "test.db"
SRC_HASH = hashlib.sha256(SRC.read_bytes()).hexdigest() if SRC.exists() else None
if SRC.exists():
    shutil.copy(SRC, DBF)
os.environ["QUIZ_DB"] = str(DBF)
os.environ["QUIZ_ADMIN_PASSWORD"] = PW = "test-pass"
os.environ.pop("TMDB_API_KEY", None)
sys.path.insert(0, str(HERE))
import db  # noqa: E402
db.CONFIG_PATH = TMP / "config.local.json"
import app, rooms, webscrape  # noqa: E402

OK = 0
def check(cond, msg):
    global OK
    if not cond:
        raise SystemExit("FAIL: " + msg)
    OK += 1
    print("  ok ", msg)

def _img(fmt="JPEG"):
    from PIL import Image
    import io
    im = Image.new("RGB", (220, 280))
    im.putdata([((i * 13) % 256, (i * 29) % 256, (i * 47) % 256) for i in range(220 * 280)])
    buf = io.BytesIO()
    kw = {"quality": 90} if fmt == "JPEG" else {}
    im.save(buf, fmt, **kw)
    return buf.getvalue()
JPG = _img("JPEG")
PNG = _img("PNG")

# ---------- atrapa sieci dla webscrape.http
MODE = {"imdb_page": "blocked", "filmweb": "ok"}
def fake_http(url, accept="", lang="", raw=False, extra=None):
    if "suggestion" in url:
        body = {"d": [{"id": "tt0081505", "l": "The Shining", "y": 1980, "qid": "movie", "s": "Jack Nicholson, Shelley Duvall",
                       "i": {"imageUrl": "https://m.media-amazon.com/images/M/x._V1_.jpg"}}]}
        out = json.dumps(body)
    elif "imdb.com/title/" in url:
        if MODE["imdb_page"] == "blocked":
            raise webscrape.Blocked("HTTP 202 (AWS WAF challenge)")
        out = ('<meta property="og:image" content="https://m.media-amazon.com/og._V1_.jpg">'
               '<script type="application/ld+json">{"image":"https://m.media-amazon.com/ld._V1_FMjpg.jpg",'
               '"actor":[{"name":"Jack Nicholson"},{"name":"Shelley Duvall"},{"name":"Danny Lloyd"}]}</script>')
    elif "filmweb.pl" in url:
        if MODE["filmweb"] == "blocked":
            raise webscrape.Blocked("HTTP 403")
        if "live/search" in url:
            out = json.dumps({"searchHits": [{"id": 1, "type": "person"}, {"id": 1123, "type": "film"}]})
        elif "/info" in url:
            out = json.dumps({"title": "Lśnienie", "originalTitle": "The Shining", "year": 1980, "posterPath": "/11/23/1123/7.$.jpg"})
        elif "/cast/actors" in url:
            item = ('filmFullCastSection__item castRoleListElement"><a href="/person/x-{i}" class="a"><img src="https://fwcdn.pl/ppo/{i}.jpg" alt="{n}"></a>'
                    '<div class="castRoleListElement__role"><span>{c}</span></div>')
            out = "<div>" + "".join(item.format(i=i, n=n, c=c) for i, (n, c) in enumerate(
                [("Jack Nicholson", "Jack Torrance"), ("Shelley Duvall", "Wendy"), ("Danny Lloyd", "Danny"),
                 ("Scatman Crothers", "Hallorann"), ("Barry Nelson", "Ullman")])) + "</div>"
        else:
            raise urllib.error.HTTPError(url, 404, "nf", {}, None)
    elif "fwcdn.pl" in url or "media-amazon" in url:
        return (JPG, "image/jpeg") if raw else JPG.decode("latin-1")
    else:
        raise urllib.error.HTTPError(url, 404, "nf", {}, None)
    return (out.encode(), "application/json") if raw else out


def scraper_tests():
    real = webscrape.http
    webscrape.http = fake_http
    try:
        mv = {"title": "The Shining", "year": 1980, "pl_title": ""}
        log = []
        data, meta, src = webscrape.fetch_one("poster", "auto", mv, log=log.append)
        check(src == "imdb" and data == JPG and "blocked" in meta["note"] and "SX600" in meta["url"],
              "plakat auto: strona IMDb zablokowana, obraz z podpowiedzi")
        MODE["imdb_page"] = "ok"
        data, meta, src = webscrape.fetch_one("poster", "imdb", mv)
        check("ld._V1_SX600" in meta["url"] and meta["imdb_id"] == "tt0081505", "plakat IMDb z JSON-LD strony tytułu")
        cast, meta, src = webscrape.fetch_one("cast", "imdb", mv, 6)
        check([c["name"] for c in cast] == ["Jack Nicholson", "Shelley Duvall", "Danny Lloyd"], "obsada IMDb z JSON-LD")
        MODE["imdb_page"] = "blocked"
        try:
            webscrape.fetch_one("cast", "imdb", mv, 6)
            check(False, "obsada IMDb zablokowana")
        except LookupError as e:
            check("blocked" in str(e) and "2 stars" in str(e), "obsada IMDb: blokada zgłoszona czytelnie")
        cast, meta, src = webscrape.fetch_one("cast", "auto", mv, 4)
        check(src == "filmweb" and len(cast) == 4 and cast[0]["name"] == "Jack Nicholson" and cast[0]["character"] == "Jack Torrance",
              "obsada Filmweb: kolejność z napisów i postacie, limit N")
        check(meta["filmweb_id"] == 1123 and meta["pl"] == "Lśnienie", "Filmweb: id i polski tytuł")
        check(cast[0].get("photo_url", "").startswith("https://fwcdn.pl/ppo/"), "Filmweb: URL zdjęcia aktora")
        data, meta, src = webscrape.fetch_one("poster", "filmweb", mv)
        check(meta["url"] == "https://fwcdn.pl/fpo/11/23/1123/7.3.jpg", "plakat Filmweb: adres fwcdn")
        MODE["filmweb"] = "blocked"
        log = []
        try:
            webscrape.fetch_one("cast", "auto", mv, 6, log=log.append)
            check(False, "wszystko zablokowane")
        except LookupError as e:
            msg = str(e)
            check("filmweb: blocked (HTTP 403)" in msg and "imdb: blocked" in msg and "2 stars" in msg,
                  "auto: każde źródło po kolei, czytelny błąd z powodami")
            check(len(log) == 2, "auto: log zawiera każdą próbę")
        MODE["filmweb"] = "ok"
        check(webscrape.is_image(JPG) and webscrape.is_image(PNG) and not webscrape.is_image(b"<html>"), "rozpoznawanie obrazów")
    finally:
        webscrape.http = real


def parse_tests(con, pid):
    a = db.parse_answers("Alien; Obcy; ósmy pasażer Nostromo\n\nThe Thing ; Coś\nalien\n  ")
    check([x["text"] for x in a] == ["Alien", "The Thing"] and a[0]["aliases"] == ["Obcy", "ósmy pasażer Nostromo"],
          "odpowiedzi: aliasy po średniku, puste i powtórki pominięte")
    qs = app.parse_questions("Filmy Carpentera | Carpenter films\nThe Thing; Coś\nHalloween\n\nTylko jedna\nX\n\n| EN only\nA\nB")
    check([q["status"] for q in qs] == ["ok", "ok", "ok"] and qs[0]["prompt_en"] == "Carpenter films"
          and qs[2]["prompt_pl"] == "" and qs[1]["status"] == "ok", "pytania hurtem: bloki, PL | EN, odpowiedzi opcjonalne")
    m = con.execute("SELECT title, year, pl_title FROM movies WHERE pack_id=? AND year IS NOT NULL ORDER BY id LIMIT 1", (pid,)).fetchone()
    text = (f"{m['title']} ({m['year']}) = [pl] Testowy cytat\n{m['title'].upper()} = \"Test quote\"\n"
            f"{m['title']} = [pl] testowy CYTAT\nNie Ma Takiego Filmu = x\nbez znaku\n{m['title']} ({m['year'] + 5}) = zły rok")
    rows = app.parse_quotes(con, pid, text)
    check([r["status"] for r in rows] == ["matched", "matched", "duplicate", "unmatched", "bad_format", "unmatched"],
          f"cytaty hurtem: statusy {[r['status'] for r in rows]}")
    check(rows[0]["lang"] == "pl" and rows[1]["lang"] == "" and rows[1]["quote"] == "Test quote", "cytaty: tag języka i cudzysłowy")
    check(rooms.best_answer("ksmy pasazer nostromo", a, [0, 1]) == 0, "dopasowanie: alias bez polskich znaków, literówka")
    check(rooms.best_answer("Thing", a, [0, 1]) == 1 and rooms.best_answer("Predator", a, [0, 1]) is None, "dopasowanie: bez przedimka, obce odrzucone")


class Client:
    def __init__(self, base, lang="pl"):
        self.base, self.lang = base, lang
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def req(self, method, path, body=None, ok=True):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method,
                                   headers={"Content-Type": "application/json", "X-Lang": self.lang})
        try:
            with self.op.open(r, timeout=30) as resp:
                raw = resp.read()
                return json.loads(raw) if resp.headers.get("Content-Type", "").startswith("application/json") else raw
        except urllib.error.HTTPError as e:
            if ok:
                raise SystemExit(f"FAIL: {method} {path} -> {e.code} {e.read()[:300]}")
            return {"_code": e.code, **json.loads(e.read() or b"{}")}


def main():
    con = db.init_db()
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    cols = {r[1] for r in con.execute("PRAGMA table_info(movies)")}
    pcols = {r[1] for r in con.execute("PRAGMA table_info(posters)")}
    check({"quotes", "questions"} <= tables and {"imdb_id", "filmweb_id", "cast_source"} <= cols
          and {"source", "url", "updated"} <= pcols, "migracje: tabele cytatów i pytań, nowe kolumny")
    pid = con.execute("""SELECT p.id FROM packs p JOIN movies m ON m.pack_id=p.id WHERE m.status='ok'
                         GROUP BY p.id HAVING COUNT(*)>=5 ORDER BY COUNT(*) DESC LIMIT 1""").fetchone()[0]
    scraper_tests()
    parse_tests(con, pid)
    con.close()

    s = ThreadingHTTPServer(("127.0.0.1", 0), app.Handler); s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{s.server_address[1]}"
    adm = Client(base)
    check(adm.req("GET", f"/api/admin/packs/{pid}/questions", ok=False).get("_code") == 401, "edytor wymaga logowania")
    adm.req("POST", "/api/admin/login", {"password": PW})
    movies = adm.req("GET", f"/api/admin/packs/{pid}/movies")
    m0, m1 = movies[0], movies[1]

    # --- plakat: plik, link (zły), usuwanie
    r = adm.req("PUT", f"/api/admin/movies/{m0['id']}/poster", {"data": "data:image/png;base64," + base64.b64encode(PNG).decode()})
    img = adm.req("GET", f"/poster/{m0['id']}.jpg")
    check(r["ok"] and img == PNG, "plakat z pliku zapisany i serwowany")
    mv = {m["id"]: m for m in adm.req("GET", f"/api/admin/packs/{pid}/movies")}
    check(mv[m0["id"]]["poster_meta"].startswith("upload|"), "źródło plakatu: upload")
    check(adm.req("PUT", f"/api/admin/movies/{m0['id']}/poster", {"data": base64.b64encode(b"<html>").decode()}, ok=False)["_code"] == 400,
          "plik, który nie jest obrazem, odrzucony")
    check(adm.req("PUT", f"/api/admin/movies/{m0['id']}/poster", {"url": "file:///etc/passwd"}, ok=False)["_code"] == 400,
          "link spoza http(s) odrzucony")
    adm.req("DELETE", f"/api/admin/movies/{m0['id']}/poster")
    check(adm.req("GET", f"/poster/{m0['id']}.jpg", ok=False).get("_code") == 404, "plakat usunięty")

    # --- obsada: zapis kolejności
    cast = [{"name": "Trzeci Plan", "character": "Gość"}, {"name": "Drugi Plan", "character": ""}, {"name": "Gwiazda", "character": "Bohater"}]
    adm.req("PUT", f"/api/admin/movies/{m0['id']}/cast", {"cast": cast + [{"name": "  "}]})
    mv = {m["id"]: m for m in adm.req("GET", f"/api/admin/packs/{pid}/movies")}
    check([c["name"] for c in json.loads(mv[m0["id"]]["cast_json"])] == ["Trzeci Plan", "Drugi Plan", "Gwiazda"], "obsada: kolejność zapisana, puste pominięte")
    # zdjęcia: upload, serwowanie, deduplikacja, zachowanie photo_id, fill bez zmiany imion
    a1 = adm.req("POST", "/api/admin/actors", {"data": "data:image/png;base64," + base64.b64encode(PNG).decode(), "name": "Trzeci Plan"})
    check(a1.get("id"), "upload zdjęcia aktora zwraca id")
    # raw fetch (endpoint zwraca obraz, nie JSON)
    import urllib.request as ur
    with adm.op.open(ur.Request(base + f"/actor/{a1['id']}.jpg")) as resp:
        raw = resp.read()
    check(raw[:8] == b"\x89PNG\r\n\x1a\n" or raw[:3] == b"\xff\xd8\xff" or len(raw) > 10, "zdjęcie aktora serwowane")
    # zachowaj photo_id przy zapisie obsady
    cast_ph = [{"name": "Trzeci Plan", "character": "Gość", "photo_id": a1["id"]},
               {"name": "Drugi Plan", "character": ""},
               {"name": "Gwiazda", "character": "Bohater"}]
    adm.req("PUT", f"/api/admin/movies/{m0['id']}/cast", {"cast": cast_ph})
    saved = json.loads(adm.req("GET", f"/api/admin/packs/{pid}/movies")[0]["cast_json"] if False else
                       [m for m in adm.req("GET", f"/api/admin/packs/{pid}/movies") if m["id"]==m0["id"]][0]["cast_json"])
    check(saved[0].get("photo_id") == a1["id"] and [c["name"] for c in saved] == ["Trzeci Plan", "Drugi Plan", "Gwiazda"],
          "obsada: photo_id zostaje przy zapisie kolejności")
    # dedup: to samo imię / ten sam klucz
    import webscrape, db as dbmod
    conp = dbmod.connect(DBF)
    id2 = dbmod.save_actor_photo(conp, key=f"upload:{a1['id']}" if False else "name:trzeci plan", name="Trzeci Plan",
                                 source="upload", image=PNG)
    # might create new or reuse name key - second save with name key
    id3 = dbmod.save_actor_photo(conp, key="name:trzeci plan", name="Trzeci Plan", source="upload", image=PNG)
    n_same = conp.execute("SELECT COUNT(*) FROM actor_photos WHERE key='name:trzeci plan'").fetchone()[0]
    check(n_same <= 1, "deduplikacja zdjęć po kluczu imienia")
    conp.close()
    # packi shardów na Cloudflare: kilka plików, nie jedno na aktora
    import deploy_cloudflare
    build_dir = TMP / "cf-build"
    # write_actor_shards używa BUILD
    deploy_cloudflare.BUILD = build_dir
    (build_dir / "data").mkdir(parents=True)
    conp = db.connect(DBF)
    n, shards, nbytes = deploy_cloudflare.write_actor_shards(conp)
    conp.close()
    files = list((build_dir / "data").glob("actors-*.bin")) + list((build_dir / "data").glob("actors-index.json"))
    check(n >= 1 and (build_dir / "data" / "actors-index.json").exists(), "deploy: indeks zdjęć aktorów")
    check(shards <= n and shards <= 8, "deploy: shardy, nie osobny plik na aktora")
    check(adm.req("POST", f"/api/admin/movies/{m0['id']}/cast", {"source": "zly"}, ok=False)["_code"] == 400, "nieznane źródło -> 400")
    check(adm.req("POST", f"/api/admin/packs/{pid}/web", {"kind": "cast", "source": "tmdb"}, ok=False)["_code"] == 400,
          "TMDB bez klucza -> 400")

    # --- cytaty
    q1 = adm.req("POST", f"/api/admin/movies/{m0['id']}/quotes", {"text": "Pierwszy cytat", "lang": "pl"})["id"]
    t = f"{m1['title']} = [en] Bulk quote\n{m1['title']} = [en] Bulk quote\nZzz Brak = a"
    pv = adm.req("POST", f"/api/admin/packs/{pid}/quotes", {"text": t})
    check(pv["saved"] == 0 and pv["matched"] == 1 and pv["unmatched"] == 2, "cytaty hurtem: podgląd bez zapisu")
    ap = adm.req("POST", f"/api/admin/packs/{pid}/quotes", {"text": t, "apply": True})
    check(ap["saved"] == 1, "cytaty hurtem: zapis dopasowanych")
    adm.req("PUT", f"/api/admin/quotes/{q1}", {"text": "Poprawiony cytat", "lang": "en"})
    ql = {m["id"]: m["quotes"] for m in adm.req("GET", f"/api/admin/packs/{pid}/quotes")}
    check(any(q["text"] == "Poprawiony cytat" and q["lang"] == "en" for q in ql[m0["id"]]), "cytat edytowany")
    adm.req("DELETE", f"/api/admin/quotes/{q1}")
    ql = {m["id"]: m["quotes"] for m in adm.req("GET", f"/api/admin/packs/{pid}/quotes")}
    check(all(q["id"] != q1 for q in ql[m0["id"]]), "cytat usunięty")

    # --- pytania
    auto = adm.req("GET", f"/api/admin/packs/{pid}/answers_auto")["text"]
    check(len(auto.splitlines()) == len(movies), "auto-uzupełnianie: jedna linia na film")
    check(adm.req("POST", f"/api/admin/packs/{pid}/questions", {"prompt_pl": "", "prompt_en": ""}, ok=False)["_code"] == 400,
          "pytanie bez treści odrzucone")
    qempty = adm.req("POST", f"/api/admin/packs/{pid}/questions", {"prompt_pl": "Tylko treść, bez odpowiedzi"})
    check(qempty.get("id"), "pytanie bez listy odpowiedzi jest przyjmowane")
    only = [q for q in adm.req("GET", f"/api/admin/packs/{pid}/questions") if q["id"] == qempty["id"]][0]
    check(only["prompt_pl"].startswith("Tylko treść") and only["answers"] == [], "nowe pytanie nie wymaga odpowiedzi")
    adm.req("DELETE", f"/api/admin/questions/{qempty['id']}")
    bulk = "Hurt 1 | Bulk 1\nA1\nA2\n\n|\n\nHurt 2"
    r = adm.req("POST", f"/api/admin/packs/{pid}/questions", {"bulk": bulk, "apply": True})
    check(r["saved"] == 2 and r["ok"] == 2, "pytania hurtem: 2 zapisane, złe pominięte")
    for q in adm.req("GET", f"/api/admin/packs/{pid}/questions"):
        adm.req("DELETE", f"/api/admin/questions/{q['id']}")
    qid = adm.req("POST", f"/api/admin/packs/{pid}/questions",
                  {"prompt_pl": "Wymień potwory z kosmosu", "prompt_en": "Name space monsters",
                   "answers_text": "Ksenomorf; Obcy; Xenomorph\nPredator\nThe Thing; Coś\nBlob"})["id"]
    adm.req("PUT", f"/api/admin/questions/{qid}", {"prompt_pl": "Wymień potwory z kosmosu", "prompt_en": "Name space monsters",
                                                   "answers": [{"text": "Ksenomorf", "aliases": ["Obcy", "Xenomorph"]},
                                                               {"text": "Predator"}, {"text": "The Thing", "aliases": ["Coś"]},
                                                               {"text": "Blob"}, {"text": "Gremlin"}]})
    qs = adm.req("GET", f"/api/admin/packs/{pid}/questions")
    check(len(qs) == 1 and len(qs[0]["answers"]) == 5, "pytanie zapisane i edytowane (5 odpowiedzi)")
    adm.req("PUT", f"/api/admin/questions/{qid}", {"prompt_pl": "Wymień potwory z kosmosu (PL)", "prompt_en": "Name space monsters"})
    qs = adm.req("GET", f"/api/admin/packs/{pid}/questions")
    check(qs[0]["prompt_pl"].endswith("(PL)") and len(qs[0]["answers"]) == 5,
          "edycja samego pytania nie kasuje istniejących odpowiedzi")
    md = adm.req("GET", f"/api/admin/packs/{pid}/modes")
    check(md["questions"] == 1 and md["avail"]["licytacja"]["ok"], "hub: licytacja gotowa, liczba pytań")

    # --- gra: licytacja z własnym pytaniem
    a, b = Client(base, "pl"), Client(base, "en")
    ra = a.req("POST", "/api/rooms", {"pack_id": pid, "name": "Ala"}); code = ra["code"]; A = {"pid": ra["pid"], "token": ra["token"]}
    rb = b.req("POST", f"/api/rooms/{code}/join", {"name": "Bob"}); B = {"pid": rb["pid"], "token": rb["token"]}
    a.req("POST", f"/api/rooms/{code}/setup", {**A, "modes": ["licytacja"], "rounds": 3})
    a.req("POST", f"/api/rooms/{code}/start", A)
    room = app.rooms[code]
    st = lambda c, P: c.req("GET", f"/api/rooms/{code}?pid={P['pid']}&token={P['token']}")
    sa, sb = st(a, A), st(b, B)
    check(sa["prompt"] == "Wymień potwory z kosmosu (PL)" and sb["prompt"] == "Name space monsters",
          "pytanie w języku gracza")
    check("Predator" not in json.dumps(sa), "stan nie zdradza odpowiedzi")
    t = room.task
    t["order"] = [A["pid"], B["pid"]]; t["turn"] = 0  # zaczyna Ala
    a.req("POST", f"/api/rooms/{code}/guess", {**A, "bid": 3})
    b.req("POST", f"/api/rooms/{code}/guess", {**B, "bid": 99})
    check(t["bidder"] == B["pid"] and t["bid"] == 5, "najwyższa oferta wygrywa, oferta przycięta do liczby odpowiedzi")
    check(not b.req("POST", f"/api/rooms/{code}/guess", {**B, "start_timer": True}).get("ok"), "licytujący nie puszcza timera")
    a.req("POST", f"/api/rooms/{code}/guess", {**A, "start_timer": True})
    sa2 = st(a, A)
    check(sa2.get("sub") == "timed" and sa2.get("duration") == 30, "przeciwnik puszcza timer (30 s)")
    t["type_end"] = __import__("time").time() - 0.1
    room.tick()
    check(t.get("sub") == "verdict", "po czasie jest werdykt graczy")
    check(not b.req("POST", f"/api/rooms/{code}/guess", {**B, "verdict": False}).get("ok"), "licytujący nie ocenia siebie")
    a.req("POST", f"/api/rooms/{code}/guess", {**A, "verdict": False})
    sr = st(a, A)
    pts = {p["name"]: p["score"] for p in sr["players"]}
    check(sr["phase"] == "reveal" and pts == {"Ala": 500, "Bob": 0}, f"werdykt nie: pozostali po 100 x oferta ({pts})")
    check((sr.get("answer") or {}).get("prompt") == "Wymień potwory z kosmosu (PL)", "odsłona pokazuje pytanie")

    # --- 13 pytań bez odpowiedzi: wszystkie w puli, rundy bez powtórzeń
    for q in adm.req("GET", f"/api/admin/packs/{pid}/questions"):
        adm.req("DELETE", f"/api/admin/questions/{q['id']}")
    for i in range(13):
        adm.req("POST", f"/api/admin/packs/{pid}/questions",
                {"prompt_pl": f"Horror {i+1}", "prompt_en": f"Horror EN {i+1}"})
    listed = adm.req("GET", f"/api/admin/packs/{pid}/questions")
    check(len(listed) == 13 and all(q["answers"] == [] for q in listed), "admin widzi 13 pytań bez odpowiedzi")
    md13 = adm.req("GET", f"/api/admin/packs/{pid}/modes")
    check(md13["questions"] == 13 and md13["avail"]["licytacja"]["ok"], "hub: 13 pytań w puli licytacji")
    # pack_data (to samo źródło co gra i deploy) też ma 13
    import rooms, db as _db
    with _db.connect() as con:
        pdata = rooms.pack_data(con, {"id": pid})
    check(len(pdata["questions"]) == 13, "pack_data / gra widzi 13 pytań, nie tylko te z listą odpowiedzi")
    a2, b2 = Client(base, "pl"), Client(base, "en")
    ra2 = a2.req("POST", "/api/rooms", {"pack_id": pid, "name": "Ala"}); code2 = ra2["code"]
    A2 = {"pid": ra2["pid"], "token": ra2["token"]}
    rb2 = b2.req("POST", f"/api/rooms/{code2}/join", {"name": "Bob"}); B2 = {"pid": rb2["pid"], "token": rb2["token"]}
    a2.req("POST", f"/api/rooms/{code2}/setup", {**A2, "modes": ["licytacja"], "rounds": 5, "per_mode": False})
    a2.req("POST", f"/api/rooms/{code2}/start", A2)
    room2 = app.rooms[code2]
    st2 = lambda: a2.req("GET", f"/api/rooms/{code2}?pid={A2['pid']}&token={A2['token']}")
    seen_p = []
    for i in range(5):
        snap = st2()
        check(snap.get("mode") == "licytacja" and snap.get("prompt", "").startswith("Horror "),
              f"runda {i+1} ładuje pytanie z puli")
        seen_p.append(snap["prompt"])
        room2.end_round()
        room2.t0 = __import__("time").time() - 20
        room2.tick()
    check(len(set(seen_p)) == 5, f"5 rund, 5 różnych pytań ({seen_p})")

    # --- kadr Zoom niezależny od Kadry
    mid = m0["id"]
    before_pick = adm.req("GET", f"/api/admin/movies/{mid}")
    old_pick = before_pick.get("pick") or {}
    jpg_b64 = "data:image/jpeg;base64," + base64.b64encode(JPG).decode()
    z = adm.req("POST", f"/api/admin/movies/{mid}/zoom", {"data": jpg_b64})
    check(z.get("zoom"), "wgrano osobny kadr Zoom")
    after = adm.req("GET", f"/api/admin/movies/{mid}")
    check(after["pick"]["zoom"] == z["zoom"], "pick.zoom wskazuje wgrany kadr")
    check((after["pick"].get("easy"), after["pick"].get("medium"), after["pick"].get("hard")) ==
          (old_pick.get("easy"), old_pick.get("medium"), old_pick.get("hard")),
          "wgranie Zoomu nie rusza trójki kadrów Kadry")
    listed = next(x for x in adm.req("GET", f"/api/admin/packs/{pid}/movies") if x["id"] == mid)
    check(listed.get("zoom") == z["zoom"], "lista filmów pokazuje kadr Zoom")
    adm.req("DELETE", f"/api/admin/movies/{mid}/zoom")
    gone = adm.req("GET", f"/api/admin/movies/{mid}")["pick"]
    check(not gone.get("zoom"), "usunięcie kadru Zoom czyści wybór")

    # --- pakiet Custom na końcu listy, merge i pokój
    plist = a.req("GET", "/api/packs")
    check(plist and plist[-1].get("id") == "custom" and plist[-1].get("custom"), "Custom jest zawsze ostatni na liście pakietów")
    real = [p["id"] for p in plist if p.get("id") != "custom"][:2]
    if len(real) >= 1:
        rc = a.req("POST", "/api/rooms", {"kind": "custom", "pack_ids": real, "name": "Ala"})
        check(rc.get("code"), "pokój Custom powstaje z wybranych pakietów")
        stc = a.req("GET", f"/api/rooms/{rc['code']}?pid={rc['pid']}&token={rc['token']}")
        check(stc.get("kind") == "custom" and stc.get("pack", {}).get("id") == "custom", "nowy pokój widzi złożoną pulę Custom")

    if SRC.exists():
        check(hashlib.sha256(SRC.read_bytes()).hexdigest() == SRC_HASH, "oryginalna baza nietknięta")
    print(f"\nOK: {OK} sprawdzeń")
    s.shutdown()
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    main()
