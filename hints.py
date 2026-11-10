"""Podpowiedzi tytułów jak we Framed: prefiks od pierwszej litery, też po odrzuceniu the/a/an."""
import re
import unicodedata

def fold(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace("ł", "l").replace("Ł", "L").lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()

ARTICLES = re.compile(r"^(the|a|an|le|la|el|il|der|die|das)\s+")

def title_matches(title, q):
    query = fold(q)
    if not query:
        return False
    f = fold(title)
    bare = ARTICLES.sub("", f)
    if f.startswith(query) or bare.startswith(query):
        return True
    words, qw = [w for w in f.split(" ") if w], [w for w in query.split(" ") if w]
    if len(qw) == 1 and any(w.startswith(qw[0]) for w in words):
        return True
    if len(qw) > 1:
        for i in range(0, len(words) - len(qw) + 1):
            if all(words[i + k].startswith(w) for k, w in enumerate(qw)):
                return True
    return False

def title_hints(pool, q, limit=8):
    return [t for t in (pool or []) if title_matches(t, q)][:limit]
