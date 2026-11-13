// admin_api.js - cloud admin read/write: same routes as local app.py (minus scraper).
// All writes go to the Content Durable Object overlay. Reads merge ASSETS + overlay.
import { contentStub, MAX_POSTER, MAX_TEXT_BODY } from "./content.js";
import { normTitle } from "./game.js";
import { scrapeCtx, fetchOne, fetchActorImage, tmdbPersonPhoto, SOURCES, DEFAULT_N } from "./webscrape.js";

class ApiError extends Error {
  constructor(code, key) { super(key); this.code = code; this.key = key; }
}

const MODES = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "top"];
const MIN = { frames: 1, zoom: 1, movies: 5, years: 3, posters: 3, cast: 3, questions: 1 };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

async function assetJson(env, req, path) {
  const r = await env.ASSETS.fetch(new Request(new URL(path, req.url), { headers: req.headers }));
  if (!r.ok) throw new ApiError(404, "Nie ma takiego adresu");
  return r.json();
}

async function contentOp(env, body) {
  const stub = contentStub(env);
  const r = await stub.fetch(new Request("https://content/op", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, data.error || "Błąd zapisu");
  return data;
}

// packs.json ma też wpis "custom" (zbiorczy pakiet dla lobby) - nie ma on pliku pack-custom.json,
// więc panel admina pomija go wszędzie, gdzie czyta dane pakietów
export function isBasePack(p) {
  return !!p && !p.custom && p.id !== "custom" && /^\d+$/.test(String(p.id));
}
async function basePacks(env, req) {
  return (await assetJson(env, req, "/data/packs.json")).filter(isBasePack);
}

async function loadMergedPack(env, req, packId) {
  const data = await assetJson(env, req, `/data/pack-${packId}.json`);
  const merged = await contentOp(env, { op: "mergePack", data });
  return merged;
}

function splitTitleYear(s) {
  const m = String(s || "").trim().match(/^(.*?)\s*\((\d{4})\)\s*$/);
  if (m) return [m[1].trim(), +m[2]];
  return [String(s || "").trim(), null];
}

function splitAliases(s) {
  return String(s || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
}

function parseAnswers(text) {
  const out = [];
  for (const line of String(text || "").split("\n")) {
    const parts = line.split(";").map(x => x.trim()).filter(Boolean);
    if (!parts.length) continue;
    out.push({ text: parts[0].slice(0, 120), aliases: parts.slice(1).map(a => a.slice(0, 120)) });
  }
  return out;
}

function matchMovie(movies, title, year) {
  const nt = normTitle(title);
  if (!nt) return [null, "bad_format"];
  const hits = movies.filter(m => {
    const names = [normTitle(m.title), normTitle(m.pl_title), ...splitAliases(typeof m.aliases === "string" ? m.aliases : (m.aliases || []).join("\n")).map(normTitle)];
    return names.includes(nt) && (year == null || m.year === year);
  });
  if (!hits.length) return [null, "unmatched"];
  if (hits.length > 1) return [null, "ambiguous"];
  return [hits[0], "matched"];
}

function recomputeAvail(pack, movies) {
  const framed = movies.filter(m => m.frames && m.frames.length).length;
  const years = movies.filter(m => m.year).length;
  const posters = movies.filter(m => m.poster).length;
  const cast = movies.filter(m => (m.cast || []).length >= 3).length;
  const quotes = movies.reduce((s, m) => s + (m.quotes || []).length, 0);
  const questions = (pack.questions || []).length;
  const zoomed = movies.filter(m => m.zoom_frame || (m.frames && m.frames.length)).length;
  const have = { frames: framed, zoom: zoomed, movies: movies.length, years, posters, cast, quotes, questions };
  const needKey = { kadry: "frames", zoom: "zoom", licytacja: "questions", rok: "years", kolejnosc: "years", plakat: "posters", aktorzy: "cast", top: "movies" };
  // licytacja can fall back to pack films, so questions need can be 0 effectively for "ok" if movies exist - match local rooms.availability
  const avail = {};
  for (const k of MODES) {
    const nk = needKey[k];
    let need = MIN[nk] || 1;
    let h = have[nk] || 0;
    if (k === "licytacja") { need = 1; h = Math.max(questions, movies.length >= 3 ? 1 : 0); }
    avail[k] = { ok: h >= need, have: k === "licytacja" ? questions : h, need: k === "licytacja" ? 1 : need };
  }
  return avail;
}

function modesOffList(csv) {
  return String(csv || "").split(",").map(s => s.trim()).filter(Boolean);
}

async function packModesOff(env, req, packId, packListEntry, merged = null) {
  // mergePack zna prawdziwe wyłączenia (nakładka albo reason "disabled" z builda)
  if (merged && merged.modes_off != null) return modesOffList(merged.modes_off);
  const ov = await contentOp(env, { op: "getModesOff", pack_id: packId });
  if (ov.modes_off != null) return modesOffList(ov.modes_off);
  // base: modes present in packs.json means enabled; missing = off? Local uses modes_off CSV.
  // packs.json only lists enabled modes. Reconstruct off = MODES - enabled
  const enabled = new Set((packListEntry && packListEntry.modes) || []);
  return MODES.filter(k => !enabled.has(k));
}

async function csrfCheck(req) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("Origin");
  if (!origin) return; // same-origin navigations / curl without Origin
  const url = new URL(req.url);
  const expect = url.origin;
  if (origin !== expect) throw new ApiError(403, "Zły Origin");
}

function isImage(bytes) {
  if (!bytes || bytes.length < 12) return false;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return true; // jpeg
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true; // png
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return true; // webp
  return false;
}

async function fetchImage(url) {
  if (!/^https:\/\//i.test(url)) throw new ApiError(400, "Link musi zaczynać się od https://");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "shot-quiz-admin/1.0" } });
    if (!r.ok) throw new ApiError(400, "Nie udało się pobrać");
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > MAX_POSTER) throw new ApiError(413, "Plakat jest za duży (max 1,5 MB)");
    if (!isImage(buf)) throw new ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)");
    return buf;
  } finally { clearTimeout(t); }
}

function b64FromBytes(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function questionFrom(d, existing) {
  const pl = String(d.prompt_pl || "").trim().slice(0, 200);
  const en = String(d.prompt_en || "").trim().slice(0, 200);
  if (!pl && !en) throw new ApiError(400, "Podaj pytanie (PL albo EN)");
  let ans;
  if ("answers_text" in d || "answers" in d) {
    ans = "answers_text" in d ? parseAnswers(d.answers_text)
      : parseAnswers((d.answers || []).map(a => [a.text, ...(a.aliases || [])].join("; ")).join("\n"));
  } else if (existing) {
    ans = existing;
  } else {
    ans = [];
  }
  return { prompt_pl: pl, prompt_en: en, answers: ans };
}

function parseQuotesText(movies, existing, text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const row = { line: raw.slice(0, 600), status: "unmatched", movie_id: null };
    if (!raw.includes("=")) { row.status = "bad_format"; out.push(row); continue; }
    const eq = raw.indexOf("=");
    const left = raw.slice(0, eq).trim();
    let qt = raw.slice(eq + 1).trim();
    let lang = "";
    const mm = qt.match(/^\[(pl|en)\]\s*(.*)$/i);
    if (mm) { lang = mm[1].toLowerCase(); qt = mm[2].trim(); }
    qt = qt.replace(/^["„”“]+|["„”“]+$/g, "").trim().slice(0, 500);
    const [title, year] = splitTitleYear(left);
    row.title = title; row.year = year; row.quote = qt; row.lang = lang;
    if (!qt) { row.status = "bad_format"; out.push(row); continue; }
    const [mv, st] = matchMovie(movies, title, year);
    row.status = st;
    if (mv) {
      const key = mv.id + "|" + qt.toLowerCase();
      if (existing.has(key) || seen.has(key)) row.status = "duplicate";
      else seen.add(key);
      row.movie_id = mv.id;
      row.movie = mv.title + (mv.year ? ` (${mv.year})` : "");
    }
    out.push(row);
  }
  return out;
}

function parseQuestionsText(text) {
  const out = [];
  for (const block of String(text || "").replace(/\r/g, "").trim().split(/\n\s*\n/)) {
    const lines = block.split("\n").map(x => x.trim()).filter(Boolean);
    if (!lines.length) continue;
    const [pl, ...rest] = lines[0].split("|");
    const en = rest.join("|");
    const ans = parseAnswers(lines.slice(1).join("\n"));
    out.push({
      prompt_pl: pl.trim().slice(0, 200), prompt_en: en.trim().slice(0, 200), answers: ans,
      status: (pl.trim() || en.trim()) ? "ok" : "bad_format",
    });
  }
  return out;
}

function parsePlTitles(movies, text) {
  const out = [], seen = new Set();
  for (const line of String(text || "").split("\n")) {
    const raw = line.trim();
    if (!raw) continue;
    const row = { line: raw.slice(0, 300), status: "unmatched", movie_id: null };
    if (!raw.includes("=")) { row.status = "bad_format"; out.push(row); continue; }
    const eq = raw.indexOf("=");
    const left = raw.slice(0, eq).trim();
    const pl = raw.slice(eq + 1).trim().slice(0, 160);
    const [title, year] = splitTitleYear(left);
    row.title = title; row.year = year; row.pl_title = pl;
    if (!pl) { row.status = "bad_format"; out.push(row); continue; }
    const [mv, st] = matchMovie(movies, title, year);
    row.status = st;
    if (mv) {
      if (seen.has(mv.id)) row.status = "repeated";
      else seen.add(mv.id);
      row.movie_id = mv.id;
      row.movie = mv.title + (mv.year ? ` (${mv.year})` : "");
      row.current = mv.pl_title || "";
    }
    out.push(row);
  }
  return out;
}

async function movieIndex(env, req) {
  // map movie_id -> {pack_id, ...} from all packs
  const packs = await basePacks(env, req);
  const idx = {};
  for (const p of packs) {
    const data = await loadMergedPack(env, req, p.id);
    for (const m of data.movies) idx[m.id] = { ...m, pack_id: p.id, pack_name: p.name };
  }
  return { packs, idx };
}

// ---------------------------------------------------------------- pobieranie z IMDb / Filmwebu / TMDB
async function webMovie(env, req, mid, d) {
  const src = d.source || "auto";
  if (!SOURCES.includes(src)) throw new ApiError(400, "Nieznane źródło");
  const { idx } = await movieIndex(env, req);
  const mv = idx[mid];
  if (!mv) throw new ApiError(404, "Nie ma filmu");
  return [mv, src];
}

async function webPoster(env, req, mid, d) {
  const [mv, src] = await webMovie(env, req, mid, d);
  const ctx = scrapeCtx(env), log = [];
  let data, meta, used;
  try { [data, meta, used] = await fetchOne(ctx, "poster", src, mv, DEFAULT_N, log); }
  catch (e) { return [{ ok: false, error: e.message, log }, 502]; }
  await contentOp(env, { op: "setPoster", movie_id: mid, image_b64: b64FromBytes(data), source: used, url: meta.url || "" });
  return [{ ok: true, source: used, log, note: meta.note || "", requests: ctx.used }];
}

// zdjęcie do jednej osoby z obsady: najpierw URL ze źródła, potem TMDB po imieniu; zapis w nakładce
async function attachPhoto(env, ctx, actor, source, log) {
  const name = String(actor.name || "").trim();
  const reasons = [];
  let url = actor.photo_url || "", src = source, sid = actor.source_id || "";
  let img = url ? await fetchActorImage(ctx, url, reasons) : null;
  if (!url) reasons.push("brak fotki u źródła");
  if (!img) {
    const fb = await tmdbPersonPhoto(ctx, name);
    if (fb) {
      const why = [];
      img = await fetchActorImage(ctx, fb.photo_url, why);
      if (img) { url = fb.photo_url; src = fb.source; sid = fb.source_id; }
      else reasons.push("TMDB: " + (why[why.length - 1] || "nie pobrano"));
    } else if (!ctx.key) reasons.push("brak klucza TMDB (nie było zapasu)");
  }
  if (!img) { log.push(`    photo ${name || "?"}: ${reasons.join("; ") || "nie zapisano"}`); return null; }
  const r = await contentOp(env, { op: "setActorPhoto", id: 0, image_b64: b64FromBytes(img),
    meta: { name, source: src, source_id: sid, url, key: sid ? `${src}:${sid}` : `name:${normTitle(name)}` } });
  return r.id || null;
}

async function webCast(env, req, mid, d) {
  const [mv, src] = await webMovie(env, req, mid, d);
  const n = Math.max(3, Math.min(15, parseInt(d.n, 10) || DEFAULT_N));
  const ctx = scrapeCtx(env), log = [];
  const had = new Map((mv.cast || []).filter(c => c && c.photo_id).map(c => [normTitle(c.name), +c.photo_id]));
  if (d.photos_only) {
    const rows = (mv.cast || []).map(c => (typeof c === "string" ? { name: c } : { ...c }));
    if (!rows.length) return [{ ok: true, photos: { ok: 0, miss: 0, changed: false }, log }];
    const lookup = new Map();
    let used = src;
    try {
      const [data, , s] = await fetchOne(ctx, "cast", src, mv, Math.max(n, rows.length), log);
      used = s;
      for (const c of data) lookup.set(normTitle(c.name), c);
    } catch (e) { log.push("    " + e.message); }
    let ok = 0, miss = 0, changed = false;
    for (const c of rows) {
      if (c.photo_id) { ok++; continue; }
      const hit = lookup.get(normTitle(c.name));
      const pid = await attachPhoto(env, ctx, { ...(hit || {}), name: c.name }, hit ? used : "auto", log);
      if (pid) { c.photo_id = pid; ok++; changed = true; } else miss++;
    }
    if (changed) await contentOp(env, { op: "upsertMovie", movie_id: mid,
      patch: { cast_json: JSON.stringify(rows.map(storeCastRow)), cast_source: mv.cast_source || "manual" } });
    return [{ ok: true, photos: { ok, miss, changed }, log, requests: ctx.used }];
  }
  let data, used;
  try { [data, , used] = await fetchOne(ctx, "cast", src, mv, n, log); }
  catch (e) { return [{ ok: false, error: e.message, log }, 502]; }
  const rows = data.map((c, i) => ({ ...c, billing: i + 1 }));
  for (const c of rows) {
    const known = had.get(normTitle(c.name));
    c.photo_id = known || await attachPhoto(env, ctx, c, used, log);
  }
  // kolejność odsłaniania: od najmniej znanego do gwiazdy (odwrotna do napisów), jak lokalnie
  const stored = rows.map(storeCastRow).reverse();
  await contentOp(env, { op: "upsertMovie", movie_id: mid, patch: { cast_json: JSON.stringify(stored), cast_source: used } });
  return [{ ok: true, source: used, log, photos: rows.filter(c => c.photo_id).length, requests: ctx.used }];
}

function storeCastRow(c) {
  const row = { name: String(c.name || "").slice(0, 80), character: String(c.character || "").slice(0, 80) };
  if (c.billing) row.billing = +c.billing;
  if (c.photo_id) row.photo_id = +c.photo_id;
  return row;
}

export async function handleAdmin(req, env, path, { isAdmin, body, detectLang }) {
  await csrfCheck(req);

  // login/logout/me handled by caller before this for cookie set; we handle the rest
  if (!await isAdmin(req, env)) throw new ApiError(401, "Zaloguj się");

  // --- me / overlay / clear / export helpers
  if (path === "/api/admin/me") return json({ admin: true, cloud: true });
  if (path === "/api/admin/overlay" && req.method === "GET") return json(await contentOp(env, { op: "dump" }));
  if (path === "/api/admin/overlay" && req.method === "DELETE") return json(await contentOp(env, { op: "clear" }));
  if (path === "/api/admin/overlay/stats") return json(await contentOp(env, { op: "stats" }));

  if (path === "/api/admin/overview" || path === "/api/admin/stats") {
    const meta = await assetJson(env, req, "/data/meta.json");
    const packsList = await basePacks(env, req);
    const ov = await contentOp(env, { op: "stats" });
    // rebuild pack stats with merge
    const packs = [];
    let ok = 0, picked = 0, pending = 0, error = 0;
    for (const p of packsList) {
      const data = await loadMergedPack(env, req, p.id);
      const movies = data.movies;
      const framed = movies.filter(m => m.frames && m.frames.length).length;
      const posters = movies.filter(m => m.poster).length;
      const cast = movies.filter(m => (m.cast || []).length >= 3).length;
      const quotes = movies.reduce((s, m) => s + (m.quotes || []).length, 0);
      const avail = recomputeAvail(data.pack, movies);
      const off = await packModesOff(env, req, p.id, p, data);
      packs.push({
        id: p.id, name: p.name, name_en: p.name_en, color: p.color,
        movies: movies.length, framed, posters, cast, quotes,
        questions: (data.pack.questions || []).length, avail,
        total: movies.length, ok: framed, picked: framed, err: 0,
        modes_off: off,
      });
      ok += framed; picked += framed;
    }
    if (path === "/api/admin/stats")
      return json({ ok, picked, pending, error, rooms: 0, players: 0, overlay: ov });
    return json({ ...meta, packs, overlay: ov });
  }

  if (path === "/api/admin/packs" && req.method === "GET") {
    const packsList = await basePacks(env, req);
    const out = [];
    for (const p of packsList) {
      const data = await loadMergedPack(env, req, p.id);
      const movies = data.movies;
      const framed = movies.filter(m => m.frames && m.frames.length).length;
      const off = await packModesOff(env, req, p.id, p, data);
      out.push({
        id: p.id, slug: p.slug, name: p.name, name_en: p.name_en, description: p.description,
        description_en: p.description_en, color: p.color,
        total: movies.length, ok: framed, picked: framed, err: 0,
        questions: (data.pack.questions || []).length,
        modes_off: off,
      });
    }
    return json(out);
  }

  if (path === "/api/admin/settings") {
    // cloud: no TMDB key storage; report empty
    return json({ tmdb_key: false, tmdb_masked: "", from_env: false, cloud: true });
  }

  if (path === "/api/admin/scrape" || path === "/api/admin/scrape/stop") {
    throw new ApiError(405, "Kadry z trailerów (YouTube) pobiera się tylko lokalnie (python app.py). W chmurze pobierzesz plakaty i obsadę ze zdjęciami.");
  }

  // /api/admin/packs/:id
  let m = path.match(/^\/api\/admin\/packs\/(\d+)$/);
  if (m) {
    const pid = +m[1];
    if (req.method === "GET") {
      const packsList = await basePacks(env, req);
      const p = packsList.find(x => x.id === pid);
      if (!p) throw new ApiError(404, "Nie ma takiego pakietu");
      const data = await loadMergedPack(env, req, pid);
      const off = await packModesOff(env, req, pid, p, data);
      return json({ ...p, modes_off: off, questions: (data.pack.questions || []).length, total: data.movies.length, ok: data.movies.filter(x => x.frames).length });
    }
    if (req.method === "PUT") {
      const d = await body(req);
      if ("modes_off" in d) {
        const off = (d.modes_off || []).filter(k => MODES.includes(k));
        await contentOp(env, { op: "setModesOff", pack_id: pid, modes_off: off });
        return json({ ok: true });
      }
      throw new ApiError(405, "W chmurze nie edytujesz nazwy ani listy filmów pakietu. Zrób to lokalnie.");
    }
    if (req.method === "DELETE" || req.method === "POST")
      throw new ApiError(405, "W chmurze nie dodajesz ani nie usuwasz pakietów. Zrób to lokalnie.");
  }

  m = path.match(/^\/api\/admin\/packs\/(\d+)\/(movies|modes|quotes|questions|pl_titles|answers_auto|web)$/);
  if (m) {
    const pid = +m[1], sub = m[2];
    const data = await loadMergedPack(env, req, pid);
    const movies = data.movies;

    // w chmurze nie ma kolejki w tle: panel pobiera film po filmie przez /api/admin/movies/:id/(poster|cast)
    if (sub === "web") throw new ApiError(405, "W chmurze pakiet pobiera się film po filmie z panelu (przycisk pobierz dla pakietu).");

    if (sub === "movies" && req.method === "GET") {
      const out = movies.map(mv => {
        const aliases = Array.isArray(mv.aliases) ? mv.aliases.join("\n") : (mv.aliases || "");
        return {
          id: mv.id, title: mv.title, year: mv.year, pl_title: mv.pl_title || "",
          aliases, cast_json: JSON.stringify(mv.cast || []), cast_source: mv.cast_source || "",
          nquotes: (mv.quotes || []).length, poster: !!mv.poster,
          poster_meta: mv.poster ? `${mv.poster_source || "overlay"}|${Math.round(mv.poster_updated || Date.now() / 1000)}` : "|",
          zoom: mv.zoom_frame || null, medium: (mv.frames && mv.frames[1]) || null,
          easy: (mv.frames && mv.frames[2]) || null, hard: (mv.frames && mv.frames[0]) || null,
          nframes: (mv.frames || []).length,
          status: mv.frames ? "ok" : "pending",
        };
      });
      // enrich poster_meta from overlay
      for (const row of out) {
        const meta = await contentOp(env, { op: "getPosterMeta", movie_id: row.id });
        if (meta && !meta.deleted && meta.has_image)
          row.poster_meta = `${meta.source || "url"}|${Math.round(meta.updated_at || 0)}`;
        else if (meta && meta.deleted) { row.poster = false; row.poster_meta = "|"; }
        const zm = await contentOp(env, { op: "getZoomMeta", movie_id: row.id });
        if (zm && !zm.deleted && zm.frame_id) row.zoom = zm.frame_id;
        else if (zm && zm.deleted) row.zoom = null;
      }
      return json(out);
    }

    if (sub === "modes" && req.method === "GET") {
      const packsList = await basePacks(env, req);
      const p = packsList.find(x => x.id === pid);
      const off = await packModesOff(env, req, pid, p, data);
      const avail = recomputeAvail(data.pack, movies);
      return json({ modes: MODES, modes_off: off, avail, questions: (data.pack.questions || []).length });
    }

    if (sub === "quotes" && req.method === "GET") {
      return json(movies.map(mv => ({
        id: mv.id, title: mv.title, year: mv.year, pl_title: mv.pl_title || "",
        quotes: (mv.quotes || []).map(q => ({
          id: q.id, text: q.text, lang: q.lang || "",
        })).filter(q => q.id != null || q.text),
      })));
    }

    if (sub === "quotes" && req.method === "POST") {
      const d = await body(req);
      if (String(d.text || "").length > MAX_TEXT_BODY) throw new ApiError(413, "Za duże żądanie");
      const existing = new Set();
      for (const mv of movies) for (const q of (mv.quotes || []))
        existing.add(mv.id + "|" + String(q.text || "").toLowerCase());
      const rows = parseQuotesText(movies, existing, d.text);
      let saved = 0;
      if (d.apply) {
        for (const r of rows) {
          if (r.status === "matched") {
            await contentOp(env, { op: "addQuote", movie_id: r.movie_id, text: r.quote, lang: r.lang || "" });
            saved++;
          }
        }
      }
      return json({ rows, saved, matched: rows.filter(r => r.status === "matched").length, unmatched: rows.filter(r => r.status !== "matched").length });
    }

    if (sub === "questions" && req.method === "GET") {
      return json((data.pack.questions || []).map(q => ({
        id: q.id, prompt_pl: q.prompt_pl || "", prompt_en: q.prompt_en || "", answers: q.answers || [],
      })));
    }

    if (sub === "questions" && req.method === "POST") {
      const d = await body(req);
      if ("bulk" in d) {
        if (String(d.bulk || "").length > MAX_TEXT_BODY) throw new ApiError(413, "Za duże żądanie");
        const rows = parseQuestionsText(d.bulk);
        let saved = 0;
        if (d.apply) {
          for (const r of rows) if (r.status === "ok") {
            await contentOp(env, { op: "addQuestion", pack_id: pid, question: r });
            saved++;
          }
        }
        return json({ rows, saved, ok: rows.filter(r => r.status === "ok").length });
      }
      const q = questionFrom(d);
      const r = await contentOp(env, { op: "addQuestion", pack_id: pid, question: q });
      return json({ id: r.id });
    }

    if (sub === "answers_auto" && req.method === "GET") {
      const lines = movies.map(mv => {
        const aliases = Array.isArray(mv.aliases) ? mv.aliases : splitAliases(mv.aliases || "");
        const parts = [mv.title, ...(mv.pl_title ? [mv.pl_title] : []), ...aliases];
        return [...new Set(parts)].join("; ");
      });
      return json({ text: lines.join("\n") });
    }

    if (sub === "pl_titles" && req.method === "POST") {
      const d = await body(req);
      if (String(d.text || "").length > MAX_TEXT_BODY) throw new ApiError(413, "Za duże żądanie");
      const rows = parsePlTitles(movies, d.text);
      let saved = 0;
      if (d.apply) {
        for (const r of rows) if (r.status === "matched") {
          await contentOp(env, { op: "upsertMovie", movie_id: r.movie_id, patch: { pl_title: r.pl_title } });
          saved++;
        }
      }
      return json({ rows, saved, matched: rows.filter(r => r.status === "matched").length, unmatched: rows.filter(r => r.status !== "matched").length });
    }
  }

  // /api/admin/movies/:id
  m = path.match(/^\/api\/admin\/movies\/(\d+)$/);
  if (m) {
    const mid = +m[1];
    if (req.method === "PUT") {
      const d = await body(req);
      const patch = {};
      if ("pl_title" in d) patch.pl_title = String(d.pl_title || "").trim().slice(0, 160);
      if ("aliases" in d) {
        const a = typeof d.aliases === "string" ? d.aliases : (d.aliases || []).join("\n");
        patch.aliases = splitAliases(a).join("\n").slice(0, 4000);
      }
      if ("year" in d) {
        const y = d.year === null || d.year === "" ? null : parseInt(d.year, 10);
        if (y != null && !(y >= 1888 && y <= 2100)) throw new ApiError(400, "Zły rok");
        patch.year = y;
      }
      if ("title" in d || "query" in d || "yt_url" in d)
        throw new ApiError(405, "W chmurze nie zmieniasz tytułu oryginalnego ani trailera. Zrób to lokalnie.");
      if (!Object.keys(patch).length) return json({ ok: true });
      await contentOp(env, { op: "upsertMovie", movie_id: mid, patch });
      return json({ ok: true });
    }
    if (req.method === "DELETE" || req.method === "POST")
      throw new ApiError(405, "W chmurze nie dodajesz ani nie usuwasz filmów. Zrób to lokalnie.");
    if (req.method === "GET") {
      const { idx } = await movieIndex(env, req);
      const mv = idx[mid];
      if (!mv) throw new ApiError(404, "Nie ma filmu");
      return json({ movie: mv, frames: (mv.frames || []).map((id, i) => ({ id, role: ["hard","medium","easy"][i] || null })), pick: { easy: (mv.frames||[])[2]||null, medium: (mv.frames||[])[1]||null, hard: (mv.frames||[])[0]||null, zoom: mv.zoom_frame || null } });
    }
  }

  // /api/admin/movies/:id/zoom
  m = path.match(/^\/api\/admin\/movies\/(\d+)\/zoom$/);
  if (m) {
    const mid = +m[1];
    if (req.method === "DELETE") {
      await contentOp(env, { op: "clearZoomFrame", movie_id: mid });
      return json({ ok: true, zoom: null });
    }
    if (req.method === "POST") {
      const d = await body(req);
      if (d.frame_id) {
        const r = await contentOp(env, { op: "setZoomFrame", movie_id: mid, frame_id: +d.frame_id });
        return json({ ok: true, zoom: r.zoom });
      }
      if (!d.data) throw new ApiError(400, "Podaj kadr");
      const raw = String(d.data);
      const b64 = raw.startsWith("data:") ? raw.split(",", 2)[1] : raw;
      if (!b64 || b64.length > MAX_POSTER * 1.4) throw new ApiError(413, "Kadr jest za duży (max 1,5 MB)");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      if (!isImage(bytes)) throw new ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)");
      const r = await contentOp(env, { op: "setZoomFrame", movie_id: mid, image_b64: b64FromBytes(bytes) });
      return json({ ok: true, zoom: r.zoom });
    }
  }

  // /api/admin/movies/:id/(poster|cast|quotes)
  m = path.match(/^\/api\/admin\/movies\/(\d+)\/(poster|cast|quotes)$/);
  if (m) {
    const mid = +m[1], what = m[2];
    if (what === "quotes" && req.method === "POST") {
      const d = await body(req);
      const text = String(d.text || "").trim().slice(0, 500);
      if (!text) throw new ApiError(400, "Podaj treść cytatu");
      const lang = d.lang === "pl" || d.lang === "en" ? d.lang : "";
      const r = await contentOp(env, { op: "addQuote", movie_id: mid, text, lang });
      return json({ id: r.id });
    }
    if (what === "cast") {
      if (req.method === "POST") return json(...await webCast(env, req, mid, await body(req)));
      if (req.method === "PUT") {
        const d = await body(req);
        const cast = [];
        for (const c of (d.cast || []).slice(0, 20)) {
          const name = String(c.name || "").trim().slice(0, 80);
          if (name) cast.push({
            name, character: String(c.character || "").trim().slice(0, 80),
            ...(String(c.billing || "").match(/^\d+$/) ? { billing: +c.billing } : {}),
            ...(String(c.photo_id || "").match(/^\d+$/) ? { photo_id: +c.photo_id } : {}),
          });
        }
        await contentOp(env, {
          op: "upsertMovie", movie_id: mid,
          patch: { cast_json: JSON.stringify(cast), cast_source: cast.length ? "manual" : "" },
        });
        return json({ ok: true });
      }
    }
    if (what === "poster") {
      if (req.method === "DELETE") {
        await contentOp(env, { op: "deletePoster", movie_id: mid });
        return json({ ok: true });
      }
      if (req.method === "POST") return json(...await webPoster(env, req, mid, await body(req)));
      if (req.method === "PUT") {
        const d = await body(req);
        let bytes, source = "url", url = "";
        if (d.data) {
          const raw = String(d.data);
          const b64 = raw.startsWith("data:") ? raw.split(",", 2)[1] : raw;
          if (!b64 || b64.length > MAX_POSTER * 1.4) throw new ApiError(413, "Plakat jest za duży (max 1,5 MB)");
          const bin = atob(b64);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          source = "upload";
        } else {
          url = String(d.url || "").trim();
          bytes = await fetchImage(url);
          source = "url";
        }
        if (!isImage(bytes)) throw new ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)");
        await contentOp(env, {
          op: "setPoster", movie_id: mid, image_b64: b64FromBytes(bytes), source, url,
        });
        return json({ ok: true });
      }
    }
  }

  // /api/admin/actors  /api/admin/actors/:id
  m = path.match(/^\/api\/admin\/actors(?:\/(\d+))?$/);
  if (m) {
    const aid = m[1] ? +m[1] : 0;
    if (req.method === "POST" || (req.method === "PUT" && aid)) {
      const d = await body(req);
      let bytes, source = "url", url = "";
      if (d.data) {
        const raw = String(d.data);
        const b64 = raw.startsWith("data:") ? raw.split(",", 2)[1] : raw;
        if (!b64 || b64.length > MAX_POSTER * 1.4) throw new ApiError(413, "Zdjęcie jest za duże (max 1,5 MB)");
        const bin = atob(b64);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        source = "upload";
      } else {
        url = String(d.url || "").trim();
        bytes = await fetchImage(url);
        source = "url";
      }
      if (!isImage(bytes)) throw new ApiError(400, "To nie jest obraz (JPEG, PNG albo WebP)");
      const r = await contentOp(env, {
        op: "setActorPhoto", id: aid || 0, image_b64: b64FromBytes(bytes),
        meta: { name: String(d.name || "").trim().slice(0, 80), source, url },
      });
      return json({ ok: true, id: r.id });
    }
    throw new ApiError(404, "Nie ma takiego adresu");
  }

  // /api/admin/quotes/:id  /api/admin/questions/:id
  m = path.match(/^\/api\/admin\/(quotes|questions)\/(\d+)$/);
  if (m) {
    const kind = m[1], iid = +m[2];
    if (kind === "quotes") {
      if (req.method === "DELETE") {
        await contentOp(env, { op: "deleteQuote", id: iid });
        return json({ ok: true });
      }
      if (req.method === "PUT") {
        const d = await body(req);
        const text = String(d.text || "").trim().slice(0, 500);
        if (!text) throw new ApiError(400, "Podaj treść cytatu");
        const lang = d.lang === "pl" || d.lang === "en" ? d.lang : "";
        // find movie_id from merged packs if needed
        let movieId = d.movie_id || 0;
        if (!movieId) {
          const { idx } = await movieIndex(env, req);
          for (const mv of Object.values(idx)) {
            if ((mv.quotes || []).some(q => q.id === iid)) { movieId = mv.id; break; }
          }
        }
        await contentOp(env, { op: "editQuote", id: iid, movie_id: movieId, text, lang });
        return json({ ok: true });
      }
    }
    if (kind === "questions") {
      if (req.method === "DELETE") {
        await contentOp(env, { op: "deleteQuestion", id: iid });
        return json({ ok: true });
      }
      if (req.method === "PUT") {
        const d = await body(req);
        let packId = d.pack_id || 0, existing = null;
        if (!packId || !("answers_text" in d || "answers" in d)) {
          const packsList = await basePacks(env, req);
          for (const p of packsList) {
            const data = await loadMergedPack(env, req, p.id);
            const hit = (data.pack.questions || []).find(x => x.id === iid);
            if (hit) { packId = packId || p.id; existing = hit.answers || []; break; }
          }
        }
        const q = questionFrom(d, existing);
        await contentOp(env, { op: "editQuestion", id: iid, pack_id: packId, question: q });
        return json({ ok: true });
      }
    }
  }

  if (path === "/api/admin/export" && req.method === "GET") {
    // caller handles export with merge - return null to signal
    return null;
  }

  throw new ApiError(404, "Nie ma takiego adresu");
}

export { ApiError, loadMergedPack, contentOp, recomputeAvail, packModesOff, MODES };
