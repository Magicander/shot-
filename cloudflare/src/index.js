// index.js - Worker: strony (PL/EN wg kraju), API pokoi -> Durable Object, lekki panel admina tylko do odczytu.
// Kadry, plakaty i dane pakietów to Workers Static Assets (katalog build/ z deploy_cloudflare.py).
import { errText } from "./i18n.js";
export { Room } from "./room.js";

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

// język: wybór z przełącznika (ciasteczko) > kraj z Cloudflare (PL -> kadr*) > Accept-Language
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

async function page(env, req, file) {
  const lang = detectLang(req);
  const res = await env.ASSETS.fetch(new URL("/static/" + file, req.url));
  if (!res.ok) return res;
  let html = await res.text();
  for (const [k, v] of Object.entries(META[lang])) html = html.replaceAll(`{{${k}}}`, v);
  html = html.replace(/<html lang="(pl|en)"/, `<html lang="$1" data-geo="${geoLang(req)}"`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", Vary: "Cookie" } });
}

async function body(req) {
  const t = await req.text();
  if (t.length > 20000) throw new ApiError(413, "Za duże żądanie");
  try { return t ? JSON.parse(t) : {}; } catch { throw new ApiError(400, "Zły format danych"); }
}

function roomStub(env, code) { return env.ROOMS.get(env.ROOMS.idFromName(code)); }
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return [...b].map(x => ALPHABET[x % ALPHABET.length]).join("");
}

// ------------------------------------------------------------------ admin (tylko odczyt)
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
  if (!await isAdmin(req, env)) throw new ApiError(403, "Zaloguj się");
  if (path === "/api/admin/me") return json({ ok: true, cloud: true });
  if (path === "/api/admin/overview") return asset(env, req, "/data/meta.json").then(r => new Response(r.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }));
  if (path === "/api/admin/export" && req.method === "GET") return exportDb(env, req);
  throw new ApiError(405, "Panel w chmurze jest tylko do odczytu. Zmiany rób lokalnie i wyślij je skryptem deploy_cloudflare.py.");
}


// Pełny eksport do odbudowy quiz.db lokalnie. Kadry i plakaty są osobnymi URL-ami (/frame, /poster).
async function exportDb(env, req) {
  const packsRes = await asset(env, req, "/data/packs.json");
  const metaRes = await asset(env, req, "/data/meta.json");
  if (!packsRes.ok || !metaRes.ok) throw new ApiError(500, "Nie ma takiego adresu");
  const packsList = await packsRes.json();
  const meta = await metaRes.json();
  const packs = [];
  for (const p of packsList) {
    const r = await asset(env, req, `/data/pack-${p.id}.json`);
    if (!r.ok) throw new ApiError(500, "Nie ma takiego pakietu");
    const data = await r.json();
    packs.push({
      id: data.pack.id, slug: data.pack.slug, name: data.pack.name, name_en: data.pack.name_en,
      description: data.pack.description, description_en: data.pack.description_en, color: data.pack.color,
      cover_frame_id: (p.thumbs && p.thumbs[0]) || null, modes: p.modes || [],
      questions: data.pack.questions || [], movies: data.movies || [],
    });
  }
  return json({
    format: "kadr-export-v1",
    built: meta.built, frames: meta.frames, posters: meta.posters, bytes: meta.bytes,
    note: "Cloud holds at most 3 gameplay frames per film (hard/medium/easy). Scrape history, trailer URLs, picks and extra frames are not in the cloud copy.",
    packs,
  });
}

// ------------------------------------------------------------------ gra
async function gameApi(req, env, path, url) {
  if (req.method === "GET" && path === "/api/packs") return asset(env, req, "/data/packs.json").then(r => new Response(r.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" } }));
  let m = path.match(/^\/api\/packs\/(\d+)\/titles$/);
  if (m) {
    const r = await asset(env, req, `/data/titles-${m[1]}-${detectLang(req)}.json`);
    if (!r.ok) throw new ApiError(404, "Nie ma takiego pakietu");
    return new Response(r.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" } });
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
      if (req.method === "GET" && path === "/admin") return page(env, req, "cloud-admin.html");
      if (path.startsWith("/data/") || path === "/static/index.html" || path === "/static/cloud-admin.html") throw new ApiError(404, "Nie ma takiej strony");
      if (path.startsWith("/api/admin")) return await adminApi(req, env, path);
      if (path.startsWith("/api/")) return await gameApi(req, env, path, url);
      return env.ASSETS.fetch(req);
    } catch (e) {
      const key = e.key || e.message || "Nie ma takiego adresu";
      const code = e.code || (/Nie ma pokoju|Nie ma takiego pakietu/.test(key) ? 404 : /pełny|gotowych/.test(key) ? 400 : 500);
      if (code === 500) console.error(JSON.stringify({ msg: "worker error", error: String(e && e.stack || e) }));
      return json({ error: errText(key, lang), key }, code);
    }
  },
};
