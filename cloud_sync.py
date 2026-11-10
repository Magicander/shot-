"""cloud_sync.py - merge Cloudflare Content DO overlay into local quiz.db.

Conflict rule: newest updated_at wins.
- movies: movies.updated vs overlay.updated_at
- posters: posters.updated vs overlay.updated_at
- questions: questions.created vs overlay.updated_at (edits bump via overlay only until merged)
- quotes: no local timestamp -> overlay wins; if local text differs from overlay and from
  a recorded base snapshot we still prefer the newer overlay.updated_at and print a conflict.

After a successful full deploy the Worker overlay is cleared (base assets now contain the edits).
"""
from __future__ import annotations

import json
import shutil
import sqlite3
import time
from pathlib import Path


def backup_db(db_path: Path) -> Path:
    ts = time.strftime("%Y%m%d-%H%M%S")
    dest = db_path.with_name(f"{db_path.stem}-backup-{ts}{db_path.suffix}")
    shutil.copy2(db_path, dest)
    return dest


def _local_movie_ts(con, mid):
    row = con.execute("SELECT updated FROM movies WHERE id=?", (mid,)).fetchone()
    return float(row[0] or 0) if row else 0.0


def _local_poster_ts(con, mid):
    row = con.execute("SELECT updated FROM posters WHERE movie_id=?", (mid,)).fetchone()
    return float(row[0] or 0) if row else 0.0


def _local_question_ts(con, qid):
    row = con.execute("SELECT created FROM questions WHERE id=?", (qid,)).fetchone()
    return float(row[0] or 0) if row else 0.0


def merge_overlay(con: sqlite3.Connection, overlay: dict, *, verbose=True) -> dict:
    """Apply overlay dict (from /api/admin/overlay or export.overlay) into open quiz.db connection.
    Returns summary {applied, skipped, conflicts: [...]}."""
    summary = {"movies": 0, "quotes_upsert": 0, "quotes_delete": 0, "questions_upsert": 0,
               "questions_delete": 0, "packs": 0, "posters": 0, "actors": 0, "conflicts": [], "skipped": 0}
    now = time.time()

    for m in overlay.get("movies") or []:
        mid = int(m["movie_id"])
        ots = float(m.get("updated_at") or 0)
        lts = _local_movie_ts(con, mid)
        if lts > ots and lts > 0:
            summary["conflicts"].append({"type": "movie", "id": mid, "winner": "local",
                                         "local_ts": lts, "cloud_ts": ots})
            summary["skipped"] += 1
            continue
        if lts and ots and abs(lts - ots) > 0.01 and lts == ots:
            pass
        fields = set(json.loads(m.get("fields") or "[]"))
        sets, vals = [], []
        if "pl_title" in fields:
            sets.append("pl_title=?"); vals.append(m.get("pl_title") or "")
        if "aliases" in fields:
            sets.append("aliases=?"); vals.append(m.get("aliases") or "")
        if "year" in fields:
            sets.append("year=?"); vals.append(m.get("year"))
        if "cast_json" in fields:
            sets.append("cast_json=?"); vals.append(m.get("cast_json") or "")
            if m.get("cast_source") is not None:
                sets.append("cast_source=?"); vals.append(m.get("cast_source") or "manual")
        if not sets:
            continue
        if con.execute("SELECT 1 FROM movies WHERE id=?", (mid,)).fetchone() is None:
            summary["conflicts"].append({"type": "movie", "id": mid, "winner": "skip",
                                         "reason": "missing locally"})
            summary["skipped"] += 1
            continue
        sets.append("updated=?"); vals.append(max(ots, now))
        vals.append(mid)
        con.execute(f"UPDATE movies SET {', '.join(sets)} WHERE id=?", vals)
        summary["movies"] += 1

    for q in overlay.get("quotes") or []:
        qid = int(q["id"])
        ots = float(q.get("updated_at") or 0)
        if q.get("deleted"):
            if con.execute("SELECT 1 FROM quotes WHERE id=?", (qid,)).fetchone():
                con.execute("DELETE FROM quotes WHERE id=?", (qid,))
                summary["quotes_delete"] += 1
            continue
        text = (q.get("text") or "")[:500]
        lang = q.get("lang") if q.get("lang") in ("pl", "en") else ""
        movie_id = int(q.get("movie_id") or 0)
        row = con.execute("SELECT id, movie_id, text, lang FROM quotes WHERE id=?", (qid,)).fetchone()
        if row:
            # no local ts -> overlay wins; note conflict if text differs
            if (row["text"] or "") != text or (row["lang"] or "") != lang:
                if verbose:
                    summary["conflicts"].append({
                        "type": "quote", "id": qid, "winner": "cloud",
                        "local": row["text"], "cloud": text, "cloud_ts": ots,
                    })
            con.execute("UPDATE quotes SET text=?, lang=? WHERE id=?", (text, lang, qid))
            summary["quotes_upsert"] += 1
        else:
            if not movie_id:
                summary["skipped"] += 1
                continue
            if con.execute("SELECT 1 FROM movies WHERE id=?", (movie_id,)).fetchone() is None:
                summary["skipped"] += 1
                continue
            # preserve id when possible
            try:
                con.execute("INSERT INTO quotes (id, movie_id, text, lang) VALUES (?,?,?,?)",
                            (qid, movie_id, text, lang))
            except sqlite3.IntegrityError:
                con.execute("INSERT INTO quotes (movie_id, text, lang) VALUES (?,?,?)",
                            (movie_id, text, lang))
            summary["quotes_upsert"] += 1

    for q in overlay.get("questions") or []:
        qid = int(q["id"])
        ots = float(q.get("updated_at") or 0)
        pack_id = int(q.get("pack_id") or 0)
        if q.get("deleted"):
            if con.execute("SELECT 1 FROM questions WHERE id=?", (qid,)).fetchone():
                con.execute("DELETE FROM questions WHERE id=?", (qid,))
                summary["questions_delete"] += 1
            continue
        lts = _local_question_ts(con, qid)
        if lts > ots and lts > 0:
            summary["conflicts"].append({"type": "question", "id": qid, "winner": "local",
                                         "local_ts": lts, "cloud_ts": ots})
            summary["skipped"] += 1
            continue
        pl = (q.get("prompt_pl") or "")[:200]
        en = (q.get("prompt_en") or "")[:200]
        answers = q.get("answers") or "[]"
        if isinstance(answers, (list, dict)):
            answers = json.dumps(answers, ensure_ascii=False)
        row = con.execute("SELECT id FROM questions WHERE id=?", (qid,)).fetchone()
        if row:
            con.execute("UPDATE questions SET prompt_pl=?, prompt_en=?, answers=?, created=? WHERE id=?",
                        (pl, en, answers, max(ots, lts, now), qid))
        else:
            if not pack_id:
                summary["skipped"] += 1
                continue
            try:
                con.execute(
                    "INSERT INTO questions (id, pack_id, prompt_pl, prompt_en, answers, created) VALUES (?,?,?,?,?,?)",
                    (qid, pack_id, pl, en, answers, ots or now))
            except sqlite3.IntegrityError:
                con.execute(
                    "INSERT INTO questions (pack_id, prompt_pl, prompt_en, answers, created) VALUES (?,?,?,?,?)",
                    (pack_id, pl, en, answers, ots or now))
        summary["questions_upsert"] += 1

    for p in overlay.get("packs") or []:
        pid = int(p["pack_id"])
        off = p.get("modes_off") or ""
        if con.execute("SELECT 1 FROM packs WHERE id=?", (pid,)).fetchone() is None:
            summary["skipped"] += 1
            continue
        con.execute("UPDATE packs SET modes_off=? WHERE id=?", (off, pid))
        summary["packs"] += 1

    for po in overlay.get("posters") or []:
        mid = int(po["movie_id"])
        ots = float(po.get("updated_at") or 0)
        lts = _local_poster_ts(con, mid)
        if lts > ots and lts > 0:
            summary["conflicts"].append({"type": "poster", "id": mid, "winner": "local",
                                         "local_ts": lts, "cloud_ts": ots})
            summary["skipped"] += 1
            continue
        if po.get("deleted"):
            con.execute("DELETE FROM posters WHERE movie_id=?", (mid,))
            summary["posters"] += 1
            continue
        # blob may be absent in dump (only metadata) - skip image write unless provided
        if po.get("image_b64"):
            import base64
            img = base64.b64decode(po["image_b64"])
            con.execute(
                "INSERT INTO posters (movie_id, image, source, url, updated) VALUES (?,?,?,?,?) "
                "ON CONFLICT(movie_id) DO UPDATE SET image=excluded.image, source=excluded.source, "
                "url=excluded.url, updated=excluded.updated",
                (mid, img, po.get("source") or "url", po.get("url") or "", ots or now))
            summary["posters"] += 1
        elif not po.get("has_image"):
            pass  # metadata-only, no local change without bytes

    for a in overlay.get("actors") or []:
        aid = int(a["id"])
        ots = float(a.get("updated_at") or 0)
        row = con.execute("SELECT id, updated FROM actor_photos WHERE id=?", (aid,)).fetchone()
        lts = float(row["updated"] or 0) if row else 0.0
        if lts > ots and lts > 0:
            summary["conflicts"].append({"type": "actor", "id": aid, "winner": "local",
                                         "local_ts": lts, "cloud_ts": ots})
            summary["skipped"] += 1
            continue
        if a.get("deleted"):
            if row:
                con.execute("DELETE FROM actor_photos WHERE id=?", (aid,))
                summary["actors"] += 1
            continue
        if not a.get("image_b64"):
            continue
        import base64
        img = base64.b64decode(a["image_b64"])
        key = a.get("key") or f"cloud:{aid}"
        if row:
            con.execute(
                "UPDATE actor_photos SET key=?, name=COALESCE(NULLIF(?, ''), name), source=?, source_id=?, "
                "image=?, url=?, updated=? WHERE id=?",
                (key, a.get("name") or "", a.get("source") or "cloud", a.get("source_id") or "",
                 img, a.get("url") or "", ots or now, aid))
        else:
            try:
                con.execute(
                    "INSERT INTO actor_photos (id, key, name, source, source_id, image, url, updated) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (aid, key, a.get("name") or "", a.get("source") or "cloud", a.get("source_id") or "",
                     img, a.get("url") or "", ots or now))
            except Exception:
                summary["skipped"] += 1
                continue
            import db as _db
            _db.bump_actor_photo_seq(con, aid)
        summary["actors"] += 1

    return summary


def print_summary(summary: dict):
    print("Merge overlay -> quiz.db:")
    for k in ("movies", "quotes_upsert", "quotes_delete", "questions_upsert",
              "questions_delete", "packs", "posters", "actors", "skipped"):
        print(f"  {k}: {summary.get(k, 0)}")
    conflicts = summary.get("conflicts") or []
    if conflicts:
        print(f"  conflicts ({len(conflicts)}):")
        for c in conflicts[:50]:
            print("   -", c)
    else:
        print("  conflicts: 0")
