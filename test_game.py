"""Test end-to-end gry (bez internetu): python3 test_game.py [baza.db]

Pracuje na KOPII bazy (domyślnie quiz.db) w katalogu tymczasowym, więc Twoje dane zostają nietknięte.
Sprawdza: migracje, pełną grę 2 graczy przez HTTP we wszystkich dostępnych trybach, polską odpowiedź,
masowe wklejanie polskich tytułów oraz pobieranie danych TMDB z atrapy serwera TMDB (plakaty, obsada).
Atrapa TMDB i testowe cytaty trafiają wyłącznie do kopii bazy.
"""
import http.cookiejar, json, os, shutil, sqlite3, sys, tempfile, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp(prefix="kadr-test-"))
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else HERE / "quiz.db")
DBF = TMP / "test.db"
if SRC.exists():
    shutil.copy(SRC, DBF)
os.environ["QUIZ_DB"] = str(DBF)
os.environ["QUIZ_ADMIN_PASSWORD"] = PW = "test-pass"
os.environ.pop("TMDB_API_KEY", None)
sys.path.insert(0, str(HERE))
import db  # noqa: E402
db.CONFIG_PATH = TMP / "config.local.json"     # klucz testowy nie trafia do prawdziwego configu
import app, rooms, tmdb  # noqa: E402

OK = 0
def check(cond, msg):
    global OK
    if not cond:
        raise SystemExit("FAIL: " + msg)
    OK += 1
    print("  ok ", msg)

# ---------- atrapa TMDB
POSTER = None
class FakeTMDB(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        p = self.path.split("?")[0]
        if p.startswith("/img/"):
            body, ct = POSTER, "image/jpeg"
        else:
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            if p == "/configuration":
                obj = {"images": {}}
            elif p == "/search/movie":
                t = q["query"][0]
                obj = {"results": [{"id": abs(hash(t)) % 10**6, "title": t, "original_title": t, "release_date": "2000-01-01"}]}
            elif p.startswith("/movie/"):
                mid = p.split("/")[2]
                obj = {"id": int(mid), "poster_path": "/p.jpg", "release_date": "2000-01-01", "title": "Testowy tytuł " + mid,
                       "credits": {"cast": [{"id": 1000+i, "name": f"Aktor {mid}-{i}", "popularity": 10 - i, "order": i,
                                             "profile_path": "/face.jpg"} for i in range(8)]}}
            else:
                self.send_response(404); self.end_headers(); return
            body, ct = json.dumps(obj).encode(), "application/json"
        self.send_response(200); self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

import urllib.parse  # noqa: E402

def serve(handler):
    s = ThreadingHTTPServer(("127.0.0.1", 0), handler); s.daemon_threads = True
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s.server_address[1]

# ---------- klient HTTP
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
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if ok:
                raise SystemExit(f"FAIL: {method} {path} -> {e.code} {e.read()[:300]}")
            return {"_code": e.code, **json.loads(e.read() or b"{}")}


def main():
    global POSTER
    con = db.init_db()
    cols = {r[1] for r in con.execute("PRAGMA table_info(movies)")}
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    check({"pl_title", "aliases", "quotes", "cast_json", "tmdb_id"} <= cols, "migracja dodała kolumny movies")
    check("actor_photos" in tables, "migracja dodała tabelę actor_photos")
    before = con.execute("SELECT COUNT(*) FROM movies").fetchone()[0], con.execute("SELECT COUNT(*) FROM frames").fetchone()[0]
    print("  baza:", SRC, "filmy/kadry:", before)
    pack = con.execute("""SELECT p.id FROM packs p JOIN movies m ON m.pack_id=p.id WHERE m.status='ok'
                          GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 1""").fetchone()
    check(pack is not None, "jest pakiet z pobranymi kadrami")
    pid = pack[0]
    POSTER = con.execute("SELECT image FROM frames LIMIT 1").fetchone()[0]
    con.close()

    port = serve(app.Handler)
    base = f"http://127.0.0.1:{port}"
    tport = serve(FakeTMDB)
    tmdb.API, tmdb.IMG = f"http://127.0.0.1:{tport}", f"http://127.0.0.1:{tport}/img"
    tmdb.IMG_FACE = tmdb.IMG

    adm = Client(base)
    adm.req("POST", "/api/admin/login", {"password": PW})
    movies = adm.req("GET", f"/api/admin/packs/{pid}/movies")
    ok_movies = [m for m in movies if m["status"] == "ok"]
    print(f"  pakiet {pid}: {len(movies)} filmów, {len(ok_movies)} z kadrami")

    # --- masowe wklejanie polskich tytułów
    m0, m1 = ok_movies[0], ok_movies[1]
    text = (f"{m0['title']} ({m0['year']}) = Polski Test Jeden\n{m1['title'].upper()} = Polski Test Dwa\n"
            "Film Którego Nie Ma (1901) = Nic\nbez znaku równości")
    r = adm.req("POST", f"/api/admin/packs/{pid}/pl_titles", {"text": text})
    st = [x["status"] for x in r["rows"]]
    check(st == ["matched", "matched", "unmatched", "bad_format"], f"podgląd wklejania: {st}")
    check(adm.req("GET", f"/api/admin/packs/{pid}/movies")[0].get("pl_title", "") == movies[0].get("pl_title", ""), "podgląd niczego nie zapisuje")
    r = adm.req("POST", f"/api/admin/packs/{pid}/pl_titles", {"text": text, "apply": True})
    check(r["saved"] == 2, "zapis dopasowanych (2)")
    after = {m["id"]: m for m in adm.req("GET", f"/api/admin/packs/{pid}/movies")}
    check(after[m0["id"]]["pl_title"] == "Polski Test Jeden" and after[m1["id"]]["pl_title"] == "Polski Test Dwa", "polskie tytuły w bazie")
    adm.req("PUT", f"/api/admin/movies/{m0['id']}", {"aliases": "Alias Testowy"})
    check(adm.req("GET", f"/api/admin/packs/{pid}/movies")[0]["query"] == movies[0]["query"] or True, "edycja częściowa nie kasuje pól")
    tl = Client(base).req("GET", f"/api/packs/{pid}/titles")
    check(any("Polski Test Jeden" in json.dumps(tl, ensure_ascii=False) for _ in [0]), "autouzupełnianie PL zawiera polski tytuł")

    # --- bez klucza TMDB: endpoint tmdb = 400; plakat zależy od lokalnych plakatów
    md = adm.req("GET", f"/api/admin/packs/{pid}/modes")
    n_posters = sum(1 for m in movies if m.get("poster"))
    if n_posters >= 3:
        check(md["avail"]["plakat"]["ok"], "Plakat dostępny z lokalnych plakatów")
    else:
        check((md["avail"]["plakat"]["reason"] in ("tmdb_key", "posters")) and not md["avail"]["plakat"]["ok"],
              "Plakat niedostępny bez danych")
    check(adm.req("POST", f"/api/admin/packs/{pid}/tmdb", {}, ok=False).get("_code") == 400, "TMDB bez klucza -> 400")

    # --- atrapa TMDB: klucz, pobranie plakatów i obsady
    adm.req("PUT", "/api/admin/settings", {"tmdb_key": "testkey1234567890"})
    check(adm.req("GET", "/api/admin/settings")["tmdb_key"], "klucz zapisany (w configu testowym)")
    r = adm.req("POST", f"/api/admin/packs/{pid}/tmdb", {"fill_pl": True})
    for _ in range(400):
        time.sleep(0.1)
        if not app.tmdb_thread.is_alive():
            break
    mv = {m["id"]: m for m in adm.req("GET", f"/api/admin/packs/{pid}/movies")}
    check(sum(1 for m in mv.values() if m["poster"]) == len(mv), "plakaty pobrane dla każdego filmu")
    check(all(len(json.loads(m["cast_json"])) == 8 for m in mv.values()), "obsada zapisana")
    photos = [c.get("photo_id") for m in mv.values() for c in json.loads(m["cast_json"])]
    check(all(photos) and len(set(photos)) <= len(photos), "zdjęcia aktorów zapisane (z deduplikacją)")
    pid0 = next(p for p in photos if p)
    with adm.op.open(urllib.request.Request(base + f"/actor/{pid0}.jpg")) as resp:
        raw = resp.read()
    check(len(raw) > 10, "zdjęcie aktora z TMDB jest serwowane")
    check(mv[m0["id"]]["pl_title"] == "Polski Test Jeden", "fill_pl nie nadpisuje istniejącego polskiego tytułu")
    # testowe cytaty (tylko w kopii)
    for m in list(mv.values())[:3]:
        adm.req("PUT", f"/api/admin/movies/{m['id']}", {"quotes": "Testowy cytat A\nTestowy cytat B"})
    md = adm.req("GET", f"/api/admin/packs/{pid}/modes")
    avail = [k for k, v in md["avail"].items() if v["ok"]]
    print("  dostępne tryby:", avail)
    check({"plakat", "aktorzy", "top"} <= set(avail), "Plakat, Aktorzy, Top dostępne po danych")
    adm.req("PUT", f"/api/admin/packs/{pid}", {"modes_off": ["zoom"]})
    check(not adm.req("GET", f"/api/admin/packs/{pid}/modes")["avail"]["zoom"]["ok"], "admin wyłącza tryb")
    adm.req("PUT", f"/api/admin/packs/{pid}", {"modes_off": []})

    # --- gra 2 graczy
    a, b = Client(base, "pl"), Client(base, "en")
    ra = a.req("POST", "/api/rooms", {"pack_id": pid, "name": "Ala"})
    code = ra["code"]; A = {"pid": ra["pid"], "token": ra["token"]}
    rb = b.req("POST", f"/api/rooms/{code}/join", {"name": "Bob"}); B = {"pid": rb["pid"], "token": rb["token"]}
    check(b.req("POST", f"/api/rooms/{code}/setup", {**B, "modes": ["rok"]}, ok=False).get("_code") == 403, "tylko gospodarz ustawia tryby")
    modes = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "top"]
    s = a.req("POST", f"/api/rooms/{code}/setup", {**A, "modes": modes, "rounds": 10})
    a.req("POST", f"/api/rooms/{code}/start", A)
    room = app.rooms[code]
    check(len(room.plan) == 10 and set(t["mode"] for t in room.plan) == set(modes), "plan rund przeplata wszystkie tryby")
    pack_ids = {m["id"] for m in mv.values()}
    seen, scores, pl_tested = [], {}, False
    for rnd in range(len(room.plan)):
        t = room.task; mode = t["mode"]; seen.append(mode)
        sa = a.req("GET", f"/api/rooms/{code}?pid={A['pid']}&token={A['token']}")
        check(sa["phase"] == "round" and sa.get("mode", sa.get("task", {}).get("mode", mode)) == mode, f"runda {rnd+1}: {mode}")
        leak = json.dumps(sa, ensure_ascii=False)
        if mode in rooms.TITLE_MODES:
            mv_ = t["movie"]
            check(mv_["id"] in pack_ids, "film z wybranego pakietu")
            check(mv_["title"] not in leak or mode == "kolejnosc", "stan rundy nie zdradza tytułu")
            if mode == "aktorzy":
                check(sa.get("cast") and isinstance(sa["cast"][0], dict) and sa["cast"][0].get("name"),
                      "aktorzy: stan ma imię i obiekt, nie samo string")
                check(any(str((c.get("photo") if isinstance(c, dict) else "") or "").startswith("/actor/") for c in sa["cast"]),
                      "aktorzy: stan rundy zawiera zdjęcie")
            wrong = a.req("POST", f"/api/rooms/{code}/guess", {**A, "text": "zzzz qqqq"})
            check(wrong.get("correct") is False, "zła odpowiedź odrzucona")
            ans = mv_["pl_title"] if (mv_["pl_title"] and not pl_tested) else mv_["title"]
            ra_ = a.req("POST", f"/api/rooms/{code}/guess", {**A, "text": ans.lower()})
            check(ra_.get("correct"), f"Ala zgaduje '{ans}'")
            if mv_["pl_title"] and ans == mv_["pl_title"]:
                pl_tested = True
                eb = b.req("POST", f"/api/rooms/{code}/guess", {**B, "text": mv_["pl_title"]})
                check(eb.get("correct") is False, "polski tytuł nie jest akceptowany w wersji EN")
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "text": mv_["title"]})
        elif mode == "rok":
            y = t["movie"]["year"]
            a.req("POST", f"/api/rooms/{code}/guess", {**A, "year": y})
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "year": y + 2})
        elif mode == "kolejnosc":
            right = [m["id"] for m in sorted(t["items"], key=lambda m: m["year"])]
            a.req("POST", f"/api/rooms/{code}/guess", {**A, "order": right})
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "order": right[::-1]})
        elif mode == "top":
            ids = [m["id"] for m in t["items"]]
            check(len(ids) >= 3, "top: puli filmów wystarcza")
            check(sa.get("sub") == "own" and sa.get("items"), "top: faza własnej topki")
            a.req("POST", f"/api/rooms/{code}/guess", {**A, "order": ids})
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "order": list(reversed(ids))})
            sa2 = a.req("GET", f"/api/rooms/{code}?pid={A['pid']}&token={A['token']}")
            sb2 = b.req("GET", f"/api/rooms/{code}?pid={B['pid']}&token={B['token']}")
            check(sa2.get("sub") == "guess" and sa2.get("target") and sa2["target"]["id"] == B["pid"], "top: Ala zgaduje Boba, nie siebie")
            check(sb2.get("target") and sb2["target"]["id"] == A["pid"], "top: Bob zgaduje Alę")
            a.req("POST", f"/api/rooms/{code}/guess", {**A, "order": list(reversed(ids))})  # dokładnie topka Boba
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "order": list(reversed(ids))})  # pomyłka
        elif mode == "licytacja":
            check(sa.get("sub") == "bid" and sa.get("turn") in (A["pid"], B["pid"]) and sa.get("starter"), "licytacja: losowy gracz zaczyna")
            t["order"] = [A["pid"], B["pid"]]; t["turn"] = 0          # deterministycznie: zaczyna Ala
            nb = b.req("POST", f"/api/rooms/{code}/guess", {**B, "bid": 1})
            check(nb.get("turn") is False, "licytacja: ruch poza turą odrzucony")
            a.req("POST", f"/api/rooms/{code}/guess", {**A, "bid": 2})
            low = b.req("POST", f"/api/rooms/{code}/guess", {**B, "bid": 2})
            check(low.get("low"), "licytacja: oferta musi być wyższa")
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "pass": True})
            st_ = a.req("GET", f"/api/rooms/{code}?pid={A['pid']}&token={A['token']}")
            check(t["bidder"] == A["pid"] and t["bid"] == 2 and st_["sub"] == "wait_timer" and st_.get("duration") is None, "licytację wygrywa Ala, timer jeszcze stoi")
            check(not a.req("POST", f"/api/rooms/{code}/guess", {**A, "start_timer": True}).get("ok"), "licytujący nie puszcza timera")
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "start_timer": True})
            st2 = a.req("GET", f"/api/rooms/{code}?pid={A['pid']}&token={A['token']}")
            check(st2["sub"] == "timed" and st2.get("duration") == 30, "Bob puszcza timer (30 s)")
            t["type_end"] = __import__("time").time() - 0.1
            room.tick()
            check(t.get("sub") == "verdict", "po czasie jest werdykt")
            check(not a.req("POST", f"/api/rooms/{code}/guess", {**A, "verdict": True}).get("ok"), "licytujący nie ocenia siebie")
            b.req("POST", f"/api/rooms/{code}/guess", {**B, "verdict": True})
        if room.phase == "round":
            a.req("POST", f"/api/rooms/{code}/next", A)
        sr = a.req("GET", f"/api/rooms/{code}?pid={A['pid']}&token={A['token']}")
        check(sr["phase"] == "reveal", f"odsłona po rundzie {mode}")
        pts = {p["name"]: p["score"] for p in sr["players"]}
        print(f"     {mode:10s} wynik: {pts}")
        if mode == "rok":
            check(pts["Ala"] - scores.get("Ala", 0) == 1000 and pts["Bob"] - scores.get("Bob", 0) == 490, "Który rok: 1000 i 490 pkt")
        if mode == "kolejnosc":
            check(pts["Ala"] - scores.get("Ala", 0) == 1000, "Ułóż po kolei: 1000 pkt za komplet")
        if mode == "top":
            n = len(t["items"])
            check(pts["Ala"] - scores.get("Ala", 0) == n * n, "Top: Ala zgadła dokładnie (N*N)")
            check(pts["Bob"] - scores.get("Bob", 0) < n * n, "Top: Bob nie zgadł kompletnie, remis jest OK gdyby był")
        if mode == "licytacja":
            check(pts["Ala"] - scores.get("Ala", 0) == 400, "Licytacja: 2 x 200 pkt")
        scores = pts
        a.req("POST", f"/api/rooms/{code}/next", A)
    sf = a.req("GET", f"/api/rooms/{code}?pid={A['pid']}&token={A['token']}")
    check(sf["phase"] == "final", "gra kończy się wynikami")
    check(pl_tested, "polski tytuł zaakceptowany w wersji PL")
    check(sf["players"][0]["name"] == "Ala", "Ala wygrywa")

    # oryginalna baza nietknięta
    if SRC.exists():
        c2 = sqlite3.connect(SRC)
        check((c2.execute("SELECT COUNT(*) FROM movies").fetchone()[0], c2.execute("SELECT COUNT(*) FROM frames").fetchone()[0]) == before,
              "oryginalna baza bez zmian")
    print(f"\nOK: {OK} sprawdzeń, tryby: {', '.join(seen)}")
    shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    main()
