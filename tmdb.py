"""tmdb.py - pobiera plakaty i obsadę z The Movie Database (wymaga klucza API, patrz panel admina)."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

import db

API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p/w500"
TOP_CAST = 8          # bierzemy główną obsadę (wg kolejności w napisach), potem sortujemy wg popularności


def _get(key, path, params=None, base=None, raw=False):
    base = API if base is None else base
    params = dict(params or {})
    headers = {"Accept": "application/json", "User-Agent": "kadr-quiz/1.0"}
    if key.startswith("eyJ"):           # token v4 (Read Access Token)
        headers["Authorization"] = "Bearer " + key
    else:                               # klucz v3
        params["api_key"] = key
    url = base + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=headers if not raw else {"User-Agent": "kadr-quiz/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    return data if raw else json.loads(data)


def find_movie(key, title, year):
    res = _get(key, "/search/movie", {"query": title, "include_adult": "false", **({"year": year} if year else {})})
    hits = res.get("results") or []
    if not hits and year:
        hits = (_get(key, "/search/movie", {"query": title}).get("results") or [])
        hits = [h for h in hits if (h.get("release_date") or "")[:4] in (str(year - 1), str(year), str(year + 1))]
    if not hits:
        return None
    nt = db.norm_title(title)
    exact = [h for h in hits if nt in (db.norm_title(h.get("title")), db.norm_title(h.get("original_title")))]
    return (exact or hits)[0]


def check_key(key):
    _get(key, "/configuration")
    return True


def run(rows, progress, key, fill_pl=False, redo=False, db_path=None):
    """rows: lista dict(id, title, year). Zapisuje plakat (BLOB) i obsadę (cast_json) dla każdego filmu."""
    L = progress.L
    progress.running, progress.total, progress.started = True, len(rows), time.time()
    progress.log(L(f"TMDB: {len(rows)} filmów do sprawdzenia", f"TMDB: {len(rows)} movies to check"))
    con = db.connect(db_path)
    try:
        for r in rows:
            if progress.stop.is_set():
                progress.log(L("Zatrzymano.", "Stopped."))
                break
            progress.current = r["title"]
            label = r["title"] + (f" ({r['year']})" if r["year"] else "")
            try:
                tid = r.get("tmdb_id")
                hit = None
                if not tid or redo:
                    hit = find_movie(key, r["title"], r["year"])
                    if not hit:
                        raise LookupError(L("nie znaleziono w TMDB", "not found on TMDB"))
                    tid = hit["id"]
                det = _get(key, f"/movie/{tid}", {"append_to_response": "credits"})
                cast = sorted(det.get("credits", {}).get("cast", []), key=lambda c: c.get("order", 99))[:TOP_CAST]
                cast = [{"name": c["name"], "popularity": round(c.get("popularity") or 0, 2),
                         "character": c.get("character") or ""} for c in cast if c.get("name")]
                img = None
                if det.get("poster_path"):
                    img = _get(key, det["poster_path"], base=IMG, raw=True)
                pl = ""
                if fill_pl:
                    pl = (_get(key, f"/movie/{tid}", {"language": "pl-PL"}).get("title") or "").strip()
                    if db.norm_title(pl) == db.norm_title(r["title"]):
                        pl = ""
                with con:
                    con.execute("UPDATE movies SET tmdb_id=?, cast_json=? WHERE id=?",
                                (tid, json.dumps(cast, ensure_ascii=False), r["id"]))
                    if not r["year"] and (det.get("release_date") or "")[:4].isdigit():
                        con.execute("UPDATE movies SET year=? WHERE id=?", (int(det["release_date"][:4]), r["id"]))
                    if img:
                        con.execute("INSERT INTO posters (movie_id, image) VALUES (?,?) ON CONFLICT(movie_id) "
                                    "DO UPDATE SET image=excluded.image", (r["id"], img))
                    if pl:
                        con.execute("UPDATE movies SET pl_title=? WHERE id=? AND pl_title=''", (pl, r["id"]))
                progress.done += 1
                progress.log(L(f"OK  {label}: plakat {'tak' if img else 'brak'}, obsada {len(cast)}",
                               f"OK  {label}: poster {'yes' if img else 'none'}, cast {len(cast)}"))
            except urllib.error.HTTPError as e:
                progress.failed += 1
                progress.log(f"ERR {label}: HTTP {e.code}" + (L(" (zły klucz API?)", " (bad API key?)") if e.code == 401 else ""))
                if e.code == 401:
                    break
            except Exception as e:  # noqa: BLE001
                progress.failed += 1
                progress.log(f"ERR {label}: {e}")
            time.sleep(0.15)
    finally:
        con.close()
        progress.running, progress.current, progress.finished = False, None, time.time()
        progress.log(L(f"TMDB gotowe: {progress.done} OK, {progress.failed} błędów",
                       f"TMDB done: {progress.done} OK, {progress.failed} errors"))
