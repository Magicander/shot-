"""webscrape.py - plakaty i obsada z IMDb i Filmwebu (zwykłe zapytania HTTP, biblioteka standardowa).

IMDb: wyszukiwanie przez publiczny endpoint podpowiedzi (v3.sg.media-imdb.com), plakat i obsada
ze strony tytułu (og:image / JSON-LD). Strony tytułów IMDb bywają zablokowane przez AWS WAF
(odpowiedź 202 z wyzwaniem JS) - wtedy plakat bierzemy z podpowiedzi, a z obsady zostają
tylko dwie gwiazdy z podpowiedzi.
Filmweb: wyszukiwanie i dane filmu przez publiczne API strony (/api/v1/...), obsada ze strony
/cast/actors.
"""
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import db

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
SOURCES = ("auto", "filmweb", "imdb", "tmdb")
ORDER = {"poster": ("imdb", "filmweb", "tmdb"), "cast": ("filmweb", "imdb", "tmdb")}
DEFAULT_N = 6
MAX_BYTES = 6 * 1024 * 1024


class Blocked(Exception):
    """Serwis odpowiedział blokadą (403/429/WAF)."""


def http(url, accept="text/html,application/json;q=0.9,*/*;q=0.8", lang="pl,en;q=0.8", raw=False, extra=None):
    h = {"User-Agent": UA, "Accept": accept, "Accept-Language": lang}
    h.update(extra or {})
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read(MAX_BYTES + 1)
            if r.status == 202 and ("awsWaf" in data[:4000].decode("latin-1") or not data):
                raise Blocked("HTTP 202 (AWS WAF challenge)")
            ctype = r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429, 503):
            raise Blocked(f"HTTP {e.code}") from None
        raise
    if len(data) > MAX_BYTES:
        raise ValueError("file too large")
    return (data, ctype) if raw else data.decode("utf-8", "replace")


def is_image(data):
    return data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def fetch_image(url):
    if not re.match(r"^https?://", url or ""):
        raise ValueError("bad url")
    data, ctype = http(url, accept="image/avif,image/webp,image/*,*/*;q=0.8", raw=True)
    if not is_image(data):
        raise ValueError("not an image (" + (ctype or "?") + ")")
    return data


def year_ok(y, want):
    return not want or not y or abs(int(y) - int(want)) <= 1


def title_ok(cands, title, pl=""):
    keys = {db.norm_title(title), db.norm_title(pl)} - {""}
    return any(db.norm_title(c) in keys for c in cands if c)


# ---------------------------------------------------------------- IMDb
def imdb_find(title, year, pl=""):
    q = re.sub(r"[^\w\s]", " ", title.lower()).strip()
    d = json.loads(http(f"https://v3.sg.media-imdb.com/suggestion/x/{urllib.parse.quote(q)}.json",
                        accept="application/json"))
    hits = [h for h in d.get("d", []) if str(h.get("id", "")).startswith("tt")
            and h.get("qid") in ("movie", "tvMovie", "video", None) and year_ok(h.get("y"), year)]
    if not hits:
        return None
    exact = [h for h in hits if title_ok([h.get("l")], title, pl)]
    return (exact or hits)[0]


def imdb_page(tid):
    page = http(f"https://www.imdb.com/title/{tid}/", lang="en-US,en;q=0.9")
    ld = {}
    m = re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)
    if m:
        try:
            ld = json.loads(m.group(1))
        except ValueError:
            ld = {}
    og = re.search(r'property="og:image" content="([^"]+)"', page) or re.search(r'content="([^"]+)" property="og:image"', page)
    return ld, (og.group(1) if og else None)


def imdb_poster(movie):
    hit = imdb_find(movie["title"], movie["year"], movie.get("pl_title"))
    if not hit:
        raise LookupError("not found")
    note = ""
    url = None
    try:
        ld, og = imdb_page(hit["id"])
        url = ld.get("image") or og
    except Blocked as e:
        note = f" (title page blocked: {e}, used search image)"
    if not url:
        url = (hit.get("i") or {}).get("imageUrl")
    if not url:
        raise LookupError("no poster")
    url = re.sub(r"\._V1_.*?\.(jpg|png)$", r"._V1_SX600.\1", url)
    return fetch_image(url), {"imdb_id": hit["id"], "url": url, "note": note}


def imdb_cast(movie, n):
    hit = imdb_find(movie["title"], movie["year"], movie.get("pl_title"))
    if not hit:
        raise LookupError("not found")
    try:
        ld, _ = imdb_page(hit["id"])
        cast = [{"name": html.unescape(a["name"]), "character": ""} for a in ld.get("actor", []) if a.get("name")]
        if cast:
            return cast[:n], {"imdb_id": hit["id"], "note": ""}
    except Blocked as e:
        stars = [s.strip() for s in (hit.get("s") or "").split(",") if s.strip()]
        if len(stars) >= 3:
            return [{"name": s, "character": ""} for s in stars[:n]], {"imdb_id": hit["id"], "note": ""}
        raise Blocked(f"{e}; search lists only {len(stars)} stars") from None
    raise LookupError("no cast")


# ---------------------------------------------------------------- Filmweb
FW = "https://www.filmweb.pl"


def fw_json(path):
    return json.loads(http(FW + path, accept="application/json", extra={"x-locale": "pl"}))


def filmweb_find(title, year, pl="", known=None):
    if known:
        info = fw_json(f"/api/v1/title/{known}/info")
        return dict(info, id=known)
    seen, cands = set(), []
    for q in [x for x in (title, pl) if x]:
        res = fw_json("/api/v1/live/search?query=" + urllib.parse.quote(q))
        for h in res.get("searchHits", [])[:8]:
            if h.get("type") == "film" and h["id"] not in seen:
                seen.add(h["id"])
                cands.append(h["id"])
    best = None
    for fid in cands[:8]:
        info = fw_json(f"/api/v1/title/{fid}/info")
        if not year_ok(info.get("year"), year):
            continue
        info["id"] = fid
        if title_ok([info.get("title"), info.get("originalTitle")], title, pl):
            return info
        best = best or info
        time.sleep(0.1)
    return best


def filmweb_poster(movie):
    info = filmweb_find(movie["title"], movie["year"], movie.get("pl_title"), movie.get("filmweb_id"))
    if not info:
        raise LookupError("not found")
    if not info.get("posterPath"):
        raise LookupError("no poster")
    url = "https://fwcdn.pl/fpo" + info["posterPath"].replace("$", "3")
    return fetch_image(url), {"filmweb_id": info["id"], "url": url, "note": "", "pl": info.get("title")}


def filmweb_cast(movie, n):
    info = filmweb_find(movie["title"], movie["year"], movie.get("pl_title"), movie.get("filmweb_id"))
    if not info:
        raise LookupError("not found")
    page = http(f"{FW}/film/x-{info.get('year') or 0}-{info['id']}/cast/actors")
    cast = []
    for it in page.split("filmFullCastSection__item castRoleListElement")[1:]:
        nm = re.search(r'href="/person/[^"]+"[^>]*>\s*<img[^>]*alt="([^"]+)"', it)
        ch = re.search(r'castRoleListElement__role[^>]*>\s*(?:<[^>]+>\s*)*([^<]+)', it)
        if nm:
            cast.append({"name": html.unescape(nm.group(1)).strip(),
                         "character": html.unescape(ch.group(1)).strip() if ch else ""})
        if len(cast) >= n:
            break
    if not cast:
        raise LookupError("no cast on the page")
    return cast, {"filmweb_id": info["id"], "note": "", "pl": info.get("title")}


# ---------------------------------------------------------------- TMDB (opcjonalnie)
def tmdb_poster(movie):
    import tmdb
    key = db.tmdb_key()
    if not key:
        raise LookupError("no TMDB key")
    hit = tmdb.find_movie(key, movie["title"], movie["year"])
    if not hit or not hit.get("poster_path"):
        raise LookupError("not found")
    return tmdb._get(key, hit["poster_path"], base=tmdb.IMG, raw=True), {"tmdb_id": hit["id"], "note": "",
                                                                          "url": tmdb.IMG + hit["poster_path"]}


def tmdb_cast(movie, n):
    import tmdb
    key = db.tmdb_key()
    if not key:
        raise LookupError("no TMDB key")
    hit = tmdb.find_movie(key, movie["title"], movie["year"])
    if not hit:
        raise LookupError("not found")
    det = tmdb._get(key, f"/movie/{hit['id']}", {"append_to_response": "credits"})
    cast = sorted(det.get("credits", {}).get("cast", []), key=lambda c: c.get("order", 99))[:n]
    return [{"name": c["name"], "character": c.get("character") or ""} for c in cast], {"tmdb_id": hit["id"], "note": ""}


FUN = {("poster", "imdb"): imdb_poster, ("poster", "filmweb"): filmweb_poster, ("poster", "tmdb"): tmdb_poster,
       ("cast", "imdb"): imdb_cast, ("cast", "filmweb"): filmweb_cast, ("cast", "tmdb"): tmdb_cast}


def chain(kind, source):
    if source in ("imdb", "filmweb", "tmdb"):
        return [source]
    return [s for s in ORDER[kind] if s != "tmdb" or db.tmdb_key()]


def fetch_one(kind, source, movie, n=DEFAULT_N, log=None):
    """Zwraca (dane, meta, źródło). Przy auto próbuje kolejnych źródeł; błędy idą do log()."""
    errs = []
    for s in chain(kind, source):
        try:
            if kind == "poster":
                data, meta = FUN[(kind, s)](movie)
            else:
                data, meta = FUN[(kind, s)](movie, n)
            return data, meta, s
        except Blocked as e:
            errs.append(f"{s}: blocked ({e})")
        except urllib.error.HTTPError as e:
            errs.append(f"{s}: HTTP {e.code}")
        except Exception as e:  # noqa: BLE001
            errs.append(f"{s}: {e}")
        if log and len(chain(kind, source)) > 1:
            log("    " + errs[-1])
    raise LookupError("; ".join(errs) or "no source")


def save(con, kind, movie_id, data, meta, source):
    with con:
        if meta.get("imdb_id"):
            con.execute("UPDATE movies SET imdb_id=? WHERE id=?", (meta["imdb_id"], movie_id))
        if meta.get("filmweb_id"):
            con.execute("UPDATE movies SET filmweb_id=? WHERE id=?", (meta["filmweb_id"], movie_id))
        if kind == "poster":
            db.save_poster(con, movie_id, data, source, meta.get("url") or "")
        else:
            # w bazie trzymamy kolejność odsłaniania: od najmniej znanego do gwiazdy (odwrotna do napisów)
            rows = [dict(c, billing=i + 1) for i, c in enumerate(data)]
            con.execute("UPDATE movies SET cast_json=?, cast_source=? WHERE id=?",
                        (json.dumps(rows[::-1], ensure_ascii=False), source, movie_id))


def run(rows, progress, kind, source="auto", n=DEFAULT_N, fill_pl=False, db_path=None):
    L = progress.L
    what = L("plakaty", "posters") if kind == "poster" else L("obsada", "cast")
    progress.running, progress.total, progress.started = True, len(rows), time.time()
    progress.log(L(f"{what} ({source}): {len(rows)} filmów", f"{what} ({source}): {len(rows)} movies"))
    con = db.connect(db_path)
    try:
        for r in rows:
            if progress.stop.is_set():
                progress.log(L("Zatrzymano.", "Stopped."))
                break
            label = r["title"] + (f" ({r['year']})" if r["year"] else "")
            progress.current = label
            try:
                data, meta, src = fetch_one(kind, source, r, n, progress.log)
                save(con, kind, r["id"], data, meta, src)
                if fill_pl and meta.get("pl") and not r.get("pl_title") and \
                        db.norm_title(meta["pl"]) != db.norm_title(r["title"]):
                    with con:
                        con.execute("UPDATE movies SET pl_title=? WHERE id=? AND pl_title=''", (meta["pl"], r["id"]))
                progress.done += 1
                info = (f"{len(data) // 1024} KB" if kind == "poster" else f"{len(data)} " + L("aktorów", "actors"))
                progress.log(f"OK - {label}: {src}, {info}{meta.get('note') or ''}")
            except Exception as e:  # noqa: BLE001
                progress.failed += 1
                progress.log(f"ERROR: {label}: {e}")
            time.sleep(0.4)
    finally:
        con.close()
        progress.running, progress.current, progress.finished = False, None, time.time()
        progress.log(L(f"Gotowe: {progress.done} OK, {progress.failed} błędów",
                       f"Done: {progress.done} OK, {progress.failed} errors"))
