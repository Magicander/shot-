// room.js - jeden Durable Object na pokój. WebSockety z hibernacją (bez pollingu),
// stan w SQLite obiektu (ctx.storage), zegar rundy przez alarmy.
import { DurableObject } from "cloudflare:workers";
import { Game, GameError, newRoom, MAX_PLAYERS, mergePackData, availability, normTitle } from "./game.js";
import { errText } from "./i18n.js";
import { pickPair, localGraph, tmdbIsAdjacent, tmdbAdjacent, isAdjacentLocal, enrichLocal } from "./most.js";

const IDLE_TTL = 6 * 3600;          // pusty pokój znika po 6 h
const ACTIONS_HOST = new Set(["start", "next", "again", "kick", "setup", "advance", "reroll"]);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.movies = null;
    // "ping" -> "pong" bez budzenia obiektu (nie liczy się do limitu żądań)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get("room")) || null;
      this.movies = (await ctx.storage.get("movies")) || null;
    });
  }

  online(exclude = null) {
    const s = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude || ws.readyState > 1) continue;
      const a = ws.deserializeAttachment(); if (a && a.pid) s.add(a.pid); }
    return s;
  }
  game(exclude = null) {
    const g = new Game(this.room, this.movies, this.online(exclude));
    g._localGraph = this.localGraph || (this.movies ? localGraph(this.movies) : null);
    return g;
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
  }

  async schedule(g) {
    const wake = g.nextWake();
    const at = wake ? wake * 1000 + 30 : Date.now() + IDLE_TTL * 1000;
    await this.ctx.storage.setAlarm(at);
  }

  broadcast(g) {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (ws.readyState > 1) continue;
      if (!a) continue;
      const me = this.room.players[a.pid];
      if (!me) { try { ws.send(JSON.stringify({ t: "err", key: "Nie jesteś w tym pokoju", error: errText("Nie jesteś w tym pokoju", a.lang) })); ws.close(4403, "gone"); } catch {} continue; }
      try { ws.send(JSON.stringify({ t: "state", s: g.state(me, a.lang) })); } catch {}
    }
  }

  async commit(g, before) {
    g.tick();
    this.room.touched = Date.now() / 1000;
    await this.save();
    await this.schedule(g);
    if (this.room.version !== before) this.broadcast(g);
  }

  // ---------------------------------------------------------------- RPC z Workera
  async loadPackData(packId) {
    const res = await this.env.ASSETS.fetch(`https://assets.local/data/pack-${packId}.json`);
    if (!res.ok) return null;
    let data = await res.json();
    try {
      const stub = this.env.CONTENT.get(this.env.CONTENT.idFromName("content"));
      const mr = await stub.fetch(new Request("https://content/op", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "mergePack", data }),
      }));
      if (mr.ok) {
        const merged = await mr.json();
        data = { pack: merged.pack, movies: merged.movies, avail: merged.avail || data.avail };
      }
    } catch (e) { console.error("content merge failed", String(e)); }
    return data;
  }

  async loadAllMovies() {
    const res = await this.env.ASSETS.fetch("https://assets.local/data/packs.json");
    if (!res.ok) return [];
    const packsList = await res.json();
    const movies = [], seen = new Set();
    for (const p of packsList) {
      if (p.custom || p.id === "custom") continue;
      const data = await this.loadPackData(p.id);
      if (!data) continue;
      for (const m of data.movies || []) {
        const key = `${normTitle(m.title)}|${m.year || -1}`;
        if (seen.has(key)) continue;
        seen.add(key);
        movies.push(m);
      }
    }
    return movies;
  }

  async create(code, packId, rounds, modes, name, settings = null, opts = {}) {
    if (this.room) return { error: "exists" };
    let kind = (opts && opts.kind) || (packId === "most" || packId === "filmrun" ? "most" : packId === "custom" ? "custom" : "pack");
    if (kind === "filmrun" || kind === "bridge") kind = "most";
    let data;
    if (kind === "most") {
      const movies = await this.loadAllMovies();
      data = {
        pack: { id: "most", slug: "filmrun", name: "Filmrun", name_en: "Filmrun", color: "#F26B1D", questions: [], modes_off: "" },
        movies,
        avail: { most: { ok: true, have: 1, need: 1, reason: null } },
      };
    } else if (kind === "custom") {
      const ids = [...new Set((opts.pack_ids || []).map(Number).filter(n => n > 0))];
      const datas = [];
      for (const id of ids) {
        const one = await this.loadPackData(id);
        if (one) datas.push(one);
      }
      if (!datas.length) throw new GameError(400, "Wybierz przynajmniej jeden pakiet");
      const merged = mergePackData(datas);
      merged.avail = availability(merged.pack, merged.movies, settings);
      if (!Object.values(merged.avail).some(v => v.ok)) throw new GameError(400, "Za mało filmów w wybranych pakietach");
      data = merged;
    } else {
      data = await this.loadPackData(packId);
      if (!data) throw new GameError(404, "Nie ma takiego pakietu");
      if (!Object.values(data.avail || {}).some(v => v.ok)) throw new GameError(400, "Ten pakiet nie ma jeszcze gotowych filmów");
    }
    this.movies = data.movies;
    this.localGraph = localGraph(this.movies);
    this.room = newRoom(code, data, rounds, kind);
    const g = this.game();
    if ((modes && modes.length && kind !== "most") || settings) g.configure(modes && modes.length && kind !== "most" ? modes : null, null, settings);
    const p = g.addPlayer(name);
    await this.ctx.storage.put("movies", this.movies);
    await this.save();
    await this.schedule(g);
    return { code, pid: p.id, token: p.token };
  }

  async peek() {
    if (!this.room) return null;
    return { code: this.room.code, pack: this.room.pack.name, phase: this.room.phase, players: Object.keys(this.room.players).length };
  }

  async join(name) {
    if (!this.room) throw new GameError(404, "Nie ma pokoju o tym kodzie");
    if (Object.keys(this.room.players).length >= MAX_PLAYERS) throw new GameError(400, "Pokój jest pełny");
    const g = this.game(), before = this.room.version;
    const p = g.addPlayer(name);
    await this.commit(g, before);
    return { code: this.room.code, pid: p.id, token: p.token };
  }

  // ---------------------------------------------------------------- WebSocket
  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    const pid = url.searchParams.get("pid") || "", tok = url.searchParams.get("token") || "";
    const lang = url.searchParams.get("lang") === "en" ? "en" : "pl";
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [pid]);
    const p = this.room && this.room.players[pid];
    if (!this.room || !p || !safeEq(p.token, tok)) {
      const key = this.room ? "Nie jesteś w tym pokoju" : "Nie ma pokoju o tym kodzie";
      server.send(JSON.stringify({ t: "err", key, error: errText(key, lang) }));
      server.close(this.room ? 4403 : 4404, "denied");
      return new Response(null, { status: 101, webSocket: client });
    }
    // starsze połączenie tego samego gracza (np. druga karta) zostaje, liczy się jako online
    server.serializeAttachment({ pid, lang });
    p.seen = Date.now() / 1000;
    const g = this.game();
    const before = this.room.version - 1;          // wymuś rozesłanie: status online się zmienił
    await this.commit(g, before);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    let m;
    try { m = JSON.parse(typeof msg === "string" ? msg : new TextDecoder().decode(msg)); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    if (!this.room) return;
    const p = this.room.players[a.pid];
    const reply = (ok, d) => { try { ws.send(JSON.stringify({ t: "r", id: m.id, ok, ...(ok ? { d } : d) })); } catch {} };
    if (!p) return reply(false, { key: "Nie jesteś w tym pokoju", error: errText("Nie jesteś w tym pokoju", a.lang), code: 403 });
    if (m.a === "lang") { a.lang = m.lang === "en" ? "en" : "pl"; ws.serializeAttachment(a); ws.send(JSON.stringify({ t: "state", s: this.game().state(p, a.lang) })); return; }
    p.seen = Date.now() / 1000;
    const g = this.game(), before = this.room.version, r = this.room, b = m.b || {};
    try {
      let out;
      if (m.a === "state") out = null;
      else if (m.a === "guess") {
        if (r.task && r.task.mode === "most") out = await this.mostGuess(g, p, b, a.lang);
        else out = g.answer(p, b, a.lang);
      }
      else if (ACTIONS_HOST.has(m.a)) {
        if (p.id !== r.host) throw new GameError(403, "Tylko gospodarz może to zrobić");
        if (m.a === "setup") g.configure(b.modes, b.rounds, b.settings);
        else if (m.a === "start" && ["lobby", "final"].includes(r.phase)) {
          if (r.kind === "most") {
            try {
              const { pickFilmrunPair } = await import("./most.js");
              const pick = pickFilmrunPair || pickPair;
              const pairs = [];
              for (let i = 0; i < r.rounds; i++) {
                pairs.push(await pick(this.movies, this.env.TMDB_API_KEY, a.lang));
              }
              this.localGraph = localGraph(this.movies);
              g._localGraph = this.localGraph;
              g.start({ pairs, pair: pairs[0] });
            } catch (e) {
              const msg = (e.key === "most_no_tmdb" || e.message === "most_no_tmdb")
                ? "Nie udało się dobrać pary aktorów w Filmrun"
                : "Nie udało się dobrać pary aktorów";
              throw new GameError(400, msg);
            }
          } else g.start();
        }
        else if (m.a === "reroll") out = await this.mostReroll(g, p, a.lang);
        else if (m.a === "next" && ["round", "reveal"].includes(r.phase)) g.next();
        else if (m.a === "advance" && r.phase === "round") g.advance(p);
        else if (m.a === "again") g.again();
        else if (m.a === "kick" && b.victim in r.players && b.victim !== r.host) g.removePlayer(b.victim);
        if (out === undefined) out = { ok: true };
      } else if (m.a === "leave") { g.removePlayer(p.id); out = { ok: true }; }
      else throw new GameError(404, "Nie ma takiego adresu");
      await this.commit(g, m.a === "state" ? before - 1 : before);
      reply(true, out);
    } catch (e) {
      const key = e instanceof GameError ? e.key : String(e.message || e);
      reply(false, { key, error: errText(key, a.lang), code: e.code || 400 });
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    if (!this.room) return;
    const a = ws.deserializeAttachment();
    if (a && this.room.players[a.pid]) this.room.players[a.pid].seen = Date.now() / 1000;
    const g = this.game(ws);
    // gracz wyszedł z karty - może to kończyć rundę ("wszyscy aktywni odpowiedzieli"); online się zmienił
    await this.commit(g, this.room.version - 1);
  }

  async webSocketError(ws) { await this.webSocketClose(ws); }

  async alarm() {
    if (!this.room) return;
    const g = this.game();
    const idle = Date.now() / 1000 - this.room.touched;
    if (!["round", "reveal"].includes(this.room.phase) && idle >= IDLE_TTL - 60 && this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.deleteAll();
      this.room = this.movies = null;
      return;
    }
    const before = this.room.version;
    g.tick();
    await this.save();
    await this.schedule(g);
    // granica etapu (nowy kadr, kolejny aktor, podpowiedź) też wymaga wysłania stanu
    this.broadcast(g);
    void before;
  }

  async mostReroll(g, p, lang) {
    const r = this.room, t = r.task;
    if (r.phase !== "round" || !t || t.mode !== "most" || t.winner) return { ok: false };
    const { pickFilmrunPair } = await import("./most.js");
    const skip = [t.start, t.goal].map(x => x && (x.imdb_id || x.id)).filter(Boolean);
    let pair;
    try { pair = await pickFilmrunPair(this.movies, this.env.TMDB_API_KEY, lang, Math.random, skip); }
    catch { throw new GameError(400, "Nie udało się dobrać pary aktorów"); }
    return g.mostReroll(p, pair);
  }

  async mostGuess(g, p, b, lang) {
    return g.answer(p, b, lang);
  }
}

function safeEq(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
