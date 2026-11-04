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
export const TITLE_MODES = new Set(["kadry", "zoom", "plakat", "aktorzy", "cytat"]);

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
    players: {}, order: [], host: null, phase: "lobby", round: 0, plan: [], task: null, t0: 0, feed: [],
    created: now(), touched: now(), version: 0,
  };
}

export class Game {
  // r = stan pokoju, movies = filmy pakietu, online = Set pid z otwartym połączeniem (null = wszyscy)
  constructor(r, movies, online = null) { this.r = r; this.movies = movies; this.online = online; }

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

  isOnline(p) { return this.online ? this.online.has(p.id) : now() - p.seen < 20; }
  active() { return Object.values(this.r.players).filter(p => this.isOnline(p)); }

  configure(modes, rounds) {
    const r = this.r;
    if (!["lobby", "final"].includes(r.phase)) return;
    if (modes != null) {
      const chosen = MODES.filter(k => modes.includes(k) && r.avail[k].ok);
      if (chosen.length) r.modes = chosen;
    }
    if (rounds != null) r.rounds = Math.max(1, Math.min(parseInt(rounds, 10), MAX_ROUNDS));
    r.version++;
  }

  start() {
    const r = this.r;
    if (!r.modes.length) throw new GameError(400, "no modes");
    const order = sample(r.modes, r.modes.length);
    const used = new Set(); r.plan = [];
    for (let i = 0; i < r.rounds; i++) {
      const t = this.makeTask(order[i % order.length], used);
      if (t) r.plan.push(t);
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
      return { mode, movie: m, cast: m.cast.slice(-MAX_ACTORS).map(c => c.name) };
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
      return { mode, q, bids: {}, bidOrder: [], bidder: null, bid: 0, found: [], type_end: null };
    }
    return null;
  }

  get mode() { return this.r.task ? this.r.task.mode : null; }

  duration() {
    const t = this.r.task;
    if (t.mode === "aktorzy") return ACTOR_SECONDS * t.cast.length;
    return DURATION[t.mode] || 30;
  }

  beginRound() {
    const r = this.r;
    r.task = r.plan[r.round];
    r.phase = "round"; r.t0 = now();
    for (const p of Object.values(r.players)) { p.got = null; p.ans = null; p.wrong = 0; }
    r.version++;
  }

  tick() {
    const r = this.r, n = now();
    if (r.phase === "round") {
      const el = n - r.t0, t = r.task, act = this.active();
      if (t.mode === "licytacja") {
        if (t.bidder === null) {
          if (el >= BID_SECONDS || (act.length && act.every(p => p.id in t.bids))) this.closeBids();
        } else if (n >= t.type_end || t.found.length >= t.bid) this.endRound();
      } else if (el >= this.duration() || (act.length && act.every(p => p.ans !== null || p.got))) this.endRound();
    } else if (r.phase === "reveal" && n - r.t0 >= REVEAL_SECONDS + (["kolejnosc", "licytacja"].includes(this.mode) ? 3 : 0)) {
      this.next();
    }
  }

  // kiedy stan zmieni się sam z siebie (granica etapu, koniec rundy) - pod alarm Durable Object
  nextWake() {
    const r = this.r;
    if (r.phase === "reveal") return r.t0 + REVEAL_SECONDS + (["kolejnosc", "licytacja"].includes(this.mode) ? 3 : 0);
    if (r.phase !== "round") return null;
    const t = r.task, n = now();
    const marks = [];
    if (t.mode === "licytacja") marks.push(t.bidder === null ? r.t0 + BID_SECONDS : t.type_end);
    else {
      const dur = this.duration();
      marks.push(r.t0 + dur);
      if (t.mode === "kadry") marks.push(r.t0 + STAGE_SECONDS, r.t0 + 2 * STAGE_SECONDS);
      if (t.mode === "aktorzy") for (let k = 1; k < t.cast.length; k++) marks.push(r.t0 + k * ACTOR_SECONDS);
      if (t.mode === "cytat") marks.push(r.t0 + dur / 2);
    }
    const future = marks.filter(x => x > n + 0.001);
    return future.length ? Math.min(...future) : n;
  }

  closeBids() {
    const r = this.r, t = r.task;
    const pids = t.bidOrder.filter(pid => pid in t.bids);
    if (!pids.length) { t.bidder = ""; return this.endRound(); }
    let best = pids[0];
    for (const pid of pids) {
      const [b, e] = t.bids[pid], [bb, be] = t.bids[best];
      if (b > bb || (b === bb && e < be)) best = pid;
    }
    const bid = t.bids[best][0];
    t.bidder = best; t.bid = bid; t.type_end = now() + Game.typeSeconds(bid);
    this.event("bidwin", r.players[best] ? r.players[best].name : "?", bid);
  }

  static typeSeconds(bid) { return Math.min(90, 15 + 5 * bid); }

  endRound() {
    const r = this.r, t = r.task;
    const pts = {};
    for (const [pid, p] of Object.entries(r.players)) pts[pid] = (p.got || {}).points || 0;
    if (t.mode === "rok") {
      for (const [pid, p] of Object.entries(r.players)) if (p.ans !== null) {
        const d = Math.abs(parseInt(p.ans, 10) - t.movie.year);
        pts[pid] = d > 8 ? 0 : Math.round(1000 * Math.pow(0.7, d));
      }
    } else if (t.mode === "kolejnosc") {
      const right = t.items.slice().sort((a, b) => a.year - b.year).map(m => m.id);
      for (const [pid, p] of Object.entries(r.players)) if (p.ans && p.ans.length)
        pts[pid] = 250 * p.ans.filter((a, i) => a === right[i]).length;
    } else if (t.mode === "licytacja" && t.bidder) {
      t.success = t.found.length >= t.bid;
      for (const pid of Object.keys(r.players)) {
        if (t.success) pts[pid] = pid === t.bidder ? 200 * t.bid : 0;
        else pts[pid] = pid === t.bidder ? 0 : 100 * t.bid;
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
    const t = r.task, el = now() - r.t0, mode = t.mode;
    if (TITLE_MODES.has(mode)) {
      if (p.got) return { ok: false };
      const text = String(d.text || "").slice(0, 120);
      if (movieDistance(text, t.movie, lang) === null) { p.wrong++; r.version++; return { ok: true, correct: false }; }
      const order = Object.values(r.players).filter(q => q.got).length;
      let pts, stage;
      if (mode === "kadry") {
        stage = Math.min(2, Math.floor(el / STAGE_SECONDS));
        const within = (el - stage * STAGE_SECONDS) / STAGE_SECONDS;
        pts = Math.trunc(STAGE_POINTS[stage] * (1 - 0.5 * Math.min(1, within)));
      } else if (mode === "aktorzy") {
        const k = Math.min(t.cast.length, Math.floor(el / ACTOR_SECONDS) + 1);
        pts = Math.max(250, 1000 - 150 * (k - 1)); stage = k;
      } else { pts = Math.trunc(1000 * (1 - 0.7 * Math.min(1, el / this.duration()))); stage = 0; }
      pts += order === 0 ? FIRST_BONUS : 0;
      p.got = { points: pts, stage, secs: r1(el), order: order + 1 };
      p.score += pts;
      this.event("guess", p.name, pts);
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
      if (t.bidder === null) {
        if (p.id in t.bids) return { ok: false };
        const raw = parseInt(d.bid, 10);
        if (Number.isNaN(raw)) throw new GameError(400, "bid");
        const bid = Math.max(1, Math.min(raw, t.q.answers.length));
        t.bids[p.id] = [bid, el]; t.bidOrder.push(p.id);
        this.event("bid", p.name); this.tick();
        return { ok: true };
      }
      if (p.id !== t.bidder) return { ok: false };
      const text = String(d.text || "").slice(0, 120);
      const ans = t.q.answers, got = new Set(t.found.map(f => f.i));
      const i = bestAnswer(text, ans, ans.map((_, k) => k).filter(k => !got.has(k)));
      if (i === null) {
        const dup = bestAnswer(text, ans, [...got].sort((x, y) => x - y));
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
      code: r.code, phase: r.phase, round: r.round + 1, rounds: r.plan.length || r.rounds,
      pack: { id: pk.id, name: pk.name, name_en: pk.name_en, slug: pk.slug, color: pk.color },
      host: r.host, me: me ? me.id : null, feed: r.feed.slice(-6),
      stage_seconds: STAGE_SECONDS, reveal_seconds: REVEAL_SECONDS,
      modes: r.modes, avail: r.avail, all_modes: MODES, min_quotes: MIN_QUOTES,
      players: players.map(p => ({
        id: p.id, name: p.name, score: p.score, online: this.isOnline(p),
        got: (r.phase !== "round" || TITLE_MODES.has(this.mode)) ? p.got : null,
        done: p.ans !== null || !!p.got, wrong: p.wrong, history: p.history,
      })),
    };
    if (r.phase !== "round" && r.phase !== "reveal") return out;
    const el = n - r.t0, mode = t.mode;
    out.mode = mode;
    if (r.phase === "round") {
      out.elapsed = r2(el);
      if (mode !== "licytacja") { out.duration = this.duration(); out.left = r1(this.duration() - el); }
      if (mode === "kadry") {
        const stage = Math.min(2, Math.floor(el / STAGE_SECONDS));
        out.stage = stage; out.frames = t.movie.frames.slice(0, stage + 1);
      } else if (mode === "zoom") Object.assign(out, { img: `/frame/${t.frame}.jpg`, ox: t.ox, oy: t.oy });
      else if (mode === "plakat") Object.assign(out, { img: `/poster/${t.movie.id}.jpg`, style: t.style, seed: t.seed });
      else if (mode === "aktorzy") {
        const k = Math.min(t.cast.length, Math.floor(el / ACTOR_SECONDS) + 1);
        Object.assign(out, { cast: t.cast.slice(0, k), cast_total: t.cast.length, actor_seconds: ACTOR_SECONDS });
      } else if (mode === "cytat") {
        Object.assign(out, { quote: t.quote[["pl", "en"].includes(lang) ? lang : "pl"], hint_year: el >= this.duration() / 2 ? t.movie.year : null });
      } else if (mode === "rok") {
        Object.assign(out, { movie: Game.mview(t.movie, lang, false), img: Game.thumb(t.movie), mine: me ? me.ans : null });
      } else if (mode === "kolejnosc") {
        Object.assign(out, { items: t.items.map(m => ({ ...Game.mview(m, lang, false), img: Game.thumb(m) })), mine: me ? me.ans : null });
      } else if (mode === "licytacja") {
        Object.assign(out, {
          total: t.q.answers.length, bid_seconds: BID_SECONDS, prompt: Game.prompt(t.q, lang),
          bidders: t.bidOrder.filter(pid => r.players[pid]).map(pid => r.players[pid].name),
          my_bid: me && t.bids[me.id] ? t.bids[me.id][0] : null,
        });
        if (t.bidder === null) Object.assign(out, { sub: "bid", left: r1(BID_SECONDS - el), duration: BID_SECONDS });
        else {
          const ts = Game.typeSeconds(t.bid);
          Object.assign(out, {
            sub: "type", bidder: t.bidder, bid: t.bid, bidder_name: (r.players[t.bidder] || {}).name || "?",
            duration: ts, left: r1(t.type_end - n), elapsed: r2(ts - (t.type_end - n)),
            found: t.found.map(f => Game.fview(f, lang)), misses: t.misses || 0,
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
        bidder_name: (r.players[t.bidder || ""] || {}).name ?? null, bid: t.bid, success: t.success || false,
        total: t.q.answers.length, prompt: Game.prompt(t.q, lang),
        missed: t.q.answers.map((a, k) => [a, k]).filter(([, k]) => !got.has(k)).map(([a]) => Game.fview({ text: a.text, pl: a.pl || "" }, lang)).slice(0, 40),
        bids: t.bidOrder.filter(pid => r.players[pid]).map(pid => ({ name: r.players[pid].name, bid: t.bids[pid][0] })),
        found: t.found.map(f => Game.fview(f, lang)),
      });
    }
    out.answer = ans;
    return out;
  }
}
