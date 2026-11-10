// content.js - singleton Durable Object "Content": writable overlay on top of static pack JSON.
// Free-plan SQLite DO (same pattern as Room). One idFromName("content") keeps request usage low.
// Effective game data = ASSETS base + this overlay. Scraping stays local-only.
import { DurableObject } from "cloudflare:workers";

const NEW_ID_BASE = 1_000_000; // new cloud-only quote/question ids start here
const MAX_POSTER = 1_500_000;  // 1.5 MB upload/URL blob limit
const MAX_TEXT_BODY = 200_000;

export class Content extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(() => this.migrate());
  }

  migrate() {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS movies (
        movie_id INTEGER PRIMARY KEY,
        pl_title TEXT, aliases TEXT, year INTEGER, cast_json TEXT, cast_source TEXT,
        fields TEXT NOT NULL DEFAULT '[]',
        updated_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY,
        movie_id INTEGER NOT NULL,
        text TEXT, lang TEXT DEFAULT '',
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at REAL NOT NULL,
        base INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY,
        pack_id INTEGER NOT NULL,
        prompt_pl TEXT, prompt_en TEXT, answers TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at REAL NOT NULL,
        base INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS packs (
        pack_id INTEGER PRIMARY KEY,
        modes_off TEXT,
        updated_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS posters (
        movie_id INTEGER PRIMARY KEY,
        image BLOB, source TEXT, url TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actor_photos (
        id INTEGER PRIMARY KEY,
        key TEXT, name TEXT, source TEXT, source_id TEXT,
        image BLOB, url TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        updated_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS seq (name TEXT PRIMARY KEY, n INTEGER NOT NULL);
      INSERT OR IGNORE INTO seq(name, n) VALUES ('quotes', ${NEW_ID_BASE});
      INSERT OR IGNORE INTO seq(name, n) VALUES ('questions', ${NEW_ID_BASE});
      INSERT OR IGNORE INTO seq(name, n) VALUES ('actors', ${NEW_ID_BASE});
    `);
  }

  now() { return Date.now() / 1000; }

  nextId(name) {
    this.ctx.storage.sql.exec("UPDATE seq SET n = n + 1 WHERE name = ?", name);
    return [...this.ctx.storage.sql.exec("SELECT n FROM seq WHERE name = ?", name)][0].n;
  }

  // ---- dump for export / deploy merge
  dump() {
    const rows = (sql, ...a) => [...this.ctx.storage.sql.exec(sql, ...a)].map(r => ({ ...r }));
    const posters = rows("SELECT movie_id, source, url, deleted, updated_at, length(image) AS bytes FROM posters");
    // include image as base64 only when small enough for JSON export of metadata; full blobs via separate endpoint
    return {
      movies: rows("SELECT * FROM movies"),
      quotes: rows("SELECT id, movie_id, text, lang, deleted, updated_at, base FROM quotes"),
      questions: rows("SELECT id, pack_id, prompt_pl, prompt_en, answers, deleted, updated_at, base FROM questions"),
      packs: rows("SELECT * FROM packs"),
      posters: posters.map(p => ({ ...p, has_image: (p.bytes || 0) > 0 })),
      actors: [...this.ctx.storage.sql.exec("SELECT id, key, name, source, source_id, url, deleted, updated_at, image FROM actor_photos")].map(r => {
        const { image, ...rest } = r;
        let image_b64 = null;
        const bytes = image && (image.byteLength || image.length);
        if (image && bytes && bytes <= 200000) {
          const u8 = image instanceof Uint8Array ? image : new Uint8Array(image);
          let s = "";
          const CH = 0x8000;
          for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
          image_b64 = btoa(s);
        }
        return { ...rest, has_image: !!(bytes), bytes: bytes || 0, image_b64 };
      }),
      seq: Object.fromEntries(rows("SELECT name, n FROM seq").map(r => [r.name, r.n])),
    };
  }

  clear() {
    this.ctx.storage.sql.exec("DELETE FROM movies");
    this.ctx.storage.sql.exec("DELETE FROM quotes");
    this.ctx.storage.sql.exec("DELETE FROM questions");
    this.ctx.storage.sql.exec("DELETE FROM packs");
    this.ctx.storage.sql.exec("DELETE FROM posters");
    this.ctx.storage.sql.exec("DELETE FROM actor_photos");
    this.ctx.storage.sql.exec(`UPDATE seq SET n = ${NEW_ID_BASE}`);
    return { ok: true };
  }

  stats() {
    const one = (sql) => [...this.ctx.storage.sql.exec(sql)][0]?.n || 0;
    return {
      movies: one("SELECT COUNT(*) AS n FROM movies"),
      quotes: one("SELECT COUNT(*) AS n FROM quotes WHERE deleted=0"),
      quotes_deleted: one("SELECT COUNT(*) AS n FROM quotes WHERE deleted=1"),
      questions: one("SELECT COUNT(*) AS n FROM questions WHERE deleted=0"),
      questions_deleted: one("SELECT COUNT(*) AS n FROM questions WHERE deleted=1"),
      packs: one("SELECT COUNT(*) AS n FROM packs"),
      posters: one("SELECT COUNT(*) AS n FROM posters WHERE deleted=0"),
      actors: one("SELECT COUNT(*) AS n FROM actor_photos WHERE deleted=0"),
    };
  }

  // ---- movie field overlay
  upsertMovie(movieId, patch) {
    const mid = +movieId;
    const cur = [...this.ctx.storage.sql.exec("SELECT * FROM movies WHERE movie_id=?", mid)][0];
    let fields = new Set(cur ? JSON.parse(cur.fields || "[]") : []);
    const next = {
      pl_title: cur?.pl_title ?? null,
      aliases: cur?.aliases ?? null,
      year: cur?.year ?? null,
      cast_json: cur?.cast_json ?? null,
      cast_source: cur?.cast_source ?? null,
    };
    for (const k of ["pl_title", "aliases", "year", "cast_json", "cast_source"]) {
      if (k in patch) {
        next[k] = patch[k];
        fields.add(k);
      }
    }
    const ts = this.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO movies(movie_id, pl_title, aliases, year, cast_json, cast_source, fields, updated_at)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(movie_id) DO UPDATE SET
         pl_title=excluded.pl_title, aliases=excluded.aliases, year=excluded.year,
         cast_json=excluded.cast_json, cast_source=excluded.cast_source,
         fields=excluded.fields, updated_at=excluded.updated_at`,
      mid, next.pl_title, next.aliases, next.year, next.cast_json, next.cast_source,
      JSON.stringify([...fields]), ts,
    );
    return { ok: true, updated_at: ts };
  }

  // ---- quotes
  addQuote(movieId, text, lang) {
    const id = this.nextId("quotes");
    const ts = this.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO quotes(id, movie_id, text, lang, deleted, updated_at, base) VALUES (?,?,?,?,0,?,0)",
      id, +movieId, text, lang || "", ts,
    );
    return { id, updated_at: ts };
  }

  editQuote(id, text, lang) {
    const ts = this.now();
    const row = [...this.ctx.storage.sql.exec("SELECT * FROM quotes WHERE id=?", +id)][0];
    if (row) {
      this.ctx.storage.sql.exec(
        "UPDATE quotes SET text=?, lang=?, deleted=0, updated_at=? WHERE id=?",
        text, lang || "", ts, +id,
      );
    } else {
      // overlay edit of a base (static) quote: mark as base override
      this.ctx.storage.sql.exec(
        "INSERT INTO quotes(id, movie_id, text, lang, deleted, updated_at, base) VALUES (?,?,?,?,0,?,1)",
        +id, 0, text, lang || "", ts,
      );
    }
    return { ok: true, updated_at: ts };
  }

  // When editing a base quote we need movie_id; caller may pass it
  editQuoteFull(id, movieId, text, lang) {
    const ts = this.now();
    const row = [...this.ctx.storage.sql.exec("SELECT * FROM quotes WHERE id=?", +id)][0];
    if (row) {
      this.ctx.storage.sql.exec(
        "UPDATE quotes SET movie_id=COALESCE(NULLIF(movie_id,0),?), text=?, lang=?, deleted=0, updated_at=? WHERE id=?",
        +movieId || row.movie_id, text, lang || "", ts, +id,
      );
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO quotes(id, movie_id, text, lang, deleted, updated_at, base) VALUES (?,?,?,?,0,?,1)",
        +id, +movieId, text, lang || "", ts,
      );
    }
    return { ok: true, updated_at: ts };
  }

  deleteQuote(id, movieId = 0) {
    const ts = this.now();
    const row = [...this.ctx.storage.sql.exec("SELECT * FROM quotes WHERE id=?", +id)][0];
    if (row && !row.base && row.id >= NEW_ID_BASE) {
      this.ctx.storage.sql.exec("DELETE FROM quotes WHERE id=?", +id);
    } else if (row) {
      this.ctx.storage.sql.exec("UPDATE quotes SET deleted=1, updated_at=? WHERE id=?", ts, +id);
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO quotes(id, movie_id, text, lang, deleted, updated_at, base) VALUES (?,?,?,?,1,?,1)",
        +id, +movieId, "", "", ts,
      );
    }
    return { ok: true, updated_at: ts };
  }

  // ---- questions
  addQuestion(packId, q) {
    const id = this.nextId("questions");
    const ts = this.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO questions(id, pack_id, prompt_pl, prompt_en, answers, deleted, updated_at, base) VALUES (?,?,?,?,?,0,?,0)",
      id, +packId, q.prompt_pl || "", q.prompt_en || "", JSON.stringify(q.answers || []), ts,
    );
    return { id, updated_at: ts };
  }

  editQuestion(id, packId, q) {
    const ts = this.now();
    const row = [...this.ctx.storage.sql.exec("SELECT * FROM questions WHERE id=?", +id)][0];
    const answers = JSON.stringify(q.answers || []);
    if (row) {
      this.ctx.storage.sql.exec(
        "UPDATE questions SET pack_id=COALESCE(NULLIF(pack_id,0),?), prompt_pl=?, prompt_en=?, answers=?, deleted=0, updated_at=? WHERE id=?",
        +packId || row.pack_id, q.prompt_pl || "", q.prompt_en || "", answers, ts, +id,
      );
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO questions(id, pack_id, prompt_pl, prompt_en, answers, deleted, updated_at, base) VALUES (?,?,?,?,?,0,?,1)",
        +id, +packId, q.prompt_pl || "", q.prompt_en || "", answers, ts,
      );
    }
    return { ok: true, updated_at: ts };
  }

  deleteQuestion(id, packId = 0) {
    const ts = this.now();
    const row = [...this.ctx.storage.sql.exec("SELECT * FROM questions WHERE id=?", +id)][0];
    if (row && !row.base && row.id >= NEW_ID_BASE) {
      this.ctx.storage.sql.exec("DELETE FROM questions WHERE id=?", +id);
    } else if (row) {
      this.ctx.storage.sql.exec("UPDATE questions SET deleted=1, updated_at=? WHERE id=?", ts, +id);
    } else {
      this.ctx.storage.sql.exec(
        "INSERT INTO questions(id, pack_id, prompt_pl, prompt_en, answers, deleted, updated_at, base) VALUES (?,?,?,?,?,1,?,1)",
        +id, +packId, "", "", "[]", ts,
      );
    }
    return { ok: true, updated_at: ts };
  }

  // ---- packs modes
  setModesOff(packId, modesOff) {
    const ts = this.now();
    const csv = Array.isArray(modesOff) ? modesOff.join(",") : String(modesOff || "");
    this.ctx.storage.sql.exec(
      `INSERT INTO packs(pack_id, modes_off, updated_at) VALUES (?,?,?)
       ON CONFLICT(pack_id) DO UPDATE SET modes_off=excluded.modes_off, updated_at=excluded.updated_at`,
      +packId, csv, ts,
    );
    return { ok: true, updated_at: ts };
  }

  // ---- posters
  setPoster(movieId, imageBytes, source, url) {
    if (imageBytes && imageBytes.byteLength > MAX_POSTER)
      throw Object.assign(new Error("Plakat jest za duży (max 1,5 MB)"), { code: 413, key: "Plakat jest za duży (max 1,5 MB)" });
    const ts = this.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO posters(movie_id, image, source, url, deleted, updated_at) VALUES (?,?,?,?,0,?)
       ON CONFLICT(movie_id) DO UPDATE SET image=excluded.image, source=excluded.source, url=excluded.url,
         deleted=0, updated_at=excluded.updated_at`,
      +movieId, imageBytes || null, source || "url", url || "", ts,
    );
    return { ok: true, updated_at: ts };
  }

  deletePoster(movieId) {
    const ts = this.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO posters(movie_id, image, source, url, deleted, updated_at) VALUES (?,NULL,'','',1,?)
       ON CONFLICT(movie_id) DO UPDATE SET image=NULL, deleted=1, updated_at=excluded.updated_at`,
      +movieId, ts,
    );
    return { ok: true, updated_at: ts };
  }

  getPoster(movieId) {
    const row = [...this.ctx.storage.sql.exec(
      "SELECT image, source, url, deleted, updated_at FROM posters WHERE movie_id=?", +movieId)][0];
    return row || null;
  }

  // ---- merge pack JSON (base from ASSETS) with overlay
  mergePack(data) {
    if (!data || !data.pack) return data;
    const packId = data.pack.id;
    const moviesOv = Object.fromEntries(
      [...this.ctx.storage.sql.exec("SELECT * FROM movies")].map(r => [r.movie_id, r]),
    );
    const quotesOv = [...this.ctx.storage.sql.exec("SELECT * FROM quotes")];
    const qByMovie = {};
    for (const q of quotesOv) {
      if (!q.movie_id) continue;
      (qByMovie[q.movie_id] ||= []).push(q);
    }
    const postersOv = Object.fromEntries(
      [...this.ctx.storage.sql.exec("SELECT movie_id, deleted, updated_at, length(image) AS bytes, source FROM posters")]
        .map(r => [r.movie_id, r]),
    );
    const packOv = [...this.ctx.storage.sql.exec("SELECT * FROM packs WHERE pack_id=?", packId)][0];
    const questionsOv = [...this.ctx.storage.sql.exec("SELECT * FROM questions WHERE pack_id=? OR pack_id=0", packId)];

    const movies = (data.movies || []).map(m => {
      const o = moviesOv[m.id];
      let out = { ...m };
      if (o) {
        const fields = new Set(JSON.parse(o.fields || "[]"));
        if (fields.has("pl_title")) out.pl_title = o.pl_title || "";
        if (fields.has("aliases")) out.aliases = o.aliases || "";
        if (fields.has("year") && o.year != null) out.year = o.year;
        if (fields.has("cast_json")) {
          try { out.cast = JSON.parse(o.cast_json || "[]"); } catch { out.cast = []; }
        }
      }
      // quotes: base + overlay (by id, or by movie_id for new cloud quotes)
      const baseQs = (m.quotes || []).map(q => ({
        text: typeof q === "string" ? q : q.text,
        lang: typeof q === "string" ? "" : (q.lang || ""),
        id: typeof q === "object" && q.id ? q.id : null,
      }));
      const allOv = quotesOv.filter(oq => oq.movie_id === m.id || (oq.movie_id === 0 && oq.id && baseQs.some(b => b.id === oq.id)));
      const byId = new Map();
      const added = [];
      for (const oq of allOv) {
        if (oq.id && oq.id < NEW_ID_BASE) byId.set(oq.id, oq);
        else if (!oq.deleted) added.push({ id: oq.id, text: oq.text, lang: oq.lang || "" });
      }
      let quotes = baseQs.map(q => {
        if (q.id && byId.has(q.id)) {
          const e = byId.get(q.id);
          if (e.deleted) return null;
          return { id: q.id, text: e.text, lang: e.lang || "" };
        }
        return q.id ? { id: q.id, text: q.text, lang: q.lang } : { text: q.text, lang: q.lang };
      }).filter(Boolean);
      quotes = quotes.concat(added);
      out.quotes = quotes;

      const po = postersOv[m.id];
      if (po) {
        if (po.deleted) out.poster = false;
        else if (po.bytes > 0) out.poster = true;
      }
      return out;
    });

    // questions
    let questions = (data.pack.questions || []).map(q => ({ ...q }));
    const qEdits = new Map();
    const qAdded = [];
    for (const oq of questionsOv) {
      if (oq.pack_id && oq.pack_id !== packId && oq.pack_id !== 0) continue;
      if (oq.deleted) qEdits.set(oq.id, { deleted: true });
      else if (oq.base || oq.id < NEW_ID_BASE) {
        qEdits.set(oq.id, {
          id: oq.id, prompt_pl: oq.prompt_pl, prompt_en: oq.prompt_en,
          answers: JSON.parse(oq.answers || "[]"),
        });
      } else {
        qAdded.push({
          id: oq.id, prompt_pl: oq.prompt_pl, prompt_en: oq.prompt_en,
          answers: JSON.parse(oq.answers || "[]"),
        });
      }
    }
    questions = questions.map(q => {
      if (qEdits.has(q.id)) {
        const e = qEdits.get(q.id);
        if (e.deleted) return null;
        return e;
      }
      return q;
    }).filter(Boolean).concat(qAdded);

    let modesOff = packOv ? (packOv.modes_off || "") : (data.pack.modes_off || "");
    const pack = { ...data.pack, questions, modes_off: modesOff };
    const off = new Set(String(modesOff || "").split(",").filter(Boolean));
    const framed = movies.filter(m => (m.frames || []).length).length;
    const years = new Set(movies.map(m => m.year).filter(Boolean));
    const nQuotes = movies.reduce((n, m) => n + (m.quotes || []).length, 0);
    const nPosters = movies.filter(m => m.poster).length;
    const nCast = movies.filter(m => (m.cast || []).length >= 3).length;
    const nQ = questions.length || (movies.length >= 5 ? 1 : 0);
    const need = {
      kadry: [framed, 1, "frames"],
      zoom: [framed, 1, "frames"],
      licytacja: [nQ, 1, "questions"],
      rok: [movies.filter(m => m.year).length, 3, "years"],
      kolejnosc: [years.size, 4, "years"],
      plakat: [nPosters, 3, "posters"],
      aktorzy: [nCast, 3, "cast"],
      cytat: [nQuotes, 5, "quotes"],
    };
    const MODES = ["kadry", "zoom", "licytacja", "rok", "kolejnosc", "plakat", "aktorzy", "cytat"];
    const avail = {};
    for (const k of MODES) {
      const [have, needN, what] = need[k];
      const ok = have >= needN && !off.has(k);
      avail[k] = { ok, have, need: needN, reason: ok ? null : (off.has(k) ? "disabled" : what) };
    }
    return { pack, movies, avail, modes_off: modesOff };
  }

  setActorPhoto(id, imageBytes, meta = {}) {
    if (imageBytes && imageBytes.byteLength > MAX_POSTER)
      throw Object.assign(new Error("Zdjęcie jest za duże (max 1,5 MB)"), { code: 413, key: "Zdjęcie jest za duże (max 1,5 MB)" });
    const ts = this.now();
    let aid = id ? +id : 0;
    if (!aid) aid = this.nextId("actors");
    this.ctx.storage.sql.exec(
      `INSERT INTO actor_photos(id, key, name, source, source_id, image, url, deleted, updated_at)
       VALUES (?,?,?,?,?,?,?,0,?)
       ON CONFLICT(id) DO UPDATE SET
         image=COALESCE(excluded.image, actor_photos.image),
         name=COALESCE(NULLIF(excluded.name,''), actor_photos.name),
         source=COALESCE(NULLIF(excluded.source,''), actor_photos.source),
         source_id=COALESCE(NULLIF(excluded.source_id,''), actor_photos.source_id),
         url=COALESCE(NULLIF(excluded.url,''), actor_photos.url),
         key=COALESCE(NULLIF(excluded.key,''), actor_photos.key),
         deleted=0, updated_at=excluded.updated_at`,
      aid, meta.key || `cloud:${aid}`, meta.name || "", meta.source || "upload",
      meta.source_id || "", imageBytes || null, meta.url || "", ts,
    );
    return { ok: true, id: aid, updated_at: ts };
  }

  getActorPhoto(id) {
    const row = [...this.ctx.storage.sql.exec(
      "SELECT image, source, url, deleted, updated_at, name FROM actor_photos WHERE id=?", +id)][0];
    return row || null;
  }

  getModesOff(packId) {
    const row = [...this.ctx.storage.sql.exec("SELECT modes_off FROM packs WHERE pack_id=?", +packId)][0];
    return row ? (row.modes_off || "") : null;
  }

  // RPC entry: Worker calls stub.fetch with JSON body {op, ...}
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/poster") {
        const mid = +url.searchParams.get("id");
        const row = this.getPoster(mid);
        if (!row || row.deleted || !row.image) return new Response("gone", { status: 404 });
        const bytes = row.image;
        const ct = bytes[0] === 0x89 ? "image/png" : bytes[8] === 0x57 ? "image/webp" : "image/jpeg";
        return new Response(bytes, { headers: { "Content-Type": ct, "Cache-Control": "no-store" } });
      }
      if (request.method === "GET" && url.pathname === "/actor") {
        const id = +url.searchParams.get("id");
        const row = this.getActorPhoto(id);
        if (!row || row.deleted || !row.image) return new Response("gone", { status: 404 });
        const bytes = row.image;
        const ct = bytes[0] === 0x89 ? "image/png" : bytes[8] === 0x57 ? "image/webp" : "image/jpeg";
        return new Response(bytes, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=3600" } });
      }
      const d = await request.json();
      const op = d.op;
      if (op === "dump") return Response.json(this.dump());
      if (op === "stats") return Response.json(this.stats());
      if (op === "clear") return Response.json(this.clear());
      if (op === "mergePack") return Response.json(this.mergePack(d.data));
      if (op === "getModesOff") return Response.json({ modes_off: this.getModesOff(d.pack_id) });
      if (op === "upsertMovie") return Response.json(this.upsertMovie(d.movie_id, d.patch || {}));
      if (op === "addQuote") return Response.json(this.addQuote(d.movie_id, d.text, d.lang));
      if (op === "editQuote") return Response.json(this.editQuoteFull(d.id, d.movie_id, d.text, d.lang));
      if (op === "deleteQuote") return Response.json(this.deleteQuote(d.id, d.movie_id));
      if (op === "addQuestion") return Response.json(this.addQuestion(d.pack_id, d.question));
      if (op === "editQuestion") return Response.json(this.editQuestion(d.id, d.pack_id, d.question));
      if (op === "deleteQuestion") return Response.json(this.deleteQuestion(d.id, d.pack_id));
      if (op === "setModesOff") return Response.json(this.setModesOff(d.pack_id, d.modes_off));
      if (op === "setPoster") {
        let bytes = null;
        if (d.image_b64) {
          const bin = atob(d.image_b64);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }
        return Response.json(this.setPoster(d.movie_id, bytes, d.source, d.url));
      }
      if (op === "deletePoster") return Response.json(this.deletePoster(d.movie_id));
      if (op === "setActorPhoto") {
        let bytes = null;
        if (d.image_b64) {
          const bin = atob(d.image_b64);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }
        return Response.json(this.setActorPhoto(d.id, bytes, d.meta || {}));
      }
      if (op === "getActorMeta") {
        const row = this.getActorPhoto(d.id);
        if (!row) return Response.json(null);
        return Response.json({
          deleted: !!row.deleted, source: row.source, url: row.url, name: row.name,
          updated_at: row.updated_at, has_image: !!(row.image && row.image.byteLength),
        });
      }
      if (op === "getPosterMeta") {
        const row = this.getPoster(d.movie_id);
        if (!row) return Response.json(null);
        return Response.json({
          deleted: !!row.deleted, source: row.source, url: row.url,
          updated_at: row.updated_at, has_image: !!(row.image && row.image.byteLength),
          bytes: row.image ? row.image.byteLength : 0,
        });
      }
      return Response.json({ error: "unknown op" }, { status: 400 });
    } catch (e) {
      const code = e.code || 500;
      return Response.json({ error: e.key || e.message || String(e) }, { status: code });
    }
  }
}

export function contentStub(env) {
  return env.CONTENT.get(env.CONTENT.idFromName("content"));
}

export { MAX_POSTER, MAX_TEXT_BODY, NEW_ID_BASE };
