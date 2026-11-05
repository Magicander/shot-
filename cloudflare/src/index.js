// index.js - Worker: strony (PL/EN), API pokoi -> Room DO, panel admina z zapisem do Content DO.
// Kadry/plakaty/pakiety bazowe = Workers Static Assets. Edycje w chmurze = overlay w Content DO.
import { errText } from "./i18n.js";
import { handleAdmin, ApiError as AdminApiError, loadMergedPack, contentOp } from "./admin_api.js";
import { contentStub } from "./content.js";
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
  const res = await env.ASSETS.fetch(new URL("/static/" + file, req.url));
  if (!res.ok) return res;
  let html = await res.text();
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
    built: meta.built, frames: meta.frames, posters: meta.posters, bytes: meta.bytes,
    note: "Merged export: static assets + Content Durable Object overlay. Cloud holds at most 3 gameplay frames per film.",
    overlay_stats: await contentOp(env, { op: "stats" }),
    overlay,
    packs,
  });
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
    return json(out);
  }
  let m = path.match(/^\/api\/packs\/(\d+)\/titles$/);
  if (m) {
    // titles with overlay pl_title
    const data = await loadMergedPack(env, req, +m[1]);
    const lang = detectLang(req);
    const t = new Set(data.movies.map(x => x.title));
    if (lang === "pl") for (const mv of data.movies) if (mv.pl_title) t.add(mv.pl_title);
    return json([...t].sort((a, b) => a.localeCompare(b, lang)));
  }
  if (req.method === "POST" && path === "/api/rooms") {
    const d = await body(req);
    const packId = parseInt(d.pack_id, 10);
    if (!(packId > 0)) throw new ApiError(400, "Zły format danych");
    for (let i = 0; i < 8; i++) {
      const code = newCode();
      const out = await roomStub(env, code).create(code, packId, parseInt(d.rounds, 10) || 10, d.modes || null, d.name, d.settings || null);
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
      if (path.startsWith("/data/") || path === "/static/index.html" || path === "/static/admin.html" || path === "/static/cloud-admin.html")
        throw new ApiError(404, "Nie ma takiej strony");
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
