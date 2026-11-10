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
        cast = []
        for a in ld.get("actor", []):
            if not a.get("name"):
                continue
            nm = re.search(r"/(nm\d+)", str(a.get("url") or a.get("@id") or ""))
            rec = {"name": html.unescape(a["name"]), "character": "", "source_id": nm.group(1) if nm else ""}
            if a.get("image"):
                rec["photo_url"] = a["image"] if isinstance(a["image"], str) else (a["image"] or {}).get("url") or ""
            cast.append(rec)
        if cast:
            return cast[:n], {"imdb_id": hit["id"], "note": ""}
    except Blocked as e:
        stars = [s.strip() for s in (hit.get("s") or "").split(",") if s.strip()]
        if len(stars) >= 3:
            return [{"name": s, "character": "", "source_id": ""} for s in stars[:n]], {"imdb_id": hit["id"], "note": ""}
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
        href = re.search(r'href="(/person/[^"]+)"', it)
        # imię: link osoby (data-person-source albo tekst /person/), nie alt kadru z roli
        nm = ""
        person = re.search(r'data-person-source[^>]*>\s*([^<]+)', it) or \
                 re.search(r'href="/person/[^"]+"[^>]*>\s*([^<]+)', it)
        if person:
            nm = person.group(1).strip()
        if not nm:
            alt = re.search(r'simplePoster__image[^>]*alt="([^"]+)"', it) or re.search(r'<img[^>]*alt="([^"]+)"', it)
            nm = (alt.group(1) if alt else "").strip()
        ch = re.search(r'href="/character/[^"]+"[^>]*>\s*([^<]+)', it) or \
             re.search(r'castRoleListElement__role[^>]*>\s*(?:<[^>]+>\s*)*([^<]+)', it)
        # zdjęcie osoby: srcset/src z plakatu obsady (ppo), nie kadr filmu (fph)
        src = ""
        poster = re.search(r'simplePoster__image[^>]*(?:srcset|src|data-src)="([^"]+)"', it)
        if poster:
            src = poster.group(1)
        if not src:
            for m in re.finditer(r'(?:srcset|src|data-src)="([^"]+)"', it):
                if "/ppo/" in m.group(1) or "fwcdn.pl/pp" in m.group(1):
                    src = m.group(1)
                    break
        if src and " " in src:  # srcset: "url 320w, url 640w" — bierz najmniejszy
            first = src.split(",")[0].strip().split()
            src = first[0] if first else src
        if nm:
            pid = ""
            if href:
                hm = re.search(r"(\d+)/?$", href.group(1).split("?")[0].rstrip("/"))
                pid = hm.group(1) if hm else ""
            rec = {"name": html.unescape(nm).strip(),
                   "character": html.unescape(ch.group(1)).strip() if ch else "",
                   "source_id": pid}
            url = _abs_fw_photo(src)
            if url:
                rec["photo_url"] = url
            cast.append(rec)
        if len(cast) >= n:
            break
    if not cast:
        raise LookupError("no cast on the page")
    return cast, {"filmweb_id": info["id"], "note": "", "pl": info.get("title")}


def _abs_fw_photo(src):
    if not src or src in ("p", "#") or src.startswith("data:"):
        return ""
    if src.startswith("//"):
        src = "https:" + src
    elif src.startswith("/"):
        src = "https://fwcdn.pl" + src if "fwcdn" in src or src.startswith("/pp") else FW + src
    if not re.match(r"^https?://", src):
        return ""
    if re.search(r"nophoto|noname|placeholder|empty|default.?avatar", src, re.I):
        return ""
    # mały wariant rozmiaru ($ albo cyfra w ścieżce fwcdn)
    src = src.replace("$", "2")
    return src


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
    out = []
    for c in cast:
        rec = {"name": c["name"], "character": c.get("character") or "", "source_id": str(c.get("id") or "")}
        if c.get("profile_path"):
            rec["photo_url"] = tmdb.IMG_FACE + c["profile_path"]
        out.append(rec)
    return out, {"tmdb_id": hit["id"], "note": ""}


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


def small_photo_url(url):
    if not url:
        return url
    if "image.tmdb.org" in url:
        return re.sub(r"/t/p/w\d+", "/t/p/w185", url)
    if "fwcdn.pl" in url:
        return url.replace("$", "2")
    if "media-amazon.com" in url or "imdb.com" in url:
        return re.sub(r"\._V1_.*?\.(jpg|png|webp)$", r"._V1_SX256.\1", url, flags=re.I)
    return url


def tmdb_person_photo(name):
    """Fallback: zdjęcie po imieniu z TMDB (gdy źródło obsady nie dało fotki)."""
    import tmdb
    key = db.tmdb_key()
    if not key or not (name or "").strip():
        return None
    try:
        res = tmdb._get(key, "/search/person", {"query": name.strip()})
    except Exception:
        return None
    nt = db.norm_title(name)
    hits = res.get("results") or []
    exact = [h for h in hits if db.norm_title(h.get("name")) == nt and h.get("profile_path")]
    hit = (exact or [h for h in hits if h.get("profile_path")] or [None])[0]
    if not hit:
        return None
    return {"photo_url": tmdb.IMG_FACE + hit["profile_path"], "source": "tmdb", "source_id": str(hit.get("id") or "")}


def fetch_actor_image(url):
    url = small_photo_url(url)
    if not re.match(r"^https?://", url or ""):
        return None
    try:
        return fetch_image(url)
    except Exception:
        return None


def attach_photo(con, actor, source, log=None):
    """Pobiera i zapisuje zdjęcie (z URL przy obsadzie albo z TMDB po imieniu). Zwraca photo_id albo None."""
    if actor.get("photo_id"):
        return actor["photo_id"]
    url = actor.get("photo_url") or ""
    src = source or ""
    sid = actor.get("source_id") or ""
    key = db.actor_photo_key(src, sid, actor.get("name"))
    name_key = db.actor_photo_key("", "", actor.get("name") or "")
    for k in (key, name_key):
        if not k:
            continue
        row = con.execute("SELECT id FROM actor_photos WHERE key=?", (k,)).fetchone()
        if row:
            return row["id"]
    img = fetch_actor_image(url) if url else None
    if not img:
        fb = tmdb_person_photo(actor.get("name") or "")
        if fb:
            img = fetch_actor_image(fb["photo_url"])
            if img:
                url, src, sid = fb["photo_url"], fb["source"], fb["source_id"]
    if not img:
        return None
    try:
        return db.save_actor_photo(
            con, key=db.actor_photo_key(src, sid, actor.get("name")),
            name=actor.get("name") or "", source=src, source_id=sid, image=img, url=url or "")
    except Exception as e:
        if log:
            log(f"    photo {actor.get('name')}: {e}")
        return None


def store_cast_row(c, billing):
    row = {"name": c["name"], "character": c.get("character") or "", "billing": billing}
    if c.get("photo_id"):
        row["photo_id"] = int(c["photo_id"])
    return row


def save(con, kind, movie_id, data, meta, source):
    with con:
        if meta.get("imdb_id"):
            con.execute("UPDATE movies SET imdb_id=? WHERE id=?", (meta["imdb_id"], movie_id))
        if meta.get("filmweb_id"):
            con.execute("UPDATE movies SET filmweb_id=? WHERE id=?", (meta["filmweb_id"], movie_id))
        if meta.get("tmdb_id"):
            con.execute("UPDATE movies SET tmdb_id=? WHERE id=?", (meta["tmdb_id"], movie_id))
        if kind == "poster":
            db.save_poster(con, movie_id, data, source, meta.get("url") or "")
        else:
            # kolejność odsłaniania: od najmniej znanego do gwiazdy (odwrotna do napisów)
            rows = [dict(c, billing=i + 1) for i, c in enumerate(data)]
            for c in rows:
                pid = attach_photo(con, c, source)
                if pid:
                    c["photo_id"] = pid
            stored = [store_cast_row(c, c["billing"]) for c in rows]
            con.execute("UPDATE movies SET cast_json=?, cast_source=? WHERE id=?",
                        (json.dumps(stored[::-1], ensure_ascii=False), source, movie_id))


def fill_photos(con, movie, source="auto", n=DEFAULT_N, log=None):
    """Dociąga brakujące zdjęcia do istniejącej obsady; imiona, role i kolejność zostają."""
    try:
        rows = json.loads(movie.get("cast_json") or "[]")
    except ValueError:
        rows = []
    if not rows:
        return {"ok": 0, "miss": 0, "changed": False}
    lookup = {}
    try:
        data, meta, src = fetch_one("cast", source, movie, max(n, len(rows)), log)
        if meta.get("imdb_id"):
            con.execute("UPDATE movies SET imdb_id=? WHERE id=?", (meta["imdb_id"], movie["id"]))
        if meta.get("filmweb_id"):
            con.execute("UPDATE movies SET filmweb_id=? WHERE id=?", (meta["filmweb_id"], movie["id"]))
        if meta.get("tmdb_id"):
            con.execute("UPDATE movies SET tmdb_id=? WHERE id=?", (meta["tmdb_id"], movie["id"]))
        for c in data:
            lookup[db.norm_title(c.get("name"))] = c
    except Exception as e:
        src = source
        if log:
            log(f"    {e}")
    changed = False
    ok = miss = 0
    for c in rows:
        if c.get("photo_id"):
            ok += 1
            continue
        hit = lookup.get(db.norm_title(c.get("name") or ""))
        probe = dict(hit or {"name": c.get("name")})
        if not probe.get("name"):
            probe["name"] = c.get("name")
        pid = attach_photo(con, probe, src if hit else "auto", log)
        if pid:
            c["photo_id"] = pid
            ok += 1
            changed = True
        else:
            miss += 1
    if changed:
        con.execute("UPDATE movies SET cast_json=? WHERE id=?",
                    (json.dumps(rows, ensure_ascii=False), movie["id"]))
    return {"ok": ok, "miss": miss, "changed": changed}


def run(rows, progress, kind, source="auto", n=DEFAULT_N, fill_pl=False, db_path=None, photos_only=False):
    L = progress.L
    if photos_only:
        what = L("zdjęcia obsady", "cast photos")
    else:
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
                if photos_only:
                    with con:
                        st = fill_photos(con, r, source, n, progress.log)
                    progress.done += 1
                    progress.log(L(
                        f"OK - {label}: zdjęcia {st['ok']}, bez fotki {st['miss']}",
                        f"OK - {label}: photos {st['ok']}, missing {st['miss']}"))
                else:
                    data, meta, src = fetch_one(kind, source, r, n, progress.log)
                    save(con, kind, r["id"], data, meta, src)
                    if fill_pl and meta.get("pl") and not r.get("pl_title") and \
                            db.norm_title(meta["pl"]) != db.norm_title(r["title"]):
                        with con:
                            con.execute("UPDATE movies SET pl_title=? WHERE id=? AND pl_title=''", (meta["pl"], r["id"]))
                    progress.done += 1
                    if kind == "poster":
                        info = f"{len(data) // 1024} KB"
                    else:
                        photos = sum(1 for c in (json.loads(con.execute(
                            "SELECT cast_json FROM movies WHERE id=?", (r["id"],)).fetchone()["cast_json"] or "[]"))
                                     if c.get("photo_id"))
                        info = f"{len(data)} " + L("aktorów", "actors") + f", {photos} " + L("zdjęć", "photos")
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
