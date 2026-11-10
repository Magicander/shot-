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

print("na głos: sędzia rotuje")
r, (A, B, C) = room(3, {"answer": "voice", "judge": "rotate"}, modes=["zoom"])
r.start()
s = r.state(A)
check(s["voice"] and s["judge"] == A["id"] and s["solution"]["title"], "runda 1: sędzia A widzi odpowiedź")
check(r.state(B)["solution"] is None and r.state(B)["can_claim"], "gracz nie widzi odpowiedzi, może zgłosić")
check(not r.answer(A, {"claim": True}, "pl")["ok"], "sędzia nie zgłasza się")
adv(r, 3)
check(r.answer(B, {"claim": True}, "pl")["ok"], "B: Mam!")
adv(r, 2)
check(r.answer(C, {"claim": True}, "pl")["ok"], "C: Mam! (druga w kolejce)")
check([c["name"] for c in r.state(A)["claims"]] == ["B", "C"], "kolejność zgłoszeń")
check(not r.answer(C, {"judge": B["id"], "verdict": True}, "pl")["ok"], "C nie może oceniać")
check(r.answer(A, {"judge": B["id"], "verdict": True}, "pl")["state"] == "ok", "A: poprawna")
check(B["got"]["points"] == int(1000 * (1 - .7 * 3 / 30)) + 100, "punkty za czas zgłoszenia + bonus")
r.answer(A, {"judge": C["id"], "verdict": False}, "pl")
check(C["wrong"] == 1 and r.state(C)["can_claim"], "błędna -> można zgłosić ponownie")
r.answer(C, {"claim": True}, "pl"); r.answer(A, {"judge": C["id"], "verdict": True}, "pl")
check(r.phase == "reveal", "wszyscy zgadujący trafili -> koniec rundy")
r.next()
check(r.state(A)["judge"] == B["id"], "runda 2: sędzia B")
adv(r, 1, off=("B",)); adv(r, 25, off=("B",))
check(r.state(A)["judge"] == A["id"], "rozłączony sędzia -> gospodarz")
r.next(); r.next()
check(r.state(A)["judge"] == C["id"], "runda 3: sędzia C")
adv(r, 2)
r.answer(A, {"claim": True}, "pl")
adv(r, 30)
check(r.phase == "round", "po czasie zgłoszenie czeka na sędziego")
adv(r, rooms.JUDGE_GRACE)
check(r.phase == "reveal" and not A["got"], "timeout sędziego: zgłoszenie przepada")

print("na głos: gospodarz sędziuje")
r, (A, B) = room(2, {"answer": "voice", "judge": "host"}, modes=["kadry"])
r.start(); r.next(); r.next()
check(r.state(B)["judge"] == A["id"], "sędzią zawsze gospodarz")

print("na głos: głosowanie")
r, (A, B, C) = room(3, {"answer": "voice", "judge": "vote"}, modes=["plakat"])
r.start()
s = r.state(A)
check(s["judge"] is None and s["can_claim"] and s["can_peek"] and s["solution"] is None, "wszyscy grają, odpowiedź ukryta")
r.answer(A, {"claim": True}, "pl")
r.answer(B, {"judge": A["id"], "verdict": True}, "pl")
check(not A["got"], "1 z 2 głosów to jeszcze nie większość")
r.answer(C, {"judge": A["id"], "verdict": True}, "pl")
check(A["got"] and r.state(A)["solution"], "większość: poprawna, trafiony widzi odpowiedź")
r.answer(B, {"claim": True}, "pl")
r.answer(A, {"judge": B["id"], "verdict": False}, "pl")
check(B["wrong"] == 1 and not r.pending(B["id"]), "połowa na nie = większości na tak już nie będzie: błędna")
r.answer(C, {"peek": True}, "pl")
check(r.state(C)["solution"] and not r.state(C)["can_claim"], "podgląd odpowiedzi = koniec zgadywania")

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
check(s["sub"] == "type" and s["duration"] == 30 and 29 <= s["left"] <= 30, "zwycięzca ma 30 s")
for x in ("Answer 0", "Answer 0", "Answer 1"):
    r.answer(C, {"text": x}, "pl")
check(len(t["found"]) == 2, "wpisywanie: automatyczne sprawdzanie, powtórka odrzucona")
adv(r, 31)
check(r.phase == "reveal" and not t["success"] and A["history"][-1] == 300, "czas minął: pozostali dostają 100 x deklaracja")

r, (A, B) = room(2, {}, modes=["licytacja"]); r.start()
cur = r.task["order"][0]
r.answer(r.players[cur], {"bid": 6}, "pl")
check(r.task["bidder"] == cur, "deklaracja = wszystkie odpowiedzi kończy licytację")
r, (A, B) = room(2, {}, modes=["licytacja"]); r.start()
r.answer(r.players[r.task["order"][0]], {"pass": True}, "pl")
r.answer(r.players[r.task["order"][1]], {"pass": True}, "pl")
check(r.phase == "reveal" and r.task["bidder"] == "", "wszyscy spasowali: brak licytującego")

print("licytacja na głos")
r, (A, B, C) = room(3, {"answer": "voice", "judge": "rotate"}, modes=["licytacja"])
r.start(); t = r.task
t["order"] = [A["id"], B["id"], C["id"]]
r.answer(A, {"bid": 2}, "pl"); r.answer(B, {"pass": True}, "pl"); r.answer(C, {"pass": True}, "pl")
check(t["bidder"] == A["id"], "A licytuje")
s = r.state(B)
check(s["can_count"] and s["counter_name"] == "B" and s["answers"], "sędzia rundy (nie licytujący) liczy, widzi listę")
check(not r.state(C)["can_count"] and not r.answer(A, {"count": 1}, "pl")["ok"], "inni nie liczą")
r.answer(B, {"count": 1}, "pl"); r.answer(B, {"count": 1}, "pl"); r.answer(B, {"count": -1}, "pl")
check(len(t["found"]) == 1, "+1 / cofnij")
r.answer(B, {"mark": 4}, "pl")
check(len(t["found"]) == 2 and r.phase == "round" and r.state(B)["closing"], "osiągnięto deklarację: chwila na cofnięcie")
adv(r, rooms.LIC_DONE_DELAY + .1)
check(r.phase == "reveal" and t["success"] and A["history"][-1] == 400, "sukces: 200 x deklaracja")

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

print(f"\nOK: {OK} sprawdzeń")
