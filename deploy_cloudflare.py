"""deploy_cloudflare.py - wysyła lokalny quiz (quiz.db + kadry + plakaty + zdjęcia aktorów) na Cloudflare.

Synchronizacja dwukierunkowa treści edytowalnych:
  1) przed pełnym deployem: pobiera nakładkę Content DO z chmury i scala ją do lokalnego quiz.db
     (backup + reguła newest updated_at wins),
  2) buduje Static Assets z (już scalonego) quiz.db i wdraża,
  3) po udanym deployu czyści nakładkę w chmurze (edycje są już w bazie assetów).

Scraper / kadry YouTube nadal tylko lokalnie. --code-only nie rusza assetów ani nakładki.

  python deploy_cloudflare.py              # zbuduj i wdroż
  python deploy_cloudflare.py --build-only # tylko zbuduj cloudflare/build/
  python deploy_cloudflare.py --dev        # zbuduj i uruchom lokalnie `wrangler dev`
  python deploy_cloudflare.py --db inna.db # inna baza
  python deploy_cloudflare.py --code-only  # TYLKO kod Workera; assety w chmurze zostają
  python deploy_cloudflare.py --force      # pomiń ostrzeżenie o mniejszej lokalnej bazie
  python deploy_cloudflare.py --url URL    # adres live do porównania liczby filmów

--code-only używa Cloudflare API (keep_assets=true), żeby wgrać nowy kod (np. /api/admin/export)
bez nadpisywania kadrów i pack-*.json. Wymaga `npx wrangler login` albo CLOUDFLARE_API_TOKEN.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path(__file__).resolve().parent
CF = BASE / "cloudflare"
BUILD = CF / "build"
MAX_FILES = 20000          # limit plików Static Assets na planie Free
MAX_FILE = 25 * 1024 * 1024


def image_ext(img: bytes) -> str:
    return "png" if img[:4] == b"\x89PNG" else "webp" if img[8:12] == b"WEBP" else "jpg"


ACTOR_SHARD = 400_000  # bajty na plik data/actors-XX.bin


def write_actor_shards(con) -> tuple[int, int, int]:
    """Zwraca (liczba zdjęć, liczba shardów, bajty). Zero zdjęć -> pusty indeks, 0 shardów."""
    try:
        rows = con.execute("SELECT id, image FROM actor_photos ORDER BY id").fetchall()
    except Exception:
        rows = []
    index, buf, shard, nbytes = {}, bytearray(), 0, 0

    def flush():
        nonlocal buf, shard
        if not buf:
            return
        (BUILD / "data" / f"actors-{shard:02d}.bin").write_bytes(bytes(buf))
        buf = bytearray()
        shard += 1

    for r in rows:
        img = bytes(r["image"] or b"")
        if not img:
            continue
        if len(img) > MAX_FILE:
            print(f"  pomijam zdjęcie aktora {r['id']}: ponad 25 MiB")
            continue
        if buf and len(buf) + len(img) > ACTOR_SHARD:
            flush()
        ctype = "image/png" if img[:4] == b"\x89PNG" else "image/webp" if img[8:12] == b"WEBP" else "image/jpeg"
        index[str(r["id"])] = {"s": shard, "o": len(buf), "n": len(img), "t": ctype}
        buf.extend(img)
        nbytes += len(img)
    flush()
    (BUILD / "data" / "actors-index.json").write_text(
        json.dumps(index, separators=(",", ":")), encoding="utf-8")
    return len(index), shard, nbytes


def build(db_path: Path) -> dict:
    os.environ["QUIZ_DB"] = str(db_path)
    sys.path.insert(0, str(BASE))
    import db
    import rooms
    if not db_path.exists():
        sys.exit(f"Brak bazy: {db_path}")
    con = db.init_db(db_path, seed=False)
    if BUILD.exists():
        shutil.rmtree(BUILD)
    (BUILD / "frame").mkdir(parents=True)
    (BUILD / "poster").mkdir()
    (BUILD / "data").mkdir()
    # Pełny panel admina (ten sam UI co lokalnie); Worker wstrzykuje window.KADR_CLOUD=true
    shutil.copytree(BASE / "static", BUILD / "static")
    (BUILD / "static" / "rt.js").write_text(
        '"use strict";\nwindow.KADR_RT = "ws";\n', encoding="utf-8")
    # stary bookmark /static/cloud-admin.html -> redirect do /admin
    (BUILD / "static" / "cloud-admin.html").write_text(
        "<!doctype html><meta http-equiv=refresh content='0;url=/admin'><title>admin</title>",
        encoding="utf-8")

    frame_ids, poster_ids, packs_out, meta_packs = set(), set(), [], []
    for p in con.execute("SELECT * FROM packs ORDER BY sort, id").fetchall():
        movies = rooms.load_pack(con, p["id"])
        pdata = rooms.pack_data(con, p)
        avail = rooms.availability(pdata, movies, False)
        for m in movies:
            if m["frames"]:
                frame_ids.update(m["frames"])
            if m.get("zoom_frame"):
                frame_ids.add(m["zoom_frame"])
            if m["poster"]:
                poster_ids.add(m["id"])
        pack = {k: pdata.get(k) for k in ("id", "slug", "name", "name_en", "description", "description_en", "color", "questions")}
        (BUILD / "data" / f"pack-{p['id']}.json").write_text(
            json.dumps({"pack": pack, "movies": movies, "avail": avail}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        for lang in ("pl", "en"):
            t = {m["title"] for m in movies}
            if lang == "pl":
                t |= {m["pl_title"] for m in movies if m["pl_title"]}
            (BUILD / "data" / f"titles-{p['id']}-{lang}.json").write_text(
                json.dumps(sorted(t, key=str.lower), ensure_ascii=False), encoding="utf-8")
        framed = [m for m in movies if m["frames"]]
        thumbs = ([p["cover_frame_id"]] if p["cover_frame_id"] else []) + [m["frames"][2] for m in framed]
        if p["cover_frame_id"]:
            frame_ids.add(p["cover_frame_id"])
        packs_out.append({"id": p["id"], "slug": p["slug"], "name": p["name"], "description": p["description"],
                          "color": p["color"], "name_en": p["name_en"] or p["name"],
                          "description_en": p["description_en"] or p["description"],
                          "playable": len(framed), "total": len(movies), "thumbs": list(dict.fromkeys(thumbs))[:3],
                          "modes": [k for k in rooms.MODES if avail[k]["ok"]]})
        meta_packs.append({"id": p["id"], "name": p["name"], "name_en": p["name_en"] or p["name"], "movies": len(movies),
                           "framed": len(framed), "posters": sum(1 for m in movies if m["poster"]),
                           "cast": sum(1 for m in movies if len(m["cast"]) >= 3),
                           "quotes": sum(len(m["quotes"]) for m in movies), "questions": len(pdata["questions"]),
                           "avail": avail})
    nbytes = 0
    for fid in sorted(frame_ids):
        row = con.execute("SELECT image FROM frames WHERE id=?", (fid,)).fetchone()
        if row and row["image"]:
            img = bytes(row["image"])
            nbytes += len(img)
            (BUILD / "frame" / f"{fid}.jpg").write_bytes(img)
    for mid in sorted(poster_ids):
        row = con.execute("SELECT image FROM posters WHERE movie_id=?", (mid,)).fetchone()
        if row and row["image"]:
            img = bytes(row["image"])
            if len(img) > MAX_FILE:
                print(f"  pomijam plakat {mid}: ponad 25 MiB")
                continue
            nbytes += len(img)
            # adres zawsze /poster/{id}.jpg (jak lokalnie); przeglądarka rozpozna PNG/WebP po treści
            (BUILD / "poster" / f"{mid}.jpg").write_bytes(img)
    # Zdjęcia aktorów: jeden wpis na unikalnego aktora, spakowane w kilka plików (nie jeden plik/aktor),
    # żeby nie zjadać limitu 20 000 Static Assets. Worker serwuje /actor/{id}.jpg z indeksu + shardu.
    actor_n, shard_n, actor_bytes = write_actor_shards(con)
    nbytes += actor_bytes
    # wirtualny pakiet Custom zawsze na końcu listy
    try:
        custom = rooms.custom_list_entry(con)
        packs_out.append({k: custom[k] for k in ("id", "slug", "name", "name_en", "description", "description_en",
                                                 "color", "playable", "total", "thumbs", "modes")})
        packs_out[-1]["custom"] = True
    except Exception as e:
        print("custom pack meta:", e)
    con.close()
    (BUILD / "data" / "packs.json").write_text(json.dumps(packs_out, ensure_ascii=False), encoding="utf-8")
    (BUILD / "_headers").write_text(
        "/frame/*\n  Cache-Control: public, max-age=86400\n/poster/*\n  Cache-Control: public, max-age=3600\n"
        "/static/*\n  Cache-Control: no-cache\n", encoding="utf-8")
    files = sum(1 for f in BUILD.rglob("*") if f.is_file())
    meta = {"built": time.strftime("%Y-%m-%d %H:%M:%S %z"), "frames": len(frame_ids), "posters": len(poster_ids),
            "actors": actor_n, "actor_shards": shard_n,
            "files": files + 1, "bytes": nbytes, "packs": meta_packs, "limit_files": MAX_FILES}
    (BUILD / "data" / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"Zbudowano {BUILD}: {len(packs_out)} pakietów, {len(frame_ids)} kadrów, {len(poster_ids)} plakatów, "
          f"{actor_n} zdjęć aktorów ({shard_n} plików), "
          f"{meta['files']} plików ({nbytes / 1e6:.1f} MB obrazów).")
    if meta["files"] > MAX_FILES:
        sys.exit(f"Za dużo plików ({meta['files']}) - limit planu Free to {MAX_FILES}.")
    return meta


def npx(*args):
    exe = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [exe, "wrangler", *args]
    print("> " + " ".join(cmd))
    return subprocess.call(cmd, cwd=CF)


def local_counts(db_path: Path) -> dict:
    sys.path.insert(0, str(BASE))
    import db
    con = db.init_db(db_path, seed=False)
    out = {
        "movies": con.execute("SELECT COUNT(*) FROM movies").fetchone()[0],
        "quotes": con.execute("SELECT COUNT(*) FROM quotes").fetchone()[0],
        "questions": con.execute("SELECT COUNT(*) FROM questions").fetchone()[0],
        "frames": con.execute("SELECT COUNT(*) FROM frames").fetchone()[0],
        "posters": con.execute("SELECT COUNT(*) FROM posters").fetchone()[0],
        "actors": con.execute("SELECT COUNT(*) FROM actor_photos").fetchone()[0],
        "packs": con.execute("SELECT COUNT(*) FROM packs").fetchone()[0],
    }
    con.close()
    return out


def live_counts(url: str) -> dict | None:
    """Publiczne /api/packs + opcjonalnie meta (bez hasła: tylko packs)."""
    url = url.rstrip("/")
    try:
        with urllib.request.urlopen(url + "/api/packs", timeout=20) as r:
            packs = json.loads(r.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
        print(f"  nie mogę odczytać {url}/api/packs: {e}")
        return None
    movies = sum(p.get("total") or 0 for p in packs)
    # meta wymaga admina; spróbuj bez cookie - zwykle 403
    meta = None
    try:
        with urllib.request.urlopen(url + "/data/meta.json", timeout=10) as r:
            meta = json.loads(r.read().decode())
    except Exception:
        pass
    # spróbuj też poprzez zbudowany meta w overview bez auth - fail expected
    mp = (meta or {}).get("packs") or []
    return {
        "movies": movies,
        "packs": len(packs),
        "quotes": sum(p.get("quotes", 0) for p in mp) if meta else None,
        "questions": sum(p.get("questions", 0) for p in mp) if meta else None,
        "frames": (meta or {}).get("frames"),
        "posters": (meta or {}).get("posters"),
        "raw_packs": packs,
        "meta": meta,
    }


def safety_check(db_path: Path, url: str | None, force: bool):
    loc = local_counts(db_path)
    print(f"Lokalnie: {loc}")
    if not url:
        # spróbuj odgadnąć z ostatniego deploya / README - użytkownik powinien podać --url
        print("Podaj --url https://shot-quiz....workers.dev, żeby porównać z live przed wdrożeniem.")
        print("Bez tego kontynuuję (użyj --force żeby wyciszyć).")
        if force:
            return
        ans = input("Wdrożyć bez porównania z live? [y/N] ").strip().lower()
        if ans not in ("y", "yes", "t", "tak"):
            sys.exit("Anulowano.")
        return
    live = live_counts(url)
    if not live:
        if force:
            return
        ans = input("Nie udało się odczytać live. Wdrażać mimo to? [y/N] ").strip().lower()
        if ans not in ("y", "yes", "t", "tak"):
            sys.exit("Anulowano.")
        return
    print(f"Live ({url}): filmy={live['movies']}, pakiety={live['packs']}, "
          f"kadry={live['frames']}, plakaty={live['posters']}, cytaty={live['quotes']}, pytania={live['questions']}")
    # porównanie filmów zawsze; cytaty/pytania gdy mamy meta
    warn = []
    if live["movies"] and loc["movies"] < live["movies"]:
        warn.append(f"lokalnie mniej filmów ({loc['movies']} < {live['movies']})")
    if live.get("quotes") is not None and loc["quotes"] < live["quotes"]:
        warn.append(f"lokalnie mniej cytatów ({loc['quotes']} < {live['quotes']})")
    if live.get("questions") is not None and loc["questions"] < live["questions"]:
        warn.append(f"lokalnie mniej pytań ({loc['questions']} < {live['questions']})")
    if live.get("frames") is not None and loc["frames"] < live["frames"]:
        # lokalnie frames bywa więcej (wszystkie ze scrapingu); cloud ma max 3/film
        pass
    if not warn:
        print("Porównanie z live: OK (lokalna baza nie jest mniejsza).")
        return
    print("UWAGA: lokalna baza wygląda na STARSZĄ niż to, co jest na Cloudflare:")
    for w in warn:
        print("  -", w)
    print("Wdrożenie NADPISZE nowsze dane w chmurze. Najpierw rozważ:")
    print("  python deploy_cloudflare.py --code-only")
    print("  python pull_from_cloudflare.py --url", url)
    if force:
        print("--force: kontynuuję mimo ostrzeżenia.")
        return
    ans = input("Na pewno nadpisać live lokalną bazą? [y/N] ").strip().lower()
    if ans not in ("y", "yes", "t", "tak"):
        sys.exit("Anulowano.")


def wrangler_auth():
    """Zwraca (account_id, token) z env albo z `wrangler whoami` / oauth."""
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
    if token and account:
        return account, token
    # spróbuj oauth wrangler (plik konfiguracyjny)
    candidates = [
        Path.home() / ".config" / ".wrangler" / "config" / "default.toml",
        Path.home() / ".wrangler" / "config" / "default.toml",
        Path.home() / "AppData" / "Roaming" / ".wrangler" / "config" / "default.toml",
    ]
    oauth = None
    for c in candidates:
        if c.exists():
            text = c.read_text(encoding="utf-8")
            for line in text.splitlines():
                if line.strip().startswith("oauth_token"):
                    oauth = line.split("=", 1)[1].strip().strip('"')
            break
    token = token or oauth
    if not token:
        sys.exit("Brak logowania Cloudflare. Uruchom: cd cloudflare; npx wrangler login\n"
                 "albo ustaw CLOUDFLARE_API_TOKEN i CLOUDFLARE_ACCOUNT_ID.")
    # account_id z whoami
    if not account:
        exe = "npx.cmd" if os.name == "nt" else "npx"
        p = subprocess.run([exe, "wrangler", "whoami"], cwd=CF, capture_output=True, text=True)
        out = (p.stdout or "") + (p.stderr or "")
        import re
        m = re.search(r"([0-9a-f]{32})", out)
        # also look for Account ID lines
        for line in out.splitlines():
            if "Account" in line and re.search(r"[0-9a-f]{32}", line):
                m = re.search(r"([0-9a-f]{32})", line)
                if m:
                    account = m.group(1)
                    break
        if not account and m:
            account = m.group(1)
    if not account:
        sys.exit("Nie mogę odczytać CLOUDFLARE_ACCOUNT_ID. Ustaw zmienną środowiskową.")
    return account, token


def api(token, method, path, data=None, form=None):
    url = "https://api.cloudflare.com/client/v4" + path
    if form is not None:
        boundary = form[0]
        body = form[1]
        headers = {"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"}
    else:
        body = None if data is None else json.dumps(data).encode()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        sys.exit(f"Cloudflare API {method} {path} -> {e.code}: {err[:500]}")


def deploy_code_only():
    """Wgraj tylko kod Workera; Static Assets w chmurze zostają (keep_assets=true).

    Cloudflare docs: multipart metadata.keep_assets zatrzymuje poprzednie assety
    zamiast wymagać nowego assets.jwt. PUT /workers/scripts/{name} wdraża od razu.
    """
    wrangler = CF / "wrangler.jsonc"
    conf_text = wrangler.read_text(encoding="utf-8")
    import re
    name_m = re.search(r'"name"\s*:\s*"([^"]+)"', conf_text)
    compat_m = re.search(r'"compatibility_date"\s*:\s*"([^"]+)"', conf_text)
    if not name_m:
        sys.exit("Brak name w wrangler.jsonc")
    script = name_m.group(1)
    compat = compat_m.group(1) if compat_m else "2026-04-01"
    print(f"Kod-only deploy Workera '{script}' (keep_assets=true)...")

    outdir = Path("/tmp/kadr-code-only-bundle")
    if outdir.exists():
        shutil.rmtree(outdir)
    # dry-run buduje bundle z lokalnego build/; NIE uploaduje assetów
    if not BUILD.exists():
        (BUILD / "data").mkdir(parents=True)
        (BUILD / "static").mkdir(parents=True)
        (BUILD / "data" / "packs.json").write_text("[]", encoding="utf-8")
        (BUILD / "data" / "meta.json").write_text("{}", encoding="utf-8")
        print("Uwaga: brak cloudflare/build - tworzę pusty placeholder tylko pod bundling kodu.")
        print("Assety NA LIVE nie są ruszane (keep_assets).")
    code = npx("deploy", "--dry-run", f"--outdir={outdir}")
    if code != 0:
        sys.exit(code)
    bundle = outdir / "index.js"
    if not bundle.exists():
        sys.exit(f"Brak {bundle} po wrangler deploy --dry-run")

    account, token = wrangler_auth()
    # keep_assets: zatrzymaj Static Assets; keep_bindings: sekrety + DO + ASSETS
    metadata = {
        "main_module": "index.js",
        "compatibility_date": compat,
        "compatibility_flags": ["nodejs_compat"],
        "keep_assets": True,
        "keep_bindings": ["secret_text", "durable_object_namespace", "assets"],
        "bindings": [
            {"name": "ASSETS", "type": "assets"},
            {"name": "ROOMS", "type": "durable_object_namespace", "class_name": "Room"},
            {"name": "CONTENT", "type": "durable_object_namespace", "class_name": "Content"},
        ],
        "annotations": {"workers/message": "code-only keep_assets + Content DO"},
    }
    boundary = "----kadrCodeOnly" + str(int(time.time()))
    parts = []

    def add(name, content, filename=None, ctype=None):
        head = f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\""
        if filename:
            head += f"; filename=\"{filename}\""
        head += "\r\n"
        if ctype:
            head += f"Content-Type: {ctype}\r\n"
        head += "\r\n"
        if isinstance(content, str):
            content = content.encode()
        parts.append(head.encode() + content + b"\r\n")

    add("metadata", json.dumps(metadata), ctype="application/json")
    add("index.js", bundle.read_bytes(), filename="index.js", ctype="application/javascript+module")
    parts.append(f"--{boundary}--\r\n".encode())
    body = b"".join(parts)

    print(f"PUT kodu do account={account} script={script} ({bundle.stat().st_size} B, keep_assets)...")
    # Klasyczny endpoint: od razu wdraża Worker z keep_assets (docs: Direct Uploads)
    result = api(token, "PUT", f"/accounts/{account}/workers/scripts/{script}",
                 form=(boundary, body))
    if not result.get("success", True) and result.get("errors"):
        sys.exit(f"Upload nieudany: {result}")
    print("Gotowe: kod Workera zaktualizowany, Static Assets (filmy, kadry, plakaty) bez zmian.")
    print("Teraz: python pull_from_cloudflare.py --url <adres>")
    print("Albo w /admin kliknij 'pobierz bazę' / 'download database'.")
    return 0



def fetch_overlay(url: str, password: str | None = None) -> dict | None:
    """Pobierz /api/admin/overlay (wymaga ADMIN_PASSWORD)."""
    import http.cookiejar
    url = url.rstrip("/")
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    pw = password or os.environ.get("ADMIN_PASSWORD") or os.environ.get("KADR_ADMIN_PASSWORD")
    if not pw:
        try:
            import getpass
            pw = getpass.getpass("Hasło /admin (pobranie nakładki): ")
        except Exception:
            pw = ""
    if not pw:
        print("Brak hasła - pomijam merge nakładki z chmury.")
        return None
    def req(method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        r = urllib.request.Request(
            url + path, data=data, method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with opener.open(r, timeout=60) as res:
            return json.loads(res.read().decode() or "null")
    try:
        req("POST", "/api/admin/login", {"password": pw})
        return req("GET", "/api/admin/overlay")
    except Exception as e:
        print(f"Nie udało się pobrać nakładki: {e}")
        return None


def clear_overlay(url: str, password: str | None = None) -> bool:
    import http.cookiejar
    url = url.rstrip("/")
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    pw = password or os.environ.get("ADMIN_PASSWORD") or os.environ.get("KADR_ADMIN_PASSWORD")
    if not pw:
        return False
    def req(method, path, body=None):
        data = None if body is None else json.dumps(body).encode()
        r = urllib.request.Request(
            url + path, data=data, method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with opener.open(r, timeout=60) as res:
            return json.loads(res.read().decode() or "null")
    try:
        req("POST", "/api/admin/login", {"password": pw})
        req("DELETE", "/api/admin/overlay")
        print("Nakładka Content DO wyczyszczona (edycje są już w Static Assets).")
        return True
    except Exception as e:
        print(f"Nie udało się wyczyścić nakładki: {e}")
        return False


def merge_cloud_edits_into_local(db_path: Path, url: str | None, force: bool) -> None:
    """Przed pełnym deployem: scal nakładkę z chmury do quiz.db (backup + summary)."""
    if not url:
        print("Brak --url: pomijam automatyczny merge nakładki. "
              "Jeśli edytowałeś w /admin w chmurze, podaj --url albo zrób pull.")
        return
    ov = fetch_overlay(url)
    if ov is None:
        return
    stats = {k: len(ov.get(k) or []) for k in ("movies", "quotes", "questions", "packs", "posters")}
    if not any(stats.values()):
        print("Nakładka w chmurze pusta - nic do scalenia.")
        return
    print(f"Nakładka z chmury: {stats}")
    sys.path.insert(0, str(BASE))
    import db
    import cloud_sync
    bak = cloud_sync.backup_db(db_path)
    print(f"Backup quiz.db -> {bak.name}")
    con = db.init_db(db_path, seed=False)
    try:
        summary = cloud_sync.merge_overlay(con, ov)
        con.commit()
        cloud_sync.print_summary(summary)
    finally:
        con.close()



def main():
    ap = argparse.ArgumentParser(description="Wdrożenie kadr*/shot* na Cloudflare (Workers + Durable Objects + Static Assets)")
    ap.add_argument("--db", default=os.environ.get("QUIZ_DB") or str(BASE / "quiz.db"))
    ap.add_argument("--build-only", action="store_true")
    ap.add_argument("--dev", action="store_true", help="uruchom lokalnie wrangler dev")
    ap.add_argument("--code-only", action="store_true",
                    help="wgraj tylko kod Workera; nie ruszaj Static Assets (keep_assets)")
    ap.add_argument("--force", action="store_true", help="pomiń ostrzeżenie gdy lokalna baza jest mniejsza niż live")
    ap.add_argument("--url", default=os.environ.get("KADR_URL"),
                    help="adres live Workera do porównania liczby filmów przed deployem")
    a = ap.parse_args()
    db_path = Path(a.db).resolve()

    if a.code_only:
        if not (CF / "node_modules").exists():
            sys.exit("Najpierw: cd cloudflare; npm install")
        sys.exit(deploy_code_only())

    if not a.build_only and not a.dev:
        # pełny deploy: najpierw ściągnij edycje z chmury do lokalnego quiz.db
        merge_cloud_edits_into_local(db_path, a.url, a.force)

    meta = build(db_path)
    if a.build_only:
        return
    if not (CF / "node_modules").exists():
        sys.exit("Najpierw: cd cloudflare; npm install")
    if a.dev:
        sys.exit(npx("dev"))

    safety_check(db_path, a.url, a.force)
    code = npx("deploy")
    if code == 0:
        print("\nGotowe. Adres *.workers.dev jest wyżej w wyniku wrangler deploy.")
        print("Hasło do /admin (jednorazowo): cd cloudflare; npx wrangler secret put ADMIN_PASSWORD")
        if a.url:
            clear_overlay(a.url)
        else:
            print("Podaj --url przy następnym deployu, żeby automatycznie czyścić nakładkę po wdrożeniu.")
            print("Albo: zaloguj się w /admin i DELETE /api/admin/overlay (albo poczekaj - nakładka jest idempotentna).")
    sys.exit(code)


if __name__ == "__main__":
    main()
