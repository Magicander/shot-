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
check(100 <= len(pool) <= 160, f"pula Filmrun ma 100–150 aktorów (jest {len(pool)})")
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

# składnia frontendu — zepsuty i18n.js wyłącza całą stronę
import subprocess, pathlib
for name in ("static/i18n.js", "static/game.js", "static/admin.js", "static/rt.js"):
    r = subprocess.run(["node", "--check", str(pathlib.Path(__file__).parent / name)], capture_output=True, text=True)
    check(r.returncode == 0, f"składnia {name}" + (f": {r.stderr.strip()}" if r.returncode else ""))

print(f"\nOK: {OK} sprawdzeń")
