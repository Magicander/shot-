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


// Licytacja: wpis na żywo / Poprawnie od razu, wyniki czekają na gospodarza
{
  const cl = await post("/api/rooms", { pack_id: PACK, rounds: 1, modes: ["licytacja"], name: "Ala" });
  const jl = await post(`/api/rooms/${cl.code}/join`, { name: "Bob" });
  const LA = client(cl.code, cl, "pl"), LB = client(cl.code, jl, "en");
  await Promise.all([LA.open, LB.open]);
  await until(LA, s => s && s.players.length === 2 && s.players.every(p => p.online));
  await LA.rpc("setup", { modes: ["licytacja"], rounds: 1, settings: { order: "fixed", lic_answer: 30 } });
  await LA.rpc("start");
  await until(LA, s => s.phase === "round" && s.mode === "licytacja" && s.sub === "bid");
  const first = LA.s.turn === cl.pid ? LA : LB, second = first === LA ? LB : LA;
  await first.rpc("guess", { bid: 1 });
  await second.rpc("guess", { pass: true });
  await until(LA, s => s.sub === "wait_timer");
  const opp = LA.s.bidder === cl.pid ? LB : LA;
  const bidr = LA.s.bidder === cl.pid ? LA : LB;
  await opp.rpc("guess", { start_timer: true });
  await until(LA, s => s.sub === "timed");
  check(opp.s.can_verdict && !bidr.s.can_verdict, "licytacja: Poprawnie od razu u sprawdzającego");
  if (bidr.s.can_type && bidr.s.has_list) {
    const q = (data.pack.questions || []).find(q => q.prompt_pl === bidr.s.prompt || q.prompt_en === bidr.s.prompt) || (data.pack.questions || [])[0];
    const titles = (q && q.answers || []).map(a => a.pl || a.text).filter(Boolean);
    const r1 = await bidr.rpc("guess", { text: titles[0] || "zzzz" });
    check(r1.d && r1.d.correct, `licytacja: żywe dopasowanie "${titles[0]}"`);
  }
  const early = await opp.rpc("guess", { verdict: true });
  check(early.ok && early.d && early.d.ok !== false, "licytacja: werdykt w trakcie czasu");
  await until(LA, s => s.phase === "reveal", 8000);
  check(LA.s.untimed, "licytacja: wyniki czekają na gospodarza");
  await sleep(8000);
  check(LA.s.phase === "reveal", "licytacja: po 8 s dalej ekran wyników");
  await LA.rpc("next");
  LA.ws.close(); LB.ws.close();
}

// Bomba i Hot buzz: lont liczy serwer (alarm DO), klip z /music/, buzzer i blokada
if (data.avail.bomba && data.avail.bomba.ok && data.avail.hotbuzz && data.avail.hotbuzz.ok) {
  const c4 = await post("/api/rooms", { pack_id: PACK, rounds: 2, modes: ["bomba", "hotbuzz"], name: "Ala" });
  const j4 = await post(`/api/rooms/${c4.code}/join`, { name: "Bob" });
  const NA = client(c4.code, c4, "pl"), NB = client(c4.code, j4, "en");
  await Promise.all([NA.open, NB.open]);
  await until(NA, s => s && s.players.length === 2 && s.players.every(p => p.online));
  await NA.rpc("setup", { modes: ["bomba", "hotbuzz"], rounds: 2, settings: { bomb_fuse: "short", buzz_answer: 6, bomb_check: true } });
  await NA.rpc("start");
  const played = new Set();
  for (;;) {
    await until(NA, s => ["round", "final"].includes(s.phase));
    if (NA.s.phase === "final") break;
    const round = NA.s.round, mode = NA.s.mode; played.add(mode);
    if (mode === "bomba") {
      await until(NB, s => s.phase === "round" && s.mode === "bomba");
      check(NA.s.can_judge && !NB.s.can_judge && Array.isArray(NA.s.examples) && !("examples" in NB.s), "bomba: ocenia gospodarz, przykłady tylko u niego");
      const no = await NB.rpc("guess", { light: true }); check(!(no.ok && no.d && no.d.ok), "bomba: gracz nie zapala lontu");
      await NA.rpc("guess", { light: true });
      await until(NA, s => s.sub === "live");
      const raw = JSON.stringify(NB.s);
      check(!/"fuse_end"|"heat_at"|"lit_at"|"fuse":|"fuse_left"|"heat_left"/.test(raw), "bomba: stan nie zdradza czasu lontu");
      const h0 = NA.s.holder; await NA.rpc("guess", { verdict: true });
      await until(NA, s => s.holder !== h0);
      check(NA.s.passes === 1, "bomba: dobra przekazuje bombę");
      await sleep(700);
      const h1 = NA.s.holder; await NA.rpc("guess", { verdict: false });
      await sleep(200); check(NA.s.holder === h1 && NA.s.misses >= 1, "bomba: zła - ten sam gracz dalej");
      const noChk = await NB.rpc("guess", { check: true });
      check(!(noChk.ok && noChk.d && noChk.d.ok), "bomba: gracz nie klika Sprawdzam");
      check(NA.s.can_check && !NB.s.can_check, "bomba: Sprawdzam tylko u sędziego");
      await NA.rpc("guess", { check: true });
      await until(NA, s => s.paused || s.sub === "check");
      check(NA.s.paused && NB.s.paused && NA.s.can_resume && !NB.s.can_resume, "bomba: pauza widoczna u wszystkich");
      const pRaw = JSON.stringify(NA.s) + JSON.stringify(NB.s);
      check(!/"fuse_end"|"heat_at"|"lit_at"|"fuse":|"fuse_left"|"heat_left"/.test(pRaw), "bomba: pauza nie wycieka pozostałym czasem");
      await sleep(3000);
      check(NA.s.phase === "round" && (NA.s.paused || NA.s.sub === "check"), "bomba: zatrzymany lont nie wybucha przez 3 s");
      await NA.rpc("guess", { resume: true });
      await until(NA, s => s.sub === "live" && !s.paused);
      check(NA.s.holder === h1 && !NA.s.paused, "bomba: Wznów wraca do gry z tym samym trzymającym");
      const t0 = Date.now(), heats = new Set();
      while (NA.s.phase === "round" && Date.now() - t0 < 40000) { heats.add(NA.s.heat); await sleep(200); }
      await until(NA, s => s.phase === "reveal", 5000);
      const el = (Date.now() - t0) / 1000;
      check(NA.s.answer && NA.s.answer.exploded && NA.s.answer.loser === h1, `bomba: wybuch z alarmu serwera po ~${el.toFixed(0)} s, przegrywa trzymający`);
      check(heats.size >= 2, `bomba: tykanie przyspiesza (fazy ${[...heats].join(",")})`);
      const res = NA.s.answer.results || [], lo = res.find(x => x.lost), ot = res.find(x => !x.lost);
      check(lo && ot && lo.points < ot.points && ot.points >= 500, `bomba: runda ${ot && ot.name} +${ot && ot.points}, ${lo && lo.name} +${lo && lo.points}`);
    } else if (mode === "hotbuzz") {
      await until(NB, s => s.phase === "round" && s.mode === "hotbuzz");
      const id = +NA.s.clip.match(/(\d+)\.mp3/)[1], m = byId.get(id);
      const mp3 = await fetch(BASE + NA.s.clip);
      const buf = new Uint8Array(await mp3.arrayBuffer());
      check(mp3.ok && buf.length > 50000 && /audio/.test(mp3.headers.get("content-type") || ""), `hotbuzz: klip ${NA.s.clip} (${buf.length} B)`);
      await NA.rpc("guess", { ready: true }); await NB.rpc("guess", { ready: true });
      await NA.rpc("guess", { start: true });
      await until(NA, s => s.sub === "play");
      const early = await NB.rpc("guess", { buzz: true }); check(early.d && early.d.early, "hotbuzz: buzzer przed startem muzyki odrzucony");
      await sleep(1200);
      const bz = await NB.rpc("guess", { buzz: true }); check(bz.d && bz.d.buzzer, "hotbuzz: Bob pierwszy na buzzerze");
      await until(NA, s => s.sub === "answer");
      check(NA.s.buzzer === j4.pid && NA.s.playing === false, "hotbuzz: muzyka stoi, Bob odpowiada");
      const w = await NB.rpc("guess", { text: "zzzz" }); check(w.d && w.d.correct === false, "hotbuzz: zła odpowiedź");
      await until(NA, s => s.sub === "play");
      const lk = await NB.rpc("guess", { buzz: true }); check(lk.d && lk.d.locked, "hotbuzz: Bob zablokowany do końca rundy");
      await sleep(900);
      await NA.rpc("guess", { buzz: true });
      const ok = await NA.rpc("guess", { text: (m.pl_title || m.title).toLowerCase() });
      check(ok.d && ok.d.correct && ok.d.points >= 500, `hotbuzz: Ala "${m.pl_title || m.title}" +${ok.d && ok.d.points}`);
    }
    await until(NA, s => s.phase === "reveal" || s.round !== round);
    if (NA.s.phase === "reveal") { check(NA.s.untimed, `${mode}: wyniki czekają na gospodarza`); await NA.rpc("next"); }
  }
  check(played.has("bomba") && played.has("hotbuzz"), "rozegrano Bombę i Hot buzz");
  NA.ws.close(); NB.ws.close();
} else check(false, "build bez Bomby/Hot buzz - zbuduj z bazy z muzyką");
console.log(log.join("\n"));
