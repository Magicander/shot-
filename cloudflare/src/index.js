// index.js - Worker: strony (PL/EN), API pokoi -> Room DO, panel admina z zapisem do Content DO.
// Kadry/plakaty/pakiety bazowe = Workers Static Assets. Edycje w chmurze = overlay w Content DO.
import { errText } from "./i18n.js";
import { frontendBody, frontendResponse } from "./frontend.js";
import { handleAdmin, ApiError as AdminApiError, loadMergedPack, contentOp } from "./admin_api.js";
import { contentStub } from "./content.js";
import { tmdbPersonMovies, tmdbMovieCast, tmdbPersonDetail, localGraph, extLinks } from "./most.js";
export { Room } from "./room.js";
export { Content } from "./content.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const META = {
  pl: { BRAND: "kadr", LANG: "pl", TITLE: "kadr* - zgadnij film po kadrze", DESC: "Quiz filmowy dla znajomych. Zgadnijcie film po jednym kadrze z trailera.", ADMIN_TITLE: "kadr* panel" },
  en: { BRAND: "shot", LANG: "en", TITLE: "shot* - guess the movie from one frame", DESC: "A movie quiz for friends. Guess the film from a single frame of its trailer.", ADMIN_TITLE: "shot* admin" },
};

class ApiError extends Error { constructor(code, key) { super(key); this.code = code; this.key = key; } }

function cookie(req, name) {
  const m = (req.headers.get("Cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function detectLang(req) {
  const c = cookie(req, "kadr_lang");
  if (c === "pl" || c === "en") return c;
  const x = req.headers.get("X-Lang");
  if (x === "pl" || x === "en") return x;
  return geoLang(req);
}
function geoLang(req) {
  const country = req.cf && req.cf.country;
  if (country && country !== "XX" && country !== "T1") return country === "PL" ? "pl" : "en";
  return (req.headers.get("Accept-Language") || "").trim().toLowerCase().startsWith("pl") ? "pl" : "en";
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

async function asset(env, req, path) {
  return env.ASSETS.fetch(new Request(new URL(path, req.url), { headers: req.headers }));
}

async function page(env, req, file, extraScript = "") {
  const lang = detectLang(req);
  const bundled = frontendBody("/static/" + file);
  let html;
  if (bundled != null) {
    html = bundled;
  } else {
    const res = await env.ASSETS.fetch(new URL("/static/" + file, req.url));
    if (!res.ok) return res;
    html = await res.text();
  }
  for (const [k, v] of Object.entries(META[lang])) html = html.replaceAll(`{{${k}}}`, v);
  html = html.replace(/<html lang="(pl|en)"/, `<html lang="$1" data-geo="${geoLang(req)}"`);
  if (extraScript) {
    html = html.replace("</head>", `<script>${extraScript}</script></head>`);
  }
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", Vary: "Cookie" } });
}

async function body(req) {
  const t = await req.text();
  if (t.length > 2500000) throw new ApiError(413, "Za duże żądanie");
  try { return t ? JSON.parse(t) : {}; } catch { throw new ApiError(400, "Zły format danych"); }
}

function roomStub(env, code) { return env.ROOMS.get(env.ROOMS.idFromName(code)); }
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return [...b].map(x => ALPHABET[x % ALPHABET.length]).join("");
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([hmac("cmp", String(a)), hmac("cmp", String(b))]);
  return x === y;
}
async function isAdmin(req, env) {
  const c = cookie(req, "kadr_admin");
  return !!(env.ADMIN_PASSWORD && c && c === await hmac(env.ADMIN_PASSWORD, "kadr-admin-v1"));
}

async function adminApi(req, env, path) {
  if (!env.ADMIN_PASSWORD) throw new ApiError(503, "Panel admina w chmurze jest wyłączony (brak sekretu ADMIN_PASSWORD)");
  if (path === "/api/admin/login" && req.method === "POST") {
    const d = await body(req);
    if (!await sameSecret(d.password || "", env.ADMIN_PASSWORD)) throw new ApiError(403, "Złe hasło");
    const v = await hmac(env.ADMIN_PASSWORD, "kadr-admin-v1");
    const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, { "Set-Cookie": `kadr_admin=${v}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}` });
  }
  if (path === "/api/admin/logout" && req.method === "POST")
    return json({ ok: true }, 200, { "Set-Cookie": "kadr_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });

  if (path === "/api/admin/export" && req.method === "GET") {
    if (!await isAdmin(req, env)) throw new ApiError(403, "Zaloguj się");
    return exportDb(env, req);
  }

  const res = await handleAdmin(req, env, path, { isAdmin, body, detectLang });
  if (res === null) return exportDb(env, req);
  return res;
}

async function exportDb(env, req) {
  const packsRes = await asset(env, req, "/data/packs.json");
  const metaRes = await asset(env, req, "/data/meta.json");
  if (!packsRes.ok || !metaRes.ok) throw new ApiError(500, "Nie ma takiego adresu");
  const packsList = await packsRes.json();
  const meta = await metaRes.json();
  const overlay = await contentOp(env, { op: "dump" });
  const packs = [];
  for (const p of packsList) {
    const data = await loadMergedPack(env, req, p.id);
    packs.push({
      id: data.pack.id, slug: data.pack.slug, name: data.pack.name, name_en: data.pack.name_en,
      description: data.pack.description, description_en: data.pack.description_en, color: data.pack.color,
      cover_frame_id: (p.thumbs && p.thumbs[0]) || null, modes: p.modes || [],
      modes_off: data.modes_off,
      questions: data.pack.questions || [], movies: data.movies || [],
    });
  }
  return json({
    format: "kadr-export-v1",
    built: meta.built, frames: meta.frames, posters: meta.posters, actors: meta.actors, bytes: meta.bytes,
    note: "Merged export: static assets + Content Durable Object overlay. Cloud holds at most 3 gameplay frames per film.",
    overlay_stats: await contentOp(env, { op: "stats" }),
    overlay,
    packs,
  });
}


async function localMostLookup(env, req, kind, nid, lang, noTmdb) {
  const packsList = await (await asset(env, req, "/data/packs.json")).json();
  const movies = [];
  for (const p of packsList) {
    if (p.custom || p.id === "custom") continue;
    try {
      const data = await loadMergedPack(env, req, p.id);
      movies.push(...(data.movies || []));
    } catch {}
  }
  const g = localGraph(movies);
  const meta = (node) => {
    const m = (g._meta && (g._meta[`${node[0]}:${node[1]}`] || g._meta[node])) || {};
    if (node[0] === "person") {
      const v = { kind: "person", id: node[1], name: m.name || "", photo: m.photo || null, imdb_id: m.imdb_id || "", filmweb_id: m.filmweb_id || null };
      v.link = extLinks(v, lang);
      return v;
    }
    return { kind: "movie", id: node[1], title: m.title || "", year: m.year, poster: m.poster || null };
  };
  const list = (g[`${kind}:${Number(nid)}`] || []).map(meta);
  if (kind === "person") return { person: meta(["person", Number(nid)]), movies: list, local: true, no_tmdb: !!noTmdb };
  return { movie: meta(["movie", Number(nid)]), cast: list, local: true, no_tmdb: !!noTmdb };
}

async function gameApi(req, env, path, url) {
  if (req.method === "GET" && path === "/api/packs") {
    const packsList = await (await asset(env, req, "/data/packs.json")).json();
    // apply modes_off from overlay so lobby hides disabled modes
    const out = [];
    for (const p of packsList) {
      const offCsv = (await contentOp(env, { op: "getModesOff", pack_id: p.id })).modes_off;
      if (offCsv == null) { out.push(p); continue; }
      const off = new Set(String(offCsv).split(",").filter(Boolean));
      out.push({ ...p, modes: (p.modes || []).filter(k => !off.has(k)) });
    }
    if (!out.some(p => p.id === "custom" || p.custom)) {
      const thumbs = [];
      for (const p of out) for (const th of (p.thumbs || [])) if (thumbs.length < 3) thumbs.push(th);
      const total = out.reduce((s, p) => s + (p.total || p.playable || 0), 0);
      out.push({
        id: "custom", slug: "custom", name: "Custom", name_en: "Custom",
        description: "Złóż własne multi-pakiet z kilku istniejących.",
        description_en: "Build a multi-pack from the packs you already have.",
        color: "#1B1712", playable: total, total, thumbs, modes: [], custom: true,
      });
    } else {
      const i = out.findIndex(p => p.id === "custom" || p.custom);
      if (i >= 0 && i !== out.length - 1) out.push(...out.splice(i, 1));
    }
    return json(out);
  }
  if (req.method === "GET" && path === "/api/most/status")
    return json({ tmdb: !!env.TMDB_API_KEY, ok: true });
  let mm = path.match(/^\/api\/most\/(person|movie)\/(\d+)(?:\/(movies|cast))?$/);
  if (mm && req.method === "GET") {
    const kind = mm[1], nid = +mm[2], sub = mm[3];
    const lang = detectLang(req);
    const key = env.TMDB_API_KEY;
    if (key) {
      try {
        if (kind === "person" && (sub == null || sub === "movies")) {
          const person = await tmdbPersonDetail(key, nid, lang);
          return json({ person, movies: await tmdbPersonMovies(key, nid) });
        }
        if (kind === "movie" && (sub == null || sub === "cast")) {
          return json({ movie: { kind: "movie", id: nid }, cast: await tmdbMovieCast(key, nid, lang) });
        }
      } catch (e) { console.log("most lookup tmdb", String(e)); }
    }
    return json(await localMostLookup(env, req, kind, nid, lang, !key));
  }
  let m = path.match(/^\/api\/packs\/(custom|\d+)\/titles$/);
  if (m) {
    const lang = detectLang(req);
    const asItems = movies => {
      const seen = new Set(), out = [];
      for (const x of movies) {
        const title = String(x.title || "").trim(), pl_title = String(x.pl_title || "").trim();
        if (!title && !pl_title) continue;
        const key = title.toLowerCase() + "\0" + pl_title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ title, pl_title });
      }
      out.sort((a, b) => (a.title || a.pl_title).localeCompare(b.title || b.pl_title, lang));
      return json(out);
    };
    if (m[1] === "custom") {
      const packsList = await (await asset(env, req, "/data/packs.json")).json();
      const raw = new URL(req.url).searchParams.get("packs") || "";
      const want = new Set(raw.split(",").map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number));
      const movies = [];
      for (const p of packsList) {
        if (p.custom || p.id === "custom") continue;
        if (!want.size || !want.has(Number(p.id))) continue;
        try {
          const data = await loadMergedPack(env, req, p.id);
          movies.push(...data.movies);
        } catch {}
      }
      return asItems(movies);
    }
    const data = await loadMergedPack(env, req, +m[1]);
    return asItems(data.movies);
  }
  if (req.method === "POST" && path === "/api/rooms") {
    const d = await body(req);
    let kind = d.kind || (["most","filmrun"].includes(d.pack_id) ? "most" : d.pack_id === "custom" ? "custom" : "pack");
    if (kind === "filmrun" || kind === "bridge") kind = "most";
    if (kind === "pack") {
      const packId = parseInt(d.pack_id, 10);
      if (!(packId > 0)) throw new ApiError(400, "Zły format danych");
    } else if (kind === "custom") {
      const ids = (d.pack_ids || d.packs || []).map(Number).filter(n => n > 0);
      if (!ids.length) throw new ApiError(400, "Wybierz przynajmniej jeden pakiet");
    }
    for (let i = 0; i < 8; i++) {
      const code = newCode();
      const out = await roomStub(env, code).create(
        code, kind === "pack" ? parseInt(d.pack_id, 10) : kind,
        parseInt(d.rounds, 10) || (kind === "most" ? 3 : 10),
        d.modes || null, d.name, d.settings || null,
        { kind, pack_ids: d.pack_ids || d.packs || [] },
      );
      if (!out.error) return json(out);
    }
    throw new ApiError(503, "Nie ma takiego adresu");
  }
  m = path.match(/^\/api\/rooms\/([A-Za-z0-9]{4})(?:\/(\w+))?$/);
  if (!m) throw new ApiError(404, "Nie ma takiego adresu");
  const code = m[1].toUpperCase(), action = m[2];
  const stub = roomStub(env, code);
  if (req.method === "GET" && action === "peek") {
    const p = await stub.peek();
    if (!p) throw new ApiError(404, "Nie ma pokoju o tym kodzie");
    return json(p);
  }
  if (req.method === "POST" && action === "join") return json(await stub.join((await body(req)).name));
  if (req.method === "GET" && action === "ws") {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
    return stub.fetch(req);
  }
  throw new ApiError(404, "Nie ma takiego adresu");
}


let _actorIndex = null;
async function actorsIndex(env, req) {
  if (_actorIndex) return _actorIndex;
  const r = await asset(env, req, "/data/actors-index.json");
  if (!r.ok) return (_actorIndex = {});
  _actorIndex = await r.json();
  return _actorIndex;
}

async function serveActor(env, req, id) {
  const stub = contentStub(env);
  const ov = await stub.fetch(new Request(`https://content/actor?id=${id}`));
  if (ov.ok) return ov;
  const idx = await actorsIndex(env, req);
  const e = idx[String(id)];
  if (!e) return new Response("Brak zdjęcia", { status: 404 });
  const shard = String(e.s).padStart(2, "0");
  const res = await asset(env, req, `/data/actors-${shard}.bin`);
  if (!res.ok) return new Response("Brak zdjęcia", { status: 404 });
  const buf = await res.arrayBuffer();
  const slice = buf.slice(e.o, e.o + e.n);
  const ct = e.t || "image/jpeg";
  return new Response(slice, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=3600" } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const lang = detectLang(req);
    try {
      if (req.method === "GET" && (path === "/" || /^\/r\/[A-Za-z0-9]{4}$/.test(path))) return page(env, req, "index.html");
      if (req.method === "GET" && path === "/admin")
        return page(env, req, "admin.html", 'window.KADR_CLOUD=true;window.KADR_RT="ws";');
      // overlay poster takes precedence
      let pm = path.match(/^\/poster\/(\d+)\.jpg$/);
      if (req.method === "GET" && pm) {
        const stub = contentStub(env);
        const r = await stub.fetch(new Request(`https://content/poster?id=${pm[1]}`));
        if (r.ok) return r;
        return env.ASSETS.fetch(req);
      }
      let fm = path.match(/^\/frame\/(\d+)\.jpg$/);
      if (req.method === "GET" && fm) {
        const stub = contentStub(env);
        const r = await stub.fetch(new Request(`https://content/frame?id=${fm[1]}`));
        if (r.ok) return r;
        return env.ASSETS.fetch(req);
      }
      let am = path.match(/^\/actor\/(\d+)\.jpg$/);
      if (req.method === "GET" && am) {
        return serveActor(env, req, +am[1]);
      }
      if (path.startsWith("/data/") || path === "/static/index.html" || path === "/static/admin.html")
        throw new ApiError(404, "Nie ma takiej strony");
      if (req.method === "GET" && path.startsWith("/static/")) {
        const ui = frontendResponse(req, path);
        if (ui) return ui;
        return env.ASSETS.fetch(req);
      }
      if (path.startsWith("/api/admin")) return await adminApi(req, env, path);
      if (path.startsWith("/api/")) return await gameApi(req, env, path, url);
      return env.ASSETS.fetch(req);
    } catch (e) {
      const key = e.key || e.message || "Nie ma takiego adresu";
      const code = e.code || (/Nie ma pokoju|Nie ma takiego pakietu|Nie ma filmu|Nie ma cytatu|Nie ma pytania/.test(key) ? 404
        : /pełny|gotowych|Zły|Podaj|Za duże|Scraper|Pobieranie|W chmurze/.test(key) ? 400 : 500);
      if (code === 500) console.error(JSON.stringify({ msg: "worker error", error: String(e && e.stack || e) }));
      return json({ error: errText(key, lang), key }, code);
    }
  },
};
