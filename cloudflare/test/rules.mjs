// Testy zasad portu (bez wranglera): node cloudflare/test/rules.mjs - te same scenariusze co test_rules.py
import { readFileSync } from "node:fs";
import { Game, newRoom, normSettings, JUDGE_GRACE, LIC_DONE_DELAY, LIC_BID_CAP, licTotal, topScore, topAssign, availability, mergePackData, MODES } from "../src/game.js";
import { mostScore, pathMovies, pickPairFromGraph, localGraph, pickFilmrunPair, poolPeople } from "../src/most.js";

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
let A, B, C, t;

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

console.log("zgadywanie tytułów: bez sędziego, gra sprawdza wpis");
{
  const [gg, [AA, BB]] = room(2, { answer: "voice", judge: "rotate" }, ["zoom"]);
  gg.start();
  s = st(gg, AA);
  check(!s.voice && !gg.isVoice("zoom") && !gg.isVoice("kadry"), "tryby tytułów nie są na głos");
  check(!s.can_claim, "brak zgłoszeń Mam!");
  check(!gg.answer(AA, { claim: true }, "pl").correct && !AA.got, "zgłoszenie głosowe nie zalicza tytułu");
  const typed = gg.answer(AA, { text: "Movie " + gg.r.task.movie.id }, "pl");
  check(typed.correct && AA.got.points > 0, "wpisany tytuł jest sprawdzany przez grę");
}

console.log("licytacja po kolei");
[g, [A, B, C]] = room(3, { lic_bid: 10, lic_answer: 30 }, ["licytacja"]);
g.start();
t = g.r.task;
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
check(s.sub === "wait_timer" && !s.timer_started && s.duration == null, "timer nie startuje sam");
check(!g.answer(C, { start_timer: true }, "pl").ok, "licytujący nie puszcza timera");
check(st(g, A).can_start_timer && st(g, B).can_start_timer, "przeciwnicy mogą puścić timer");
check(g.answer(A, { start_timer: true }, "pl").ok, "A puszcza timer");
s = st(g, C);
check(s.sub === "timed" && s.duration === 30 && s.left >= 29 && s.left <= 30, "po puszczeniu jest 30 s");
check(!g.answer(B, { start_timer: true }, "pl").ok, "drugi raz nie startuje");
adv(g, 31);
check(g.r.phase === "round" && g.r.task.sub === "verdict", "po czasie werdykt, runda jeszcze trwa");
check(st(g, A).can_verdict && st(g, B).can_verdict && !st(g, C).can_verdict, "oceniają pozostali, nie licytujący");
g.answer(A, { verdict: false }, "pl");
check(g.r.phase === "round", "jeden głos jeszcze nie kończy");
g.answer(B, { verdict: false }, "pl");
check(g.r.phase === "reveal" && !t.success && A.history.at(-1) === 300, "werdykt nie: pozostali dostają 100 x deklaracja");

[g, [A, B]] = room(2, {}, ["licytacja"]); g.start();
let cur = g.r.task.order[0];
g.answer(g.r.players[cur], { bid: 6 }, "pl");
check(g.r.task.bidder === cur, "deklaracja = wszystkie odpowiedzi kończy licytację");
[g, [A, B]] = room(2, {}, ["licytacja"]); g.start();
g.answer(g.r.players[g.r.task.order[0]], { pass: true }, "pl");
g.answer(g.r.players[g.r.task.order[1]], { pass: true }, "pl");
check(g.r.phase === "reveal" && g.r.task.bidder === "", "wszyscy spasowali: brak licytującego");

console.log("licytacja: werdykt sukcesu");
[g, [A, B, C]] = room(3, { lic_bid: 10, lic_answer: 10 }, ["licytacja"]);
g.start(); t = g.r.task;
t.order = [A.id, B.id, C.id];
t.turn = 0;
g.answer(A, { bid: 2 }, "pl"); g.answer(B, { pass: true }, "pl"); g.answer(C, { pass: true }, "pl");
check(t.bidder === A.id && st(g, A).sub === "wait_timer", "A licytuje, czeka na timer");
g.answer(B, { start_timer: true }, "pl");
adv(g, 11);
g.answer(B, { verdict: true }, "pl"); g.answer(C, { verdict: true }, "pl");
check(g.r.phase === "reveal" && t.success && A.history.at(-1) === 400, "werdykt tak: 200 x deklaracja");

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


console.log("Filmrun: lobby bez czasu, Start/Stop");
{
  const r = newRoom("FR01", { pack: { id: "most", name: "Filmrun", name_en: "Filmrun", slug: "filmrun", color: "#F26B1D", questions: [], modes_off: "" }, avail: { most: { ok: true, have: 1, need: 1, reason: null } } }, 2, "filmrun");
  check(r.kind === "most", "kind filmrun aliasuje most");
  const g = new Game(r, clone(FX.movies));
  const A = g.addPlayer("A"), B = g.addPlayer("B");
  const pair = {
    start: { name: "Ada", photo: "/actor/1.jpg", link: { label: "Filmweb", url: "https://www.filmweb.pl/person/x-1" } },
    goal: { name: "Ben", photo: "/actor/2.jpg", link: { label: "Filmweb", url: "https://www.filmweb.pl/person/x-2" } },
  };
  r.plan = [0, 1].map(() => ({ mode: "most", start: pair.start, goal: pair.goal, started: {}, stopped: {}, winner: null, dur: null, step: null }));
  r.round = 0;
  g.beginRound();
  let s = g.state(A, "pl");
  check(s.duration == null && s.left == null, "Filmrun: brak limitu czasu");
  check(s.can_start && !s.can_stop && s.start.name === "Ada", "przed Startem można tylko wystartować");
  check(!g.answer(A, { stop: true }, "pl").ok, "Stop przed Startem odrzucony");
  const stt = g.answer(A, { start: true }, "pl");
  check(stt.ok && (stt.link || {}).url.includes("filmweb.pl/person/x-1"), "Start zwraca link profilu");
  check(g.state(A, "pl").can_stop && !g.state(B, "pl").can_stop, "tylko ten, kto wystartował, może Stop");
  check(!g.answer(B, { stop: true }, "pl").ok, "B bez Startu nie wygrywa");
  check(g.answer(A, { stop: true }, "pl").ok && g.r.task.winner === A.id, "pierwszy Stop po Starcie wygrywa");
  check(g.r.phase === "reveal" && A.history.at(-1) === 1000 && B.history.at(-1) === 0, "zwycięzca rundy: 1000 pkt");
}
{
  const js = readFileSync(new URL("../../static/game.js", import.meta.url), "utf8");
  check(js.includes("qmark") && js.includes("isCustom"), "karta Custom ma znak zapytania, nie kolaż kadrów");
  check(js.includes("titleHints") && js.includes("titleMatches"), "podpowiedzi tytułów jak we Framed");
  check(js.includes("filmrun-home") && js.includes("filmrun-box"), "Filmrun ma osobny box na stronie głównej");
  check(!js.includes("renderMostEntry(box)"), "Filmrun nie jest doklejany do siatki pakietów");
  const css = readFileSync(new URL("../../static/style.css", import.meta.url), "utf8");
  const cssn = css.replace(/\s+/g, "");
  check(cssn.includes("grid-template-columns:autominmax(0,1fr)auto"), "wyniki: siatka zostawia miejsce na punkty");
  check(css.includes("toplist li::before") && css.includes("content:none"), "Top: bez podwójnych numerów");
  check(cssn.includes(".stage.textstage.lvl{position:static"), "nagłówek rundy w textstage nie nachodzi na pytanie");
  check(cssn.includes(".stage:not(.textstage)img{"), "kadry: pełny kadr nie psuje zdjęć w Filmrun/textstage");
  check(cssn.includes("flex-wrap:nowrap") && css.includes(".fr-pair{"), "Filmrun: para aktorów w jednym rzędzie na pulpicie");
  const pool = poolPeople();
  check(pool.length >= 100 && pool.length <= 160, `pula Filmrun ma 100–150 aktorów (jest ${pool.length})`);
  const pair = await pickFilmrunPair([], null, "pl", () => 0.1);
  check(pair.start.name && pair.start.name !== pair.goal.name, "pula CF: para to dwie różne osoby");
  check(String(pair.start.imdb_id).startsWith("nm") && Number(pair.start.filmweb_id) > 0, "pula CF: prawdziwe ID");
  check(pair.start.photo.includes("/static/filmrun/photos/") && !(pair.start.link.url.includes("search") || pair.start.link.url.includes("find/?")),
    "pula CF: zdjęcie z assetów i profil, nie wyszukiwarka");
  check(licTotal({ answers: [] }) === LIC_BID_CAP, "licytacja bez listy: pułap deklaracji");
  check(licTotal({ answers: [{}, {}] }) === 2, "licytacja z listą: pułap to liczba odpowiedzi");
}

console.log(`\nOK: ${OK} sprawdzeń`);
