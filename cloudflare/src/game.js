// game.js - port silnika gry z rooms.py (te same zasady i punktacja). Stan to zwykły obiekt JSON,
// więc Durable Object może go zapisać w swoim SQLite i odtworzyć po hibernacji.

export const STAGE_SECONDS = 15;
export const REVEAL_SECONDS = 9;
export const STAGE_POINTS = [1000, 600, 300];
export const FIRST_BONUS = 100;
export const MAX_PLAYERS = 16;
export const MIN_QUOTES = 5;
export const MAX_ROUNDS = 30;
export const MODES = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "cytat"];
export const DURATION = { kadry: 3 * STAGE_SECONDS, zoom: 30, plakat: 30, cytat: 30, rok: 25, kolejnosc: 40 };
export const ACTOR_SECONDS = 6;
export const MAX_ACTORS = 8;
export const BID_SECONDS = 15;
export const ORDER_N = 4;
function castView(members) {
  return (members || []).map(c => {
    if (typeof c === "string") return { name: c, photo: null };
    const pid = c.photo_id;
    return { name: c.name || "", photo: pid ? `/actor/${pid}.jpg` : null };
  });
}

export const TITLE_MODES = new Set(["kadry", "zoom", "plakat", "aktorzy", "cytat"]);
export const VOICE_MODES = new Set([...TITLE_MODES, "licytacja"]);
export const JUDGE_GRACE = 15;
export const LIC_DONE_DELAY = 3;

const toInt = (v, lo, hi, dflt) => {
  const n = Math.trunc(Number(v));
  if (v === null || v === undefined || v === "" || typeof v === "boolean" || !Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(n, hi));
};
const isObj = x => x && typeof x === "object" && !Array.isArray(x);

// to samo co norm_settings w rooms.py
export function normSettings(d) {
  d = isObj(d) ? d : {};
  const mt = isObj(d.mode_time) ? d.mode_time : {}, mr = isObj(d.mode_rounds) ? d.mode_rounds : {}, ma = isObj(d.mode_answer) ? d.mode_answer : {};
  const t = toInt(d.time, 0, 120, 0);
  const pick = (src, ok, fn) => { const o = {}; for (const k of MODES) if (k in src && ok(k)) o[k] = fn(src[k]); return o; };
  return {
    time: t ? Math.max(10, t) : 0,
    mode_time: pick(mt, k => k !== "licytacja" && toInt(mt[k], 0, 120, 0) > 0, v => Math.max(10, toInt(v, 0, 120, 0))),
    order: d.order === "fixed" ? "fixed" : "mix",
    per_mode: !!d.per_mode,
    mode_rounds: pick(mr, () => true, v => toInt(v, 1, 10, 1)),
    answer: d.answer === "voice" ? "voice" : "type",
    mode_answer: pick(ma, k => VOICE_MODES.has(k) && ["type", "voice"].includes(ma[k]), v => v),
    judge: ["rotate", "host", "vote"].includes(d.judge) ? d.judge : "rotate",
    lic_answer: toInt(d.lic_answer, 10, 120, 30),
    lic_bid: toInt(d.lic_bid, 5, 60, 10),
    hints: d.hints !== false,
    final_x: toInt(d.final_x, 1, 3, 1),
  };
}

export class GameError extends Error {
  constructor(code, msg) { super(msg); this.code = code; this.key = msg; }
}

const now = () => Date.now() / 1000;
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
const rnd = () => Math.random();
const choice = a => a[Math.floor(rnd() * a.length)];
function sample(a, k) {
  const c = a.slice();
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  if (k > c.length) throw new GameError(400, "Sample larger than population");
  return c.slice(0, k);
}
function token(bytes) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------ dopasowanie odpowiedzi
export function normTitle(s) {
  s = String(s || "").replace(/ł/g, "l").replace(/Ł/g, "L").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/^(the|a|an) /, "");
  s = s.replace(/ (19|20)\d\d$/, "");
  return s.replace(/ /g, "");
}

export function lev(a, b, cap = 3) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)));
    prev = cur;
  }
  return prev[prev.length - 1];
}

export function distance(guess, title) {
  const g = normTitle(guess), t = normTitle(title);
  if (!g || !t) return null;
  if (g === t) return 0;
  const allowed = t.length < 4 ? 0 : t.length < 9 ? 1 : t.length < 16 ? 2 : 3;
  const d = lev(g, t, allowed);
  return d <= allowed ? d : null;
}

export function names(movie, lang) {
  const out = [movie.title, ...(movie.aliases || [])];
  if (lang === "pl" && movie.pl_title) {
    const pl = movie.pl_title;
    out.push(pl);
    const m = pl.match(/\s+[-\u2013:]\s+|:\s+|\.\s+/);
    const head = (m ? pl.slice(0, m.index) : pl).trim();
    if (head !== pl && normTitle(head).length >= 3) out.push(head);
  }
  return out;
}

export function movieDistance(guess, movie, lang) {
  const ds = names(movie, lang).map(n => distance(guess, n)).filter(d => d !== null);
  return ds.length ? Math.min(...ds) : null;
}

export function fallbackQuestion(movies) {
  return {
    id: 0, prompt_pl: "Ile filmów z tego pakietu wymienisz?", prompt_en: "How many films from this pack can you name?",
    answers: movies.map(m => ({ text: m.title, aliases: (m.pl_title ? [m.pl_title] : []).concat(m.aliases || []), pl: m.pl_title })),
  };
}

function answerDistance(guess, a) {
  const ds = [a.text, ...(a.aliases || [])].map(n => distance(guess, n)).filter(d => d !== null);
  return ds.length ? Math.min(...ds) : null;
}

export function bestAnswer(guess, answers, idxs) {
  const scored = [];
  for (const i of idxs) { const d = answerDistance(guess, answers[i]); if (d !== null) scored.push([d, i]); }
  if (!scored.length) return null;
  scored.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  if (scored.length > 1 && scored[0][0] === scored[1][0] && scored[0][0] > 0) return null;
  return scored[0][1];
}

// --------------------------------------------------------------------- pokój
// pack = {pack:{...,questions}, movies:[...], avail:{...}} z eksportu (deploy_cloudflare.py)
export function newRoom(code, data, rounds) {
  const avail = data.avail;
  return {
    code, pack: data.pack, avail,
    modes: MODES.filter(k => avail[k].ok),
    rounds: Math.max(1, Math.min(parseInt(rounds || 10, 10) || 10, MAX_ROUNDS)),
    cfg: normSettings({}),
    players: {}, order: [], host: null, phase: "lobby", round: 0, plan: [], task: null, t0: 0, feed: [],
    created: now(), touched: now(), version: 0,
  };
}

export class Game {
  // r = stan pokoju, movies = filmy pakietu, online = Set pid z otwartym połączeniem (null = wszyscy)
  constructor(r, movies, online = null) {
    this.r = r; this.movies = movies; this.online = online;
    if (!r.cfg) r.cfg = normSettings({});          // pokoje sprzed aktualizacji
  }
  get cfg() { return this.r.cfg; }

  event(kind, name, pts = null) {
    const r = this.r;
    r.feed.push({ t: now(), k: kind, name, pts });
    if (r.feed.length > 12) r.feed.splice(0, r.feed.length - 12);
    r.version++;
  }

  addPlayer(name) {
    const r = this.r;
    name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 18) || "Gracz";
    const taken = new Set(Object.values(r.players).map(p => p.name.toLowerCase()));
    const base = name; let n = 2;
    while (taken.has(name.toLowerCase())) { name = `${base} ${n}`; n++; }
    const pid = "p" + token(4);
    r.players[pid] = { id: pid, name, score: 0, token: token(12), seen: now(), got: null, ans: null, wrong: 0, history: [] };
    if (!r.host) r.host = pid;
    this.event("join", name);
    return r.players[pid];
  }

  removePlayer(pid) {
    const r = this.r, p = r.players[pid];
    if (!p) return;
    delete r.players[pid];
    this.event("leave", p.name);
    if (r.host === pid) r.host = Object.keys(r.players)[0] || null;
  }

  isOnline(p) { return !!p && (this.online ? this.online.has(p.id) : now() - p.seen < 20); }
  active() { return Object.values(this.r.players).filter(p => this.isOnline(p)); }
  onlineIds() { return Object.keys(this.r.players).filter(pid => this.isOnline(this.r.players[pid])); }
  pname(pid) { const p = this.r.players[pid]; return p ? p.name : null; }

  // --- ustawienia
  configure(modes, rounds, settings) {
    const r = this.r;
    if (!["lobby", "final"].includes(r.phase)) return;
    if (modes != null && Array.isArray(modes)) {
      const chosen = [...new Set(modes.filter(k => MODES.includes(k) && r.avail[k].ok))];
      if (chosen.length) r.modes = chosen;
    }
    if (rounds != null) r.rounds = toInt(rounds, 1, MAX_ROUNDS, r.rounds);
    if (settings != null) r.cfg = normSettings(settings);
    r.version++;
  }

  totalRounds() {
    const c = this.cfg, r = this.r;
    if (c.per_mode) return Math.min(MAX_ROUNDS, r.modes.reduce((s, k) => s + (c.mode_rounds[k] || 1), 0));
    return r.rounds;
  }

  planModes() {
    const c = this.cfg, ms = this.r.modes.slice();
    if (c.per_mode) {
      const seq = [];
      for (const k of ms) for (let i = 0; i < (c.mode_rounds[k] || 1); i++) seq.push(k);
      const s = seq.slice(0, MAX_ROUNDS);
      return c.order === "mix" ? sample(s, s.length) : s;
    }
    const order = c.order === "mix" ? sample(ms, ms.length) : ms;
    return Array.from({ length: this.r.rounds }, (_, i) => order[i % order.length]);
  }

  timing(t) {
    const c = this.cfg, mode = t.mode;
    if (mode === "licytacja") return [c.lic_answer, c.lic_bid];
    const s = c.mode_time[mode] || c.time;
    if (mode === "aktorzy") { const dur = s || ACTOR_SECONDS * t.cast.length; return [dur, r2(dur / t.cast.length)]; }
    const dur = s || DURATION[mode] || 30;
    return [dur, mode === "kadry" ? r2(dur / 3) : null];
  }

  isVoice(mode) {
    const c = this.cfg;
    return VOICE_MODES.has(mode) && (c.mode_answer[mode] || c.answer) === "voice";
  }

  start() {
    const r = this.r;
    if (!r.modes.length) throw new GameError(400, "no modes");
    const used = new Set(); r.plan = [];
    for (const mode of this.planModes()) {
      const t = this.makeTask(mode, used);
      if (t) { [t.dur, t.step] = this.timing(t); r.plan.push(t); }
    }
    for (const p of Object.values(r.players)) { p.score = 0; p.history = []; }
    r.round = 0; r.feed = [];
    this.beginRound();
  }

  pick(pool, used) {
    const fresh = pool.filter(m => !used.has(m.id));
    const m = choice(fresh.length ? fresh : pool);
    used.add(m.id);
    return m;
  }

  makeTask(mode, used) {
    const ms = this.movies;
    if (mode === "kadry" || mode === "zoom") {
      const m = this.pick(ms.filter(x => x.frames), used);
      const t = { mode, movie: m };
      if (mode === "zoom") Object.assign(t, { frame: m.frames[1], ox: Math.round((0.3 + rnd() * 0.4) * 1000) / 1000, oy: Math.round((0.3 + rnd() * 0.4) * 1000) / 1000 });
      return t;
    }
    if (mode === "plakat") {
      const m = this.pick(ms.filter(x => x.poster), used);
      return { mode, movie: m, style: choice(["pix", "tiles"]), seed: 1 + Math.floor(rnd() * 1e6) };
    }
    if (mode === "aktorzy") {
      const m = this.pick(ms.filter(x => (x.cast || []).length >= 3), used);
      return { mode, movie: m, cast: castView(m.cast.slice(-MAX_ACTORS)) };
    }
    if (mode === "cytat") {
      const m = this.pick(ms.filter(x => (x.quotes || []).length), used);
      const qs = m.quotes;
      const neutral = qs.filter(q => !q.lang);
      const base = choice(neutral.length ? neutral : qs);
      const quote = {};
      for (const lg of ["pl", "en"]) {
        const own = qs.filter(q => q.lang === lg);
        const q = (["", lg].includes(base.lang) && !own.length) ? base : choice(own.length ? own : [base]);
        quote[lg] = q.text;
      }
      return { mode, movie: m, quote };
    }
    if (mode === "rok") return { mode, movie: this.pick(ms.filter(x => x.year), used) };
    if (mode === "kolejnosc") {
      const byYear = new Map();
      for (const x of sample(ms, ms.length)) if (x.year && !byYear.has(x.year)) byYear.set(x.year, x);
      return { mode, items: sample([...byYear.values()], ORDER_N) };
    }
    if (mode === "licytacja") {
      const qs = this.r.pack.questions || [];
      const freshQ = qs.filter(q => !used.has("q" + q.id));
      const pool = freshQ.length ? freshQ : qs;
      const q = pool.length ? choice(pool) : fallbackQuestion(ms);
      used.add("q" + q.id);
      return { mode, q, bids: [], bidder: null, bid: 0, found: [], type_end: null };
    }
    return null;
  }

  get mode() { return this.r.task ? this.r.task.mode : null; }
  duration() { return this.r.task.dur; }
  mult() { const r = this.r; return r.plan.length && r.round === r.plan.length - 1 ? this.cfg.final_x : 1; }

  beginRound() {
    const r = this.r;
    const t = r.task = r.plan[r.round];
    r.phase = "round"; r.t0 = now();
    for (const p of Object.values(r.players)) { p.got = null; p.ans = null; p.wrong = 0; }
    const pl = Object.keys(r.players);
    t.voice = this.isVoice(t.mode);
    t.judge0 = pl.length ? pl[r.round % pl.length] : null;
    if (t.mode === "licytacja") {
      const s = pl.length ? Math.floor(rnd() * pl.length) : 0;
      Object.assign(t, { order: pl.slice(s).concat(pl.slice(0, s)), turn: 0, passed: [], leader: null, bids: [], bid: 0, bidder: null,
        found: [], type_end: null, done_at: null, turn_end: r.t0 + t.step });
    } else if (t.voice) Object.assign(t, { claims: [], peek: [] });
    r.version++;
  }

  // --- sędziowanie
  judge() {
    const r = this.r, c = this.cfg;
    if (c.judge === "vote") return null;
    let j = c.judge === "host" ? r.host : r.task.judge0;
    if (!this.isOnline(r.players[j])) j = this.isOnline(r.players[r.host]) ? r.host : (this.onlineIds()[0] ?? null);
    return j;
  }
  voters(claimant) {
    const others = this.onlineIds().filter(pid => pid !== claimant);
    if (!others.length) return [claimant];
    if (this.cfg.judge === "vote") return others;
    const j = this.judge();
    return j && j !== claimant ? [j] : others;
  }
  solo() { return this.onlineIds().length <= 1; }
  plays(p) {
    const t = this.r.task;
    if ((t.peek || []).includes(p.id)) return false;
    return this.cfg.judge === "vote" || this.solo() || p.id !== this.judge();
  }
  pending(pid) { return (this.r.task.claims || []).find(c => c.pid === pid && c.st === "wait") || null; }
  resolve(c) {
    const r = this.r;
    if (!r.players[c.pid]) { c.st = "gone"; return; }
    const vs = this.voters(c.pid);
    const yes = vs.filter(v => c.votes[v] === true).length, no = vs.filter(v => c.votes[v] === false).length;
    if (yes * 2 > vs.length) { c.st = "ok"; this.award(r.players[c.pid], c.el); }
    else if (no * 2 >= vs.length && no) { c.st = "no"; r.players[c.pid].wrong++; this.event("wrong", r.players[c.pid].name); }
  }
  seesSolution(p) {
    const t = this.r.task;
    if (!p || !t.voice || !TITLE_MODES.has(t.mode)) return false;
    if (p.got || t.peek.includes(p.id)) return true;
    if (this.solo()) return !!this.pending(p.id);
    return this.cfg.judge !== "vote" && p.id === this.judge();
  }
  licJudge() {
    const r = this.r, b = r.task.bidder;
    let j = this.judge();
    if (j === null || j === b)
      j = r.host !== b && this.isOnline(r.players[r.host]) ? r.host : (this.onlineIds().find(pid => pid !== b) ?? null);
    return j;
  }
  canCount(p) {
    const t = this.r.task;
    if (!p || !t.voice || !t.bidder) return false;
    const others = this.onlineIds().filter(pid => pid !== t.bidder);
    if (!others.length) return p.id === t.bidder;
    if (this.cfg.judge === "vote") return p.id !== t.bidder;
    return p.id === this.licJudge();
  }

  // --- punkty
  titlePoints(t, el) {
    const step = t.step;
    if (t.mode === "kadry") {
      const stage = Math.min(2, Math.floor(el / step));
      const within = (el - stage * step) / step;
      return [Math.trunc(STAGE_POINTS[stage] * (1 - 0.5 * Math.min(1, within))), stage];
    }
    if (t.mode === "aktorzy") { const k = Math.min(t.cast.length, Math.floor(el / step) + 1); return [Math.max(250, 1000 - 150 * (k - 1)), k]; }
    return [Math.trunc(1000 * (1 - 0.7 * Math.min(1, el / t.dur))), 0];
  }
  award(p, el) {
    const r = this.r;
    const order = Object.values(r.players).filter(q => q.got).length;
    let [pts, stage] = this.titlePoints(r.task, el);
    pts = (pts + (order === 0 ? FIRST_BONUS : 0)) * this.mult();
    p.got = { points: pts, stage, secs: r1(el), order: order + 1 };
    p.score += pts;
    this.event("guess", p.name, pts);
    return pts;
  }

  tick() {
    const r = this.r, n = now();
    if (r.phase === "round") {
      const el = n - r.t0, t = r.task, act = this.active();
      if (t.mode === "licytacja") {
        if (t.bidder === null) this.licTick(n);
        else if (n >= t.type_end) this.endRound();
        else if (!t.voice && t.found.length >= t.bid) this.endRound();
        else if (t.voice && t.done_at && n >= t.done_at + LIC_DONE_DELAY) this.endRound();
      } else if (t.voice) {
        for (const c of t.claims) if (c.st === "wait") this.resolve(c);
        if (r.phase !== "round") return;
        const pend = t.claims.filter(c => c.st === "wait");
        const players = act.filter(p => this.plays(p));
        if (el >= this.duration() + JUDGE_GRACE) { for (const c of pend) c.st = "late"; this.endRound(); }
        else if (!pend.length && (el >= this.duration() || (players.length && players.every(p => p.got)))) this.endRound();
      } else if (el >= this.duration() || (act.length && act.every(p => p.ans !== null || p.got))) this.endRound();
    } else if (r.phase === "reveal" && n - r.t0 >= REVEAL_SECONDS + (["kolejnosc", "licytacja"].includes(this.mode) ? 3 : 0)) {
      this.next();
    }
  }

  // kiedy stan zmieni się sam z siebie (granica etapu, koniec rundy, koniec tury) - pod alarm Durable Object
  nextWake() {
    const r = this.r;
    if (r.phase === "reveal") return r.t0 + REVEAL_SECONDS + (["kolejnosc", "licytacja"].includes(this.mode) ? 3 : 0);
    if (r.phase !== "round") return null;
    const t = r.task, n = now();
    const marks = [];
    if (t.mode === "licytacja") {
      if (t.bidder === null) marks.push(t.turn_end);
      else { marks.push(t.type_end); if (t.done_at) marks.push(t.done_at + LIC_DONE_DELAY); }
    } else {
      const dur = this.duration();
      marks.push(r.t0 + dur);
      if (t.voice) marks.push(r.t0 + dur + JUDGE_GRACE);
      if (t.mode === "kadry") marks.push(r.t0 + t.step, r.t0 + 2 * t.step);
      if (t.mode === "aktorzy") for (let k = 1; k < t.cast.length; k++) marks.push(r.t0 + k * t.step);
      if (t.mode === "cytat") marks.push(r.t0 + dur / 2);
    }
    const future = marks.filter(x => x > n + 0.001);
    return future.length ? Math.min(...future) : (t.voice && t.mode !== "licytacja" ? null : n);
  }

  // --- licytacja po kolei
  licTick(n) {
    const r = this.r, t = r.task;
    for (let guard = 0; guard <= t.order.length; guard++) {
      if (r.phase !== "round" || t.bidder !== null) return;
      const cur = t.order.length ? t.order[t.turn] : null;
      if (cur === null) return this.licClose();
      const p = r.players[cur];
      if (!p || !this.isOnline(p) || n >= t.turn_end) this.licAct(cur, null);
      else return;
    }
  }
  licAct(pid, bid) {
    const r = this.r, t = r.task;
    if (bid === null) t.passed.push(pid); else { t.bid = bid; t.leader = pid; }
    t.bids.push([pid, bid || 0]);
    this.event(bid === null ? "pass" : "bid", this.pname(pid) || "?", bid);
    const alive = t.order.filter(x => !t.passed.includes(x) && r.players[x]);
    if (!alive.length || (alive.length === 1 && alive[0] === t.leader) || (t.leader && t.bid >= t.q.answers.length)) return this.licClose();
    const n = t.order.length;
    for (let k = 1; k <= n; k++) { const j = (t.turn + k) % n; if (alive.includes(t.order[j])) { t.turn = j; break; } }
    t.turn_end = now() + t.step;
  }
  licClose() {
    const r = this.r, t = r.task;
    const b = r.players[t.leader] ? t.leader : null;
    if (!b) { t.bidder = ""; return this.endRound(); }
    t.bidder = b; t.type_end = now() + t.dur;
    this.event("bidwin", this.pname(b), t.bid);
  }

  endRound() {
    const r = this.r, t = r.task, x = this.mult();
    const pts = {};
    for (const [pid, p] of Object.entries(r.players)) pts[pid] = (p.got || {}).points || 0;
    if (t.mode === "rok") {
      for (const [pid, p] of Object.entries(r.players)) if (p.ans !== null) {
        const d = Math.abs(parseInt(p.ans, 10) - t.movie.year);
        pts[pid] = (d > 8 ? 0 : Math.round(1000 * Math.pow(0.7, d))) * x;
      }
    } else if (t.mode === "kolejnosc") {
      const right = t.items.slice().sort((a, b) => a.year - b.year).map(m => m.id);
      for (const [pid, p] of Object.entries(r.players)) if (p.ans && p.ans.length)
        pts[pid] = 250 * p.ans.filter((a, i) => a === right[i]).length * x;
    } else if (t.mode === "licytacja" && t.bidder) {
      t.success = t.found.length >= t.bid;
      for (const pid of Object.keys(r.players)) {
        if (t.success) pts[pid] = pid === t.bidder ? 200 * t.bid * x : 0;
        else pts[pid] = pid === t.bidder ? 0 : 100 * t.bid * x;
      }
    }
    for (const [pid, p] of Object.entries(r.players)) {
      if (!TITLE_MODES.has(t.mode)) { p.score += pts[pid]; p.got = pts[pid] ? { points: pts[pid] } : null; }
      p.history.push(pts[pid]);
    }
    r.phase = "reveal"; r.t0 = now();
    r.version++;
  }

  next() {
    const r = this.r;
    if (r.phase === "round") return this.endRound();
    if (r.round + 1 >= r.plan.length) { r.phase = "final"; r.version++; }
    else { r.round++; this.beginRound(); }
  }

  again() {
    const r = this.r;
    r.phase = "lobby";
    for (const p of Object.values(r.players)) { p.score = 0; p.history = []; p.got = null; }
    r.version++;
  }

  // --- odpowiedzi
  answer(p, d, lang) {
    const r = this.r;
    if (r.phase !== "round") return { ok: false };
    d = d || {};
    const t = r.task, el = now() - r.t0, mode = t.mode;
    if (TITLE_MODES.has(mode) && t.voice) {
      if (d.claim) {
        if (p.got || this.pending(p.id) || el >= this.duration() || !this.plays(p)) return { ok: false };
        t.claims.push({ pid: p.id, el: r2(el), st: "wait", votes: {} });
        this.event("claim", p.name);
        return { ok: true };
      }
      if (d.peek) {
        if (this.cfg.judge !== "vote" || p.got || this.pending(p.id)) return { ok: false };
        if (!t.peek.includes(p.id)) t.peek.push(p.id);
        r.version++; this.tick();
        return { ok: true };
      }
      if (d.judge) {
        const c = this.pending(String(d.judge));
        if (!c || !this.voters(c.pid).includes(p.id)) return { ok: false };
        c.votes[p.id] = !!d.verdict;
        this.resolve(c);
        r.version++; this.tick();
        return { ok: true, state: c.st };
      }
      return { ok: false };
    }
    if (TITLE_MODES.has(mode)) {
      if (p.got) return { ok: false };
      const text = String(d.text || "").slice(0, 120);
      if (movieDistance(text, t.movie, lang) === null) { p.wrong++; r.version++; return { ok: true, correct: false }; }
      const pts = this.award(p, el);
      this.tick();
      return { ok: true, correct: true, points: pts };
    }
    if (mode === "rok") {
      if (p.ans !== null) return { ok: false };
      const y = parseInt(d.year, 10);
      if (!(y >= 1880 && y <= 2100)) throw new GameError(400, "year");
      p.ans = y; this.event("answered", p.name); this.tick();
      return { ok: true };
    }
    if (mode === "kolejnosc") {
      if (p.ans !== null) return { ok: false };
      const ids = (d.order || []).map(x => parseInt(x, 10));
      const a = ids.slice().sort((x, y) => x - y).join(), b = t.items.map(m => m.id).sort((x, y) => x - y).join();
      if (a !== b) throw new GameError(400, "order");
      p.ans = ids; this.event("answered", p.name); this.tick();
      return { ok: true };
    }
    if (mode === "licytacja") {
      const ans = t.q.answers;
      if (t.bidder === null) {
        this.tick();
        if (t.bidder !== null || r.phase !== "round") return { ok: false };
        if (t.order[t.turn] !== p.id) return { ok: false, turn: false };
        if (d.pass) { this.licAct(p.id, null); return { ok: true }; }
        const raw = toInt(d.bid, 1, ans.length, null);
        if (raw === null) throw new GameError(400, "bid");
        if (raw <= t.bid) return { ok: false, low: true };
        this.licAct(p.id, raw);
        return { ok: true };
      }
      if (t.voice) {
        if (!this.canCount(p)) return { ok: false };
        const f = t.found;
        if ("mark" in d) {
          const i = toInt(d.mark, 0, ans.length - 1, null);
          if (i === null) return { ok: false };
          const k = f.findIndex(x => x.i === i);
          if (k >= 0) f.splice(k, 1); else f.push({ i, text: ans[i].text, pl: ans[i].pl || "" });
        } else if (toInt(d.count, -1, 1, 0) > 0) f.push({ i: null, text: "", pl: "" });
        else if (toInt(d.count, -1, 1, 0) < 0 && f.length) f.pop();
        else return { ok: false };
        t.done_at = f.length >= t.bid ? (t.done_at || now()) : null;
        r.version++; this.tick();
        return { ok: true, count: f.length };
      }
      if (p.id !== t.bidder) return { ok: false };
      const text = String(d.text || "").slice(0, 120);
      const got = new Set(t.found.map(f => f.i));
      const i = bestAnswer(text, ans, ans.map((_, k) => k).filter(k => !got.has(k)));
      if (i === null) {
        const dup = bestAnswer(text, ans, [...got].filter(k => k !== null).sort((x, y) => x - y));
        t.misses = (t.misses || 0) + 1; r.version++;
        return { ok: true, correct: false, duplicate: dup !== null };
      }
      t.found.push({ i, text: ans[i].text, pl: ans[i].pl || "" });
      r.version++; this.tick();
      return { ok: true, correct: true, title: ans[i].text };
    }
    return { ok: false };
  }

  // --- stan dla klienta (ten sam kształt co Room.state w rooms.py)
  static mview(m, lang, year = true) {
    const out = { id: m.id, title: m.title, pl_title: lang === "pl" ? m.pl_title : "" };
    if (year) out.year = m.year;
    return out;
  }
  static prompt(q, lang) { return lang === "en" ? (q.prompt_en || q.prompt_pl) : (q.prompt_pl || q.prompt_en); }
  static fview(f, lang) { return { title: f.text, pl_title: lang === "pl" ? (f.pl ?? "") : "" }; }
  static thumb(m) {
    if (m.frames) return `/frame/${m.frames[2]}.jpg`;
    if (m.poster) return `/poster/${m.id}.jpg`;
    return null;
  }

  sortedPlayers() {
    return Object.values(this.r.players).sort((a, b) => b.score - a.score || (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
  }

  state(me, lang = "pl") {
    const r = this.r, n = now(), t = r.task;
    const players = this.sortedPlayers();
    const pk = r.pack;
    const out = {
      code: r.code, phase: r.phase, round: r.round + 1,
      rounds: r.phase !== "lobby" && r.plan.length ? r.plan.length : this.totalRounds(),
      pack: { id: pk.id, name: pk.name, name_en: pk.name_en, slug: pk.slug, color: pk.color },
      host: r.host, me: me ? me.id : null, feed: r.feed.slice(-6),
      stage_seconds: STAGE_SECONDS, reveal_seconds: REVEAL_SECONDS,
      modes: r.modes, avail: r.avail, all_modes: MODES, min_quotes: MIN_QUOTES,
      settings: this.cfg, max_rounds: MAX_ROUNDS,
      players: players.map(p => ({
        id: p.id, name: p.name, score: p.score, online: this.isOnline(p),
        got: (r.phase !== "round" || TITLE_MODES.has(this.mode)) ? p.got : null,
        done: p.ans !== null || !!p.got, wrong: p.wrong, history: p.history,
      })),
    };
    if (r.phase !== "round" && r.phase !== "reveal") return out;
    const el = n - r.t0, mode = t.mode;
    Object.assign(out, { mode, voice: !!t.voice, mult: this.mult() });
    if (r.phase === "round") {
      out.elapsed = r2(el);
      if (mode !== "licytacja") { out.duration = this.duration(); out.left = r1(this.duration() - el); }
      if (mode === "kadry") {
        const stage = Math.min(2, Math.floor(el / t.step));
        Object.assign(out, { stage, frames: t.movie.frames.slice(0, stage + 1), stage_seconds: t.step });
      } else if (mode === "zoom") Object.assign(out, { img: `/frame/${t.frame}.jpg`, ox: t.ox, oy: t.oy });
      else if (mode === "plakat") Object.assign(out, { img: `/poster/${t.movie.id}.jpg`, style: t.style, seed: t.seed });
      else if (mode === "aktorzy") {
        const k = Math.min(t.cast.length, Math.floor(el / t.step) + 1);
        Object.assign(out, { cast: t.cast.slice(0, k), cast_total: t.cast.length, actor_seconds: t.step });
      } else if (mode === "cytat") {
        Object.assign(out, { quote: t.quote[["pl", "en"].includes(lang) ? lang : "pl"], hint_year: el >= this.duration() / 2 ? t.movie.year : null });
      } else if (mode === "rok") {
        Object.assign(out, { movie: Game.mview(t.movie, lang, false), img: Game.thumb(t.movie), mine: me ? me.ans : null });
      } else if (mode === "kolejnosc") {
        Object.assign(out, { items: t.items.map(m => ({ ...Game.mview(m, lang, false), img: Game.thumb(m) })), mine: me ? me.ans : null });
      }
      if (TITLE_MODES.has(mode) && t.voice) {
        const j = this.judge(), vote = this.cfg.judge === "vote";
        const mine = me && this.pending(me.id);
        Object.assign(out, {
          judge: vote ? null : j, judge_name: vote ? null : this.pname(j), judge_mode: this.cfg.judge, grace: JUDGE_GRACE,
          claims: t.claims.filter(c => ["wait", "ok", "no"].includes(c.st)).map(c => ({
            pid: c.pid, name: this.pname(c.pid) || "?", secs: r1(c.el), st: c.st,
            vote: me && me.id in c.votes ? c.votes[me.id] : null,
            can: !!(me && c.st === "wait" && this.voters(c.pid).includes(me.id)),
          })),
          can_claim: !!(me && !me.got && !mine && el < this.duration() && this.plays(me)),
          plays: !!(me && this.plays(me)),
          can_peek: !!(me && vote && !me.got && !mine && !t.peek.includes(me.id) && !this.solo()),
          solution: this.seesSolution(me) ? { title: t.movie.title, pl_title: t.movie.pl_title, year: t.movie.year } : null,
        });
      } else if (mode === "licytacja") {
        const ans = t.q.answers;
        Object.assign(out, {
          total: ans.length, prompt: Game.prompt(t.q, lang), bid_seconds: this.cfg.lic_bid, answer_seconds: t.dur, bid: t.bid,
          history: t.bids.map(([pid, b]) => ({ name: this.pname(pid) || "?", bid: b })).slice(-10),
        });
        if (t.bidder === null) {
          const cur = t.order.length ? t.order[t.turn] : null;
          Object.assign(out, {
            sub: "bid", turn: cur, turn_name: this.pname(cur), starter: t.order.length ? this.pname(t.order[0]) : null,
            leader: t.leader, leader_name: this.pname(t.leader),
            order: t.order.filter(pid => r.players[pid]).map(pid => ({ id: pid, name: r.players[pid].name, passed: t.passed.includes(pid), online: this.isOnline(r.players[pid]) })),
            duration: t.step, left: r1(t.turn_end - n), elapsed: r2(t.step - (t.turn_end - n)),
          });
        } else {
          const cc = this.canCount(me);
          const lj = this.cfg.judge === "vote" ? null : this.licJudge();
          Object.assign(out, {
            sub: "type", bidder: t.bidder, bidder_name: this.pname(t.bidder) || "?",
            duration: t.dur, left: r1(t.type_end - n), elapsed: r2(t.dur - (t.type_end - n)),
            found: t.found.map(f => Game.fview(f, lang)), count: t.found.length,
            misses: t.misses || 0, can_count: cc, counter_name: this.pname(lj),
            closing: t.done_at ? r1(t.done_at + LIC_DONE_DELAY - n) : null,
            answers: cc ? ans.map((a, k) => ({ i: k, title: a.text, pl_title: a.pl || "", found: t.found.some(f => f.i === k) })) : null,
          });
        }
      }
      return out;
    }
    out.left = r1(REVEAL_SECONDS - el);
    const ans = { mode };
    if (t.movie) {
      const m = t.movie;
      Object.assign(ans, Game.mview(m, lang), { frames: m.frames || [], poster: m.poster, img: Game.thumb(m) });
      if (mode === "aktorzy") ans.cast = t.cast;
      if (mode === "cytat") ans.quote = t.quote[["pl", "en"].includes(lang) ? lang : "pl"];
      if (mode === "zoom") ans.img = `/frame/${t.frame}.jpg`;
      if (mode === "plakat") ans.img = `/poster/${m.id}.jpg`;
      if (mode === "rok") ans.guesses = players.filter(p => p.ans !== null).map(p => ({ name: p.name, year: p.ans, points: p.history.length ? p.history[p.history.length - 1] : 0 }));
    }
    if (mode === "kolejnosc") ans.items = t.items.slice().sort((a, b) => a.year - b.year).map(m => ({ ...Game.mview(m, lang), img: Game.thumb(m) }));
    if (mode === "licytacja") {
      const got = new Set(t.found.map(f => f.i));
      Object.assign(ans, {
        bidder_name: this.pname(t.bidder || ""), bid: t.bid, success: t.success || false,
        total: t.q.answers.length, prompt: Game.prompt(t.q, lang),
        missed: t.q.answers.map((a, k) => [a, k]).filter(([, k]) => !got.has(k)).map(([a]) => Game.fview({ text: a.text, pl: a.pl || "" }, lang)).slice(0, 40),
        bids: t.bids.filter(([, b]) => b).map(([pid, b]) => ({ name: this.pname(pid) || "?", bid: b })),
        found: t.found.filter(f => f.i !== null).map(f => Game.fview(f, lang)), count: t.found.length,
      });
    }
    out.answer = ans;
    return out;
  }
}
