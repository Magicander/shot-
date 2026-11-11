#!/usr/bin/env python3
"""Buduje wbudowaną pulę Filmrun: household names z prawdziwym ID Filmweb/IMDb i zdjęciem.

Źródło listy (pobrane 2026-11-11):
  The Numbers, „Top 100 Stars in Leading Roles at the Worldwide Box Office”
  https://www.the-numbers.com/box-office-star-records/worldwide/lifetime-acting/top-grossing-leading-stars

Nie kopiujemy rankingu w ciemno: box office zespołów (zwłaszcza MCU) zawyża osoby,
których typowy gracz nie rozpozna od razu. Z Top 100 bierzemy tylko nazwiska
na poziomie Evans / Jackson / DiCaprio / Hanks, a pulę uzupełniamy równie
sławnymi aktorami, których metodologia box office'u nie stawia w pierwszej setce
(np. Michael B. Jordan, Zendaya, Al Pacino). Kilka ogólnopolsko znanych nazwisk
zostaje dla wersji PL, bez rozwadniania puli średnią półką.

ID: Wikidata P345 (IMDb) i P5033 (Filmweb), w razie potrzeby API Filmwebu.
Zdjęcia: Wikimedia Commons (P18) albo Filmweb. Pliki w static/filmrun/, nie w quiz.db.

Uruchomienie: python3 tools/build_filmrun_pool.py
Istniejące wpisy i zdjęcia są ponownie używane; dociągane są tylko braki.
"""
from __future__ import annotations

import json
import ssl
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import webscrape  # noqa: E402

OUT_DIR = ROOT / "static" / "filmrun"
PHOTO_DIR = OUT_DIR / "photos"
UA = "kadr-shot-filmrun-pool/1.1 (https://github.com/Magicander/shot-; movie quiz seed)"
CTX = ssl.create_default_context()
SPARQL = "https://query.wikidata.org/sparql"
WD_API = "https://www.wikidata.org/w/api.php"
SOURCE = (
    "The Numbers, Top 100 Stars in Leading Roles at the Worldwide Box Office "
    "(https://www.the-numbers.com/box-office-star-records/worldwide/lifetime-acting/top-grossing-leading-stars), "
    "stan na 2026-11-11; przefiltrowane pod kątem prawdziwej rozpoznawalności "
    "(odrzucone m.in. mniej znane nazwiska z ensemble MCU i hype box-office'u), "
    "uzupełnione household names spoza tej setki oraz kilkoma ogólnopolsko znanymi aktorami. "
    "ID: Wikidata P345 (IMDb) i P5033 (Filmweb), w razie potrzeby potwierdzone API-em Filmwebu. "
    "Zdjęcia: Wikimedia Commons albo Filmweb. Poza quiz.db."
)

# --- The Numbers Top 100 (role pierwszoplanowe, box office światowy), po filtrze rozpoznawalności.
NUMBERS_KEEP = [
    "Zoe Saldaña", "Scarlett Johansson", "Chris Pratt", "Samuel L. Jackson",
    "Robert Downey Jr.", "Tom Holland", "Tom Cruise", "Chris Hemsworth",
    "Tom Hanks", "Vin Diesel", "Dwayne Johnson", "Chris Evans",
    "Bradley Cooper", "Johnny Depp", "Mark Ruffalo", "Emma Watson",
    "Matt Damon", "Will Smith", "Harrison Ford", "Benedict Cumberbatch",
    "Daniel Radcliffe", "Steve Carell", "Jack Black", "Idris Elba",
    "Hugh Jackman", "Chadwick Boseman", "Brad Pitt", "Rupert Grint",
    "Leonardo DiCaprio", "Bruce Willis", "Liam Neeson", "Eddie Murphy",
    "Anne Hathaway", "Ryan Reynolds", "Jason Statham", "Ben Stiller",
    "Ian McKellen", "Nicolas Cage", "Mark Wahlberg", "Jim Carrey",
    "Jennifer Lawrence", "Ewan McGregor", "Christian Bale", "Cameron Diaz",
    "Keanu Reeves", "Natalie Portman", "Sandra Bullock", "Julia Roberts",
    "Ralph Fiennes", "Adam Sandler", "Ben Affleck", "Robert De Niro",
    "Sylvester Stallone", "Meryl Streep", "Morgan Freeman", "Robert Pattinson",
    "Denzel Washington", "George Clooney", "Daniel Craig", "Orlando Bloom",
    "Robin Williams", "Jason Momoa", "Mel Gibson", "Arnold Schwarzenegger",
]

# Household names, których typowy gracz od razu rozpozna, a metodologia
# The Numbers (suma box office ról pierwszoplanowych) może ich nie stawiać w top 100.
HOUSEHOLD_ADD = [
    "Michael B. Jordan", "Zendaya", "Emma Stone", "Angelina Jolie",
    "Margot Robbie", "Gal Gadot", "Timothée Chalamet", "Ryan Gosling",
    "Cillian Murphy", "Pedro Pascal", "Al Pacino", "Jack Nicholson",
    "Anthony Hopkins", "Joaquin Phoenix", "Tom Hardy", "Matthew McConaughey",
    "Jake Gyllenhaal", "Henry Cavill", "Charlize Theron", "Nicole Kidman",
    "Cate Blanchett", "Kate Winslet", "Jennifer Aniston", "Halle Berry",
    "Jackie Chan", "Clint Eastwood", "Sean Connery", "Heath Ledger",
    "Bill Murray", "Jamie Foxx", "Antonio Banderas", "Penélope Cruz",
    "Sigourney Weaver", "Marilyn Monroe", "Bruce Lee", "Pierce Brosnan",
]

# Ogólnopolsko rozpoznawalni (nie średnia półka).
POLISH_HOUSEHOLD = [
    "Janusz Gajos", "Bogusław Linda", "Krystyna Janda", "Cezary Pazura",
    "Daniel Olbrychski",
]

NAMES = NUMBERS_KEEP + HOUSEHOLD_ADD + POLISH_HOUSEHOLD

ACTOR_Q = {
    "Q33999", "Q10800557", "Q2259451", "Q10798782", "Q2405480", "Q2526255",
}


def norm(s):
    t = unicodedata.normalize("NFKD", s or "")
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(t.lower().replace(".", "").replace(",", "").replace("'", "").replace("’", "").split())


def http_get(url, accept="*/*", referer=None, timeout=30, data=None):
    h = {"User-Agent": UA, "Accept": accept, "Accept-Language": "en,pl;q=0.8"}
    if referer:
        h["Referer"] = referer
    if data is not None:
        h["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read(), r.headers.get("Content-Type", ""), r.geturl()


def sparql(query, timeout=90):
    raw, _, _ = http_get(
        SPARQL,
        accept="application/sparql-results+json",
        data=urllib.parse.urlencode({"query": query, "format": "json"}).encode(),
        timeout=timeout,
    )
    return json.loads(raw.decode())["results"]["bindings"]


def claim_ids(ent, pid):
    out = []
    for c in (ent.get("claims") or {}).get(pid, []):
        dv = (((c.get("mainsnak") or {}).get("datavalue") or {}).get("value"))
        if isinstance(dv, dict) and dv.get("id"):
            out.append(dv["id"])
        elif isinstance(dv, str):
            out.append(dv)
    return out


def claim_str(ent, pid):
    for c in (ent.get("claims") or {}).get(pid, []):
        dv = (((c.get("mainsnak") or {}).get("datavalue") or {}).get("value"))
        if isinstance(dv, str):
            return dv
        if isinstance(dv, dict) and dv.get("id"):
            return dv["id"]
    return ""


def commons_from_entity(ent):
    for c in (ent.get("claims") or {}).get("P18", []):
        dv = (((c.get("mainsnak") or {}).get("datavalue") or {}).get("value"))
        if isinstance(dv, str) and dv:
            return "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(dv)
    return ""


def wd_search_person(name):
    """Szukaj aktora w Wikidanych; nie bierz pierwszego trafienia w ciemno."""
    best = None
    for lang in ("en", "pl"):
        q = urllib.parse.urlencode({
            "action": "wbsearchentities", "search": name, "language": lang,
            "uselang": "en", "type": "item", "limit": 8, "format": "json",
        })
        try:
            raw, _, _ = http_get(WD_API + "?" + q, accept="application/json", timeout=25)
            hits = json.loads(raw.decode()).get("search") or []
        except Exception:
            hits = []
        ids = [h["id"] for h in hits if h.get("id")]
        if not ids:
            continue
        q2 = urllib.parse.urlencode({
            "action": "wbgetentities", "ids": "|".join(ids),
            "props": "labels|aliases|claims|sitelinks", "format": "json",
        })
        try:
            raw, _, _ = http_get(WD_API + "?" + q2, accept="application/json", timeout=30)
            ents = json.loads(raw.decode()).get("entities") or {}
        except Exception:
            continue
        for hid in ids:
            ent = ents.get(hid) or {}
            if "Q5" not in claim_ids(ent, "P31"):
                continue
            occ = set(claim_ids(ent, "P106"))
            if occ and not (occ & ACTOR_Q):
                # bez zawodu aktorskiego — pomijamy (muzyk, założyciel itd.)
                continue
            imdb = claim_str(ent, "P345")
            if not imdb.startswith("nm"):
                continue
            labels = []
            for lab in (ent.get("labels") or {}).values():
                labels.append(lab.get("value") or "")
            for als in (ent.get("aliases") or {}).values():
                for a in als:
                    labels.append(a.get("value") or "")
            if not any(norm(x) == norm(name) or norm(name) in norm(x) or norm(x) in norm(name) for x in labels if x):
                # luźniejsze: nazwisko musi się zgadzać
                want = norm(name).split()
                if not any(all(p in norm(x) for p in want) for x in labels if x):
                    continue
            fw = claim_str(ent, "P5033")
            rec = {
                "name": name,
                "imdb_id": imdb,
                "filmweb_id": int(fw) if str(fw).isdigit() else None,
                "commons": commons_from_entity(ent),
                "sitelinks": len(ent.get("sitelinks") or {}),
            }
            if not best or rec["sitelinks"] > best["sitelinks"] or (rec["filmweb_id"] and not best["filmweb_id"]):
                best = rec
        if best:
            break
    return best


def lookup_chunk(names):
    values = " ".join('"%s"@en' % n.replace('"', "") for n in names)
    values_pl = " ".join('"%s"@pl' % n.replace('"', "") for n in names)
    q = f"""
    SELECT ?name ?imdb ?filmweb ?image ?sitelinks WHERE {{
      VALUES ?name {{ {values} {values_pl} }}
      ?person rdfs:label ?name.
      ?person wdt:P31 wd:Q5.
      ?person wdt:P345 ?imdb.
      OPTIONAL {{ ?person wdt:P5033 ?filmweb }}
      OPTIONAL {{ ?person wdt:P18 ?image }}
      OPTIONAL {{ ?person wikibase:sitelinks ?sitelinks }}
    }}
    """
    rows = {}
    for b in sparql(q):
        name = (b.get("name") or {}).get("value") or ""
        imdb = (b.get("imdb") or {}).get("value") or ""
        if not name or not imdb.startswith("nm"):
            continue
        fw = (b.get("filmweb") or {}).get("value") or ""
        img = (b.get("image") or {}).get("value") or ""
        sl = int(float((b.get("sitelinks") or {}).get("value") or 0))
        rec = {"name": name, "imdb_id": imdb, "filmweb_id": int(fw) if fw.isdigit() else None,
               "commons": img, "sitelinks": sl}
        prev = rows.get(name)
        if not prev or (rec["filmweb_id"] and not prev["filmweb_id"]) or sl > prev["sitelinks"]:
            rows[name] = rec
    return rows


def filmweb_info(fid=None, name=None):
    if fid:
        try:
            raw, _, _ = http_get(
                f"https://www.filmweb.pl/api/v1/person/{int(fid)}/info",
                accept="application/json",
                referer="https://www.filmweb.pl/",
            )
            return json.loads(raw.decode())
        except Exception:
            return None
    if name:
        try:
            return webscrape.filmweb_person(name)
        except Exception:
            return None
    return None


def photo_from_info(info):
    if not info:
        return None
    path = ""
    if isinstance(info.get("poster"), dict):
        path = (info["poster"].get("path") or "").strip()
    elif info.get("photo_url"):
        url = info["photo_url"]
        if webscrape.is_placeholder_url(url):
            return None
        try:
            img, _, _ = http_get(url, referer="https://www.filmweb.pl/")
            return img if webscrape.is_real_headshot(img) else None
        except Exception:
            return None
    if not path:
        return None
    url = path if path.startswith("http") else "https://fwcdn.pl/ppo" + path
    if webscrape.is_placeholder_url(url):
        return None
    try:
        img, _, _ = http_get(url, referer="https://www.filmweb.pl/")
    except Exception:
        return None
    return img if webscrape.is_real_headshot(img) else None


def commons_bytes(url):
    if not url:
        return None
    if "Special:FilePath" in url or "commons.wikimedia.org" in url:
        sep = "&" if "?" in url else "?"
        url = url + sep + "width=420"
    try:
        raw, _, _ = http_get(url, referer="https://commons.wikimedia.org/")
    except Exception:
        return None
    return raw if webscrape.is_real_headshot(raw) else None


def maybe_shrink(blob):
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(blob)).convert("RGB")
        im.thumbnail((420, 560))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=85, optimize=True)
        out = buf.getvalue()
        if webscrape.is_real_headshot(out):
            return out
    except Exception:
        pass
    return blob


def load_existing():
    path = OUT_DIR / "people.json"
    if not path.is_file():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = raw.get("people") if isinstance(raw, dict) else raw
    out = {}
    for p in rows or []:
        photo = p.get("photo") or ""
        if not (PHOTO_DIR / photo).is_file():
            continue
        if (PHOTO_DIR / photo).stat().st_size < 800:
            continue
        if not str(p.get("imdb_id") or "").startswith("nm"):
            continue
        try:
            int(p["filmweb_id"])
        except (TypeError, ValueError, KeyError):
            continue
        out[norm(p.get("name") or "")] = p
        out[str(p["imdb_id"])] = p
    return out


def resolve_missing(names, existing):
    found = {}
    chunk = 25
    todo = [n for n in names if norm(n) not in existing]
    if not todo:
        return found
    print(f"do dociągnięcia z Wikidanych: {len(todo)}", flush=True)
    for i in range(0, len(todo), chunk):
        part = todo[i:i + chunk]
        print(f"  SPARQL {i+1}-{i+len(part)}…", flush=True)
        try:
            found.update(lookup_chunk(part))
        except Exception as e:
            print("  SPARQL błąd:", e, flush=True)
            time.sleep(2)
            try:
                found.update(lookup_chunk(part))
            except Exception as e2:
                print("  ponownie nie wyszło:", e2, flush=True)
        time.sleep(0.4)
    by_norm = {norm(k): v for k, v in found.items()}
    # uzupełnij braki pojedynczym wyszukiwaniem (SPARQL często nie trafia w etykietę)
    still = [n for n in todo if n not in found and norm(n) not in by_norm]
    for name in still:
        print(f"  szukam: {name}", flush=True)
        rec = wd_search_person(name)
        time.sleep(0.2)
        if rec:
            found[name] = rec
            by_norm[norm(name)] = rec
            print(f"    {name} -> {rec['imdb_id']} fw={rec['filmweb_id']} sl={rec['sitelinks']}", flush=True)
        else:
            print(f"    brak: {name}", flush=True)
    return found


def fetch_photo(rec, fw):
    blob = commons_bytes(rec.get("commons") or "")
    if blob:
        return blob, "wikimedia"
    info = rec.get("_fwinfo") or filmweb_info(fid=fw) or filmweb_info(name=rec.get("name"))
    time.sleep(0.1)
    blob = photo_from_info(info)
    if blob:
        return blob, "filmweb"
    return None, None


def main():
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    names = list(dict.fromkeys(NAMES))
    print(f"docelowych nazwisk: {len(names)}", flush=True)
    existing = load_existing()
    found = resolve_missing(names, existing)
    by_norm = {norm(k): v for k, v in found.items()}

    people, skipped = [], []
    for name in names:
        ex = existing.get(norm(name))
        if ex:
            people.append({
                "name": name,
                "imdb_id": ex["imdb_id"],
                "filmweb_id": int(ex["filmweb_id"]),
                "photo": ex["photo"],
                "sitelinks": ex.get("sitelinks") or 0,
                "photo_source": ex.get("photo_source") or "existing",
                "rank": 0,
            })
            print(f"  reuse {name} ({ex['imdb_id']})", flush=True)
            continue
        rec = found.get(name) or by_norm.get(norm(name))
        if not rec:
            skipped.append((name, "brak w wikidanych"))
            print(f"  brak ID: {name}", flush=True)
            continue
        fw = rec.get("filmweb_id")
        if not fw:
            info = filmweb_info(name=name)
            time.sleep(0.12)
            if info and info.get("filmweb_id"):
                rec["filmweb_id"] = info["filmweb_id"]
                rec["_fwinfo"] = info
                fw = rec["filmweb_id"]
            else:
                skipped.append((name, "brak filmweb id"))
                print(f"  brak Filmweb ID: {name}", flush=True)
                continue
        if not rec.get("imdb_id") or not rec["imdb_id"].startswith("nm"):
            skipped.append((name, "brak imdb"))
            continue
        blob, src = fetch_photo(rec, fw)
        if not blob:
            skipped.append((name, "brak zdjęcia"))
            print(f"  brak zdjęcia: {name}", flush=True)
            continue
        blob = maybe_shrink(blob)
        fname = f"{rec['imdb_id']}.jpg"
        (PHOTO_DIR / fname).write_bytes(blob)
        people.append({
            "name": name,
            "imdb_id": rec["imdb_id"],
            "filmweb_id": int(fw),
            "photo": fname,
            "sitelinks": rec.get("sitelinks") or 0,
            "photo_source": src,
            "rank": 0,
        })
        print(f"  nowy {name} ({src}, fw={fw}, {rec['imdb_id']})", flush=True)

    seen_i, seen_f, uniq = set(), set(), []
    for p in people:
        if p["imdb_id"] in seen_i or p["filmweb_id"] in seen_f:
            print(f"  duplikat pominięty: {p['name']}", flush=True)
            continue
        seen_i.add(p["imdb_id"])
        seen_f.add(p["filmweb_id"])
        p["rank"] = len(uniq) + 1
        uniq.append(p)
    people = uniq

    keep_photos = {p["photo"] for p in people}
    removed = 0
    for f in PHOTO_DIR.glob("*"):
        if f.name not in keep_photos:
            f.unlink()
            removed += 1
    print(f"usunięte stare zdjęcia: {removed}", flush=True)

    meta = {
        "source": SOURCE,
        "updated": time.strftime("%Y-%m-%d"),
        "count": len(people),
        "people": people,
    }
    (OUT_DIR / "people.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    js_path = ROOT / "cloudflare" / "src" / "filmrun_people.js"
    js_path.write_text(
        "/** Wygenerowane z static/filmrun/people.json — nie edytuj ręcznie. */\n"
        "export const FILMRUN_PEOPLE = " + json.dumps(people, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"OK: {len(people)} osób, pominięte {len(skipped)}: {skipped}", flush=True)
    if not (90 <= len(people) <= 110):
        print(f"UWAGA: oczekiwany rozmiar puli to ok. 100 (90–110), jest {len(people)}", flush=True)
        return 1
    for must in ("Chris Evans", "Samuel L. Jackson", "Michael B. Jordan"):
        if not any(p["name"] == must for p in people):
            print(f"BRAK wymaganego nazwiska: {must}", flush=True)
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
