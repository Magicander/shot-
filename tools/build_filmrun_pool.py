#!/usr/bin/env python3
"""Buduje wbudowaną pulę Filmrun: znani aktorzy z prawdziwym ID Filmweb/IMDb i zdjęciem.

Lista nazwisk jest kuratorska (powszechnie rozpoznawalne gwiazdy filmowe, nie
epizodyści). ID pochodzą z Wikidanych (P345 IMDb, P5033 Filmweb) albo z API
Filmwebu, gdy brak P5033. Zdjęcia: Wikimedia Commons (P18), w razie braku
plakat z API Filmwebu. Pliki trafiają do static/filmrun/, nie do quiz.db.
"""
from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import webscrape  # noqa: E402

OUT_DIR = ROOT / "static" / "filmrun"
PHOTO_DIR = OUT_DIR / "photos"
UA = "kadr-shot-filmrun-pool/1.0 (https://github.com/Magicander/shot-; movie quiz seed)"
CTX = ssl.create_default_context()
SPARQL = "https://query.wikidata.org/sparql"

# A-lista / powszechnie rozpoznawalni aktorzy filmowi (żyjący i ikony).
# Świadomie pomijamy muzyków, polityków i reżyserów bez aktorskiej sławy.
NAMES = [
    "Tom Hanks", "Tom Cruise", "Leonardo DiCaprio", "Brad Pitt", "Denzel Washington",
    "Morgan Freeman", "Samuel L. Jackson", "Robert Downey Jr.", "Chris Hemsworth",
    "Chris Evans", "Chris Pratt", "Robert De Niro", "Al Pacino", "Jack Nicholson",
    "Anthony Hopkins", "Ian McKellen", "Patrick Stewart", "Harrison Ford", "Clint Eastwood",
    "Dwayne Johnson", "Vin Diesel", "Jason Statham", "Keanu Reeves", "Hugh Jackman",
    "Ryan Reynolds", "Ryan Gosling", "Christian Bale", "Joaquin Phoenix", "Cillian Murphy",
    "Timothée Chalamet", "Austin Butler", "Pedro Pascal", "Tom Holland", "Benedict Cumberbatch",
    "Idris Elba", "Michael B. Jordan", "Adam Driver", "Oscar Isaac", "Andrew Garfield",
    "Tobey Maguire", "Jake Gyllenhaal", "Matthew McConaughey", "George Clooney", "Matt Damon",
    "Ben Affleck", "Mark Ruffalo", "Jeremy Renner", "Paul Rudd", "Tom Hiddleston",
    "Chris Pine", "Henry Cavill", "Jason Momoa", "Dave Bautista", "John Krasinski",
    "Daniel Craig", "Daniel Radcliffe", "Elijah Wood", "Orlando Bloom", "Viggo Mortensen",
    "Sean Connery", "Pierce Brosnan", "Willem Dafoe", "Gary Oldman", "Ralph Fiennes",
    "Colin Firth", "Hugh Grant", "Jude Law", "Ewan McGregor", "Michael Fassbender",
    "James McAvoy", "Tom Hardy", "Robert Pattinson", "Paul Mescal", "Glen Powell",
    "Nicolas Cage", "Johnny Depp", "Bradley Cooper", "Jamie Foxx", "Eddie Murphy",
    "Jim Carrey", "Steve Carell", "Adam Sandler", "Will Smith", "Mark Wahlberg",
    "Javier Bardem", "Antonio Banderas", "Omar Sy", "Mads Mikkelsen", "Christoph Waltz",
    "Daniel Brühl", "Song Kang-ho", "Tony Leung", "Jackie Chan", "Jet Li",
    "Donnie Yen", "Hiroyuki Sanada", "Ken Watanabe", "Amitabh Bachchan", "Shah Rukh Khan",
    "Aamir Khan", "Dev Patel", "Daniel Kaluuya", "John Boyega", "Mahershala Ali",
    "Forest Whitaker", "Laurence Fishburne", "Jeff Goldblum", "Bill Murray", "Eddie Redmayne",
    "Rami Malek", "Chadwick Boseman", "Sebastian Stan", "Anthony Mackie", "Jacob Elordi",
    "Barry Keoghan", "Simu Liu", "Diego Luna", "Gael García Bernal", "Ricardo Darín",
    "Kevin Hart", "John Cena", "Will Ferrell", "Ben Stiller", "Meryl Streep",
    "Scarlett Johansson", "Margot Robbie", "Jennifer Lawrence", "Natalie Portman", "Anne Hathaway",
    "Emma Stone", "Emma Watson", "Zendaya", "Florence Pugh", "Sydney Sweeney",
    "Jenna Ortega", "Anya Taylor-Joy", "Saoirse Ronan", "Angelina Jolie", "Julia Roberts",
    "Sandra Bullock", "Nicole Kidman", "Cate Blanchett", "Viola Davis", "Lupita Nyong'o",
    "Brie Larson", "Elizabeth Olsen", "Emma Thompson", "Kate Winslet", "Keira Knightley",
    "Carey Mulligan", "Alicia Vikander", "Charlize Theron", "Jessica Chastain", "Amy Adams",
    "Rachel McAdams", "Jennifer Aniston", "Reese Witherspoon", "Cameron Diaz", "Gal Gadot",
    "Zoe Saldaña", "Zoe Kravitz", "Michelle Rodriguez", "Salma Hayek", "Penélope Cruz",
    "Monica Bellucci", "Marion Cotillard", "Léa Seydoux", "Eva Green", "Sigourney Weaver",
    "Jodie Foster", "Jamie Lee Curtis", "Winona Ryder", "Helena Bonham Carter", "Kristen Stewart",
    "Daisy Ridley", "Michelle Yeoh", "Awkwafina", "Angela Bassett", "Halle Berry",
    "Octavia Spencer", "Regina King", "Rosamund Pike", "Rebecca Ferguson", "Vanessa Kirby",
    "Jodie Comer", "Olivia Colman", "Tilda Swinton", "Frances McDormand", "Julianne Moore",
    "Laura Dern", "Michelle Pfeiffer", "Sharon Stone", "Demi Moore", "Meg Ryan",
    "Whoopi Goldberg", "Ayo Edebiri", "Millie Bobby Brown", "Elle Fanning", "Sandra Oh",
    "Marilyn Monroe", "Audrey Hepburn", "Humphrey Bogart", "James Dean", "Marlon Brando",
    "Charlie Chaplin", "Ingrid Bergman", "Grace Kelly", "Elizabeth Taylor", "Paul Newman",
    "Steve McQueen", "Katharine Hepburn", "Bette Davis", "Cary Grant", "John Wayne",
    "Bruce Lee", "Robin Williams", "Heath Ledger", "Philip Seymour Hoffman", "Alan Rickman",
    "Carrie Fisher", "James Earl Jones", "Peter O'Toole", "Sophia Loren", "Alain Delon",
    "Jean-Paul Belmondo", "Marcello Mastroianni", "Romy Schneider", "Brigitte Bardot",
    "Catherine Deneuve", "Isabelle Huppert", "Max von Sydow", "Arnold Schwarzenegger",
    "Sylvester Stallone", "Jean-Claude Van Damme", "Chuck Norris", "Mel Gibson",
    "Kurt Russell", "Michael Caine", "Helen Mirren", "Judi Dench", "Maggie Smith",
    "Janusz Gajos", "Daniel Olbrychski", "Bogusław Linda", "Piotr Adamczyk", "Tomasz Kot",
    "Robert Więckiewicz", "Andrzej Chyra", "Borys Szyc", "Maciej Stuhr", "Cezary Pazura",
    "Andrzej Seweryn", "Marek Kondrat", "Zbigniew Zamachowski", "Dawid Ogrodnik",
    "Bartosz Bielenia", "Agata Kulesza", "Joanna Kulig", "Agnieszka Grochowska",
    "Magdalena Cielecka", "Maja Ostaszewska", "Aleksandra Konieczna", "Danuta Stenka",
    "Krystyna Janda", "Kinga Preis", "Jakub Gierszał",
]


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


def lookup_chunk(names):
    values = " ".join('"%s"@en' % n.replace('"', "") for n in names)
    # też polskie etykiety
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


def main():
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    names = list(dict.fromkeys(NAMES))
    print(f"kuratorskich nazwisk: {len(names)}", flush=True)
    found = {}
    chunk = 35
    for i in range(0, len(names), chunk):
        part = names[i:i + chunk]
        print(f"  Wikidata {i+1}-{i+len(part)}…", flush=True)
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

    # dopasuj niezależnie od znaków diakrytycznych / Jr.
    def norm(s):
        import unicodedata
        t = unicodedata.normalize("NFKD", s or "")
        t = "".join(c for c in t if not unicodedata.combining(c))
        return " ".join(t.lower().replace(".", "").replace("'", "").split())

    by_norm = {norm(k): v for k, v in found.items()}
    people = []
    skipped = []
    for name in names:
        rec = found.get(name) or by_norm.get(norm(name))
        if not rec:
            # spróbuj Filmwebu po nazwie (da też ID)
            info = filmweb_info(name=name)
            if info and info.get("filmweb_id"):
                rec = {"name": name, "imdb_id": None, "filmweb_id": info["filmweb_id"],
                       "commons": "", "sitelinks": 0, "_fwinfo": info}
                print(f"  {name}: tylko Filmweb, bez IMDb na Wikidanych — pomijam (potrzebne oba profile)", flush=True)
                skipped.append((name, "brak imdb na wikidanych"))
                time.sleep(0.12)
                continue
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
        if not rec.get("imdb_id"):
            skipped.append((name, "brak imdb"))
            continue

        src = None
        blob = commons_bytes(rec.get("commons") or "")
        if blob:
            src = "wikimedia"
        else:
            info = rec.get("_fwinfo") or filmweb_info(fid=fw)
            time.sleep(0.1)
            blob = photo_from_info(info)
            if blob:
                src = "filmweb"
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
            "rank": len(people) + 1,
        })
        print(f"  {len(people):3} {name} ({src}, fw={fw}, {rec['imdb_id']})", flush=True)

    # unikalne imdb / filmweb
    seen_i, seen_f, uniq = set(), set(), []
    for p in people:
        if p["imdb_id"] in seen_i or p["filmweb_id"] in seen_f:
            continue
        seen_i.add(p["imdb_id"]); seen_f.add(p["filmweb_id"])
        p["rank"] = len(uniq) + 1
        uniq.append(p)
    people = uniq

    meta = {
        "source": "Kuratorska lista znanych aktorów filmowych. ID: Wikidata P345 (IMDb) i P5033 (Filmweb), w razie potrzeby potwierdzone API-em Filmwebu. Zdjęcia: Wikimedia Commons albo Filmweb. Poza quiz.db.",
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
    return 0 if len(people) >= 100 else 1


if __name__ == "__main__":
    raise SystemExit(main())
