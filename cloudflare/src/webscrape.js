// webscrape.js - plakaty i obsada z IMDb / Filmwebu / TMDB w Workerze (port webscrape.py).
// Zwykłe zapytania HTTP + parsowanie HTML/JSON. Kadry z trailerów (yt-dlp + OpenCV) zostają lokalne.
// Limit planu Free: 50 zewnętrznych subrequestów na żądanie, więc każde zapytanie liczymy (budget).
import { normTitle } from "./game.js";

export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
export const SOURCES = ["auto", "filmweb", "imdb", "tmdb"];
export const ORDER = { poster: ["imdb", "filmweb", "tmdb"], cast: ["filmweb", "imdb", "tmdb"] };
export const DEFAULT_N = 6;
const MAX_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE = 1_500_000;
const FW = "https://www.filmweb.pl";
const TMDB = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
const TMDB_FACE = "https://image.tmdb.org/t/p/w185";
const BUDGET = 45;                      // zapas poniżej 50 subrequestów (plan Free)

export class Blocked extends Error {}

export function scrapeCtx(env, fetchImpl = null) {
  return { used: 0, budget: BUDGET, key: (env && env.TMDB_API_KEY) || "", fetch: fetchImpl || ((u, o) => fetch(u, o)) };
}

async function http(ctx, url, { accept = "text/html,application/json;q=0.9,*/*;q=0.8", lang = "pl,en;q=0.8", extra = {}, raw = false } = {}) {
  if (ctx.used >= ctx.budget) throw new Error("limit zapytań na jedno kliknięcie");
  ctx.used++;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  let r;
  try {
    r = await ctx.fetch(url, { signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": UA, "Accept": accept, "Accept-Language": lang, ...extra } });
  } finally { clearTimeout(t); }
  if ([401, 403, 429, 503].includes(r.status)) throw new Blocked(`HTTP ${r.status}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error("file too large");
  if (r.status === 202) {
    const head = new TextDecoder("latin1").decode(buf.slice(0, 4000));
    if (!buf.byteLength || head.includes("awsWaf")) throw new Blocked("HTTP 202 (AWS WAF challenge)");
  }
  if (raw) return { data: buf, ctype: r.headers.get("Content-Type") || "" };
  return new TextDecoder("utf-8").decode(buf);
}

export function isImage(b) {
  if (!b || b.length < 12) return false;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return true;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return true;
  return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
}

const PLACEHOLDER = /nophoto|noname|placeholder|empty|default.?avatar|\/front\/assets\/|\/assets\/images\/t\.gif|transparent\.gif|blank\.gif|no[_-]?pic|missing/i;
export function isPlaceholderUrl(url) {
  if (!url || url === "p" || url === "#" || String(url).startsWith("data:")) return true;
  return PLACEHOLDER.test(url);
}

function imageHeaders(url) {
  if (/fwcdn\.pl|filmweb\.pl/.test(url)) return { Referer: "https://www.filmweb.pl/" };
  if (/media-amazon\.com|imdb\.com|amazon\.com/.test(url)) return { Referer: "https://www.imdb.com/" };
  if (/image\.tmdb\.org/.test(url)) return { Referer: "https://www.themoviedb.org/" };
  return {};
}

export async function fetchImage(ctx, url) {
  if (!/^https?:\/\//.test(url || "")) throw new Error("bad url");
  if (isPlaceholderUrl(url)) throw new Error("placeholder");
  const { data, ctype } = await http(ctx, url, { accept: "image/avif,image/webp,image/*,*/*;q=0.8", raw: true, extra: imageHeaders(url) });
  if (!isImage(data)) throw new Error("not an image (" + (ctype || "?") + ")");
  if (data.byteLength > MAX_IMAGE) throw new Error("image too large");
  return data;
}

export function smallPhotoUrl(url) {
  if (!url) return url;
  if (url.includes("image.tmdb.org")) return url.replace(/\/t\/p\/w\d+/, "/t/p/w185");
  if (url.includes("fwcdn.pl")) return url.replace(/\$/g, "2");
  if (/media-amazon\.com|imdb\.com/.test(url)) return url.replace(/\._V1_.*?\.(jpg|png|webp)$/i, "._V1_SX256.$1");
  return url;
}

const yearOk = (y, want) => !want || !y || Math.abs(+y - +want) <= 1;
function titleOk(cands, title, pl = "") {
  const keys = new Set([normTitle(title), normTitle(pl)].filter(Boolean));
  return cands.some(c => c && keys.has(normTitle(c)));
}
export function unescapeHtml(s) {
  return String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

// ---------------------------------------------------------------- IMDb
async function imdbFind(ctx, title, year, pl = "") {
  const q = String(title || "").toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, " ").trim();
  const d = JSON.parse(await http(ctx, `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q)}.json`, { accept: "application/json" }));
  const hits = (d.d || []).filter(h => String(h.id || "").startsWith("tt")
    && ["movie", "tvMovie", "video", undefined, null].includes(h.qid) && yearOk(h.y, year));
  if (!hits.length) return null;
  const exact = hits.filter(h => titleOk([h.l], title, pl));
  return (exact.length ? exact : hits)[0];
}

export function parseImdbPage(page) {
  let ld = {};
  const m = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (m) { try { ld = JSON.parse(m[1]); } catch { ld = {}; } }
  const og = page.match(/property="og:image" content="([^"]+)"/) || page.match(/content="([^"]+)" property="og:image"/);
  return { ld, og: og ? og[1] : null };
}

async function imdbPage(ctx, tid) {
  return parseImdbPage(await http(ctx, `https://www.imdb.com/title/${tid}/`, { lang: "en-US,en;q=0.9" }));
}

async function imdbPoster(ctx, movie) {
  const hit = await imdbFind(ctx, movie.title, movie.year, movie.pl_title);
  if (!hit) throw new Error("not found");
  let url = null, note = "";
  try { const { ld, og } = await imdbPage(ctx, hit.id); url = (typeof ld.image === "string" ? ld.image : null) || og; }
  catch (e) { if (e instanceof Blocked) note = ` (title page blocked: ${e.message}, used search image)`; else throw e; }
  if (!url) url = (hit.i || {}).imageUrl;
  if (!url) throw new Error("no poster");
  url = url.replace(/\._V1_.*?\.(jpg|png)$/, "._V1_SX600.$1");
  return [await fetchImage(ctx, url), { imdb_id: hit.id, url, note }];
}

async function imdbCast(ctx, movie, n) {
  const hit = await imdbFind(ctx, movie.title, movie.year, movie.pl_title);
  if (!hit) throw new Error("not found");
  try {
    const { ld } = await imdbPage(ctx, hit.id);
    const cast = [];
    for (const a of ld.actor || []) {
      if (!a.name) continue;
      const nm = String(a.url || a["@id"] || "").match(/\/(nm\d+)/);
      const rec = { name: unescapeHtml(a.name), character: "", source_id: nm ? nm[1] : "" };
      if (a.image) rec.photo_url = typeof a.image === "string" ? a.image : (a.image.url || "");
      cast.push(rec);
    }
    if (cast.length) return [cast.slice(0, n), { imdb_id: hit.id, note: "" }];
  } catch (e) {
    if (!(e instanceof Blocked)) throw e;
    const stars = String(hit.s || "").split(",").map(s => s.trim()).filter(Boolean);
    if (stars.length >= 3) return [stars.slice(0, n).map(s => ({ name: s, character: "", source_id: "" })), { imdb_id: hit.id, note: "" }];
    throw new Blocked(`${e.message}; search lists only ${stars.length} stars`);
  }
  throw new Error("no cast");
}

// ---------------------------------------------------------------- Filmweb
const fwJson = async (ctx, path) => JSON.parse(await http(ctx, FW + path, { accept: "application/json", extra: { "x-locale": "pl" } }));

async function filmwebFind(ctx, title, year, pl = "") {
  const seen = new Set(), cands = [];
  for (const q of [title, pl].filter(Boolean)) {
    if (normTitle(q) === normTitle(title) && q !== title) continue;
    const res = await fwJson(ctx, "/api/v1/live/search?query=" + encodeURIComponent(q));
    for (const h of (res.searchHits || []).slice(0, 8)) {
      if (h.type === "film" && !seen.has(h.id)) { seen.add(h.id); cands.push(h.id); }
    }
  }
  let best = null;
  for (const fid of cands.slice(0, 6)) {
    const info = await fwJson(ctx, `/api/v1/title/${fid}/info`);
    if (!yearOk(info.year, year)) continue;
    info.id = fid;
    if (titleOk([info.title, info.originalTitle], title, pl)) return info;
    best = best || info;
  }
  return best;
}

export function absFwPhoto(src) {
  if (!src || src === "p" || src === "#" || src.startsWith("data:")) return "";
  if (src.startsWith("//")) src = "https:" + src;
  else if (src.startsWith("/")) src = (src.includes("fwcdn") || src.startsWith("/pp")) ? "https://fwcdn.pl" + src : FW + src;
  if (!/^https?:\/\//.test(src) || isPlaceholderUrl(src)) return "";
  if (src.includes("fwcdn.pl") && !/\/ppo?\//.test(src)) return "";
  return src.replace(/\$/g, "2");
}

export function parseFilmwebCast(page, n) {
  const cast = [];
  for (const it of page.split("filmFullCastSection__item castRoleListElement").slice(1)) {
    const href = it.match(/href="(\/person\/[^"]+)"/);
    let nm = "";
    const person = it.match(/data-person-source[^>]*>\s*([^<]+)/) || it.match(/href="\/person\/[^"]+"[^>]*>\s*([^<]+)/);
    if (person) nm = person[1].trim();
    if (!nm) {
      const alt = it.match(/simplePoster__image[^>]*alt="([^"]+)"/) || it.match(/<img[^>]*alt="([^"]+)"/);
      nm = (alt ? alt[1] : "").trim();
    }
    const ch = it.match(/href="\/character\/[^"]+"[^>]*>\s*([^<]+)/) || it.match(/castRoleListElement__role[^>]*>\s*(?:<[^>]+>\s*)*([^<]+)/);
    let src = "";
    const poster = it.match(/simplePoster__image[^>]*(?:srcset|src|data-src)="([^"]+)"/);
    if (poster) src = poster[1];
    if (!src) {
      for (const m of it.matchAll(/(?:srcset|src|data-src)="([^"]+)"/g)) {
        if (m[1].includes("/ppo/") || m[1].includes("fwcdn.pl/pp")) { src = m[1]; break; }
      }
    }
    if (src && src.includes(" ")) src = src.split(",")[0].trim().split(/\s+/)[0] || src;
    if (nm) {
      let pid = "";
      if (href) { const hm = href[1].split("?")[0].replace(/\/+$/, "").match(/(\d+)$/); pid = hm ? hm[1] : ""; }
      const rec = { name: unescapeHtml(nm).trim(), character: ch ? unescapeHtml(ch[1]).trim() : "", source_id: pid };
      const url = absFwPhoto(src);
      if (url) rec.photo_url = url;
      cast.push(rec);
    }
    if (cast.length >= n) break;
  }
  return cast;
}

async function filmwebPoster(ctx, movie) {
  const info = await filmwebFind(ctx, movie.title, movie.year, movie.pl_title);
  if (!info) throw new Error("not found");
  if (!info.posterPath) throw new Error("no poster");
  const url = "https://fwcdn.pl/fpo" + info.posterPath.replace("$", "3");
  return [await fetchImage(ctx, url), { filmweb_id: info.id, url, note: "", pl: info.title }];
}

async function filmwebCast(ctx, movie, n) {
  const info = await filmwebFind(ctx, movie.title, movie.year, movie.pl_title);
  if (!info) throw new Error("not found");
  const page = await http(ctx, `${FW}/film/x-${info.year || 0}-${info.id}/cast/actors`);
  const cast = parseFilmwebCast(page, n);
  if (!cast.length) throw new Error("no cast on the page");
  return [cast, { filmweb_id: info.id, note: "", pl: info.title }];
}

// ---------------------------------------------------------------- TMDB (gdy jest sekret TMDB_API_KEY)
async function tmdbGet(ctx, path, params = {}) {
  const u = new URL(TMDB + path);
  u.searchParams.set("api_key", ctx.key);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return JSON.parse(await http(ctx, u.toString(), { accept: "application/json" }));
}
async function tmdbFind(ctx, title, year) {
  const res = await tmdbGet(ctx, "/search/movie", { query: title, ...(year ? { year: String(year) } : {}) });
  return (res.results || [])[0] || null;
}
async function tmdbPoster(ctx, movie) {
  if (!ctx.key) throw new Error("no TMDB key");
  const hit = await tmdbFind(ctx, movie.title, movie.year);
  if (!hit || !hit.poster_path) throw new Error("not found");
  const url = TMDB_IMG + hit.poster_path;
  return [await fetchImage(ctx, url), { tmdb_id: hit.id, url, note: "" }];
}
async function tmdbCast(ctx, movie, n) {
  if (!ctx.key) throw new Error("no TMDB key");
  const hit = await tmdbFind(ctx, movie.title, movie.year);
  if (!hit) throw new Error("not found");
  const det = await tmdbGet(ctx, `/movie/${hit.id}`, { append_to_response: "credits" });
  const cast = ((det.credits || {}).cast || []).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)).slice(0, n);
  return [cast.map(c => ({ name: c.name, character: c.character || "", source_id: String(c.id || ""),
    ...(c.profile_path ? { photo_url: TMDB_FACE + c.profile_path } : {}) })), { tmdb_id: hit.id, note: "" }];
}

const FUN = {
  "poster:imdb": imdbPoster, "poster:filmweb": filmwebPoster, "poster:tmdb": tmdbPoster,
  "cast:imdb": imdbCast, "cast:filmweb": filmwebCast, "cast:tmdb": tmdbCast,
};

export function chain(kind, source, hasKey) {
  if (["imdb", "filmweb", "tmdb"].includes(source)) return [source];
  return ORDER[kind].filter(s => s !== "tmdb" || hasKey);
}

// Zwraca [dane, meta, źródło]. Przy auto próbuje kolejnych źródeł, błędy idą do log.
export async function fetchOne(ctx, kind, source, movie, n = DEFAULT_N, log = []) {
  const errs = [];
  for (const s of chain(kind, source, !!ctx.key)) {
    try {
      const [data, meta] = await FUN[`${kind}:${s}`](ctx, movie, n);
      return [data, meta, s];
    } catch (e) {
      errs.push(e instanceof Blocked ? `${s}: blocked (${e.message})` : `${s}: ${e.message || e}`);
      log.push("    " + errs[errs.length - 1]);
    }
  }
  const err = new Error(errs.join("; ") || "no source");
  err.log = log;
  throw err;
}

// zdjęcie aktora: bajty albo null (powód w reasons)
export async function fetchActorImage(ctx, url, reasons = []) {
  url = smallPhotoUrl(url);
  if (isPlaceholderUrl(url) || !/^https?:\/\//.test(url || "")) { reasons.push(url ? "placeholder" : "brak adresu"); return null; }
  try {
    const data = await fetchImage(ctx, url);
    if (data.byteLength < 800) { reasons.push("to nie jest prawdziwe zdjęcie"); return null; }
    return data;
  } catch (e) { reasons.push(e instanceof Blocked ? `blokada (${e.message})` : (e.message || "pobieranie nieudane")); return null; }
}

export async function tmdbPersonPhoto(ctx, name) {
  if (!ctx.key || !String(name || "").trim()) return null;
  let res;
  try { res = await tmdbGet(ctx, "/search/person", { query: name.trim() }); } catch { return null; }
  const nt = normTitle(name), hits = res.results || [];
  const hit = hits.find(h => normTitle(h.name) === nt && h.profile_path) || hits.find(h => h.profile_path);
  return hit ? { photo_url: TMDB_FACE + hit.profile_path, source: "tmdb", source_id: String(hit.id || "") } : null;
}
