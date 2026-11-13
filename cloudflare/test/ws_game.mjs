// Test end-to-end przeciw `wrangler dev`: dwóch graczy po WebSocket przechodzi grę w kilku trybach.
// node test/ws_game.mjs [http://127.0.0.1:8788] [packId]
import WebSocket from "ws";
import fs from "node:fs";
const BASE = process.argv[2] || "http://127.0.0.1:8788", PACK = +(process.argv[3] || 1);
const data = JSON.parse(fs.readFileSync(new URL(`../build/data/pack-${PACK}.json`, import.meta.url)));
const byFrame = new Map(), byId = new Map();
for (const m of data.movies) { byId.set(m.id, m); for (const f of m.frames || []) byFrame.set(f, m); }
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const check = (ok, msg) => { log.push((ok ? "OK   " : "FAIL ") + msg); if (!ok) process.exitCode = 1; };

function client(code, me, lang) {
  const ws = new WebSocket(`${BASE.replace("http", "ws")}/api/rooms/${code}/ws?pid=${me.pid}&token=${encodeURIComponent(me.token)}&lang=${lang}`);
  const c = { ws, s: null, n: 0, pend: {}, states: 0 };
  ws.on("message", raw => { const m = JSON.parse(raw); if (m.t === "state") { c.s = m.s; c.states++; } else if (m.t === "r") c.pend[m.id]?.(m); });
  c.rpc = (a, b = {}) => new Promise(res => { const id = ++c.n; c.pend[id] = res; ws.send(JSON.stringify({ id, a, b })); });
  c.open = new Promise(r => ws.on("open", r));
  return c;
}
async function until(c, f, ms = 15000) { const t = Date.now(); while (!f(c.s)) { if (Date.now() - t > ms) throw new Error("timeout " + JSON.stringify(c.s && [c.s.phase, c.s.mode, c.s.sub])); await sleep(50); } }

// licytacja ma teraz timer od przeciwnika i werdykt - jej przebieg sprawdza test/rules.mjs
const modes = ["kadry", "rok", "kolejnosc", "aktorzy", "zoom", "plakat", "top"].filter(k => data.avail[k].ok);
const cr = await post("/api/rooms", { pack_id: PACK, rounds: modes.length, modes, name: "Ala" });
check(cr.code && cr.pid, `create room ${cr.code}`);
const jn = await post(`/api/rooms/${cr.code}/join`, { name: "Bob" });
check(jn.pid && jn.pid !== cr.pid, "join second player");
const A = client(cr.code, cr, "pl"), B = client(cr.code, jn, "en");
await Promise.all([A.open, B.open]);
await until(A, s => s && s.players.length === 2 && s.players.every(p => p.online));
check(true, "both online via WS (server push)");
const bad = await B.rpc("start"); check(!bad.ok && bad.code === 403, "non-host start rejected: " + bad.error);
await A.rpc("setup", { modes, rounds: modes.length });
await A.rpc("start");
const seen = new Set();
for (;;) {
  await until(A, s => ["round", "final"].includes(s.phase));
  const s = A.s; if (s.phase === "final") break;
  const round = s.round, mode = s.mode; seen.add(mode);
  if (["kadry", "zoom", "plakat", "aktorzy"].includes(mode)) {
    let m = mode === "kadry" ? byFrame.get(s.frames[0]) : mode === "zoom" ? byFrame.get(+s.img.match(/(\d+)\.jpg/)[1]) :
      mode === "plakat" ? byId.get(+s.img.match(/(\d+)\.jpg/)[1]) : mode === "cytat" ? data.movies.find(x => (x.quotes || []).some(q => q.text === s.quote)) : data.movies.find(x => x.cast.length && x.cast[0].name === (s.cast[0].name || s.cast[0]));
    const w = await B.rpc("guess", { text: "zzzz nie ma takiego" }); check(w.ok && !w.d.correct, `${mode}: wrong answer rejected`);
    const txt = m.pl_title || m.title;
    const r = await A.rpc("guess", { text: txt.toLowerCase() }); check(r.ok && r.d.correct, `${mode}: PL answer "${txt}" accepted, ${r.d && r.d.points} pts`);
    const r2 = await B.rpc("guess", { text: m.title }); check(r2.ok && r2.d.correct, `${mode}: EN answer "${m.title}" accepted`);
  } else if (mode === "rok") {
    const m = byId.get(s.movie.id);
    await A.rpc("guess", { year: m.year }); await B.rpc("guess", { year: m.year - 7 });
  } else if (mode === "kolejnosc") {
    const ids = s.items.map(i => i.id).sort((x, y) => byId.get(x).year - byId.get(y).year);
    await A.rpc("guess", { order: ids }); await B.rpc("guess", { order: ids.slice().reverse() });
  } else if (mode === "top") {
    const ids = s.items.map(i => i.id);
    await A.rpc("guess", { order: ids }); await B.rpc("guess", { order: ids.slice().reverse() });
    await until(A, s => s.sub === "guess" || s.phase !== "round");
    if (A.s.phase === "round") { await A.rpc("guess", { order: ids }); await B.rpc("guess", { order: ids }); }
  } else if (mode === "licytacja") {
    const q = data.pack.questions.find(q => q.prompt_pl === s.prompt || q.prompt_en === s.prompt);
    check(s.sub === "bid" && [cr.pid, jn.pid].includes(s.turn) && s.starter, `licytacja: random starter ${s.starter}`);
    const wrongTurn = s.turn === cr.pid ? B : A;
    const wt = await wrongTurn.rpc("guess", { bid: 1 }); check(wt.ok && wt.d.turn === false, "licytacja: out-of-turn bid rejected");
    if (s.turn === cr.pid) { await A.rpc("guess", { bid: 2 }); const lo = await B.rpc("guess", { bid: 1 }); check(lo.d.low, "licytacja: lower bid rejected"); await B.rpc("guess", { pass: true }); }
    else { await B.rpc("guess", { pass: true }); await A.rpc("guess", { bid: 2 }); }
    await until(A, s => s.phase !== "round" || s.sub === "type");
    check(A.s.sub === "type" && A.s.bidder === cr.pid && A.s.duration === 30, "licytacja: Ala wins with 2, 30 s to answer");
    const nb = await B.rpc("guess", { text: q.answers[0].text }); check(nb.ok && nb.d.ok === false, "licytacja: non-bidder cannot answer");
    const ans = q.answers.map(a => a.pl || a.text);
    for (const t of ans.slice(0, 2)) { const r = await A.rpc("guess", { text: t }); check(r.d.correct, `licytacja: answer "${t}"`); }
  }
  await until(A, s => s.phase === "reveal" || s.phase === "final" || s.round !== round);
  if (A.s.phase === "reveal") {
    await until(B, s => s.phase === "reveal");
    if (mode === "licytacja") check(A.s.answer.success, "licytacja: bid fulfilled");
    if (mode === "top" || mode === "kolejnosc") {
      check(A.s.untimed, `${mode}: wyniki czekają na gospodarza (untimed)`);
      await sleep(16000);
      check(A.s.phase === "reveal" && A.s.round === round, `${mode}: po 16 s dalej ekran wyników`);
    }
    const sc = Object.fromEntries(A.s.players.map(p => [p.name, p.score]));
    log.push(`     round ${round} ${mode}: scores ${JSON.stringify(sc)}`);
    await A.rpc("next");
  }
}
check(modes.every(m => seen.has(m)), `played modes: ${[...seen].join(", ")}`);
check(B.s.phase === "final" && B.states > 5, `B received ${B.states} pushed states, final reached`);
B.ws.close(); await sleep(400);
check(A.s.players.find(p => p.name === "Bob").online === false, "B disconnect visible to A");
const B2 = client(cr.code, jn, "en"); await B2.open; await until(B2, s => s && s.phase === "final");
await until(A, s => s.players.find(p => p.name === "Bob").online);
check(true, "B reconnect restores state");
const bogus = new WebSocket(`${BASE.replace("http", "ws")}/api/rooms/${cr.code}/ws?pid=${jn.pid}&token=wrong`);
const closeCode = await new Promise(r => bogus.on("close", c => r(c)));
check(closeCode === 4403, "bad token closed with 4403");
A.ws.close(); B2.ws.close();

// (odpowiedzi na głos zostały usunięte z gry, więc nie ma już drugiej gry "voice")

// Filmrun: "Wylosuj jeszcze raz" tylko dla gospodarza, nowa para trafia do wszystkich
{
  const c3 = await post("/api/rooms", { kind: "filmrun", pack_id: "most", rounds: 1, name: "Ala" });
  const j3 = await post(`/api/rooms/${c3.code}/join`, { name: "Bob" });
  const FA = client(c3.code, c3, "pl"), FB = client(c3.code, j3, "pl");
  await Promise.all([FA.open, FB.open]);
  await until(FA, s => s && s.players.length === 2);
  await FA.rpc("start");
  await until(FB, s => s.phase === "round" && s.mode === "most");
  check(FA.s.can_reroll && !FB.s.can_reroll, "filmrun: przycisk losowania tylko u gospodarza");
  const before = [FB.s.start.id, FB.s.goal.id];
  const no = await FB.rpc("reroll"); check(!no.ok && no.code === 403, "filmrun: losowanie od gracza odrzucone (403)");
  await FB.rpc("guess", { start: true });
  const yes = await FA.rpc("reroll"); check(yes.ok && yes.d.ok, "filmrun: gospodarz losuje nową parę");
  await until(FB, s => s.start && s.start.id !== before[0] && s.goal.id !== before[1]);
  const after = [FB.s.start.id, FB.s.goal.id];
  check(!after.some(x => before.includes(x)) && after[0] !== after[1], `filmrun: Bob widzi nową parę ${after.join(" -> ")}`);
  check(FB.s.can_start && !(FB.s.started_names || []).length && FB.s.rerolls === 1, "filmrun: Start wyzerowany po losowaniu");
  FA.ws.close(); FB.ws.close();
}
console.log(log.join("\n"));
