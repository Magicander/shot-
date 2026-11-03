"""
scraper.py - pobiera kadry z trailerów YouTube dla filmów z bazy quiz.db.

    pip install -U "yt-dlp[default]" opencv-python
    (+ Deno lub Node.js - yt-dlp potrzebuje środowiska JS dla YouTube)

    python scraper.py --list                     # pakiety i statusy
    python scraper.py --pack horrory --limit 2   # test na 2 filmach
    python scraper.py --pack horrory             # cały pakiet (wznawialne)
    python scraper.py --pack marvel --redo       # od nowa (kasuje kadry i wybory!)
    python scraper.py --movie 12 --movie 15      # wybrane filmy po id
    python scraper.py --retry-failed             # tylko te z błędem

Ten sam kod uruchamia panel /admin w wątku w tle.
"""
import argparse
import random
import re
import tempfile
import threading
import time
from pathlib import Path

import db

FRAMES_PER_MOVIE = 10     # ile kadrów kandydatów zapisać (admin wybiera 3)
MAX_WIDTH = 640
JPEG_QUALITY = 85
SKIP_START = 0.10         # pomijamy początek (plansze z oceną wiekową, logo studia)
SKIP_END = 0.14           # i koniec (tytuł, data premiery, napisy)

BAD_WORDS = ["reaction", "review", "explained", "parody", "fan made", "fanmade", "recap",
             "breakdown", "spoof", "ending", "scene", "honest trailer", "everything wrong",
             "pitch meeting", "reacts", "concept", "ai trailer", "fan trailer", "4k remaster comparison"]
FALLBACK_WORDS = ["teaser", "tv spot", "clip", "featurette"]
GOOD_CHANNELS = ["movieclips", "rotten tomatoes", "warner bros", "universal", "sony pictures",
                 "paramount", "20th century", "marvel entertainment", "a24", "lionsgate", "netflix",
                 "disney", "neon", "mgm", "focus features", "blumhouse", "imdb", "fandango",
                 "kinocheck", "screen rant"]


class Stopped(Exception):
    pass


class Progress:
    """Wątkowo-bezpieczny stan zadania - czyta go panel admina."""
    def __init__(self, lang="pl"):
        self.lang = lang if lang in ("pl", "en") else "pl"
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.log_lines = []
        self.running = False
        self.total = self.done = self.failed = 0
        self.current = None
        self.started = self.finished = None

    def L(self, pl, en):
        return en if self.lang == "en" else pl

    def log(self, msg):
        line = time.strftime("%H:%M:%S ") + msg
        print(line, flush=True)
        with self.lock:
            self.log_lines.append(line)
            del self.log_lines[:-400]

    def snapshot(self):
        with self.lock:
            return {"running": self.running, "total": self.total, "done": self.done,
                    "failed": self.failed, "current": self.current, "log": list(self.log_lines[-200:]),
                    "started": self.started, "finished": self.finished}


# ---------------------------------------------------------------- szukanie YT
def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def score_entry(e, title, year):
    t = norm(e.get("title"))
    ch = norm(e.get("channel") or e.get("uploader") or "")
    dur = e.get("duration") or 0
    want = f" {norm(title)} "
    if want not in f" {t} ":
        return None
    if any(f" {b} " in f" {t} " for b in BAD_WORDS):
        return None
    if dur and not (30 <= dur <= 480):
        return None
    s = 0
    if "official trailer" in t: s += 50
    elif "trailer" in t: s += 30
    if "official" in t: s += 10
    if any(w in t for w in FALLBACK_WORDS): s -= 25
    if not ("trailer" in t or any(w in t for w in FALLBACK_WORDS)): return None
    if any(c in ch for c in GOOD_CHANNELS): s += 20
    if "vevo" in ch or "music" in t: s -= 30
    years = re.findall(r"\b(19\d\d|20\d\d)\b", t)
    if years:
        s += 15 if str(year) in years else -40     # np. trailer remake'u z innego roku
    elif year and int(year) < 2005:
        s -= 20   # stary film bez roku w tytule - częsty remake/reboot o tym samym tytule
    if "4k" in t or "remaster" in t or "re release" in t: s -= 5
    if dur: s += 5 if 60 <= dur <= 210 else 0
    return s


def video_id_from_url(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


def download(url: str, workdir: Path) -> tuple[Path, dict]:
    import yt_dlp
    opts = {"format": "bv*[height<=720][vcodec^=avc1]/bv*[height<=720]/b[height<=720]/b",
            "outtmpl": str(workdir / "video.%(ext)s"), "quiet": True, "no_warnings": True,
            "noplaylist": True, "retries": 3, "noprogress": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
    files = [p for p in workdir.glob("video.*") if p.suffix != ".part"]
    if not files:
        raise RuntimeError("yt-dlp nic nie pobrał")
    return files[0], info or {}


# ----------------------------------------------------------------------- kadry
def analyze(frame, relax=0):
    """Zwraca (ocena, odcisk) albo (None, powód) dla klatek do odrzucenia."""
    import cv2
    import numpy as np
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    small = cv2.resize(gray, (160, 90), interpolation=cv2.INTER_AREA)
    mean, std = float(small.mean()), float(small.std())
    lo_m, hi_m, min_std, min_sharp = [(20, 235, 10, 25), (14, 242, 7, 14), (9, 248, 5, 7)][relax]
    if mean < lo_m or mean > hi_m or std < min_std:
        return None, "pusta/ciemna"
    # plansza z tekstem: prawie całe tło jednolite (ciemne lub jasne), a krawędzie tylko w paskach
    dark = float((small < 35).mean())
    edges = cv2.Canny(small, 80, 200)
    edge_frac = float((edges > 0).mean())
    if relax < 2 and (dark > 0.72 or float((small > 220).mean()) > 0.72) and edge_frac > 0.01:
        return None, "plansza z tekstem"
    sharp = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    if sharp < min_sharp:
        return None, "rozmazana"
    sat = float(cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2HSV)[..., 1].mean())
    score = min(sharp, 1500) / 15 + std + sat / 4
    thumb = cv2.resize(gray, (32, 18), interpolation=cv2.INTER_AREA).astype(np.int16)
    return score, thumb


def is_dup(thumb, chosen, thr=14):
    import numpy as np
    return any(float(np.abs(thumb - c).mean()) < thr for c in chosen)


def to_jpeg(frame) -> bytes:
    import cv2
    h, w = frame.shape[:2]
    if w > MAX_WIDTH:
        frame = cv2.resize(frame, (MAX_WIDTH, int(h * MAX_WIDTH / w)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
    if not ok:
        raise RuntimeError("nie udało się zakodować JPEG")
    return buf.tobytes()


def extract_frames(video: Path, n: int, stop=None, relax=0) -> list:
    """Zwraca listę (ts, jpeg, odcisk). relax 0..2 luzuje progi jakości."""
    import cv2
    cap = cv2.VideoCapture(str(video))
    try:
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total < n * 10:
            raise RuntimeError("za mało klatek / too few video frames")
        lo, hi = int(total * SKIP_START), int(total * (1 - SKIP_END))
        seg = (hi - lo) / n
        result, thumbs = [], []
        for i in range(n):
            if stop is not None and stop.is_set():
                raise Stopped()
            start, end = int(lo + i * seg), int(lo + (i + 1) * seg)
            cands = []
            for k in range(8):          # 8 prób rozłożonych w segmencie, bierzemy najlepszą
                idx = start + int((k + random.random()) * (end - start) / 8)
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ok, frame = cap.read()
                if not ok:
                    continue
                score, thumb = analyze(frame, relax)
                if score is None or is_dup(thumb, thumbs, 14 - 3 * relax):
                    continue
                cands.append((score, idx, frame, thumb))
            if not cands:
                continue                # cały segment słaby - pomijamy, nie wciskamy złej klatki
            score, idx, frame, thumb = max(cands, key=lambda c: c[0])
            thumbs.append(thumb)
            result.append((idx / fps, to_jpeg(frame), thumb))
        return result
    finally:
        cap.release()


# ---------------------------------------------------------------------- główna
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]|\[0?;?\d+m")
MAX_ATTEMPTS = 6          # ile trailerów maksymalnie próbujemy pobrać dla jednego filmu
MIN_FRAMES = 3


def clean_err(e) -> str:
    msg = ANSI.sub("", str(e)).replace("ERROR:", "").strip()
    msg = re.sub(r"^\[youtube\]\s*[A-Za-z0-9_-]{11}:\s*", "", msg)
    return (msg.splitlines() or ["?"])[0][:160]


def classify(msg: str) -> str:
    m = msg.lower()
    if "not a bot" in m or "sign in to confirm" in m: return "bot"
    if "private" in m: return "private"
    if "age" in m and ("restrict" in m or "confirm your age" in m or "inappropriate" in m): return "age"
    if "country" in m or "region" in m or "geo" in m: return "region"
    if "not available" in m or "unavailable" in m or "removed" in m or "terminated" in m: return "unavailable"
    if "copyright" in m: return "unavailable"
    return "other"


REASON = {"bot": ("YouTube chce potwierdzenia, że nie jestem botem", "YouTube bot check"),
          "private": ("film prywatny", "private video"),
          "age": ("ograniczenie wiekowe", "age-restricted"),
          "region": ("zablokowany w regionie", "region-locked"),
          "unavailable": ("film niedostępny", "video unavailable"),
          "other": ("błąd pobierania", "download error")}


def search(q, log=print):
    import yt_dlp
    with yt_dlp.YoutubeDL({"quiet": True, "extract_flat": True, "skip_download": True,
                           "no_warnings": True}) as ydl:
        res = ydl.extract_info(f"ytsearch12:{q}", download=False)
    return res.get("entries") or []


def alt_queries(title, year, query=None):
    y = f" {year}" if year else ""
    qs = [query or f"{title}{y} official trailer", f"{title}{y} trailer", f"{title} trailer HD",
          f"{title}{y} official teaser", f"{title} movie trailer"]
    out = []
    for q in qs:
        if q not in out: out.append(q)
    return out


def parse_tried(s):
    tried, blocked = set(), set()
    for tok in (s or "").split(","):
        tok = tok.strip()
        if not tok: continue
        if tok.endswith("!"): blocked.add(tok[:-1])
        else: tried.add(tok)
    return tried, blocked - tried


def candidates(title, year, query=None, tried=(), blocked=(), log=print, searcher=None, L=None):
    """Generator kandydatów: kolejne zapytania, ranking wg score_entry, znane złe ID na koniec."""
    searcher = searcher or search
    seen, deferred = set(), []
    for qi, q in enumerate(alt_queries(title, year, query)):
        if qi: time.sleep(random.uniform(1, 2))          # grzecznie między wyszukiwaniami
        try:
            entries = searcher(q, log)
        except Exception as e:
            log(L(f"    wyszukiwanie \"{q}\" nie powiodło się: {clean_err(e)}", f"    search \"{q}\" failed: {clean_err(e)}"))
            continue
        scored = []
        for e in entries:
            if not e or e.get("id") in seen: continue
            s = score_entry(e, title, year)
            if s is not None: scored.append((s, e))
        scored.sort(key=lambda x: -x[0])
        log(L(f"    zapytanie \"{q}\": {len(scored)} kandydatów", f"    query \"{q}\": {len(scored)} candidates"))
        for s, e in scored:
            seen.add(e["id"])
            if e["id"] in blocked or e["id"] in tried:
                deferred.append((s, e)); continue
            yield s, e
    for s, e in deferred:                  # na końcu te, które wcześniej zawiodły
        yield s, e


def process_movie(con, row, frames_n=FRAMES_PER_MOVIE, log=print, stop=None, L=None,
                  searcher=None, downloader=None, extractor=None):
    """Próbuje kolejnych trailerów aż zbierze dość dobrych kadrów. Zwraca liczbę kadrów.
    Błąd końcowy to krótki kod: no_trailer | all_failed:K | few_frames:N:K (tłumaczy go UI)."""
    L = L or (lambda pl, en: pl)
    downloader, extractor = downloader or download, extractor or extract_frames
    keys = row.keys() if hasattr(row, "keys") else row
    tried, blocked = parse_tried(row["tried_ids"] if "tried_ids" in keys else "")
    if row["yt_url"]:
        url = row["yt_url"].strip()
        log(L(f"    link podany ręcznie: {url}", f"    manual link: {url}"))
        cands = iter([(0, {"id": video_id_from_url(url), "title": None, "url": url})])
    else:
        cands = candidates(row["title"], row["year"], row["query"], tried, blocked, log, searcher, L)
    pool, thumbs, sources, videos = [], [], {}, []
    attempts = downloaded = 0
    result = None
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        for s, e in cands:
            if attempts >= MAX_ATTEMPTS: break
            if stop is not None and stop.is_set(): raise Stopped()
            attempts += 1
            vid = e.get("id")
            url = e["url"] if (e.get("url") or "").startswith("http") else f"https://www.youtube.com/watch?v={vid}"
            log(L(f"    próba {attempts}/{MAX_ATTEMPTS} ({s:+d}): {e.get('title') or url} [{vid}]",
                  f"    attempt {attempts}/{MAX_ATTEMPTS} ({s:+d}): {e.get('title') or url} [{vid}]"))
            wd = Path(tmp) / f"v{attempts}"; wd.mkdir()
            try:
                video, info = downloader(url, wd)
            except Stopped:
                raise
            except Exception as ex:
                msg = clean_err(ex); kind = classify(msg)
                if vid: blocked.add(vid); tried.discard(vid)
                log(L(f"      pomijam - {REASON[kind][0]} ({msg})", f"      skipping - {REASON[kind][1]} ({msg})"))
                time.sleep(random.uniform(1, 2.5))
                continue
            downloaded += 1
            vid = vid or info.get("id")
            if vid: tried.add(vid); blocked.discard(vid)
            title = e.get("title") or info.get("title")
            try:
                got = extractor(video, frames_n, stop, relax=0)
            except Stopped:
                raise
            except Exception as ex:
                log(L(f"      pomijam - nie da się odczytać ({clean_err(ex)})", f"      skipping - unreadable ({clean_err(ex)})"))
                continue
            videos.append((len(got), video, vid, title, url))
            added = 0
            for ts, jpg, th in got:
                if len(pool) >= frames_n or is_dup(th, thumbs): continue
                pool.append((ts, jpg)); thumbs.append(th); added += 1
            sources[vid] = (added, title, url)
            log(L(f"      dobre kadry: {len(got)} (razem {len(pool)})", f"      good frames: {len(got)} (total {len(pool)})"))
            if len(pool) >= max(MIN_FRAMES, min(frames_n, 6)) or (len(pool) >= MIN_FRAMES and downloaded >= 2):
                break
            log(L("      za mało, szukam kolejnego trailera", "      not enough, trying another trailer"))
        if len(pool) < MIN_FRAMES and videos:
            # ostatnia deska ratunku: luźniejsze progi na najlepszym pobranym trailerze
            for relax in (1, 2):
                best = max(videos, key=lambda v: v[0])
                got = extractor(best[1], frames_n, stop, relax=relax)
                log(L(f"    luźniejsze progi (poziom {relax}): {len(got)} kadrów", f"    relaxed thresholds (level {relax}): {len(got)} frames"))
                if len(got) > len(pool):
                    pool = [(ts, jpg) for ts, jpg, _ in got[:frames_n]]
                    sources = {best[2]: (len(pool), best[3], best[4])}
                if len(pool) >= MIN_FRAMES: break
    tried_s = ",".join(sorted(tried) + [b + "!" for b in sorted(blocked)])
    con.execute("UPDATE movies SET tried_ids=? WHERE id=?", (tried_s, row["id"])); con.commit()
    if len(pool) < MIN_FRAMES:
        if attempts == 0: raise ScrapeError("no_trailer")
        if downloaded == 0: raise ScrapeError(f"all_failed:{attempts}")
        raise ScrapeError(f"few_frames:{len(pool)}:{attempts}")
    main_vid, (_, vtitle, url) = max(sources.items(), key=lambda kv: kv[1][0])
    if len([v for v in sources.values() if v[0]]) > 1:
        log(L(f"    połączono kadry z {len(sources)} trailerów", f"    merged frames from {len(sources)} trailers"))
    with con:
        con.execute("DELETE FROM picks WHERE movie_id=?", (row["id"],))
        con.execute("DELETE FROM frames WHERE movie_id=?", (row["id"],))
        con.execute("UPDATE movies SET video_id=?, video_title=?, video_url=?, status='ok', error=NULL, "
                    "updated=? WHERE id=?", (main_vid, vtitle, url, time.time(), row["id"]))
        con.executemany("INSERT INTO frames (movie_id,position,ts_seconds,image) VALUES (?,?,?,?)",
                        [(row["id"], p, ts, jpg) for p, (ts, jpg) in enumerate(pool, 1)])
    return len(pool)


class ScrapeError(Exception):
    pass


ERR_TEXT = {"no_trailer": ("nie znaleziono trailera", "no trailer found"),
            "all_failed": ("żaden z {k} trailerów nie dał się pobrać", "none of {k} trailers could be downloaded"),
            "few_frames": ("za mało dobrych kadrów ({n}) po {k} próbach", "too few good frames ({n}) after {k} attempts")}


def err_text(code, lang="pl"):
    parts = str(code).split(":")
    if parts[0] not in ERR_TEXT: return code
    t = ERR_TEXT[parts[0]][0 if lang == "pl" else 1]
    if parts[0] == "all_failed": return t.format(k=parts[1])
    if parts[0] == "few_frames": return t.format(n=parts[1], k=parts[2])
    return t


def select_rows(con, pack=None, movie_ids=None, redo=False, retry_failed=False, limit=None):
    sql, args = "SELECT m.* FROM movies m JOIN packs p ON p.id=m.pack_id WHERE 1", []
    if pack:
        sql += " AND (p.slug=? OR p.id=?)"; args += [str(pack), str(pack)]
    if movie_ids:
        sql += f" AND m.id IN ({','.join('?' * len(movie_ids))})"; args += [int(i) for i in movie_ids]
    elif retry_failed:
        sql += " AND m.status='error'"
    elif not redo:
        sql += " AND m.status!='ok'"
    rows = con.execute(sql + " ORDER BY p.sort, m.id", args).fetchall()
    return rows[:limit] if limit else rows


def run(rows, progress: Progress, frames_n=FRAMES_PER_MOVIE, db_path=None):
    con = db.connect(db_path)
    L = progress.L
    with progress.lock:
        progress.running, progress.total, progress.done, progress.failed = True, len(rows), 0, 0
        progress.started, progress.finished = time.time(), None
    progress.stop.clear()
    try:
        if not rows:
            progress.log(L("Nic do zrobienia - wszystkie wybrane filmy są już pobrane.", "Nothing to do - all selected movies are already scraped."))
        for i, row in enumerate(rows, 1):
            if progress.stop.is_set():
                progress.log(L("Zatrzymano na prośbę admina.", "Stopped at the admin's request."))
                break
            row = con.execute("SELECT * FROM movies WHERE id=?", (row["id"],)).fetchone() or row   # świeże tried_ids
            with progress.lock:
                progress.current = f"{row['title']} ({row['year']})"
            progress.log(f"[{i}/{len(rows)}] {row['title']} ({row['year']})")
            try:
                n = process_movie(con, row, frames_n, progress.log, progress.stop, L)
                word = ("kadr" if n == 1 else "kadry" if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14) else "kadrów")
                progress.log(L(f"    OK - zapisano {n} {word}", f"    OK - saved {n} frames"))
            except Stopped:
                progress.log(L("    przerwano", "    interrupted"))
            except Exception as e:
                code = str(e) if isinstance(e, ScrapeError) else clean_err(e)
                progress.log(L(f"    BŁĄD: {err_text(code, 'pl')}", f"    ERROR: {err_text(code, 'en')}"))
                with con:
                    con.execute("UPDATE movies SET status='error', error=?, updated=? WHERE id=?",
                                (code, time.time(), row["id"]))
                with progress.lock:
                    progress.failed += 1
            with progress.lock:
                progress.done += 1
            if i < len(rows) and not progress.stop.is_set():
                time.sleep(random.uniform(1, 3))      # nie młotkujemy YouTube
        progress.log(L(f"Koniec. Gotowe {progress.done - progress.failed}, błędy {progress.failed}.",
                       f"Done. Ready {progress.done - progress.failed}, errors {progress.failed}."))
    finally:
        con.close()
        with progress.lock:
            progress.running, progress.current, progress.finished = False, None, time.time()


def main():
    ap = argparse.ArgumentParser(description="Pobiera kadry z trailerów do quiz.db")
    ap.add_argument("--pack", help="slug lub id pakietu (np. horrory)")
    ap.add_argument("--movie", type=int, action="append", help="id filmu (można powtórzyć)")
    ap.add_argument("--limit", type=int, help="tylko N pierwszych filmów")
    ap.add_argument("--redo", action="store_true", help="od nowa także pobrane (kasuje kadry i wybory!)")
    ap.add_argument("--retry-failed", action="store_true", help="tylko filmy z błędem")
    ap.add_argument("--frames", type=int, default=FRAMES_PER_MOVIE, help="ile kadrów na film")
    ap.add_argument("--list", action="store_true", help="pokaż pakiety i statusy")
    args = ap.parse_args()
    con = db.init_db()
    if args.list:
        for p in con.execute("SELECT * FROM packs ORDER BY sort, id"):
            st = dict(con.execute("SELECT status, COUNT(*) FROM movies WHERE pack_id=? GROUP BY status",
                                  (p["id"],)).fetchall())
            print(f"{p['slug']:<14} {p['name']:<20} ok={st.get('ok', 0)} pending={st.get('pending', 0)} "
                  f"error={st.get('error', 0)}")
        return
    rows = select_rows(con, args.pack, args.movie, args.redo, args.retry_failed, args.limit)
    con.close()
    try:
        run(rows, Progress(), args.frames)
    except KeyboardInterrupt:
        print("\nPrzerwano.")


if __name__ == "__main__":
    main()
