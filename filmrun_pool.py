"""Wbudowana pula znanych aktorów do Filmrun. Poza quiz.db, działa bez klucza TMDB."""
from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "static" / "filmrun" / "people.json"
PHOTO_DIR = ROOT / "static" / "filmrun" / "photos"
PHOTO_URL = "/static/filmrun/photos/"


def load_people():
    if not DATA.is_file():
        return []
    raw = json.loads(DATA.read_text(encoding="utf-8"))
    rows = raw.get("people") if isinstance(raw, dict) else raw
    out, seen = [], set()
    for p in rows or []:
        imdb = str(p.get("imdb_id") or "")
        try:
            fw = int(p.get("filmweb_id"))
        except (TypeError, ValueError):
            continue
        photo = p.get("photo") or (imdb + ".jpg" if imdb else "")
        path = PHOTO_DIR / photo
        if not imdb.startswith("nm") or fw <= 0 or not path.is_file() or path.stat().st_size < 800:
            continue
        key = imdb
        if key in seen:
            continue
        seen.add(key)
        rec = dict(p)
        rec["imdb_id"] = imdb
        rec["filmweb_id"] = fw
        rec["photo"] = photo
        out.append(rec)
    return out


def person_view(p, lang="pl"):
    import most
    out = {
        "kind": "person",
        "id": p["imdb_id"],
        "name": p["name"],
        "photo": PHOTO_URL + p["photo"],
        "imdb_id": p["imdb_id"],
        "filmweb_id": int(p["filmweb_id"]),
        "source": "filmrun-pool",
    }
    out["link"] = most.ext_links(out, lang)
    return out


def pick_pair(lang="pl", rng=None, exclude=None):
    """Losuje dwóch różnych aktorów z wbudowanej puli (zdjęcie + prawdziwe ID)."""
    rng = rng or random
    people = load_people()
    skip = {str(x) for x in (exclude or [])}
    cands = [p for p in people if p["imdb_id"] not in skip]
    if len(cands) < 2:
        raise LookupError("most_no_pair")
    start, goal = rng.sample(cands, 2)
    return {"start": person_view(start, lang), "goal": person_view(goal, lang)}
