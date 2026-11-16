"""Testy zasad gry (bez serwera): python3 test_rules.py
Ustawienia, nadpisanie czasu, sędziowanie na głos (rotacja, głosowanie, rozłączony sędzia),
licytacja po kolei (podbicie, pas, timeout, 30 s na odpowiedź) i mnożnik finału.
Te same scenariusze sprawdza cloudflare/test/rules.mjs dla portu na Workers.
"""
import json, sys, types
from pathlib import Path
import rooms

HERE = Path(__file__).resolve().parent
FX = json.loads((HERE / "cloudflare/test/fixture.json").read_text())
T = [1000.0]
rooms.time = types.SimpleNamespace(time=lambda: T[0])
OK = 0


def check(cond, msg):
    global OK
    if not cond:
        raise SystemExit("FAIL: " + msg)
    OK += 1
    print("  ok ", msg)


def room(n=3, settings=None, modes=None):
    r = rooms.Room("TEST", json.loads(json.dumps(FX["pack"])), json.loads(json.dumps(FX["movies"])), 10, FX["avail"])
    ps = [r.add_player(x) for x in "ABCDEFG"[:n]]
    r.configure(modes=modes, settings=settings or {})
    return r, ps


def adv(r, s, off=()):
    T[0] += s
    for p in r.players.values():
        if p["name"] not in off:
            p["seen"] = T[0]
    r.tick()


print("ustawienia")
d = rooms.norm_settings({})
check(d == rooms.DEFAULTS, "domyślne ustawienia")
d = rooms.norm_settings({"time": 5, "mode_time": {"kadry": 500, "licytacja": 40, "xx": 3}, "order": "fixed",
                         "answer": "voice", "mode_answer": {"rok": "voice", "zoom": "type"}, "judge": "vote",
                         "lic_answer": 999, "lic_bid": 1, "final_x": 7, "hints": False, "mode_rounds": {"rok": 50}})
check(d["time"] == 10 and d["mode_time"] == {"kadry": 120}, "czas przycięty do 10..120, licytacja bez nadpisania")
check(d["mode_answer"] == {"zoom": "type"}, "rok nie może być na głos")
check((d["lic_answer"], d["lic_bid"], d["final_x"], d["hints"], d["judge"]) == (120, 5, 3, False, "vote"), "zakresy licytacji, mnożnik, podpowiedzi")
check(rooms.norm_settings({"time": "abc", "lic_answer": None, "final_x": True})["time"] == 0, "śmieci -> domyślne")

print("czas i plan")
r, ps = room(1, {"time": 20, "mode_time": {"zoom": 45}, "order": "fixed", "per_mode": True,
                 "mode_rounds": {"kadry": 2, "zoom": 1, "aktorzy": 1, "licytacja": 1}, "lic_answer": 30},
             modes=["zoom", "kadry", "aktorzy", "licytacja"])
check(r.total_rounds() == 5, "rundy per tryb sumują się")
r.start()
check([t["mode"] for t in r.plan] == ["zoom", "kadry", "kadry", "aktorzy", "licytacja"], "kolejność gospodarza")
check(r.plan[0]["dur"] == 45, "nadpisanie czasu trybu")
check(r.plan[1]["dur"] == 20 and abs(r.plan[1]["step"] - 6.67) < .01, "kadry: czas globalny / 3 etapy")
check(r.plan[3]["dur"] == 20 and r.plan[3]["step"] == 4, "aktorzy: czas dzielony na aktorów")
check(r.plan[4]["dur"] == 30, "licytacja: 30 s na odpowiedź")
s = r.state(ps[0])
check(s["duration"] == 45 and s["settings"]["time"] == 20, "stan pokazuje czas rundy i ustawienia")
r2, _ = room(1, {}, modes=["kadry"]); r2.start()
check(r2.plan[0]["dur"] == 45 and r2.plan[0]["step"] == 15, "bez nadpisania: domyślne 3x15 s")

print("zgadywanie tytułów: bez sędziego, gra sprawdza wpis")
r, (A, B) = room(2, {"answer": "voice", "judge": "rotate"}, modes=["zoom"])
r.start()
s = r.state(A)
check(not s["voice"] and not r.is_voice("zoom") and not r.is_voice("kadry"), "tryby tytułów nie są na głos")
check(s.get("can_claim") in (None, False), "brak zgłoszeń Mam!")
check(not r.answer(A, {"claim": True}, "pl").get("correct") and not A.get("got"), "zgłoszenie głosowe nie zalicza tytułu")
ok = r.answer(A, {"text": "Movie " + str(r.task["movie"]["id"])}, "pl")
check(ok.get("correct") and A["got"]["points"] > 0, "wpisany tytuł jest sprawdzany przez grę")

print("podpowiedzi tytułów (jak we Framed)")
import hints as titlehints
pool = ["Alien", "Aliens", "Aladdin", "Alexander", "The Alienist", "Obcy", "Obcy - 8. pasażer Nostromo"]
got = titlehints.title_hints(pool, "Al")
check("Alien" in got and "Aladdin" in got and "Alexander" in got and "Aliens" in got, "prefiks Al.. podpowiada Alien, Aladdin, Alexander, Aliens")
check(titlehints.title_matches("The Alienist", "Al"), "prefiks po odrzuceniu the")
check(titlehints.title_hints(pool, "Ob"), "Obcy też od pierwszej litery (PL)")
check(not titlehints.title_hints(pool, ""), "puste zapytanie nie pokazuje listy")

print("licytacja po kolei")
r, (A, B, C) = room(3, {"lic_bid": 10, "lic_answer": 30}, modes=["licytacja"])
r.start()
t = r.task
t["order"] = [B["id"], C["id"], A["id"]]
s = r.state(A)
check(s["sub"] == "bid" and s["turn"] == B["id"] and s["starter"] == "B", "losowy gracz zaczyna i jest pokazany")
check(s["answer_seconds"] == 30 and s["bid_seconds"] == 10, "zasady: 30 s na odpowiedź, 10 s na turę")
check(r.answer(A, {"bid": 3}, "pl") == {"ok": False, "turn": False}, "nie twoja kolej")
r.answer(B, {"bid": 2}, "pl")
check(r.state(A)["turn"] == C["id"] and r.task["leader"] == B["id"], "B: 2, kolej C")
check(r.answer(C, {"bid": 2}, "pl").get("low"), "trzeba podbić")
r.answer(C, {"bid": 3}, "pl")
adv(r, 11)
check(A["id"] in t["passed"] and r.state(A)["turn"] == B["id"], "timeout A = pas")
r.answer(B, {"pass": True}, "pl")
check(t["bidder"] == C["id"] and t["bid"] == 3, "zostaje jeden: wygrywa C z 3")
s = r.state(C)
check(s["sub"] == "wait_timer" and not s.get("timer_started") and s["duration"] is None, "timer nie startuje sam")
check(not r.answer(C, {"start_timer": True}, "pl")["ok"], "licytujący nie puszcza timera")
check(r.state(A)["can_start_timer"] and r.state(B)["can_start_timer"], "przeciwnicy mogą puścić timer")
check(r.answer(A, {"start_timer": True}, "pl")["ok"], "A puszcza timer")
s = r.state(C)
check(s["sub"] == "timed" and s["duration"] == 30 and 29 <= s["left"] <= 30, "po puszczeniu jest 30 s")
check(not r.answer(B, {"start_timer": True}, "pl")["ok"], "drugi raz nie startuje")
adv(r, 31)
check(r.phase == "round" and r.task.get("sub") == "verdict", "po czasie werdykt, runda jeszcze trwa")
check(r.state(A)["can_verdict"] and r.state(B)["can_verdict"] and not r.state(C)["can_verdict"], "oceniają pozostali, nie licytujący")
r.answer(A, {"verdict": False}, "pl")
check(r.phase == "round", "jeden głos jeszcze nie kończy")
r.answer(B, {"verdict": False}, "pl")
check(r.phase == "reveal" and not t["success"] and A["history"][-1] == 300, "werdykt nie: pozostali dostają 100 x deklaracja")

r, (A, B) = room(2, {}, modes=["licytacja"]); r.start()
cur = r.task["order"][0]
r.answer(r.players[cur], {"bid": 6}, "pl")
check(r.task["bidder"] == cur, "deklaracja = wszystkie odpowiedzi kończy licytację")
r, (A, B) = room(2, {}, modes=["licytacja"]); r.start()
r.answer(r.players[r.task["order"][0]], {"pass": True}, "pl")
r.answer(r.players[r.task["order"][1]], {"pass": True}, "pl")
check(r.phase == "reveal" and r.task["bidder"] == "", "wszyscy spasowali: brak licytującego")

print("licytacja: werdykt sukcesu")
r, (A, B, C) = room(3, {"lic_bid": 10, "lic_answer": 10}, modes=["licytacja"])
r.start(); t = r.task
t["order"] = [A["id"], B["id"], C["id"]]
r.answer(A, {"bid": 2}, "pl"); r.answer(B, {"pass": True}, "pl"); r.answer(C, {"pass": True}, "pl")
check(t["bidder"] == A["id"] and r.state(A)["sub"] == "wait_timer", "A licytuje, czeka na timer")
r.answer(B, {"start_timer": True}, "pl")
adv(r, 11)
r.answer(B, {"verdict": True}, "pl"); r.answer(C, {"verdict": True}, "pl")
check(r.phase == "reveal" and t["success"] and A["history"][-1] == 400, "werdykt tak: 200 x deklaracja")

print("mnożnik finału")
r, (A,) = room(1, {"final_x": 2, "order": "fixed"}, modes=["zoom"])
r.configure(rounds=2); r.start(); r.next(); r.next()
check(r.state(A)["mult"] == 2, "ostatnia runda x2")
r.answer(A, {"text": "Movie " + str(r.task["movie"]["id"])}, "pl")
check(A["got"]["points"] == 2 * 1100, "punkty podwojone")
print("top, custom, zoom, most")
check(rooms.top_score([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]) == 25, "Top: komplet = N*N")
check(rooms.top_score([2, 1, 3, 4, 5], [1, 2, 3, 4, 5]) == 23, "Top: pomyłka o 1 na dwóch miejscach = 4+4+5+5+5")
check(rooms.top_score([5, 4, 3, 2, 1], [1, 2, 3, 4, 5]) == 13, "Top: odwrotna kolejność = 13")
asg = rooms.top_assign(["A", "B"])
check(asg == {"A": "B", "B": "A"}, "Top: przy 2 osobach zgadują siebie nawzajem")
asg = rooms.top_assign(["A", "B", "C", "D"])
check(len(asg) == 4 and all(asg[k] != k for k in asg) and set(asg.values()) == set(asg), "Top: cykl bez zgadywania siebie, każdy raz")
check(rooms.top_assign(["A"]) == {}, "Top: jedna osoba — brak celów")

# zoom_frame niezależny od kadry
ms = json.loads(json.dumps(FX["movies"]))
ms[0]["zoom_frame"] = 999
r = rooms.Room("TEST", json.loads(json.dumps(FX["pack"])), ms, 1, FX["avail"])
r.add_player("A")
r.configure(modes=["zoom"])
# deterministycznie: tylko pierwszy film w puli zoom (wszystkie mają frames, pierwszy ma zoom_frame)
# podmieniamy pick przez ograniczenie puli
r.movies = [ms[0]]
r.start()
check(r.task["frame"] == 999, "Zoom: osobny kadr, nie frames[1]")
r2 = rooms.Room("TEST", json.loads(json.dumps(FX["pack"])), json.loads(json.dumps(FX["movies"])), 1, FX["avail"])
r2.add_player("A")
r2.configure(modes=["zoom"])
r2.movies = [json.loads(json.dumps(FX["movies"][0]))]  # bez zoom_frame
r2.start()
check(r2.task["frame"] == FX["movies"][0]["frames"][1], "Zoom: zapas to środkowy kadr z Kadry")

# merge custom
import types as _types
class Fake:
    pass

# merge_packs wymaga sqlite — testujemy czystą deduplikację przez ręczny typ
# (funkcja jest przy kon; tu sprawdzamy klucz tytułu+rok na liście filmów z rooms.load patrząc na logikę poza DB)
from rooms import merge_packs, availability, top_need, norm_settings
# availability top
av = rooms.availability(FX["pack"], FX["movies"][:3], False, {"top_n": 5})
check(not av["top"]["ok"] and av["top"]["need"] == 5 and av["top"]["reason"] == "movies", "Top niedostępny, gdy za mało filmów")
av = rooms.availability(FX["pack"], FX["movies"], False, {"top_n": 5})
check(av["top"]["ok"], "Top dostępny przy 8 filmach")

# Most: punktacja, ścieżka, graf lokalny
import most
check(most.most_score(3, True, first=True) == 1100, "Most: 3 filmy i premia za pierwsze miejsce")
check(most.most_score(3, True, first=False) == 1000, "Most: 3 filmy bez premii")
check(most.most_score(8, True) == 100, "Most: 8 filmów = minimum 100")
check(most.most_score(10, True) == 100, "Most: dłuższa niż cap i tak 100, jeśli doszedł")
check(most.most_score(2, False) == 0, "Most: brak dojścia = 0")

# graf z wspólnymi aktorami: A-film1-B-film2-C-film3-D  (3 filmy, dystans OK)
chain_movies = []
names = ["Ada", "Ben", "Cora", "Dan"]
for i in range(3):
    chain_movies.append({
        "id": 100 + i, "title": f"Link {i}", "year": 2000 + i, "poster": False,
        "frames": None, "cast": [{"name": names[i], "source_id": str(10 + i)},
                                 {"name": names[i+1], "source_id": str(11 + i)}],
    })
g = most.local_graph(chain_movies)
pair = most.pick_pair_from_graph(g, rng=__import__("random").Random(0))
check(pair is not None, "Most: istnieje ścieżka w grafie lokalnym")
start, goal, path = pair
check(start["kind"] == "person" and goal["kind"] == "person" and start["id"] != goal["id"], "Most: para to dwaj różni aktorzy")
nmov = most.path_movies(path)
check(3 <= nmov <= 4, f"Most: dobrana ścieżka ma 3–4 filmy (jest {nmov})")
check(most.is_adjacent is not None, "Most: is_adjacent istnieje")


print("Filmrun: lobby bez czasu, Start/Stop")
r = rooms.Room("FR01", {"id": "most", "name": "Filmrun", "name_en": "Filmrun", "slug": "filmrun", "color": "#F26B1D", "questions": [], "modes_off": ""},
               FX["movies"], 2, {"most": {"ok": True, "have": 1, "need": 1, "reason": None}}, kind="filmrun")
check(r.kind == "most", "kind filmrun aliasuje most")
A = r.add_player("A"); B = r.add_player("B")
pair = {"start": {"name": "Ada", "photo": "/actor/1.jpg", "link": {"label": "Filmweb", "url": "https://www.filmweb.pl/person/x-1"}},
        "goal": {"name": "Ben", "photo": "/actor/2.jpg", "link": {"label": "Filmweb", "url": "https://www.filmweb.pl/person/x-2"}}}
r.plan = [{"mode": "most", "start": pair["start"], "goal": pair["goal"], "started": {}, "stopped": {}, "winner": None, "dur": None, "step": None} for _ in range(2)]
r.round = 0
r.begin_round()
s = r.state(A)
check(s["duration"] is None and s["left"] is None, "Filmrun: brak limitu czasu")
check(s["can_start"] and not s["can_stop"] and s["start"]["name"] == "Ada", "przed Startem można tylko wystartować")
check(not r.answer(A, {"stop": True}, "pl")["ok"], "Stop przed Startem odrzucony")
st = r.answer(A, {"start": True}, "pl")
check(st["ok"] and "filmweb.pl/person/x-1" in (st.get("link") or {}).get("url", ""), "Start zwraca link profilu")
check(r.state(A)["can_stop"] and not r.state(B)["can_stop"], "tylko ten, kto wystartował, może Stop")
# B nie wystartował — nie wygrywa
check(not r.answer(B, {"stop": True}, "pl")["ok"], "B bez Startu nie wygrywa")
check(r.answer(A, {"stop": True}, "pl")["ok"] and r.task["winner"] == A["id"], "pierwszy Stop po Starcie wygrywa")
check(r.phase == "reveal" and A["history"][-1] == 1000 and B["history"][-1] == 0, "zwycięzca rundy: 1000 pkt")

print("Custom i zdjęcia: placeholder nie jest fotką")
js = open("static/game.js", encoding="utf-8").read()
check("qmark" in js and "isCustom" in js, "karta Custom ma znak zapytania, nie kolaż kadrów")
check("titleHints" in js and "titleMatches" in js, "podpowiedzi tytułów jak we Framed")
check("filmrun-home" in js and "filmrun-box" in js, "Filmrun ma osobny box na stronie głównej")
check("renderMostEntry(box)" not in js, "Filmrun nie jest doklejany do siatki pakietów")
css = open("static/style.css", encoding="utf-8").read()
cssn = css.replace(" ", "").replace("\n", "")
check("grid-template-columns:autominmax(0,1fr)auto" in cssn, "wyniki: siatka zostawia miejsce na punkty")
check("toplist li::before" in css and "content:none" in css, "Top: bez podwójnych numerów")
check(".stage.textstage.lvl{position:static" in cssn, "nagłówek rundy w textstage nie nachodzi na pytanie")
check(".stage:not(.textstage)img{" in cssn, "kadry: pełny kadr nie psuje zdjęć w Filmrun/textstage")
check("flex-wrap:nowrap" in cssn and ".fr-pair{" in css, "Filmrun: para aktorów w jednym rzędzie na pulpicie")
html = open("static/index.html", encoding="utf-8").read()
check('id="filmrun-home"' in html and html.find('id="packs"') < html.find('id="filmrun-home"'),
      "Filmrun jest pod listą pakietów w HTML")
import rooms as roomsmod
check(roomsmod.lic_total({"answers": []}) == roomsmod.LIC_BID_CAP, "licytacja bez listy: pułap deklaracji")
check(roomsmod.lic_total({"answers": [{"text": "A"}, {"text": "B"}, {"text": "C"}]}) == 3,
      "licytacja z listą: pułap to liczba odpowiedzi")
import filmrun_pool
pool = filmrun_pool.load_people()
check(90 <= len(pool) <= 110, f"pula Filmrun ma ok. 100 household names (jest {len(pool)})")
names = {p["name"] for p in pool}
for n in ("Chris Evans", "Samuel L. Jackson", "Michael B. Jordan"):
    check(n in names, f"pula zawiera {n}")
for n in ("Joanna Kulig", "Awkwafina", "Kinga Preis"):
    check(n not in names, f"pula bez średnio znanego nazwiska: {n}")
pair = filmrun_pool.pick_pair(lang="pl", rng=__import__("random").Random(1))
check(pair["start"]["name"] != pair["goal"]["name"], "pula: para to dwie różne osoby")
check(pair["start"]["imdb_id"].startswith("nm") and int(pair["start"]["filmweb_id"]) > 0, "pula: prawdziwe ID IMDb i Filmweb")
check("/static/filmrun/photos/" in pair["start"]["photo"] and "search" not in pair["start"]["link"]["url"],
      "pula: zdjęcie z assetów i profil, nie wyszukiwarka")
check(most.pick_filmrun_pair(None, [], lang="pl", rng=__import__("random").Random(2))["start"]["name"],
      "Filmrun dobiera parę bez TMDB i bez obsady z bazy")
import webscrape
check(webscrape.is_placeholder_url("https://fwcdn.pl/front/assets/images/t.gif"), "Filmweb t.gif to placeholder")
check(not webscrape.is_real_headshot(b"GIF89a" + b"x" * 2000), "GIF (t.gif) nie jest prawdziwym zdjęciem")
check(not webscrape.is_real_headshot(b"\xff\xd8\xff" + b"x" * 20), "za mały JPEG nie przechodzi")
# save_actor_photo nie ustawia id dla śmieci
import tempfile, os, db as dbmod
here = tempfile.mkdtemp()
old_db = os.environ.get("QUIZ_DB")
# db.connect uses quiz.db path; use isolated file via monkey if possible
# sprawdzamy tylko wyjątek na złym blobie bez ruszania quiz.db
try:
    webscrape.is_real_headshot(b"not-an-image")
    check(True, "is_real_headshot odrzuca nie-obrazek")
except Exception:
    check(False, "is_real_headshot nie powinien rzucać")
check(not webscrape.is_real_headshot(b"not-an-image"), "nie-obrazek odrzucony")

print("remake: etykiety w Ułóż po kolei")
pair = rooms.remake_tags([
    {"id": 1, "title": "A Nightmare on Elm Street", "pl_title": "Koszmar z ulicy Wiązów", "year": 1984},
    {"id": 2, "title": "Jaws", "pl_title": "Szczęki", "year": 1975},
    {"id": 3, "title": "The Nightmare on Elm Street", "pl_title": "Koszmar z ulicy Wiązów", "year": 2010},
    {"id": 4, "title": "Alien", "pl_title": "Obcy", "year": 1979},
])
check(pair == {1: "starszy", 3: "nowszy"}, "para remake: (starszy)/(nowszy), kinds articles znormalizowane")
triple = rooms.remake_tags([
    {"id": 1, "title": "Halloween", "pl_title": "Halloween", "year": 1978},
    {"id": 2, "title": "Halloween", "pl_title": "Halloween", "year": 2007},
    {"id": 3, "title": "Halloween", "pl_title": "Halloween", "year": 2018},
    {"id": 4, "title": "Jaws", "pl_title": "Szczęki", "year": 1975},
])
check(triple == {1: "1978", 2: "2007", 3: "2018"}, "3+ wersje: rok w nawiasie, nie dwa 'nowszy'")
pl_only = rooms.remake_tags([
    {"id": 1, "title": "Completely Different EN", "pl_title": "Koszmar z ulicy Wiązów", "year": 1984},
    {"id": 2, "title": "Other English Title", "pl_title": "Koszmar z ulicy Wiązów", "year": 2010},
])
check(pl_only == {1: "starszy", 2: "nowszy"}, "sparowanie po polskim tytule, gdy oryginały się różnią")
check(rooms.remake_tags([
    {"id": 1, "title": "Halloween", "year": 1978},
    {"id": 2, "title": "Halloween", "year": 1978},
]) == {}, "ten sam tytuł i rok: bez etykiety")
r, (A,) = room(1, modes=["kolejnosc"])
r.start()
blank = {"aliases": [], "frames": [], "poster": None, "cast": [], "quotes": []}
r.task["items"] = [
    {**blank, "id": 11, "title": "A Nightmare on Elm Street", "pl_title": "Koszmar z ulicy Wiązów", "year": 1984},
    {**blank, "id": 12, "title": "Halloween", "pl_title": "Halloween", "year": 1978},
    {**blank, "id": 13, "title": "A Nightmare on Elm Street", "pl_title": "Koszmar z ulicy Wiązów", "year": 2010},
    {**blank, "id": 14, "title": "Jaws", "pl_title": "Szczęki", "year": 1975},
]
st = r.state(A, "pl")
by = {m["id"]: m for m in st["items"]}
check(all(m.get("year") in (None, False) or "year" not in m for m in st["items"]), "w rundzie rok jest ukryty")
check(by[11].get("remake") == "starszy" and by[13].get("remake") == "nowszy", "stan rundy ma etykiety remake")
check(not by[12].get("remake") and not by[14].get("remake"), "inne tytuły bez etykiety")
r.end_round()
rev = r.state(A, "pl")["answer"]["items"]
byr = {m["id"]: m for m in rev}
check(byr[11].get("remake") == "starszy" and byr[11].get("year") == 1984, "odsłona: etykieta i rok")

print("licytacja: pula pytań bez listy odpowiedzi")
import sqlite3, tempfile, os
fd, qpath = tempfile.mkstemp(suffix=".db")
os.close(fd)
qcon = sqlite3.connect(qpath)
qcon.row_factory = sqlite3.Row
qcon.execute("CREATE TABLE questions (id INTEGER PRIMARY KEY, pack_id INTEGER, prompt_pl TEXT, prompt_en TEXT, answers TEXT, created REAL)")
qcon.executemany("INSERT INTO questions VALUES (?,?,?,?,?,1)", [
    (1, 1, "Pytanie 1", "Q 1", "[]"),
    (2, 1, "Pytanie 2", "Q 2", "[]"),
    (3, 1, "", "", "[]"),
    (4, 1, "Pytanie 4", "Q 4", '[{"text":"A"},{"text":"B"}]'),
    (5, 2, "Inny pakiet", "Other", "[]"),
])
qcon.commit()
loaded = rooms.load_questions(qcon, 1)
qcon.close(); os.remove(qpath)
check([q["id"] for q in loaded] == [1, 2, 4], "load_questions: pytania z treścią, też bez odpowiedzi; puste odrzucone")
check(loaded[0]["answers"] == [] and len(loaded[2]["answers"]) == 2, "pusta lista odpowiedzi zostaje, stare odpowiedzi też")

r, (A, B) = room(2, {"order": "fixed", "per_mode": True, "mode_rounds": {"licytacja": 5}}, modes=["licytacja"])
r.pack["questions"] = [
    {"id": 101 + i, "prompt_pl": f"Horror {i+1}", "prompt_en": f"Horror EN {i+1}", "answers": []}
    for i in range(13)
]
r.start()
seen = []
for i in range(5):
    check(r.mode == "licytacja", f"runda {i+1} to licytacja")
    seen.append(r.task["q"]["id"])
    check(r.state(A, "pl")["prompt"] == f"Horror {seen[-1]-100}", "prompt z puli pytań bez odpowiedzi")
    r.end_round()
    adv(r, rooms.REVEAL_SECONDS + 7)
check(len(seen) == len(set(seen)) == 5, f"5 rund, 5 różnych pytań z puli 13 ({seen})")

print("czas wyłączony i język tytułów")
check(rooms.DEFAULTS["titles"] == "ui", "domyślny język tytułów: ui")
check(rooms.norm_settings({})["titles"] == "ui", "puste ustawienia: titles=ui")
check(rooms.norm_settings({"titles": "pl"})["titles"] == "pl", "tytuły: tylko pl")
check(rooms.norm_settings({"titles": "en"})["titles"] == "en", "tytuły: tylko en")
check(rooms.norm_settings({"titles": "both"})["titles"] == "both", "tytuły: oba")
check(rooms.norm_settings({"titles": "xx"})["titles"] == "ui", "zły język tytułów -> ui")
check(rooms.norm_settings({"time": -1})["time"] == -1, "czas: -1 = bez limitu")
check(rooms.norm_settings({"time": "off"})["time"] == -1, "czas: off = bez limitu")
check(rooms.norm_settings({"mode_time": {"zoom": -1, "rok": 40}})["mode_time"] == {"zoom": -1, "rok": 40}, "nadpisanie trybu: -1 zostaje")
check(rooms.norm_settings({"top_own": -1, "top_guess": "bez"})["top_own"] == -1 and rooms.norm_settings({"top_own": -1, "top_guess": "bez"})["top_guess"] == -1, "top: bez limitu")

r, (A, B) = room(2, {"time": -1}, modes=["zoom"])
r.start()
check(r.plan[0]["dur"] is None and not r.has_timer(), "zoom bez limitu: dur=None")
s = r.state(A)
check(s.get("untimed") and s.get("duration") is None and s.get("can_end") and s.get("settings", {}).get("titles") == "ui", "stan: untimed, can_end, titles w ustawieniach")
title = "Movie " + str(r.task["movie"]["id"])
check(r.answer(A, {"text": title}, "pl").get("correct"), "A zgaduje bez zegara")
check(r.answer(B, {"text": title}, "pl").get("correct"), "B też zgaduje")
adv(r, 5)
check(r.phase == "round", "wszyscy odpowiedzieli, runda bez czasu nie kończy się sama")
check(r.next() is None or r.phase == "reveal", "host kończy rundę")
check(r.phase == "reveal" and r.state(A).get("untimed"), "odsłona czeka na gospodarza")
adv(r, rooms.REVEAL_SECONDS + 20)
check(r.phase == "reveal", "odsłona bez czasu nie przechodzi sama")
r.next()
check(r.phase == "round" and r.round == 1, "host puszcza następną rundę")

r, (A,) = room(1, {"time": 30, "mode_time": {"rok": -1}}, modes=["rok", "zoom"])
r.start()
# plan may mix; find modes
durs = {t["mode"]: t["dur"] for t in r.plan}
check(durs.get("rok") is None and durs.get("zoom") == 30, "limit tylko w wybranym trybie, rok bez czasu, zoom 30 s")

r, (A,) = room(1, {"time": -1}, modes=["licytacja"])
r.start()
check(r.plan[0]["dur"] == 30 and r.task.get("step") == 10, "globalny brak czasu nie psuje zegara licytacji")

r, (A,) = room(1, {"time": -1}, modes=["kadry"])
r.start()
check(r.task.get("dur") is None and r.task.get("stage") == 0, "kadry bez czasu startują od etapu 0")
s = r.state(A)
check(s.get("can_advance") and s.get("stage") == 0, "host może podać kolejny kadr")
r.advance(A)
check(r.task["stage"] == 1 and r.state(A)["stage"] == 1, "advance: kolejny kadr")
r.advance(A)
check(r.task["stage"] == 2 and not r.state(A).get("can_advance"), "ostatni kadr, brak dalszego advance")

print("porównanie wyników Top i Ułóż po kolei")
check(rooms.place_marks([1, 2, 3, 4], [1, 2, 3, 4]) == ["ok", "ok", "ok", "ok"], "identyczny układ: wszystko zielone")
check(rooms.place_marks([1, 3, 2, 4], [1, 2, 3, 4]) == ["ok", "bad", "bad", "ok"], "złe miejsca: czerwone, dobre: zielone")
check(rooms.place_marks([4, 3, 2, 1], [1, 2, 3, 4]) == ["bad", "bad", "bad", "bad"], "odwrotny układ: wszystko czerwone")
check(rooms.place_marks([1, 2], [1, 2, 3]) == ["ok", "ok"], "krótszy układ gracza")
check(rooms.place_marks([], [1, 2]) == [], "brak układu: puste oznaczenia")

r, (A,) = room(1, {"time": -1}, modes=["kolejnosc"])
r.start()
items = r.task["items"]
right = [m["id"] for m in sorted(items, key=lambda m: m["year"])]
wrong = list(reversed(right)) if right != list(reversed(right)) else right[1:] + right[:1]
r.answer(A, {"order": wrong}, "pl")
r.next()
ans = r.state(A, "pl")["answer"]
check(ans["order"] and ans["correct"] and ans["marks"], "odsłona układu: lewa (order) i prawa (correct) plus marks")
check([m["id"] for m in ans["order"]] == wrong, "lewa kolumna to układ gracza")
check([m["id"] for m in ans["correct"]] == right, "prawa kolumna to poprawna kolejność")
check(ans["marks"] == rooms.place_marks(wrong, right), "marks ok/bad po pozycjach")
check(all(m in ("ok", "bad") for m in ans["marks"]), "oznaczenia tylko ok albo bad")

r, (A, B) = room(2, {"time": -1, "top_n": 3, "top_own": -1, "top_guess": -1}, modes=["top"])
r.start()
ids = [m["id"] for m in r.task["items"]]
own_a, own_b = ids[:], list(reversed(ids))
check(r.answer(A, {"order": own_a}, "pl").get("ok") is not False, "A zapisuje topkę")
check(r.answer(B, {"order": own_b}, "pl").get("ok") is not False, "B zapisuje topkę")
adv(r, 2)
check(r.task.get("sub") == "own" and r.phase == "round", "top bez czasu: own nie przechodzi samo do zgadywania")
r.advance(A)
check(r.task.get("sub") == "guess", "host przechodzi do zgadywania")
# A zgaduje topkę celu
tgt = r.task["targets"][A["id"]]
truth = r.task["own"][tgt]
guess = list(reversed(truth)) if truth != list(reversed(truth)) else truth[1:] + truth[:1]
r.answer(A, {"order": guess}, "pl")
r.answer(B, {"order": r.task["own"][r.task["targets"][B["id"]]]}, "pl")
adv(r, 2)
check(r.phase == "round", "top guess bez czasu nie kończy się sam po odpowiedziach")
r.next()
mine = r.state(A, "pl")["answer"]["mine"]
check(mine["guess"] and mine["truth"] and mine["marks"], "odsłona top: twój układ, poprawna topka, marks")
check([m["id"] for m in mine["guess"]] == guess, "lewa: układ gracza")
check([m["id"] for m in mine["truth"]] == truth, "prawa: poprawna topka")
check(mine["marks"] == rooms.place_marks(guess, truth), "top marks ok/bad")

print("wyniki Top i Ułóż po kolei czekają na gospodarza")
for cfg in ({"time": -1}, {"time": 30}, {"time": -1, "top_own": 30, "top_guess": 30}):
    r, (A, B) = room(2, dict(cfg, top_n=3), modes=["top"])
    r.start()
    ids = [m["id"] for m in r.task["items"]]
    r.answer(A, {"order": ids}, "pl"); r.answer(B, {"order": list(reversed(ids))}, "pl")
    adv(r, 1)
    if r.task.get("sub") == "own":
        r.advance(A)
    for P in (A, B):
        r.answer(P, {"order": ids}, "pl")
    adv(r, 1)
    if r.phase == "round":
        r.next()
    check(r.phase == "reveal" and r.state(A).get("untimed"), f"Top {cfg}: odsłona oznaczona jako ręczna")
    adv(r, rooms.REVEAL_SECONDS + 60)
    check(r.phase == "reveal" and r.round == 0, f"Top {cfg}: wyniki nie przeskakują same")
for cfg in ({"time": -1}, {"time": 30}):
    r, (A,) = room(1, cfg, modes=["kolejnosc"])
    r.configure(rounds=2); r.start()
    r.answer(A, {"order": [m["id"] for m in r.task["items"]]}, "pl")
    adv(r, 1)
    if r.phase == "round":
        r.next()
    adv(r, rooms.REVEAL_SECONDS + 60)
    check(r.phase == "reveal" and r.round == 0, f"Ułóż po kolei {cfg}: wyniki czekają na gospodarza")
    r.next()
    check(r.phase == "round" and r.round == 1, "gospodarz puszcza kolejną rundę")
r, (A,) = room(1, {"time": 20}, modes=["zoom"])
r.start(); r.next()
check(r.phase == "reveal" and not r.state(A).get("untimed"), "Zoom z czasem: odsłona dalej automatyczna")
adv(r, rooms.REVEAL_SECONDS + 1)
check(r.phase != "reveal" or r.round == 1, "Zoom z czasem: po odsłonie sam przechodzi dalej")

print("Filmrun: Wylosuj jeszcze raz")
import filmrun_pool as _fp
r = rooms.Room("FR02", {"id": "most", "name": "Filmrun", "name_en": "Filmrun", "slug": "filmrun", "color": "#F26B1D", "questions": [], "modes_off": ""},
               FX["movies"], 1, {"most": {"ok": True, "have": 1, "need": 1, "reason": None}}, kind="filmrun")
A = r.add_player("A"); B = r.add_player("B")
p0 = _fp.pick_pair(lang="pl")
r.plan = [{"mode": "most", "start": p0["start"], "goal": p0["goal"], "started": {}, "stopped": {}, "winner": None, "dur": None, "step": None}]
r.round = 0; r.begin_round()
check(r.state(A)["can_reroll"] and not r.state(B)["can_reroll"], "przycisk losowania tylko u gospodarza")
r.answer(B, {"start": True}, "pl")
try:
    r.most_reroll(B, "pl"); check(False, "nie-gospodarz nie może losować")
except PermissionError:
    check(True, "nie-gospodarz nie może losować (odrzucone)")
check(r.task["start"]["id"] == p0["start"]["id"], "po odrzuconym losowaniu para bez zmian")
old = {p0["start"]["id"], p0["goal"]["id"]}
for i in range(15):
    prev = {r.task["start"]["id"], r.task["goal"]["id"]}
    out = r.most_reroll(A, "pl")
    now_ids = {r.task["start"]["id"], r.task["goal"]["id"]}
    if not (out["ok"] and not (now_ids & prev) and len(now_ids) == 2):
        check(False, "losowanie daje dwie nowe osoby, różne od obecnej pary")
check(True, "15 losowań: zawsze dwie nowe osoby, różne od poprzedniej pary")
s = r.state(B)
check(s["start"]["id"] == r.task["start"]["id"] and s["rerolls"] == 15, "wszyscy gracze widzą nową parę")
check(not s["started_names"] and s["can_start"], "losowanie zeruje Start graczy")
r.answer(A, {"start": True}, "pl"); r.answer(A, {"stop": True}, "pl")
check(not r.most_reroll(A, "pl")["ok"], "po zwycięstwie nie da się losować")

print("Bomba: gospodarz zalicza odpowiedzi, ukryty lont, wybuch")
r, (A, B, C) = room(3, {"bomb_fuse": "normal"}, modes=["bomba"])
r.configure(rounds=2)
r.start()
check(r.task["mode"] == "bomba" and r.task["sub"] == "ready", "runda zaczyna się od zapalenia lontu")
s = r.state(A)
check(s["can_judge"] and "examples" in s and s["prompt"], "gospodarz ocenia i widzi przykładowe odpowiedzi")
sB = r.state(B)
check(not sB["can_judge"] and "examples" not in sB, "gracze nie widzą przykładów")
check("fuse_end" not in json.dumps(sB) and sB["left"] is None and sB["duration"] is None, "dokładny czas wybuchu nie trafia do graczy")
check(not r.answer(B, {"light": True}, "pl")["ok"], "tylko gospodarz zapala lont")
check(r.answer(A, {"light": True}, "pl")["ok"] and r.task["sub"] == "live", "gospodarz zapala lont")
check(20 <= r.task["fuse"] <= 45, "lont normalny 20-45 s")
h0 = r.task["holder"]
check(r.answer(A, {"verdict": True}, "pl")["ok"] and r.task["holder"] != h0, "dobra: bomba idzie dalej")
check(not r.answer(A, {"verdict": True}, "pl")["ok"], "podwójne kliknięcie dobra nie przerzuca bomby drugi raz")
adv(r, 1)
h1 = r.task["holder"]
check(r.answer(A, {"verdict": False}, "pl")["ok"] and r.task["holder"] == h1 and r.task["sub"] == "live", "zła: ten sam gracz próbuje dalej, czas leci")
check(not r.answer(B, {"verdict": True}, "pl")["ok"], "gracz nie może zaliczyć sobie odpowiedzi")
heats = []
while r.phase == "round":
    heats.append(r.state(B)["heat"]); adv(r, 0.5)
check(heats == sorted(heats) and heats[-1] == 3, "tykanie przyspiesza (heat 0..3)")
check(r.phase == "reveal" and r.task["exploded"] and r.task["loser"] == h1, "wybuch: przegrywa trzymający bombę")
pts = {p["name"]: p["history"][-1] for p in r.players.values()}
loser = r.players[h1]["name"]
check(pts[loser] == 0, "trzymający bombę dostaje 0")
check(all(v >= 500 for k, v in pts.items() if k != loser), "pozostali +500 (plus 100 za zaliczoną odpowiedź)")
check(pts[r.players[h0]["name"]] == 600 if h0 != h1 else True, "za zaliczoną odpowiedź +100")
st = r.state(A)
check(st["untimed"] and st["answer"]["exploded"] and st["answer"]["loser_name"] == loser, "odsłona czeka na gospodarza")
adv(r, 60)
check(r.phase == "reveal", "bez automatycznego przejścia")
r.next()
check(r.phase == "round" and r.round == 1 and r.task["sub"] == "ready", "gospodarz przechodzi do kolejnej rundy")
r.answer(A, {"light": True}, "pl")
check(r.mult() == r.cfg["final_x"], "ostatnia runda z mnożnikiem")
r2, _ = room(2, {"bomb_fuse": "short"}, modes=["bomba"]); r2.start(); r2.answer(r2.players[r2.host], {"light": True}, "pl")
check(15 <= r2.task["fuse"] <= 30, "krótki lont 15-30 s")
pk = json.loads(json.dumps(FX["pack"])); pk["bombs"] = []
av = rooms.availability(pk, FX["movies"], False)
check(not av["bomba"]["ok"] and av["hotbuzz"]["ok"], "Bomba wymaga kategorii, Hot buzz 5 filmów z muzyką")
ms = json.loads(json.dumps(FX["movies"]))
for m in ms[4:]:
    m["music"] = False
check(not rooms.availability(FX["pack"], ms, False)["hotbuzz"]["ok"], "mniej niż 5 filmów z muzyką: Hot buzz niedostępny")

print("Hot buzz: muzyka, buzzer, blokada po pudle")
r, (A, B, C) = room(3, {"buzz_answer": 8}, modes=["hotbuzz"])
r.start()
t = r.task
check(t["movie"]["music"] and t["clip"] == "/music/%d.mp3" % t["movie"]["id"] and t["sub"] == "ready", "runda z klipem, czeka na start")
check(r.answer(B, {"ready": True}, "pl")["ok"] and B["id"] in r.state(A)["ready"], "gracz zgłasza gotowość (odblokowanie dźwięku)")
check(not r.answer(B, {"start": True}, "pl")["ok"], "tylko gospodarz startuje muzykę")
r.answer(A, {"start": True}, "pl")
s = r.state(B)
check(s["playing"] and s["music_pos"] < 0, "muzyka rusza u wszystkich po krótkim wyprzedzeniu")
check(not r.answer(B, {"buzz": True}, "pl")["ok"], "buzzer przed startem muzyki nie działa")
adv(r, 5)
check(abs(r.state(B)["music_pos"] - 4.0) < 0.01, "pozycja muzyki liczona przez serwer")
check(r.answer(B, {"buzz": True}, "pl")["ok"] and r.task["sub"] == "answer", "pierwszy buzzer przejmuje odpowiedź")
check(not r.answer(C, {"buzz": True}, "pl")["ok"], "drugi buzzer w tym czasie nie działa")
s = r.state(C)
check(not s["playing"] and s["buzzer_name"] == "B" and s["answer_left"] == 8, "muzyka pauzuje, 8 s na wpisanie")
check(not r.answer(C, {"text": "Movie 1"}, "pl")["ok"], "wpisać może tylko ten, kto wcisnął")
check(r.answer(B, {"text": "zupełnie nie to"}, "pl")["correct"] is False, "zły tytuł")
check(B["id"] in r.task["locked"] and r.task["sub"] == "play", "pudło: gracz zablokowany, muzyka gra dalej")
check(not r.answer(B, {"buzz": True}, "pl")["ok"], "zablokowany nie może wcisnąć ponownie")
adv(r, 2)
check(r.answer(C, {"buzz": True}, "pl")["ok"], "inni mogą wcisnąć po wznowieniu")
adv(r, 9)
check(C["id"] in r.task["locked"] and r.task["sub"] == "play", "brak odpowiedzi w czasie = pudło")
adv(r, 1)
pos = r.buzz_pos()
r.answer(A, {"buzz": True}, "pl")
title = r.task["movie"]["pl_title"]
res = r.answer(A, {"text": title}, "pl")
want = round(1000 - 500 * min(1, pos / r.task["clip_len"]))
check(res["correct"] and res["points"] == want * r.mult(), "dobry tytuł (polski): punkty maleją z czasem muzyki")
check(r.phase == "reveal" and A["history"][-1] == want * r.mult() and B["history"][-1] == 0, "punkty tylko dla zgadującego")
st = r.state(B)["answer"]
check(st["winner_name"] == "A" and st["title"] and len(st["tries"]) == 3, "odsłona: tytuł, zwycięzca, próby")
r, (A, B) = room(2, {}, modes=["hotbuzz"]); r.start(); r.answer(A, {"start": True}, "pl")
adv(r, 2); r.answer(A, {"buzz": True}, "pl"); r.answer(A, {"text": "nope"}, "pl")
adv(r, 1); r.answer(B, {"buzz": True}, "pl"); r.answer(B, {"text": "nope"}, "pl")
check(r.phase == "reveal" and not r.task["winner"], "wszyscy zablokowani: koniec rundy bez punktów")
r, (A, B) = room(2, {}, modes=["hotbuzz"]); r.start(); r.answer(A, {"start": True}, "pl")
adv(r, 30)
check(r.phase == "reveal" and r.state(A)["untimed"], "koniec klipu: koniec rundy, gospodarz przechodzi dalej")
r, (A, B) = room(2, {"titles": "en"}, modes=["hotbuzz"]); r.start(); r.answer(A, {"start": True}, "pl"); adv(r, 2)
r.answer(B, {"buzz": True}, "en")
check(r.answer(B, {"text": r.task["movie"]["title"]}, "en")["correct"], "angielski tytuł zaliczony w EN")
check(rooms.norm_settings({"buzz_answer": 99, "bomb_fuse": "x"})["buzz_answer"] == 20 and rooms.norm_settings({"bomb_fuse": "x"})["bomb_fuse"] == "normal", "zakresy ustawień nowych trybów")

print("migracja faza 7: addytywna, jednorazowe kategorie Bomby")
import shutil as _sh, tempfile as _tf, sqlite3 as _sq
_src = HERE / "quiz.db"
if _src.exists():
    _d = Path(_tf.mkdtemp(prefix="kadr-mig-")); _f = _d / "copy.db"; _sh.copy(_src, _f)
    _c0 = _sq.connect(_f); _before = _c0.execute("SELECT COUNT(*) FROM movies").fetchone()[0]; _c0.close()
    import db as _db
    _c = _db.init_db(_f, seed=False)
    _n1 = _c.execute("SELECT COUNT(*) FROM questions WHERE kind='bomba'").fetchone()[0]
    _packs = _c.execute("SELECT COUNT(*) FROM packs").fetchone()[0]
    check(_n1 >= _packs and _c.execute("SELECT COUNT(*) FROM movies").fetchone()[0] == _before, "kategorie Bomby dla każdego pakietu, filmy bez zmian")
    check(_c.execute("SELECT COUNT(*) FROM questions WHERE kind='licytacja'").fetchone()[0] >= 0 and
          {"music_on", "music_url", "music_error"} <= {r[1] for r in _c.execute("PRAGMA table_info(movies)")}, "nowe kolumny movies")
    _c.close()
    _c = _db.init_db(_f, seed=False)
    check(_c.execute("SELECT COUNT(*) FROM questions WHERE kind='bomba'").fetchone()[0] == _n1, "druga migracja nic nie dubluje")
    _c.execute("DELETE FROM questions WHERE kind='bomba'"); _c.commit(); _c.close()
    _c = _db.init_db(_f, seed=False)
    check(_c.execute("SELECT COUNT(*) FROM questions WHERE kind='bomba'").fetchone()[0] == 0, "usunięte przez admina kategorie nie wracają")
    _c.close(); _sh.rmtree(_d, ignore_errors=True)
import music as _music
check(_music.score_entry({"title": "Halloween (1978) Main Theme", "duration": 180}, "Halloween", 1978) is not None, "muzyka: motyw przyjęty")
check(_music.score_entry({"title": "Halloween Theme REACTION", "duration": 180}, "Halloween", 1978) is None
      and _music.score_entry({"title": "Halloween Theme 10 hours", "duration": 36000}, "Halloween", 1978) is None, "muzyka: reakcje i 10-godzinne pętle odrzucone")
_rms = [100.0] * 20 + [3000.0] * 30 + [200.0] * 60
check(18 <= _music.pick_window(_rms) <= 25, "muzyka: okno 25 s w najgłośniejszym fragmencie")
check(_music.url_start("https://youtu.be/abc?t=1m13s") == 73, "muzyka: start z linku")

# składnia frontendu — zepsuty i18n.js wyłącza całą stronę
import subprocess, pathlib
for name in ("static/i18n.js", "static/game.js", "static/admin.js", "static/rt.js"):
    r = subprocess.run(["node", "--check", str(pathlib.Path(__file__).parent / name)], capture_output=True, text=True)
    check(r.returncode == 0, f"składnia {name}" + (f": {r.stderr.strip()}" if r.returncode else ""))

print(f"\nOK: {OK} sprawdzeń")
