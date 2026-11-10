// most.js - gra Most/Bridge: przejście po filmografii, punktacja i dobór pary.
// Ruchy dzieją się w naszym UI. Linki IMDb/Filmweb są tylko pomocnicze (bez śledzenia).

export const TMDB_API = "https://api.themoviedb.org/3";
export const IMG = "https://image.tmdb.org/t/p/w185";
export const BFS_MOVIES = 8;
export const BFS_CAST = 8;
export const MIN_VOTES = 40;
export const TARGET_DIST = [3, 4];
export const MOST_CAP = 8;
export const FIRST_BONUS = 100;

export function mostScore(nMovies, reached, first = false, cap = MOST_CAP) {
  if (!reached) return 0;
  return Math.max(100, (cap - Number(nMovies)) * 200) + (first ? FIRST_BONUS : 0);
}

export function pathMovies(path) {
  return (path || []).filter(x => x && x.kind === "movie").length;
}

export function extLinks(person, lang = "pl") {
  const imdb = (person && person.imdb_id) || "";
  const fw = person && person.filmweb_id;
  const name = (person && person.name) || "";
  if (lang === "pl") {
    if (fw) return { label: "Filmweb", url: `https://www.filmweb.pl/person/${Number(fw)}` };
    return { label: "Filmweb", url: `https://www.filmweb.pl/search#/${encodeURIComponent(name)}` };
  }
  if (imdb) return { label: "IMDb", url: `https://www.imdb.com/name/${imdb}/` };
  return { label: "IMDb", url: `https://www.imdb.com/find/?q=${encodeURIComponent(name)}` };
}

function personView(p, lang = "pl") {
  const photo = p.photo || (p.profile_path ? IMG + p.profile_path : null);
  const out = {
    kind: "person", id: Number(p.id), name: p.name || "", photo,
    imdb_id: p.imdb_id || "", filmweb_id: p.filmweb_id || null,
  };
  out.link = extLinks(out, lang);
  return out;
}

function movieView(m) {
  const poster = m.poster || (m.poster_path ? IMG + m.poster_path : null);
  const rd = m.release_date || m.year || "";
  let year = null;
  if (rd) {
    const y = parseInt(String(rd).slice(0, 4), 10);
    if (Number.isFinite(y)) year = y;
  }
  return { kind: "movie", id: Number(m.id), title: m.title || m.name || "", year, poster };
}

export function localGraph(movies) {
  const g = { _meta: {} };
  const norm = s => String(s || "").replace(/ł/g, "l").replace(/Ł/g, "L").normalize("NFKD")
    .replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const hashName = name => {
    // stabilny ujemny id bez TMDB (nie JS hash, bo ten jest per-proces)
    let h = 2166136261;
    const t = norm(name);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return -((h >>> 0) % 1_000_000_000) - 1;
  };
  for (const m of movies || []) {
    const mid = ["movie", Number(m.id)];
    g._meta[`${mid[0]}:${mid[1]}`] = {
      title: m.title || "", year: m.year,
      poster: m.poster ? `/poster/${m.id}.jpg` : null,
    };
    for (const c of m.cast || []) {
      let name, cid, photo;
      if (typeof c === "string") { name = c; cid = null; photo = null; }
      else { name = c.name || ""; cid = c.source_id || c.tmdb_id; photo = c.photo || null; }
      if (!name) continue;
      const pid = (cid && /^\d+$/.test(String(cid))) ? Number(cid) : hashName(name);
      const pkey = ["person", pid];
      g._meta[`${pkey[0]}:${pkey[1]}`] = { name, photo, imdb_id: "", filmweb_id: null };
      const pk = `${pkey[0]}:${pkey[1]}`, mk = `${mid[0]}:${mid[1]}`;
      (g[pk] || (g[pk] = [])).push(["movie", mid[1]]);
      (g[mk] || (g[mk] = [])).push(["person", pid]);
    }
  }
  const flat = { _meta: {} };
  for (const [k, v] of Object.entries(g._meta)) {
    const [kind, id] = k.split(":");
    flat._meta[[kind, Number(id)]] = v;
    // also string key for lookup
    flat._meta[k] = v;
  }
  for (const [k, vs] of Object.entries(g)) {
    if (k === "_meta") continue;
    const [kind, id] = k.split(":");
    flat[[kind, Number(id)]] = vs;
    flat[k] = vs;
  }
  return flat;
}

function neigh(graph, node) {
  return graph[node] || graph[`${node[0]}:${node[1]}`] || [];
}

function metaOf(graph, node) {
  return (graph._meta && (graph._meta[node] || graph._meta[`${node[0]}:${node[1]}`])) || {};
}

export function isAdjacentLocal(graph, a, b) {
  if (!a || !b || a.kind === b.kind) return false;
  const list = neigh(graph, [a.kind, Number(a.id)]);
  return list.some(n => n[0] === b.kind && Number(n[1]) === Number(b.id));
}

export function viewNode(graph, node, lang = "pl") {
  const meta = metaOf(graph, node);
  if (node[0] === "person") {
    const v = { kind: "person", id: node[1], name: meta.name || String(node[1]), photo: meta.photo || null,
      imdb_id: meta.imdb_id || "", filmweb_id: meta.filmweb_id || null };
    v.link = extLinks(v, lang);
    return v;
  }
  return { kind: "movie", id: node[1], title: meta.title || String(node[1]), year: meta.year, poster: meta.poster || null };
}

export function pickPairFromGraph(graph, rng = Math.random, lang = "pl") {
  const people = [];
  const seen = new Set();
  for (const k of Object.keys(graph)) {
    if (k === "_meta") continue;
    const node = Array.isArray(graph[k]) && k.includes(":") ? k.split(":") : null;
    if (!node) continue;
    if (node[0] !== "person") continue;
    const id = Number(node[1]);
    const sk = `person:${id}`;
    if (seen.has(sk)) continue;
    seen.add(sk);
    people.push(["person", id]);
  }
  // shuffle
  for (let i = people.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [people[i], people[j]] = [people[j], people[i]];
  }
  const [lo, hi] = TARGET_DIST;
  for (const start of people.slice(0, 40)) {
    const prev = new Map([[`${start[0]}:${start[1]}`, null]]);
    const dist = new Map([[`${start[0]}:${start[1]}`, 0]]);
    const q = [start];
    const found = [];
    while (q.length) {
      const cur = q.shift();
      const ck = `${cur[0]}:${cur[1]}`;
      const d = dist.get(ck);
      if (d >= hi) continue;
      for (const nxt of neigh(graph, cur)) {
        const key = `${nxt[0]}:${nxt[1]}`;
        if (prev.has(key)) continue;
        const step = nxt[0] === "movie" ? 1 : 0;
        const nd = d + step;
        if (nd > hi) continue;
        prev.set(key, cur);
        dist.set(key, nd);
        q.push([nxt[0], Number(nxt[1])]);
        if (nxt[0] === "person" && nd >= lo && nd <= hi && Number(nxt[1]) !== start[1])
          found.push(["person", Number(nxt[1])]);
      }
    }
    if (!found.length) continue;
    const goal = found[Math.floor(rng() * found.length)];
    const chain = [];
    let cur = goal;
    while (cur) {
      chain.push(cur);
      const p = prev.get(`${cur[0]}:${cur[1]}`);
      cur = p;
    }
    chain.reverse();
    const path = chain.map(n => viewNode(graph, n, lang));
    const startV = viewNode(graph, start, lang);
    const goalV = viewNode(graph, goal, lang);
    return [startV, goalV, path];
  }
  return null;
}

export function pickPairLocal(movies, rng = Math.random, lang = "pl") {
  return pickPairFromGraph(localGraph(movies), rng, lang);
}

export function tmdbHeaders(key) {
  const headers = { Accept: "application/json", "User-Agent": "kadr-quiz/1.0" };
  const params = {};
  if (String(key).startsWith("eyJ")) headers.Authorization = "Bearer " + key;
  else params.api_key = key;
  return { headers, params };
}

export async function tmdbGet(key, path, params = {}) {
  const { headers, params: base } = tmdbHeaders(key);
  const q = new URLSearchParams({ ...base, ...params });
  const url = TMDB_API + path + (q.toString() ? "?" + q : "");
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("tmdb " + res.status);
  return res.json();
}

export async function tmdbPersonMovies(key, personId) {
  const data = await tmdbGet(key, `/person/${Number(personId)}/movie_credits`);
  const creds = [...(data.cast || [])].sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.popularity || 0) - (a.popularity || 0));
  const out = [];
  for (const c of creds) {
    if ((c.vote_count || 0) < MIN_VOTES && (c.popularity || 0) < 8) continue;
    if (c.character && String(c.character).toLowerCase().includes("archive footage")) continue;
    out.push(movieView(c));
    if (out.length >= 40) break;
  }
  return out;
}

export async function tmdbMovieCast(key, movieId, lang = "pl") {
  const data = await tmdbGet(key, `/movie/${Number(movieId)}/credits`);
  const cast = [...(data.cast || [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return cast.filter(c => c.id && c.name).slice(0, 40).map(c => personView(c, lang));
}

export async function tmdbPersonDetail(key, personId, lang = "pl") {
  const data = await tmdbGet(key, `/person/${Number(personId)}`, { append_to_response: "external_ids" });
  const ext = data.external_ids || {};
  data.imdb_id = ext.imdb_id || data.imdb_id || "";
  return personView(data, lang);
}

export async function tmdbAdjacent(key, node, lang = "pl") {
  if (node.kind === "person") return tmdbPersonMovies(key, node.id);
  return tmdbMovieCast(key, node.id, lang);
}

export async function tmdbIsAdjacent(key, a, b, lang = "pl") {
  if (!a || !b || a.kind === b.kind) return false;
  try {
    if (a.kind === "person")
      return (await tmdbPersonMovies(key, a.id)).some(m => Number(m.id) === Number(b.id));
    return (await tmdbMovieCast(key, a.id, lang)).some(p => Number(p.id) === Number(b.id));
  } catch {
    return false;
  }
}

export async function pickPairTmdb(key, seedIds = [], lang = "pl", rng = Math.random) {
  let seeds = [...seedIds];
  if (!seeds.length) {
    const page = 1 + Math.floor(rng() * 5);
    const data = await tmdbGet(key, "/person/popular", { page });
    seeds = (data.results || []).map(p => p.id).filter(Boolean);
  }
  // shuffle copy
  seeds = seeds.slice();
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
  }
  const [lo, hi] = TARGET_DIST;
  for (const sid of seeds.slice(0, 8)) {
    let start;
    try { start = await tmdbPersonDetail(key, sid, lang); }
    catch { continue; }
    const prev = new Map([[`person:${start.id}`, null]]);
    const dist = new Map([[`person:${start.id}`, 0]]);
    const views = new Map([[`person:${start.id}`, start]]);
    const q = [["person", start.id, start]];
    const found = [];
    let steps = 0;
    while (q.length && steps < 80) {
      const [kind, nid] = q.shift();
      steps++;
      const d = dist.get(`${kind}:${nid}`);
      if (d >= hi) continue;
      let neighList;
      try { neighList = kind === "person" ? await tmdbPersonMovies(key, nid) : await tmdbMovieCast(key, nid, lang); }
      catch { continue; }
      neighList = kind === "person" ? neighList.slice(0, BFS_MOVIES) : neighList.slice(0, BFS_CAST);
      for (const n of neighList) {
        const k2 = `${n.kind}:${n.id}`;
        if (prev.has(k2)) continue;
        const nd = d + (n.kind === "movie" ? 1 : 0);
        if (nd > hi) continue;
        prev.set(k2, [kind, nid]);
        dist.set(k2, nd);
        views.set(k2, n);
        q.push([n.kind, Number(n.id), n]);
        if (n.kind === "person" && nd >= lo && nd <= hi && Number(n.id) !== start.id) found.push(k2);
      }
    }
    if (!found.length) continue;
    const goalK = found[Math.floor(rng() * found.length)];
    const chain = [];
    let cur = goalK;
    while (cur) {
      chain.push(views.get(cur));
      const p = prev.get(cur);
      cur = p ? `${p[0]}:${p[1]}` : null;
    }
    chain.reverse();
    let goal = views.get(goalK);
    if (!goal.link) {
      try { goal = await tmdbPersonDetail(key, goal.id, lang); }
      catch { goal.link = extLinks(goal, lang); }
    }
    return [start, goal, chain];
  }
  return null;
}

export function seedIdsFromMovies(movies) {
  const ids = [];
  for (const m of movies || []) {
    for (const c of m.cast || []) {
      if (c && typeof c === "object" && /^\d+$/.test(String(c.source_id || "")))
        ids.push(Number(c.source_id));
    }
  }
  return [...new Set(ids)];
}

export async function pickPair(movies, key, lang = "pl", rng = Math.random) {
  let pair = null;
  if (key) {
    try { pair = await pickPairTmdb(key, seedIdsFromMovies(movies), lang, rng); }
    catch (e) { console.log("Most TMDB pair failed:", String(e)); }
  }
  if (!pair) pair = pickPairLocal(movies, rng, lang);
  if (!pair) {
    const err = new Error(key ? "most_no_pair" : "most_no_tmdb");
    err.code = "LookupError";
    err.key = err.message;
    throw err;
  }
  const [start, goal, witness] = pair;
  start.link = extLinks(start, lang);
  goal.link = extLinks(goal, lang);
  return { start, goal, witness: pathMovies(witness) };
}

export function enrichLocal(graph, node) {
  if (!node) return node;
  const meta = metaOf(graph, [node.kind, Number(node.id)]) || {};
  return { ...node, ...meta, kind: node.kind, id: Number(node.id) };
}
