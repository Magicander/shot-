"""pull_from_cloudflare.py - odbudowuje lokalny quiz.db z danych Workera Cloudflare.

Eksport /api/admin/export zwraca Static Assets + nakładkę Content DO już SCALONĄ
(format kadr-export-v1, pole overlay + packs po merge). Stary Worker bez eksportu:
najpierw wgraj sam kod bez ruszania assetów:

  python deploy_cloudflare.py --code-only

Potem ten skrypt (albo przycisk "pobierz bazę" w /admin + --from-file).

  python pull_from_cloudflare.py --url https://shot-quiz.xxx.workers.dev
  python pull_from_cloudflare.py --from-file kadr-export.json
  python pull_from_cloudflare.py --url URL --out inna.db

Istniejący quiz.db jest kopiowany do quiz-backup-YYYYMMDD-HHMM.db (chyba że --out).
"""
from __future__ import annotations

import argparse
import getpass
import http.cookiejar
import json
import os
import shutil
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
EXPORT_FORMAT = "kadr-export-v1"


class Client:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, method, path, body=None, raw=False):
        data = None if body is None else json.dumps(body).encode()
        r = urllib.request.Request(
            self.base + path, data=data, method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"} if body is not None or method != "GET"
            else {"Accept": "*/*"},
        )
        try:
            with self.opener.open(r, timeout=120) as res:
                blob = res.read()
                if raw:
                    return res.status, blob, dict(res.headers)
                return res.status, json.loads(blob.decode() or "null"), dict(res.headers)
        except urllib.error.HTTPError as e:
            blob = e.read()
            try:
                return e.code, json.loads(blob.decode() or "null"), dict(e.headers)
            except ValueError:
                return e.code, {"error": blob[:200].decode("utf-8", "replace")}, dict(e.headers)

    def get_bytes(self, path):
        r = urllib.request.Request(self.base + path)
        try:
            with self.opener.open(r, timeout=120) as res:
                return res.status, res.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


def probe_old_deploy(c: Client) -> dict:
    """Co da się wyczytać ze starego Workera bez /api/admin/export."""
    info = {"packs": None, "overview": None, "pack_json_blocked": None, "titles": {}, "sample_frame": None, "sample_poster": None}
    st, packs, _ = c.req("GET", "/api/packs")
    if st == 200:
        info["packs"] = packs
    st, ov, _ = c.req("GET", "/api/admin/overview")
    if st == 200:
        info["overview"] = ov
    st, body, _ = c.req("GET", "/data/pack-1.json")
    info["pack_json_blocked"] = st in (403, 404) or (isinstance(body, dict) and body.get("key"))
    if info["packs"]:
        pid = info["packs"][0]["id"]
        st, t, _ = c.req("GET", f"/api/packs/{pid}/titles")
        if st == 200:
            info["titles"][pid] = t
        thumbs = info["packs"][0].get("thumbs") or []
        if thumbs:
            st, img = c.get_bytes(f"/frame/{thumbs[0]}.jpg")
            info["sample_frame"] = (thumbs[0], st, len(img) if st == 200 else 0)
    return info


def fetch_export(c: Client, password: str) -> dict:
    st, body, _ = c.req("POST", "/api/admin/login", {"password": password})
    if st != 200:
        sys.exit(f"Logowanie nieudane ({st}): {body.get('error') or body}")
    st, body, _ = c.req("GET", "/api/admin/export")
    if st == 405 or (isinstance(body, dict) and "tylko do odczytu" in str(body.get("key") or body.get("error") or "")):
        print("\nBŁĄD: wdrożony Worker nie ma jeszcze /api/admin/export.")
        print("Publiczne /data/pack-*.json są zablokowane, a wrangler/API Cloudflare")
        print("nie pozwalają pobrać wdrożonych Static Assets.")
        print("\nŻeby odzyskać dane BEZ nadpisania kadrów/filmów w chmurze:")
        print("  1) git pull")
        print("  2) python deploy_cloudflare.py --code-only")
        print("     (wgrywa tylko kod Workera, keep_assets=true - assety zostają)")
        print("  3) python pull_from_cloudflare.py --url <adres>")
        print("\nNIE uruchamiaj zwykłego deploy_cloudflare.py z starą lokalną bazą")
        print("- nadpisze nowsze dane w chmurze starymi.")
        # pokaż co widać bez eksportu
        info = probe_old_deploy(c)
        print("\nDostępne bez eksportu:")
        if info["packs"]:
            print(f"  /api/packs: {len(info['packs'])} pakietów (bez filmów)")
        if info["overview"]:
            o = info["overview"]
            print(f"  /api/admin/overview: {o.get('frames')} kadrów, {o.get('posters')} plakatów, "
                  f"paczki={[ (p['name'], p['movies']) for p in o.get('packs', []) ]}")
        print(f"  /data/pack-*.json zablokowane: {info['pack_json_blocked']}")
        print(f"  /frame i /poster są publiczne, ale bez mapowania film→kadr nie da się złożyć quiz.db")
        sys.exit(2)
    if st != 200:
        sys.exit(f"Eksport nieudany ({st}): {body.get('error') or body}")
    if not isinstance(body, dict) or body.get("format") != EXPORT_FORMAT:
        sys.exit(f"Nieznany format eksportu: {body.get('format') if isinstance(body, dict) else type(body)}")
    return body


def load_export_file(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("format") != EXPORT_FORMAT:
        sys.exit(f"Plik nie jest eksportem {EXPORT_FORMAT} (format={data.get('format')!r})")
    return data


def backup_if_needed(out: Path):
    if out.exists() and out.stat().st_size > 0:
        stamp = time.strftime("%Y%m%d-%H%M")
        bak = out.with_name(f"{out.stem}-backup-{stamp}{out.suffix}")
        n = 1
        while bak.exists():
            bak = out.with_name(f"{out.stem}-backup-{stamp}-{n}{out.suffix}")
            n += 1
        shutil.copy2(out, bak)
        print(f"Kopia zapasowa: {bak}")


def write_db(data: dict, out: Path, images: dict):
    """images: {'frame': {id: bytes}, 'poster': {movie_id: bytes}}"""
    if out.exists():
        out.unlink()
    sys.path.insert(0, str(BASE))
    import db
    con = db.init_db(out, seed=False)
    # wyczyść ewentualny seed
    for t in ("quotes", "questions", "frames", "posters", "actor_photos", "picks", "movies", "packs"):
        con.execute(f"DELETE FROM {t}")
    con.commit()

    frame_ok = poster_ok = actor_ok = 0
    movies_n = quotes_n = questions_n = 0
    for i, p in enumerate(data["packs"]):
        # modes w eksporcie = włączone; modes_off = reszta z pełnej listy
        # modes_off w bazie to lista CSV (jak w app.py), nie JSON
        ALL_MODES = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "cytat"]
        modes_on = set(p.get("modes") or ALL_MODES)
        if isinstance(p.get("modes_off"), str):
            modes_off = p["modes_off"]
        elif isinstance(p.get("modes_off"), list):
            modes_off = ",".join(m for m in ALL_MODES if m in p["modes_off"])
        else:
            modes_off = ",".join(m for m in ALL_MODES if m not in modes_on)
        cur = con.execute(
            "INSERT INTO packs (id, slug, name, description, color, cover_frame_id, sort, name_en, description_en, modes_off) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (p["id"], p.get("slug") or f"pack-{p['id']}", p["name"], p.get("description") or "",
             p.get("color") or "#E2541B", p.get("cover_frame_id"), i,
             p.get("name_en") or p["name"], p.get("description_en") or p.get("description") or "", modes_off),
        )
        for q in p.get("questions") or []:
            con.execute(
                "INSERT INTO questions (id, pack_id, prompt_pl, prompt_en, answers) VALUES (?,?,?,?,?)",
                (q["id"], p["id"], q.get("prompt_pl") or "", q.get("prompt_en") or "",
                 json.dumps(q.get("answers") or [], ensure_ascii=False)),
            )
            questions_n += 1
        for m in p.get("movies") or []:
            aliases = m.get("aliases") or []
            if isinstance(aliases, list):
                aliases_s = "\n".join(aliases)
            else:
                aliases_s = str(aliases)
            con.execute(
                "INSERT INTO movies (id, pack_id, title, year, status, pl_title, aliases, cast_json, updated) "
                "VALUES (?,?,?,?, 'ok', ?, ?, ?, datetime('now'))",
                (m["id"], p["id"], m["title"], m.get("year") or 0, m.get("pl_title") or "",
                 aliases_s, json.dumps(m.get("cast") or [], ensure_ascii=False)),
            )
            movies_n += 1
            for q in m.get("quotes") or []:
                text = q["text"] if isinstance(q, dict) else str(q)
                lang = q.get("lang", "") if isinstance(q, dict) else ""
                con.execute("INSERT INTO quotes (movie_id, text, lang) VALUES (?,?,?)", (m["id"], text, lang or ""))
                quotes_n += 1
            frames = m.get("frames") or []
            if frames and len(frames) >= 3:
                # zachowaj oryginalne id kadrów (linki /frame/{id}.jpg)
                for pos, fid in enumerate(frames[:3]):
                    img = images["frame"].get(fid)
                    if not img:
                        continue
                    con.execute(
                        "INSERT INTO frames (id, movie_id, position, ts_seconds, image) VALUES (?,?,?,?,?)",
                        (fid, m["id"], pos, 0, img),
                    )
                    frame_ok += 1
                con.execute(
                    "INSERT INTO picks (movie_id, hard_frame_id, medium_frame_id, easy_frame_id) VALUES (?,?,?,?) "
                    "ON CONFLICT(movie_id) DO UPDATE SET hard_frame_id=excluded.hard_frame_id, "
                    "medium_frame_id=excluded.medium_frame_id, easy_frame_id=excluded.easy_frame_id",
                    (m["id"], frames[0], frames[1], frames[2]),
                )
            if m.get("poster"):
                img = images["poster"].get(m["id"])
                if img:
                    con.execute(
                        "INSERT INTO posters (movie_id, image, source, url, updated) VALUES (?,?,?,?, datetime('now'))",
                        (m["id"], img, "cloud", ""),
                    )
                    poster_ok += 1
    # zdjęcia aktorów (unikalne id z obsady)
    for aid, img in (images.get("actor") or {}).items():
        if not img:
            continue
        name = ""
        try:
            con.execute(
                "INSERT INTO actor_photos (id, key, name, source, source_id, image, url, updated) "
                "VALUES (?,?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET image=excluded.image",
                (int(aid), f"cloud:{aid}", name, "cloud", "", img, "", time.time()),
            )
            actor_ok += 1
        except sqlite3.IntegrityError:
            con.execute(
                "INSERT INTO actor_photos (key, name, source, image, url, updated) VALUES (?,?,?,?,?,?)",
                (f"cloud:{aid}-dup", name, "cloud", img, "", time.time()),
            )
            actor_ok += 1
    con.commit()
    # sqlite_sequence
    try:
        for table, col in (("packs", "id"), ("movies", "id"), ("frames", "id"), ("questions", "id"),
                           ("quotes", "id"), ("actor_photos", "id")):
            mx = con.execute(f"SELECT MAX({col}) FROM {table}").fetchone()[0] or 0
            row = con.execute("SELECT seq FROM sqlite_sequence WHERE name=?", (table,)).fetchone()
            if row is None:
                con.execute("INSERT INTO sqlite_sequence(name, seq) VALUES (?,?)", (table, mx))
            else:
                con.execute("UPDATE sqlite_sequence SET seq=? WHERE name=?", (mx, table))
        con.commit()
    except sqlite3.Error as e:
        print("uwaga sqlite_sequence:", e)
    con.close()
    return {"movies": movies_n, "frames": frame_ok, "posters": poster_ok, "actors": actor_ok,
            "quotes": quotes_n, "questions": questions_n, "packs": len(data["packs"])}


def collect_image_ids(data: dict):
    frames, posters, actors = set(), set(), set()
    for p in data["packs"]:
        if p.get("cover_frame_id"):
            frames.add(p["cover_frame_id"])
        for m in p.get("movies") or []:
            for fid in m.get("frames") or []:
                frames.add(fid)
            if m.get("poster"):
                posters.add(m["id"])
            for c in m.get("cast") or []:
                if isinstance(c, dict) and c.get("photo_id"):
                    actors.add(int(c["photo_id"]))
    for a in (data.get("overlay") or {}).get("actors") or []:
        if a.get("id") and not a.get("deleted"):
            actors.add(int(a["id"]))
    return frames, posters, actors


def download_images(c: Client, frames, posters, actors=None):
    out = {"frame": {}, "poster": {}, "actor": {}}
    miss_f, miss_p, miss_a = [], [], []
    for fid in sorted(frames):
        st, img = c.get_bytes(f"/frame/{fid}.jpg")
        if st == 200 and img:
            out["frame"][fid] = img
        else:
            miss_f.append(fid)
    for mid in sorted(posters):
        st, img = c.get_bytes(f"/poster/{mid}.jpg")
        if st == 200 and img:
            out["poster"][mid] = img
        else:
            miss_p.append(mid)
    for aid in sorted(actors or []):
        st, img = c.get_bytes(f"/actor/{aid}.jpg")
        if st == 200 and img:
            out["actor"][aid] = img
        else:
            miss_a.append(aid)
    return out, miss_f, miss_p, miss_a


def main():
    ap = argparse.ArgumentParser(description="Odbuduj quiz.db z Cloudflare (eksport admina)")
    ap.add_argument("--url", help="Adres Workera, np. https://shot-quiz.xxx.workers.dev")
    ap.add_argument("--from-file", type=Path, help="Gotowy JSON z przycisku Pobierz bazę")
    ap.add_argument("--out", type=Path, default=None, help="Ścieżka docelowa (domyślnie quiz.db)")
    ap.add_argument("--password", default=os.environ.get("QUIZ_ADMIN_PASSWORD"), help="Hasło admina (inaczej getpass)")
    ap.add_argument("--probe", action="store_true", help="Tylko sprawdź, co widać na starym wdrożeniu (bez zapisu)")
    a = ap.parse_args()
    out = (a.out or (BASE / "quiz.db")).resolve()

    if a.probe:
        if not a.url:
            sys.exit("--probe wymaga --url")
        c = Client(a.url)
        pw = a.password if a.password is not None else getpass.getpass("Hasło admina Cloudflare: ")
        st, body, _ = c.req("POST", "/api/admin/login", {"password": pw})
        print("login:", st, body if st != 200 else "ok")
        info = probe_old_deploy(c)
        print(json.dumps({k: (v if k != "overview" else {"frames": v.get("frames"), "posters": v.get("posters"),
              "packs": [(p["name"], p["movies"]) for p in v.get("packs", [])]} if isinstance(v, dict) else v)
              for k, v in info.items()}, ensure_ascii=False, indent=2))
        st, body, _ = c.req("GET", "/api/admin/export")
        print("export:", st, (body.get("key") or body.get("error") or (body.get("format") if isinstance(body, dict) else "")) )
        return

    if a.from_file:
        data = load_export_file(a.from_file)
        c = Client(a.url) if a.url else None
    else:
        if not a.url:
            sys.exit("Podaj --url albo --from-file")
        c = Client(a.url)
        pw = a.password or getpass.getpass("Hasło admina Cloudflare: ")
        data = fetch_export(c, pw)

    frames, posters, actors = collect_image_ids(data)
    print(f"Eksport: {len(data['packs'])} pakietów, {sum(len(p.get('movies') or []) for p in data['packs'])} filmów, "
          f"{len(frames)} kadrów, {len(posters)} plakatów, {len(actors)} zdjęć aktorów (built={data.get('built')})")

    if c is None:
        print("Uwaga: bez --url nie pobiorę obrazów (/frame, /poster, /actor). Baza będzie bez kadrów/plakatów/zdjęć.")
        print("Uruchom ponownie z --url albo najpierw zapisz JSON i podaj oba argumenty.")
        images, miss_f, miss_p, miss_a = {"frame": {}, "poster": {}, "actor": {}}, list(frames), list(posters), list(actors)
    else:
        images, miss_f, miss_p, miss_a = download_images(c, frames, posters, actors)
        print(f"Pobrano obrazów: {len(images['frame'])} kadrów, {len(images['poster'])} plakatów, {len(images['actor'])} zdjęć aktorów")

    backup_if_needed(out)
    stats = write_db(data, out, images)
    print(f"Zapisano {out}: {stats}")

    print("\nCzego NIE ma w chmurze (i nie da się odzyskać z Workera):")
    print("  - tylko 3 kadry na film (hard/medium/easy); reszta kadrów ze scrapingu jest lokalna")
    print("  - historia scrapingu (yt_url, video_id, tried_ids, query, status/error)")
    print("  - tabela picks poza tymi 3 kadrami; dodatkowe wybory admina giną")
    print("  - modes_off admina: w chmurze są tylko tryby faktycznie dostępne (z builda); ręczne wyłączenia giną")
    if miss_f or miss_p or miss_a:
        print(f"\nBrakujące obrazy: {len(miss_f)} kadrów {miss_f[:10]}{'...' if len(miss_f)>10 else []}, "
              f"{len(miss_p)} plakatów {miss_p[:10]}, {len(miss_a)} zdjęć aktorów {miss_a[:10]}")
    if data.get("note"):
        print(f"\n{data['note']}")


if __name__ == "__main__":
    main()
