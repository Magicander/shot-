"""Hot buzz: pobiera rozpoznawalny fragment muzyki z filmu do quiz.db (tabela music).

Dla zaznaczonych w panelu filmów (movies.music_on=1) szuka na YouTube
"<tytuł> <rok> main theme soundtrack", pobiera samo audio (yt-dlp), wybiera
najgłośniejsze ~25 s (zwykle refren motywu, nie cisza z intro) i koduje do
małego mp3 mono 80 kbps (ffmpeg). Działa tylko lokalnie (YouTube + ffmpeg).

  python music.py --list
  python music.py --pack horrory            # zaznaczone filmy bez muzyki
  python music.py --pack horrory --redo     # zaznaczone, także już pobrane
  python music.py --movie 12 --movie 15     # konkretne filmy (bez względu na zaznaczenie)

Baza: QUIZ_DB=sciezka.db (domyślnie quiz.db obok skryptu).
Wymaga: pip install -U "yt-dlp[default]" i ffmpeg w PATH (albo pip install imageio-ffmpeg).
"""
import argparse
import array
import math
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import db

CLIP_SECONDS = 25
BITRATE = "80k"
MIN_SRC, MAX_SRC = 45, 720          # długość źródła (s): krótsze to zwiastuny/shorts, dłuższe to składanki
SAMPLE_RATE = 8000                  # do analizy głośności wystarczy
BAD_WORDS = ("reaction", "reacts", "cover", "remix", "slowed", "reverb", "nightcore", "8d", "1 hour", "10 hours",
             "hour version", "extended", "loop", "piano tutorial", "tutorial", "karaoke", "lyrics", "trailer",
             "review", "explained", "ranking", "top 10", "behind the scenes", "making of", "interview", "parody",
             "minecraft", "fortnite", "roblox", "bass boosted", "sped up", "guitar", "drum", "ringtone", "full album",
             "playlist", "compilation", "medley")
GOOD_WORDS = ("main theme", "theme", "soundtrack", "ost", "score", "original motion picture", "opening", "main title")


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def score_entry(e, title, year):
    """Ocena wyniku wyszukiwania (None = odrzuć)."""
    t = f" {norm(e.get('title'))} "
    dur = e.get("duration") or 0
    words = [w for w in norm(title).split() if w not in ("the", "a", "an", "of")]
    if not words or not all(f" {w} " in t for w in words):
        return None
    if any(f" {norm(b)} " in t for b in BAD_WORDS):
        return None
    if dur and not (MIN_SRC <= dur <= MAX_SRC):
        return None
    s = 0
    if " main theme " in t:
        s += 40
    elif " theme " in t:
        s += 25
    if any(f" {norm(w)} " in t for w in ("soundtrack", "ost", "score", "original motion picture")):
        s += 15
    if not any(f" {norm(w)} " in t for w in GOOD_WORDS):
        s -= 30
    years = re.findall(r"\b(19\d\d|20\d\d)\b", t)
    if years and year:
        s += 10 if str(year) in years else -25
    ch = norm(e.get("channel") or e.get("uploader") or "")
    if "topic" in ch or "records" in ch or "music" in ch or "soundtrack" in ch:
        s += 8
    if dur and 90 <= dur <= 360:
        s += 5
    return s


def search(title, year, log=print, n=12):
    """Szuka motywu na YouTube. Wyniki YouTube bywają losowe, więc przy zerze pasujących
    próbuje kolejnych, prostszych zapytań."""
    import yt_dlp
    y = f" {year}" if year else ""
    queries = [f"{title}{y} main theme soundtrack", f"{title}{y} soundtrack main title", f"{title} movie theme"]
    best, seen = [], set()
    with yt_dlp.YoutubeDL({"quiet": True, "extract_flat": True, "skip_download": True, "no_warnings": True}) as ydl:
        for q in queries:
            res = ydl.extract_info(f"ytsearch{n}:{q}", download=False) or {}
            ents = res.get("entries") or []
            found = 0
            for e in ents:
                if e.get("id") in seen:
                    continue
                seen.add(e.get("id"))
                sc = score_entry(e, title, year)
                if sc is not None:
                    best.append((sc, e))
                    found += 1
            log(f"  szukam: {q} -> {found} pasujących / {len(ents)}")
            if best:
                break
    best.sort(key=lambda x: -x[0])
    return [(e.get("url") or f"https://www.youtube.com/watch?v={e.get('id')}", e) for _, e in best]


def ffmpeg_bin():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        raise RuntimeError("Brak ffmpeg. Zainstaluj ffmpeg (Windows: winget install ffmpeg) albo: pip install imageio-ffmpeg")


def download_audio(url, workdir):
    import yt_dlp
    opts = {"format": "bestaudio[abr<=160]/bestaudio/best", "outtmpl": str(Path(workdir) / "src.%(ext)s"),
            "quiet": True, "no_warnings": True, "noplaylist": True, "retries": 3, "noprogress": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True) or {}
    files = [p for p in Path(workdir).glob("src.*") if p.suffix != ".part"]
    if not files:
        raise RuntimeError("yt-dlp nic nie pobrał")
    return files[0], info


def loudness(path, ff):
    """Głośność RMS dla każdej sekundy (lista floatów)."""
    raw = subprocess.run([ff, "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    try:
        import numpy as np
        a = np.frombuffer(raw[: len(raw) // 2 * 2], dtype="<i2").astype("float32")
        n = len(a) // SAMPLE_RATE
        if not n:
            return []
        return [float(x) for x in np.sqrt((a[: n * SAMPLE_RATE].reshape(n, SAMPLE_RATE) ** 2).mean(axis=1))]
    except ImportError:
        a = array.array("h")
        a.frombytes(raw[: len(raw) // 2 * 2])
        out = []
        for i in range(0, len(a) - SAMPLE_RATE + 1, SAMPLE_RATE):
            seg = a[i:i + SAMPLE_RATE:4]
            out.append(math.sqrt(sum(x * x for x in seg) / len(seg)))
        return out


def pick_window(rms, clip=CLIP_SECONDS, skip=None):
    """Start (s) okna o długości clip: dużo energii przez całe okno, lekko premiowany wcześniejszy start
    (motyw przewodni zwykle pada w pierwszej połowie), pomijamy ciche intro."""
    n = len(rms)
    if n <= clip:
        return 0.0
    peak = max(rms) or 1.0
    norm_r = [x / peak for x in rms]
    skip = min(12, n * 0.08) if skip is None else skip
    best, best_s = -1e9, 0
    for s in range(int(skip), n - clip + 1):
        w = norm_r[s:s + clip]
        mean = sum(w) / clip
        quiet = sum(1 for x in w if x < 0.25) / clip          # dziury/cisza w środku okna
        score = mean - 0.6 * quiet - 0.15 * (s / n)
        if score > best:
            best, best_s = score, s
    return float(best_s)


def encode(src, start, ff, clip=CLIP_SECONDS):
    out = Path(src).with_name("clip.mp3")
    fade_out = max(0.0, clip - 2.0)
    subprocess.run([ff, "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", str(clip), "-i", str(src), "-vn",
                    "-ac", "1", "-ar", "44100", "-b:a", BITRATE,
                    "-af", f"afade=t=in:d=1.2,afade=t=out:st={fade_out:.2f}:d=2", "-f", "mp3", str(out)],
                   check=True, capture_output=True)
    data = out.read_bytes()
    if len(data) < 20_000:
        raise RuntimeError("za krótki plik mp3")
    return data


def url_start(url):
    """Ręczny link z panelu może mieć start: ...&t=73 albo #t=1m13s."""
    m = re.search(r"[?&#]t=(?:(\d+)m)?(\d+)s?\b", url or "")
    if not m:
        return None
    return int(m[1] or 0) * 60 + int(m[2])


def fetch_one(row, log=print):
    """Zwraca (mp3, meta). row: id, title, year, music_url."""
    ff = ffmpeg_bin()
    manual = (row.get("music_url") or "").strip()
    cands = [(manual, {"title": "link z panelu"})] if manual else search(row["title"], row.get("year"), log)
    if not cands:
        raise RuntimeError("brak wyników z motywem muzycznym")
    last = None
    for url, e in cands[:3]:
        with tempfile.TemporaryDirectory(prefix="kadr-music-") as tmp:
            try:
                src, info = download_audio(url, tmp)
                rms = loudness(src, ff)
                if len(rms) < 20:
                    raise RuntimeError("za krótkie nagranie")
                forced = url_start(manual) if manual else None
                start = float(forced) if forced is not None else pick_window(rms)
                start = min(start, max(0.0, len(rms) - CLIP_SECONDS))
                data = encode(src, start, ff)
                dur = float(min(CLIP_SECONDS, len(rms) - start))
                return data, {"start_s": start, "dur": round(dur, 2), "video_id": info.get("id") or "",
                              "video_title": (info.get("title") or e.get("title") or "")[:200],
                              "url": info.get("webpage_url") or url}
            except Exception as ex:  # noqa: BLE001
                last = ex
                log(f"  pomijam {url}: {str(ex)[:160]}")
    raise RuntimeError(str(last) if last else "nie udało się pobrać")


def select_rows(con, pack=None, movie_ids=None, redo=False, limit=None):
    sql = "SELECT m.id, m.title, m.year, m.music_url, EXISTS(SELECT 1 FROM music mu WHERE mu.movie_id=m.id) have FROM movies m "
    if movie_ids:
        rows = con.execute(sql + f"WHERE m.id IN ({','.join('?' * len(movie_ids))}) ORDER BY m.id", [int(i) for i in movie_ids])
        rows = [dict(r) for r in rows]
        return rows[:limit] if limit else rows
    p = con.execute("SELECT id FROM packs WHERE slug=? OR CAST(id AS TEXT)=?", (str(pack), str(pack))).fetchone()
    if not p:
        raise SystemExit(f"Nie ma pakietu: {pack}")
    rows = [dict(r) for r in con.execute(sql + "WHERE m.pack_id=? AND m.music_on=1 ORDER BY m.id", (p["id"],))]
    if not redo:
        rows = [r for r in rows if not r["have"]]
    return rows[:limit] if limit else rows


def run(rows, progress, db_path=None):
    """Zadanie w tle (panel admina) albo z linii poleceń. progress: scraper.Progress."""
    L = progress.L
    progress.running, progress.total, progress.started = True, len(rows), time.time()
    progress.log(L(f"Muzyka (Hot buzz): {len(rows)} filmów", f"Music (Hot buzz): {len(rows)} movies"))
    con = db.connect(db_path)
    try:
        for i, r in enumerate(rows, 1):
            if progress.stop.is_set():
                progress.log(L("Zatrzymano.", "Stopped."))
                break
            label = r["title"] + (f" ({r['year']})" if r.get("year") else "")
            progress.current = label
            try:
                data, meta = fetch_one(r, progress.log)
                with con:
                    db.save_music(con, r["id"], data, **meta)
                    con.execute("UPDATE movies SET music_error='' WHERE id=?", (r["id"],))
                progress.log(f"OK - {label}: {len(data) // 1024} KB, od {meta['start_s']:.0f} s - {meta['video_title'][:70]}")
            except Exception as ex:  # noqa: BLE001
                msg = str(ex)[:300]
                with con:
                    con.execute("UPDATE movies SET music_error=? WHERE id=?", (msg, r["id"]))
                progress.log(L(f"BŁĄD - {label}: {msg}", f"ERROR - {label}: {msg}"))
                with progress.lock:
                    progress.failed += 1
            with progress.lock:
                progress.done += 1
            if i < len(rows) and not progress.stop.is_set():
                time.sleep(1.0)
        progress.log(L(f"Koniec. Gotowe {progress.done - progress.failed}, błędy {progress.failed}.",
                       f"Done. Ready {progress.done - progress.failed}, errors {progress.failed}."))
    finally:
        con.close()
        with progress.lock:
            progress.running, progress.current, progress.finished = False, None, time.time()


def main():
    ap = argparse.ArgumentParser(description="Pobiera fragmenty muzyki do trybu Hot buzz (quiz.db)")
    ap.add_argument("--pack", help="slug lub id pakietu (np. horrory) - bierze filmy zaznaczone w panelu")
    ap.add_argument("--movie", type=int, action="append", help="id filmu (można powtórzyć)")
    ap.add_argument("--limit", type=int, help="tylko N pierwszych filmów")
    ap.add_argument("--redo", action="store_true", help="pobierz od nowa także filmy, które już mają muzykę")
    ap.add_argument("--list", action="store_true", help="pokaż pakiety: zaznaczone / z muzyką / błędy")
    args = ap.parse_args()
    con = db.init_db()
    if args.list:
        for p in con.execute("SELECT * FROM packs ORDER BY sort, id"):
            on, have, err = con.execute(
                "SELECT SUM(music_on), SUM(EXISTS(SELECT 1 FROM music mu WHERE mu.movie_id=m.id)), "
                "SUM(music_error<>'') FROM movies m WHERE pack_id=?", (p["id"],)).fetchone()
            print(f"{p['slug']:<14} {p['name']:<20} zaznaczone={on or 0} z_muzyka={have or 0} bledy={err or 0}")
        return
    if not args.pack and not args.movie:
        ap.error("podaj --pack albo --movie (albo --list)")
    rows = select_rows(con, args.pack, args.movie, args.redo, args.limit)
    con.close()
    if not rows:
        print("Nic do pobrania. Zaznacz filmy w panelu: Pakiet -> Hot buzz (muzyka).")
        return
    import scraper
    try:
        run(rows, scraper.Progress())
    except KeyboardInterrupt:
        print("\nPrzerwano.")


if __name__ == "__main__":
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    main()
