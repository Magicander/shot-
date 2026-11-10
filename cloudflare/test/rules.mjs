// Testy zasad portu (bez wranglera): node cloudflare/test/rules.mjs - te same scenariusze co test_rules.py
import { readFileSync } from "node:fs";
import { Game, newRoom, normSettings, JUDGE_GRACE, LIC_DONE_DELAY, topScore, topAssign, availability, mergePackData, MODES } from "../src/game.js";
import { mostScore, pathMovies, pickPairFromGraph, localGraph } from "../src/most.js";

const FX = JSON.parse(readFileSync(new URL("./fixture.json", import.meta.url)));
let T = 1000;
Date.now = () => T * 1000;
let OK = 0;
const check = (c, msg) => { if (!c) { console.log("FAIL: " + msg); process.exit(1); } OK++; console.log("  ok ", msg); };
const clone = x => JSON.parse(JSON.stringify(x));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function room(n = 3, settings = {}, modes = null) {
  const r = newRoom("TEST", { pack: clone(FX.pack), avail: FX.avail }, 10);
  const g = new Game(r, clone(FX.movies));
  const ps = [..."ABCDEFG"].slice(0, n).map(x => g.addPlayer(x));
  g.configure(modes, null, settings);
  return [g, ps];
}
function adv(g, s, off = []) {
  T += s;
  for (const p of Object.values(g.r.players)) if (!off.includes(p.name)) p.seen = T;
  g.tick();
}
const st = (g, p) => g.state(p, "pl");

console.log("ustawienia");
const DEF = { time: 0, mode_time: {}, order: "mix", per_mode: false, mode_rounds: {}, answer: "type", mode_answer: {}, judge: "rotate", lic_answer: 30, lic_bid: 10, hints: true, final_x: 1, top_n: 5, top_own: 45, top_guess: 45, most_time: 90 };
check(eq(normSettings({}), DEF), "domyślne ustawienia");
let d = normSettings({ time: 5, mode_time: { kadry: 500, licytacja: 40, xx: 3 }, order: "fixed", answer: "voice", mode_answer: { rok: "voice", zoom: "type" }, judge: "vote", lic_answer: 999, lic_bid: 1, final_x: 7, hints: false, mode_rounds: { rok: 50 } });
check(d.time === 10 && eq(d.mode_time, { kadry: 120 }), "czas przycięty do 10..120, licytacja bez nadpisania");
check(eq(d.mode_answer, { zoom: "type" }), "rok nie może być na głos");
check(eq([d.lic_answer, d.lic_bid, d.final_x, d.hints, d.judge], [120, 5, 3, false, "vote"]), "zakresy licytacji, mnożnik, podpowiedzi");
check(normSettings({ time: "abc", lic_answer: null, final_x: true }).time === 0, "śmieci -> domyślne");

console.log("czas i plan");
let [g, ps] = room(1, { time: 20, mode_time: { zoom: 45 }, order: "fixed", per_mode: true, mode_rounds: { kadry: 2, zoom: 1, aktorzy: 1, licytacja: 1 }, lic_answer: 30 }, ["zoom", "kadry", "aktorzy", "licytacja"]);
check(g.totalRounds() === 5, "rundy per tryb sumują się");
g.start();
check(eq(g.r.plan.map(t => t.mode), ["zoom", "kadry", "kadry", "aktorzy", "licytacja"]), "kolejność gospodarza");
check(g.r.plan[0].dur === 45, "nadpisanie czasu trybu");
check(g.r.plan[1].dur === 20 && Math.abs(g.r.plan[1].step - 6.67) < .01, "kadry: czas globalny / 3 etapy");
check(g.r.plan[3].dur === 20 && g.r.plan[3].step === 4, "aktorzy: czas dzielony na aktorów");
check(g.r.plan[4].dur === 30, "licytacja: 30 s na odpowiedź");
let s = st(g, ps[0]);
check(s.duration === 45 && s.settings.time === 20, "stan pokazuje czas rundy i ustawienia");
let [g2] = room(1, {}, ["kadry"]); g2.start();
check(g2.r.plan[0].dur === 45 && g2.r.plan[0].step === 15, "bez nadpisania: domyślne 3x15 s");

console.log("na głos: sędzia rotuje");
let A, B, C;
[g, [A, B, C]] = room(3, { answer: "voice", judge: "rotate" }, ["zoom"]);
g.start();
s = st(g, A);
check(s.voice && s.judge === A.id && s.solution.title, "runda 1: sędzia A widzi odpowiedź");
check(st(g, B).solution === null && st(g, B).can_claim, "gracz nie widzi odpowiedzi, może zgłosić");
check(!g.answer(A, { claim: true }, "pl").ok, "sędzia nie zgłasza się");
adv(g, 3);
check(g.answer(B, { claim: true }, "pl").ok, "B: Mam!");
adv(g, 2);
check(g.answer(C, { claim: true }, "pl").ok, "C: Mam! (druga w kolejce)");
check(eq(st(g, A).claims.map(c => c.name), ["B", "C"]), "kolejność zgłoszeń");
check(!g.answer(C, { judge: B.id, verdict: true }, "pl").ok, "C nie może oceniać");
check(g.answer(A, { judge: B.id, verdict: true }, "pl").state === "ok", "A: poprawna");
check(B.got.points === Math.trunc(1000 * (1 - .7 * 3 / 30)) + 100, "punkty za czas zgłoszenia + bonus");
g.answer(A, { judge: C.id, verdict: false }, "pl");
check(C.wrong === 1 && st(g, C).can_claim, "błędna -> można zgłosić ponownie");
g.answer(C, { claim: true }, "pl"); g.answer(A, { judge: C.id, verdict: true }, "pl");
check(g.r.phase === "reveal", "wszyscy zgadujący trafili -> koniec rundy");
g.next();
check(st(g, A).judge === B.id, "runda 2: sędzia B");
adv(g, 1, ["B"]); adv(g, 25, ["B"]);
check(st(g, A).judge === A.id, "rozłączony sędzia -> gospodarz");
g.next(); g.next();
check(st(g, A).judge === C.id, "runda 3: sędzia C");
adv(g, 2);
g.answer(A, { claim: true }, "pl");
adv(g, 30);
check(g.r.phase === "round", "po czasie zgłoszenie czeka na sędziego");
check(g.nextWake() > T, "alarm DO ustawiony na koniec czasu sędziego");
adv(g, JUDGE_GRACE);
check(g.r.phase === "reveal" && !A.got, "timeout sędziego: zgłoszenie przepada");

console.log("na głos: gospodarz sędziuje");
[g, [A, B]] = room(2, { answer: "voice", judge: "host" }, ["kadry"]);
g.start(); g.next(); g.next();
check(st(g, B).judge === A.id, "sędzią zawsze gospodarz");

console.log("na głos: głosowanie");
[g, [A, B, C]] = room(3, { answer: "voice", judge: "vote" }, ["plakat"]);
g.start();
s = st(g, A);
check(s.judge === null && s.can_claim && s.can_peek && s.solution === null, "wszyscy grają, odpowiedź ukryta");
g.answer(A, { claim: true }, "pl");
g.answer(B, { judge: A.id, verdict: true }, "pl");
check(!A.got, "1 z 2 głosów to jeszcze nie większość");
g.answer(C, { judge: A.id, verdict: true }, "pl");
check(A.got && st(g, A).solution, "większość: poprawna, trafiony widzi odpowiedź");
g.answer(B, { claim: true }, "pl");
g.answer(A, { judge: B.id, verdict: false }, "pl");
check(B.wrong === 1 && !g.pending(B.id), "połowa na nie = większości na tak już nie będzie: błędna");
g.answer(C, { peek: true }, "pl");
check(st(g, C).solution && !st(g, C).can_claim, "podgląd odpowiedzi = koniec zgadywania");

console.log("licytacja po kolei");
[g, [A, B, C]] = room(3, { lic_bid: 10, lic_answer: 30 }, ["licytacja"]);
g.start();
let t = g.r.task;
t.order = [B.id, C.id, A.id];
s = st(g, A);
check(s.sub === "bid" && s.turn === B.id && s.starter === "B", "losowy gracz zaczyna i jest pokazany");
check(s.answer_seconds === 30 && s.bid_seconds === 10, "zasady: 30 s na odpowiedź, 10 s na turę");
check(eq(g.answer(A, { bid: 3 }, "pl"), { ok: false, turn: false }), "nie twoja kolej");
g.answer(B, { bid: 2 }, "pl");
check(st(g, A).turn === C.id && t.leader === B.id, "B: 2, kolej C");
check(g.answer(C, { bid: 2 }, "pl").low, "trzeba podbić");
g.answer(C, { bid: 3 }, "pl");
check(Math.abs(g.nextWake() - (T + 10)) < .01, "alarm DO na koniec tury");
adv(g, 11);
check(t.passed.includes(A.id) && st(g, A).turn === B.id, "timeout A = pas");
g.answer(B, { pass: true }, "pl");
check(t.bidder === C.id && t.bid === 3, "zostaje jeden: wygrywa C z 3");
s = st(g, C);
check(s.sub === "type" && s.duration === 30 && s.left >= 29 && s.left <= 30, "zwycięzca ma 30 s");
for (const x of ["Answer 0", "Answer 0", "Answer 1"]) g.answer(C, { text: x }, "pl");
check(t.found.length === 2, "wpisywanie: automatyczne sprawdzanie, powtórka odrzucona");
adv(g, 31);
check(g.r.phase === "reveal" && !t.success && A.history.at(-1) === 300, "czas minął: pozostali dostają 100 x deklaracja");

[g, [A, B]] = room(2, {}, ["licytacja"]); g.start();
let cur = g.r.task.order[0];
g.answer(g.r.players[cur], { bid: 6 }, "pl");
check(g.r.task.bidder === cur, "deklaracja = wszystkie odpowiedzi kończy licytację");
[g, [A, B]] = room(2, {}, ["licytacja"]); g.start();
g.answer(g.r.players[g.r.task.order[0]], { pass: true }, "pl");
g.answer(g.r.players[g.r.task.order[1]], { pass: true }, "pl");
check(g.r.phase === "reveal" && g.r.task.bidder === "", "wszyscy spasowali: brak licytującego");

console.log("licytacja na głos");
[g, [A, B, C]] = room(3, { answer: "voice", judge: "rotate" }, ["licytacja"]);
g.start(); t = g.r.task;
t.order = [A.id, B.id, C.id];
g.answer(A, { bid: 2 }, "pl"); g.answer(B, { pass: true }, "pl"); g.answer(C, { pass: true }, "pl");
check(t.bidder === A.id, "A licytuje");
s = st(g, B);
check(s.can_count && s.counter_name === "B" && s.answers, "sędzia rundy (nie licytujący) liczy, widzi listę");
check(!st(g, C).can_count && !g.answer(A, { count: 1 }, "pl").ok, "inni nie liczą");
g.answer(B, { count: 1 }, "pl"); g.answer(B, { count: 1 }, "pl"); g.answer(B, { count: -1 }, "pl");
check(t.found.length === 1, "+1 / cofnij");
g.answer(B, { mark: 4 }, "pl");
check(t.found.length === 2 && g.r.phase === "round" && st(g, B).closing, "osiągnięto deklarację: chwila na cofnięcie");
adv(g, LIC_DONE_DELAY + .1);
check(g.r.phase === "reveal" && t.success && A.history.at(-1) === 400, "sukces: 200 x deklaracja");

console.log("mnożnik finału");
[g, [A]] = room(1, { final_x: 2, order: "fixed" }, ["zoom"]);
g.configure(null, 2); g.start(); g.next(); g.next();
check(st(g, A).mult === 2, "ostatnia runda x2");
g.answer(A, { text: "Movie " + g.r.task.movie.id }, "pl");
check(A.got.points === 2 * 1100, "punkty podwojone");
console.log("top, custom, zoom, most");
check(topScore([1,2,3,4,5],[1,2,3,4,5]) === 25, "Top: komplet = N*N");
check(topScore([2,1,3,4,5],[1,2,3,4,5]) === 23, "Top: pomyłka o 1 na dwóch miejscach");
check(topScore([5,4,3,2,1],[1,2,3,4,5]) === 13, "Top: odwrotna kolejność = 13");
let asg = topAssign(["A","B"], () => 0); // degenerates? better test structure
asg = topAssign(["A","B"]);
check(asg.A === "B" && asg.B === "A", "Top: przy 2 osobach zgadują siebie nawzajem");
asg = topAssign(["A","B","C","D"]);
check(Object.keys(asg).length === 4 && Object.keys(asg).every(k => asg[k] !== k) && new Set(Object.values(asg)).size === 4, "Top: cykl bez zgadywania siebie");
check(eq(topAssign(["A"]), {}), "Top: jedna osoba — brak celów");

// zoom_frame niezależny
let moviesZ = clone(FX.movies);
moviesZ[0].zoom_frame = 999;
let rz = newRoom("TEST", { pack: clone(FX.pack), avail: FX.avail }, 1);
let gz = new Game(rz, [moviesZ[0]]);
gz.addPlayer("A"); gz.configure(["zoom"], null, {}); gz.start();
check(gz.r.task.frame === 999, "Zoom: osobny kadr, nie frames[1]");
let rz2 = newRoom("TEST", { pack: clone(FX.pack), avail: FX.avail }, 1);
let gz2 = new Game(rz2, [clone(FX.movies[0])]);
gz2.addPlayer("A"); gz2.configure(["zoom"], null, {}); gz2.start();
check(gz2.r.task.frame === FX.movies[0].frames[1], "Zoom: zapas to środkowy kadr z Kadry");

const avLow = availability(FX.pack, FX.movies.slice(0, 3), { top_n: 5 });
check(!avLow.top.ok && avLow.top.need === 5 && avLow.top.reason === "movies", "Top niedostępny, gdy za mało filmów");
const avOk = availability(FX.pack, FX.movies, { top_n: 5 });
check(avOk.top.ok, "Top dostępny przy 8 filmach");

// merge custom: duplikat tytułu+roku odpada, zostaje bogatszy
const aPack = { pack: { id: 1, name: "A", name_en: "A", color: "#111", questions: [{ id: 1, prompt_pl: "q", prompt_en: "q", answers: [1, 2] }] },
  movies: [{ id: 1, title: "Same", year: 2000, frames: [1,2,3], poster: false, cast: [] }] };
const bPack = { pack: { id: 2, name: "B", name_en: "B", color: "#222", questions: [{ id: 2, prompt_pl: "q2", prompt_en: "q2", answers: [1, 2] }] },
  movies: [{ id: 99, title: "Same", year: 2000, frames: [1,2,3], poster: true, cast: [{ name: "X" }, { name: "Y" }, { name: "Z" }], zoom_frame: 7 }, { id: 2, title: "Other", year: 2001, frames: [4,5,6], poster: false, cast: [] }] };
const merged = mergePackData([aPack, bPack]);
check(merged.pack.id === "custom" && merged.pack.source_ids.join(",") === "1,2", "Custom: wirtualny pakiet z source_ids");
check(merged.movies.length === 2, "Custom: duplikat tytułu+roku scalony");
const kept = merged.movies.find(m => m.title === "Same");
check(kept.poster && kept.zoom_frame === 7 && (kept.cast || []).length === 3, "Custom: zostaje bogatsza wersja");
check(merged.pack.questions.length === 2, "Custom: pytania z obu pakietów");

check(mostScore(3, true, true) === 1100, "Most: 3 filmy i premia za pierwsze miejsce");
check(mostScore(3, true, false) === 1000, "Most: 3 filmy bez premii");
check(mostScore(8, true) === 100, "Most: 8 filmów = minimum 100");
check(mostScore(2, false) === 0, "Most: brak dojścia = 0");
const chain = [];
const names = ["Ada", "Ben", "Cora", "Dan"];
for (let i = 0; i < 3; i++) chain.push({ id: 100 + i, title: "Link " + i, year: 2000 + i, poster: false, frames: null,
  cast: [{ name: names[i], source_id: String(10 + i) }, { name: names[i + 1], source_id: String(11 + i) }] });
const pair = pickPairFromGraph(localGraph(chain), () => 0.3);
check(!!pair, "Most: istnieje ścieżka w grafie lokalnym");
const [stt, gl, path] = pair;
check(stt.kind === "person" && gl.kind === "person" && stt.id !== gl.id, "Most: para to dwaj różni aktorzy");
const nmov = pathMovies(path);
check(nmov >= 3 && nmov <= 4, "Most: dobrana ścieżka ma 3–4 filmy");

// przebieg Top w silniku
[g, [A, B]] = room(2, { top_n: 5, order: "fixed" }, ["top"]);
g.start();
check(g.r.task.mode === "top" && g.r.task.sub === "own" && g.r.task.items.length === 5, "Top: start we własnej fazie, 5 filmów");
const ids = g.r.task.items.map(m => m.id);
g.answer(A, { order: ids }, "pl");
g.answer(B, { order: ids.slice().reverse() }, "pl");
check(g.r.task.sub === "guess" && g.r.task.targets[A.id] === B.id && g.r.task.targets[B.id] === A.id, "Top: faza zgadywania, bez self-guess");
g.answer(A, { order: ids.slice().reverse() }, "pl");
g.answer(B, { order: ids }, "pl");
check(g.r.phase === "reveal", "Top: po zgadywaniu odsłona");
check(A.history.at(-1) === 25 && B.history.at(-1) === 25, "Top: oboje zgadli dokładnie, 25 pkt");

console.log(`\nOK: ${OK} sprawdzeń`);
