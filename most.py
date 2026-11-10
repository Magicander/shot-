"""most.py - gra Most/Bridge: przejście po filmografii od aktora A do aktora B."""
import json
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque

import db

TMDB_API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p/w185"
CACHE_TTL = 12 * 3600
# w BFS bierzemy ograniczoną liczbę pozycji, żeby graf był "znany" i nie wybuchał
BFS_MOVIES = 8
BFS_CAST = 8
MIN_VOTES = 40
TARGET_DIST = (3, 4)          # liczba filmów w ścieżce (1 = ten sam film, za łatwo)
MOST_CAP = 8                  # punktacja: 200 * (cap - filmy), min. 100
FIRST_BONUS = 100


def most_score(n_movies, reached, first=False, cap=MOST_CAP):
    """Punkty za dojście: im krótsza ścieżka, tym więcej. Brak dojścia = 0."""
    if not reached:
        return 0
    return max(100, (cap - int(n_movies)) * 200) + (FIRST_BONUS if first else 0)


def path_movies(path):
    return sum(1 for x in path or [] if x.get("kind") == "movie")


def cache_get(con, key):
    row = con.execute("SELECT body, updated FROM tmdb_cache WHERE key=?", (key,)).fetchone()
    if not row:
        return None
    if time.time() - (row["updated"] or 0) > CACHE_TTL:
        return None
    try:
        return json.loads(row["body"])
    except ValueError:
        return None


def cache_put(con, key, data):
    body = json.dumps(data, ensure_ascii=False)
    con.execute(
        "INSERT INTO tmdb_cache (key, body, updated) VALUES (?,?,?) "
        "ON CONFLICT(key) DO UPDATE SET body=excluded.body, updated=excluded.updated",
        (key, body, time.time()))
    con.commit()


def tmdb_get(key, path, params=None):
    params = dict(params or {})
    headers = {"Accept": "application/json", "User-Agent": "kadr-quiz/1.0"}
    if key.startswith("eyJ"):
        headers["Authorization"] = "Bearer " + key
    else:
        params["api_key"] = key
    url = TMDB_API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def cached_tmdb(con, key, path, params=None):
    ck = path + "?" + urllib.parse.urlencode(sorted((params or {}).items()))
    hit = cache_get(con, ck)
    if hit is not None:
        return hit
    data = tmdb_get(key, path, params)
    cache_put(con, ck, data)
    return data


def ext_links(person, lang="pl"):
    """Link pomocniczy: Filmweb w PL, IMDb w EN (wyszukiwarka, jeśli nie ma id)."""
    imdb = (person or {}).get("imdb_id") or ""
    fw = (person or {}).get("filmweb_id")
    name = (person or {}).get("name") or ""
    if lang == "pl":
        if fw:
            return {"label": "Filmweb", "url": f"https://www.filmweb.pl/person/x-{int(fw)}"}
        q = urllib.parse.quote(name)
        return {"label": "Filmweb", "url": f"https://www.filmweb.pl/search#/{q}"}
    if imdb:
        return {"label": "IMDb", "url": f"https://www.imdb.com/name/{imdb}/"}
    q = urllib.parse.quote(name)
    return {"label": "IMDb", "url": f"https://www.imdb.com/find/?q={q}"}


def person_view(p, lang="pl"):
    photo = p.get("photo") or (IMG + p["profile_path"] if p.get("profile_path") else None)
    out = {"kind": "person", "id": int(p["id"]), "name": p.get("name") or "", "photo": photo,
           "imdb_id": p.get("imdb_id") or "", "filmweb_id": p.get("filmweb_id")}
    out["link"] = ext_links(out, lang)
    return out


def movie_view(m):
    poster = m.get("poster") or (IMG + m["poster_path"] if m.get("poster_path") else None)
    year = None
    rd = m.get("release_date") or m.get("year") or ""
    if rd:
        try:
            year = int(str(rd)[:4])
        except ValueError:
            year = None
    return {"kind": "movie", "id": int(m["id"]), "title": m.get("title") or m.get("name") or "",
            "year": year, "poster": poster}


def person_movies(con, key, person_id):
    data = cached_tmdb(con, key, f"/person/{int(person_id)}/movie_credits")
    creds = list(data.get("cast") or [])
    creds.sort(key=lambda c: (-(c.get("vote_count") or 0), -(c.get("popularity") or 0)))
    out = []
    for c in creds:
        if (c.get("vote_count") or 0) < MIN_VOTES and (c.get("popularity") or 0) < 8:
            continue
        if c.get("character") and "archive footage" in (c.get("character") or "").lower():
            continue
        out.append(movie_view(c))
        if len(out) >= 40:
            break
    return out


def movie_cast(con, key, movie_id):
    data = cached_tmdb(con, key, f"/movie/{int(movie_id)}/credits")
    cast = sorted(data.get("cast") or [], key=lambda c: c.get("order", 99))
    return [person_view(c) for c in cast[:40] if c.get("id") and c.get("name")]


def person_detail(con, key, person_id, lang="pl"):
    data = cached_tmdb(con, key, f"/person/{int(person_id)}", {"append_to_response": "external_ids"})
    ext = data.get("external_ids") or {}
    data["imdb_id"] = ext.get("imdb_id") or data.get("imdb_id") or ""
    return person_view(data, lang)


def adjacent(con, key, node):
    """Sąsiedzi w grafie: z osoby -> filmy, z filmu -> obsada."""
    if node["kind"] == "person":
        return person_movies(con, key, node["id"])
    return movie_cast(con, key, node["id"])


def is_adjacent(con, key, a, b):
    """Czy krok a -> b jest legalny."""
    if a["kind"] == b["kind"]:
        return False
    try:
        if a["kind"] == "person":
            return any(int(m["id"]) == int(b["id"]) for m in person_movies(con, key, a["id"]))
        return any(int(p["id"]) == int(b["id"]) for p in movie_cast(con, key, a["id"]))
    except Exception:
        return False


def pick_pair_from_graph(graph, rng=None):
    """
    graph: dict person_id -> list of (movie_id, movie_meta, list of person neighbors)
    Albo prostszy format: {("person", id): [("movie", id, meta), ...], ("movie", id): [("person", id, meta), ...]}
    Zwraca (start_view, goal_view, witness_path) albo None.
    """
    rng = rng or random
    people = [k for k in graph if k[0] == "person"]
    rng.shuffle(people)
    lo, hi = TARGET_DIST
    for start in people[:40]:
        prev = {start: None}
        dist = {start: 0}          # liczba filmów
        q = deque([start])
        found = []
        while q:
            cur = q.popleft()
            d = dist[cur]
            if d >= hi:
                continue
            for nxt in graph.get(cur) or []:
                key = (nxt[0], nxt[1])
                if key in prev:
                    continue
                step = 1 if nxt[0] == "movie" else 0
                nd = d + step
                if nd > hi:
                    continue
                prev[key] = cur
                dist[key] = nd
                q.append(key)
                if nxt[0] == "person" and lo <= nd <= hi and key != start:
                    found.append(key)
        if not found:
            continue
        goal = rng.choice(found)
        # odtwórz ścieżkę
        chain = []
        cur = goal
        while cur is not None:
            chain.append(cur)
            cur = prev[cur]
        chain.reverse()
        def view(node):
            meta = graph.get("_meta", {}).get(node) or {}
            if node[0] == "person":
                return {"kind": "person", "id": node[1], "name": meta.get("name") or str(node[1]),
                        "photo": meta.get("photo"), "imdb_id": meta.get("imdb_id") or "",
                        "filmweb_id": meta.get("filmweb_id")}
            return {"kind": "movie", "id": node[1], "title": meta.get("title") or str(node[1]),
                    "year": meta.get("year"), "poster": meta.get("poster")}
        path = [view(n) for n in chain]
        start_v, goal_v = view(start), view(goal)
        start_v["link"] = ext_links(start_v, "pl")
        goal_v["link"] = ext_links(goal_v, "pl")
        return start_v, goal_v, path
    return None


def local_graph(movies):
    """Graf z już pobranej obsady pakietów (fallback bez TMDB)."""
    g = {"_meta": {}}
    for m in movies or []:
        mid = ("movie", int(m["id"]))
        g["_meta"][mid] = {"title": m.get("title") or "", "year": m.get("year"),
                           "poster": f"/poster/{m['id']}.jpg" if m.get("poster") else None}
        names = []
        for c in m.get("cast") or []:
            if isinstance(c, str):
                name, cid, photo = c, None, None
            else:
                name, cid, photo = c.get("name") or "", c.get("source_id") or c.get("tmdb_id"), c.get("photo")
            if not name:
                continue
            # lokalne id: tmdb jeśli jest, inaczej ujemny hash imienia
            try:
                pid = int(cid) if cid and str(cid).isdigit() else -abs(hash(db.norm_title(name))) - 1
            except (TypeError, ValueError):
                pid = -abs(hash(db.norm_title(name))) - 1
            pkey = ("person", pid)
            g["_meta"][pkey] = {"name": name, "photo": photo}
            g.setdefault(pkey, []).append(("movie", mid[1], None))
            g.setdefault(mid, []).append(("person", pid, None))
            names.append(pkey)
        # uprość krotki do (kind, id)
    flat = {"_meta": g["_meta"]}
    for k, vs in g.items():
        if k == "_meta":
            continue
        flat[k] = [(v[0], v[1]) for v in vs]
    return flat


def pick_pair_local(movies, rng=None):
    return pick_pair_from_graph(local_graph(movies), rng=rng)


def pick_pair_tmdb(con, key, seed_ids=None, lang="pl", rng=None):
    """Dobiera parę z TMDB (BFS z ograniczeniem). seed_ids: tmdb person id z naszej bazy."""
    rng = rng or random
    seeds = list(seed_ids or [])
    if not seeds:
        data = cached_tmdb(con, key, "/person/popular", {"page": rng.randint(1, 5)})
        seeds = [p["id"] for p in (data.get("results") or []) if p.get("id")]
    rng.shuffle(seeds)
    lo, hi = TARGET_DIST
    for sid in seeds[:8]:
        try:
            start = person_detail(con, key, sid, lang)
        except Exception:
            continue
        prev = {("person", start["id"]): None}
        dist = {("person", start["id"]): 0}
        q = deque([("person", start["id"], start)])
        found = []
        views = {("person", start["id"]): start}
        steps = 0
        while q and steps < 80:
            kind, nid, view = q.popleft()
            steps += 1
            d = dist[(kind, nid)]
            if d >= hi:
                continue
            try:
                neigh = person_movies(con, key, nid) if kind == "person" else movie_cast(con, key, nid)
            except Exception:
                continue
            if kind == "person":
                neigh = neigh[:BFS_MOVIES]
            else:
                neigh = neigh[:BFS_CAST]
            for n in neigh:
                k2 = (n["kind"], int(n["id"]))
                if k2 in prev:
                    continue
                nd = d + (1 if n["kind"] == "movie" else 0)
                if nd > hi:
                    continue
                prev[k2] = (kind, nid)
                dist[k2] = nd
                views[k2] = n
                q.append((n["kind"], int(n["id"]), n))
                if n["kind"] == "person" and lo <= nd <= hi and int(n["id"]) != start["id"]:
                    found.append(k2)
        if not found:
            continue
        goal_k = rng.choice(found)
        chain = []
        cur = goal_k
        while cur is not None:
            chain.append(views[cur])
            cur = prev[cur]
        chain.reverse()
        goal = views[goal_k]
        if "link" not in goal:
            try:
                goal = person_detail(con, key, goal["id"], lang)
            except Exception:
                goal["link"] = ext_links(goal, lang)
        return start, goal, chain
    return None



def _store_person_photo(con, person, image=None, url=""):
    """Zapisuje zdjęcie do actor_photos, tylko gdy obrazek jest prawdziwy. Zwraca /actor/id.jpg albo None."""
    import webscrape
    img = image
    if not img and url:
        img = webscrape.fetch_actor_image(url)
    if not img or not webscrape.is_real_headshot(img):
        return None
    try:
        pid = db.save_actor_photo(
            con, key=db.actor_photo_key(person.get("source") or "tmdb", person.get("source_id") or person.get("id"),
                                        person.get("name")),
            name=person.get("name") or "", source=person.get("source") or "",
            source_id=str(person.get("source_id") or person.get("id") or ""),
            image=img, url=url or "")
    except Exception:
        return None
    return f"/actor/{int(pid)}.jpg" if pid else None


def filmweb_lookup(name, con=None):
    """Filmweb id + ewentualny URL zdjęcia. Wynik cache'owany w tmdb_cache."""
    import webscrape
    key = "fw-person:" + db.norm_title(name)
    if con:
        hit = cache_get(con, key)
        if hit is not None:
            return hit or None
    try:
        info = webscrape.filmweb_person(name)
    except Exception:
        info = None
    if con:
        cache_put(con, key, info or {})
    return info or None


def famous_from_tmdb(con, key, lang="pl", rng=None):
    rng = rng or random
    pages = list(range(1, 4))
    rng.shuffle(pages)
    people = []
    seen = set()
    for page in pages[:2]:
        try:
            data = cached_tmdb(con, key, "/person/popular", {"page": page})
        except Exception:
            continue
        for p in data.get("results") or []:
            if not p.get("id") or not p.get("profile_path") or not p.get("name"):
                continue
            if (p.get("popularity") or 0) < 12:
                continue
            if p["id"] in seen:
                continue
            seen.add(p["id"])
            people.append(p)
    rng.shuffle(people)
    out = []
    for p in people[:24]:
        try:
            det = person_detail(con, key, p["id"], lang)
        except Exception:
            continue
        if not det.get("imdb_id") or not str(det["imdb_id"]).startswith("nm"):
            continue
        fw = None
        if lang == "pl":
            fw = filmweb_lookup(det["name"], con)
            if not fw or not fw.get("filmweb_id"):
                continue
            det["filmweb_id"] = fw["filmweb_id"]
        photo = det.get("photo")
        # ściągnij do naszej bazy, żeby serwować /actor/
        local = _store_person_photo(con, {"name": det["name"], "source": "tmdb", "source_id": det["id"]}, url=photo)
        if not local:
            continue
        det["photo"] = local
        det["link"] = ext_links(det, lang)
        # wymagamy prawdziwego profilu, nie wyszukiwarki
        if "search" in (det["link"].get("url") or "") or "find/?" in (det["link"].get("url") or ""):
            continue
        out.append(det)
        if len(out) >= 12:
            break
    return out


def famous_from_local(con, movies, lang="pl"):
    """Aktorzy z naszej obsady, którzy mają prawdziwe zdjęcie i działający link profilu."""
    import webscrape
    out, seen = [], set()
    for m in movies or []:
        for c in m.get("cast") or []:
            if not isinstance(c, dict):
                continue
            name = (c.get("name") or "").strip()
            pid = c.get("photo_id")
            if not name or not pid:
                continue
            row = con.execute("SELECT id, image, source, source_id, url FROM actor_photos WHERE id=?", (int(pid),)).fetchone()
            if not row or not webscrape.is_real_headshot(row["image"]):
                continue
            src, sid = (row["source"] or ""), str(row["source_id"] or "")
            person = {"kind": "person", "id": int(pid), "name": name, "photo": f"/actor/{int(pid)}.jpg",
                      "imdb_id": sid if sid.startswith("nm") else "", "filmweb_id": None, "source": src, "source_id": sid}
            if src == "imdb" and sid.startswith("nm"):
                person["imdb_id"] = sid
            if src == "filmweb" and sid.isdigit():
                person["filmweb_id"] = int(sid)
            if lang == "pl" and not person["filmweb_id"]:
                fw = filmweb_lookup(name, con)
                if fw and fw.get("filmweb_id"):
                    person["filmweb_id"] = fw["filmweb_id"]
            if lang == "en" and not person["imdb_id"]:
                continue
            if lang == "pl" and not person["filmweb_id"]:
                continue
            person["link"] = ext_links(person, lang)
            if "search" in (person["link"].get("url") or "") or "find/?" in (person["link"].get("url") or ""):
                continue
            key = db.norm_title(name)
            if key in seen:
                continue
            seen.add(key)
            out.append(person)
    return out


def pick_filmrun_pair(con, movies, lang="pl", rng=None):
    """Dobiera dwóch znanych aktorów ze zdjęciem i prawdziwym linkiem do profilu (nie wyszukiwarką)."""
    rng = rng or random
    ensure_cache_table(con)
    key = db.tmdb_key()
    cands = []
    if key:
        try:
            cands = famous_from_tmdb(con, key, lang, rng)
        except Exception as e:
            print("Filmrun TMDB pick failed:", e)
    if len(cands) < 2:
        local = famous_from_local(con, movies, lang)
        have = {db.norm_title(p["name"]) for p in cands}
        for p in local:
            if db.norm_title(p["name"]) not in have:
                cands.append(p)
    cands = [p for p in cands if p.get("photo") and p.get("link") and "search" not in p["link"]["url"]]
    if len(cands) < 2:
        if not key:
            raise LookupError("most_no_tmdb")
        raise LookupError("most_no_pair")
    rng.shuffle(cands)
    start, goal = cands[0], cands[1]
    start["link"] = ext_links(start, lang)
    goal["link"] = ext_links(goal, lang)
    return {"start": start, "goal": goal}


def pick_pair(con, movies, lang="pl", rng=None):
    """Filmrun: dwóch znanych aktorów ze zdjęciem i prawdziwym linkiem. Fallback: stary graf (nieużywany w grze)."""
    try:
        return pick_filmrun_pair(con, movies, lang=lang, rng=rng)
    except LookupError:
        pass
    key = db.tmdb_key()
    seed = []
    for m in movies or []:
        for c in m.get("cast") or []:
            if isinstance(c, dict) and str(c.get("source_id") or "").isdigit():
                seed.append(int(c["source_id"]))
    seed = list(dict.fromkeys(seed))
    pair = None
    if key:
        try:
            pair = pick_pair_tmdb(con, key, seed_ids=seed, lang=lang, rng=rng)
        except Exception as e:
            print("Most TMDB pair failed:", e)
    if not pair:
        pair = pick_pair_local(movies, rng=rng)
    if not pair:
        if not key:
            raise LookupError("most_no_tmdb")
        raise LookupError("most_no_pair")
    start, goal, witness = pair
    start["link"] = ext_links(start, lang)
    goal["link"] = ext_links(goal, lang)
    return {"start": start, "goal": goal, "witness": path_movies(witness)}


def ensure_cache_table(con):
    con.execute(
        "CREATE TABLE IF NOT EXISTS tmdb_cache ("
        "key TEXT PRIMARY KEY, body TEXT NOT NULL, updated REAL)")
    con.commit()
