"""deploy_cloudflare.py - wysyła lokalny quiz (quiz.db + kadry + plakaty) na Cloudflare.

Synchronizacja jest jednokierunkowa: lokalne "studio" (app.py, scraper) -> chmura.
Skrypt czyta quiz.db, buduje cloudflare/build/ (Workers Static Assets: kadry, plakaty,
dane pakietów w JSON) i uruchamia `npx wrangler deploy`. Niczego nie zapisuje w quiz.db
poza zwykłymi automatycznymi migracjami schematu.

  python deploy_cloudflare.py              # zbuduj i wdroż
  python deploy_cloudflare.py --build-only # tylko zbuduj cloudflare/build/
  python deploy_cloudflare.py --dev        # zbuduj i uruchom lokalnie `wrangler dev`
  python deploy_cloudflare.py --db inna.db # inna baza
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
CF = BASE / "cloudflare"
BUILD = CF / "build"
MAX_FILES = 20000          # limit plików Static Assets na planie Free
MAX_FILE = 25 * 1024 * 1024


def image_ext(img: bytes) -> str:
    return "png" if img[:4] == b"\x89PNG" else "webp" if img[8:12] == b"WEBP" else "jpg"


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
    shutil.copytree(BASE / "static", BUILD / "static", ignore=shutil.ignore_patterns("admin.js", "admin.html", "admin.css"))
    shutil.copy(CF / "public" / "cloud-admin.html", BUILD / "static" / "cloud-admin.html")
    (BUILD / "static" / "rt.js").write_text('"use strict";\nwindow.KADR_RT = "ws";\n', encoding="utf-8")

    frame_ids, poster_ids, packs_out, meta_packs = set(), set(), [], []
    for p in con.execute("SELECT * FROM packs ORDER BY sort, id").fetchall():
        movies = rooms.load_pack(con, p["id"])
        pdata = rooms.pack_data(con, p)
        avail = rooms.availability(pdata, movies, False)
        for m in movies:
            if m["frames"]:
                frame_ids.update(m["frames"])
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
    con.close()
    (BUILD / "data" / "packs.json").write_text(json.dumps(packs_out, ensure_ascii=False), encoding="utf-8")
    (BUILD / "_headers").write_text(
        "/frame/*\n  Cache-Control: public, max-age=86400\n/poster/*\n  Cache-Control: public, max-age=3600\n"
        "/static/*\n  Cache-Control: no-cache\n", encoding="utf-8")
    files = sum(1 for f in BUILD.rglob("*") if f.is_file())
    meta = {"built": time.strftime("%Y-%m-%d %H:%M:%S %z"), "frames": len(frame_ids), "posters": len(poster_ids),
            "files": files + 1, "bytes": nbytes, "packs": meta_packs, "limit_files": MAX_FILES}
    (BUILD / "data" / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print(f"Zbudowano {BUILD}: {len(packs_out)} pakietów, {len(frame_ids)} kadrów, {len(poster_ids)} plakatów, "
          f"{meta['files']} plików ({nbytes / 1e6:.1f} MB obrazów).")
    if meta["files"] > MAX_FILES:
        sys.exit(f"Za dużo plików ({meta['files']}) - limit planu Free to {MAX_FILES}.")
    return meta


def npx(*args):
    exe = "npx.cmd" if os.name == "nt" else "npx"
    cmd = [exe, "wrangler", *args]
    print("> " + " ".join(cmd))
    return subprocess.call(cmd, cwd=CF)


def main():
    ap = argparse.ArgumentParser(description="Wdrożenie kadr*/shot* na Cloudflare (Workers + Durable Objects + Static Assets)")
    ap.add_argument("--db", default=os.environ.get("QUIZ_DB") or str(BASE / "quiz.db"))
    ap.add_argument("--build-only", action="store_true")
    ap.add_argument("--dev", action="store_true", help="uruchom lokalnie wrangler dev")
    a = ap.parse_args()
    build(Path(a.db).resolve())
    if a.build_only:
        return
    if not (CF / "node_modules").exists():
        sys.exit("Najpierw: cd cloudflare; npm install")
    if a.dev:
        sys.exit(npx("dev"))
    code = npx("deploy")
    if code == 0:
        print("\nGotowe. Adres *.workers.dev jest wyżej w wyniku wrangler deploy.")
        print("Hasło do /admin (jednorazowo): cd cloudflare; npx wrangler secret put ADMIN_PASSWORD")
    sys.exit(code)


if __name__ == "__main__":
    main()
