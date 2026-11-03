"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
Object.assign(EN, {
  "Ustawienia": "Settings",
  "polskie tytuły": "Polish titles",
  "PL: {x}": "PL: {x}",
  "plakat": "poster",
  "obsada {n}": "cast {n}",
  "cytaty {n}": "quotes {n}",
  "Wczytuję...": "Loading...",
  "Polski tytuł (opcjonalnie)": "Polish title (optional)",
  "Aliasy, też akceptowane (jeden w linii albo po średniku)": "Aliases, also accepted (one per line or separated by semicolons)",
  "Cytaty do trybu Cytat (jeden w linii, bez tytułu filmu)": "Quotes for Quote mode (one per line, without the film title)",
  "Odznacz, żeby wyłączyć tryb w tym pakiecie. Tryb bez danych jest niedostępny w grze.": "Untick to disable a mode for this pack. A mode without enough data is unavailable in the game.",
  "za mało": "not enough",
  "dane TMDB (plakaty, obsada)": "TMDB data (posters, cast)",
  "uzupełnij puste polskie tytuły z TMDB": "fill empty Polish titles from TMDB",
  "pobierz od nowa także filmy, które już mają dane": "refetch films that already have data",
  "Pobierz dane TMDB": "Fetch TMDB data",
  "Plakat i Aktorzy wymagają klucza API TMDB.": "Poster and Cast need a TMDB API key.",
  "Wpisz klucz w ustawieniach.": "Enter the key in settings.",
  "TMDB: {n} filmów w kolejce": "TMDB: {n} films queued",
  "ustawienia": "settings",
  "klucz API TMDB": "TMDB API key",
  "Potrzebny do trybów Plakat i Aktorzy. Darmowy klucz założysz na themoviedb.org (Ustawienia konta, API). Działa klucz v3 albo token v4. Zapisuję go lokalnie w config.local.json, poza gitem i poza eksportem .sql.": "Needed for the Poster and Cast modes. Get a free key at themoviedb.org (Account settings, API). A v3 key or a v4 token both work. It is stored locally in config.local.json, outside git and outside the .sql export.",
  "Stan": "Status",
  "klucz zapisany ({m})": "key saved ({m})",
  "(ze zmiennej TMDB_API_KEY)": "(from the TMDB_API_KEY variable)",
  "brak klucza": "no key",
  "wklej klucz API": "paste the API key",
  "sprawdź i zapisz": "check and save",
  "usuń klucz": "remove key",
  "Dane pochodzą z TMDB. Ta aplikacja korzysta z API TMDB, ale nie jest przez TMDB wspierana ani certyfikowana.": "Data comes from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.",
  "Klucz działa, zapisano": "Key works, saved",
  "Usunąć klucz TMDB?": "Remove the TMDB key?",
  "{a} z {b} ma polski tytuł": "{a} of {b} have a Polish title",
  "Jedna linia na film: <b>Original Title (rok) = Polski tytuł</b> albo <b>Original Title = Polski tytuł</b>. Dopasowuję po znormalizowanym tytule. Najpierw podgląd, potem zapis.": "One line per film: <b>Original Title (year) = Polish title</b> or <b>Original Title = Polish title</b>. Matched by normalized title. Preview first, then save.",
  "podgląd": "preview",
  "zapisz dopasowane": "save matched",
  "edycja w tabeli": "inline editing",
  "Zmiana zapisuje się po wyjściu z pola. Aliasy rozdzielaj średnikiem.": "Changes save when you leave the field. Separate aliases with semicolons.",
  "Polski tytuł": "Polish title",
  "Aliasy": "Aliases",
  "Brak filmów.": "No films.",
  "Wklej listę": "Paste a list",
  "dopasowane: {n}": "matched: {n}",
  "niedopasowane: {n}": "unmatched: {n}",
  "zapisano: {n}": "saved: {n}",
  "Linia": "Line",
  "Film w pakiecie": "Film in the pack",
  "było: {x}": "was: {x}",
  "Zapisano {n} polskich tytułów": "Saved {n} Polish titles",
  "filmy z kadrami": "films with frames",
  "filmy w pakiecie": "films in the pack",
  "filmy z rokiem": "films with a year",
  "plakaty": "posters",
  "filmy z obsadą": "films with cast",
  "cytaty": "quotes",
  "dopasowano": "matched",
  "nie ma w pakiecie": "not in the pack",
  "kilka filmów, dopisz rok": "several films, add the year",
  "film już był wyżej": "film already listed above",
  "zły format": "bad format",
  "Panel admina. Wpisz hasło.": "Admin panel. Enter the password.", "hasło": "password", "wejdź": "log in", "panel": "admin",
  "eksport .sql": "export .sql", "strona gry": "game site", "wyloguj": "log out", "Błąd": "Error", "Zaloguj się": "Please log in",
  "Pulpit": "Dashboard", "Scraper": "Scraper", "Pakiety": "Packs", "+ nowy pakiet": "+ new pack",
  "gotowe {a}, pobrane {b}, błędy {c}": "ready {a}, scraped {b}, errors {c}",
  "pulpit": "dashboard", "nowy pakiet": "new pack", "filmów z kadrami": "movies with frames", "z wybranymi 3 kadrami": "with 3 frames picked",
  "czeka na pobranie": "waiting to scrape", "z błędem": "with errors", "aktywne pokoje ({n} graczy)": "active rooms ({n} players)",
  "MB baza, {n} kadrów": "MB database, {n} frames", "Pakiet": "Pack", "Postęp": "Progress", "W grze": "Playable",
  "{n} filmów": "{n} movies", "gotowe: {a} · pobrane: {b} · błędy: {c}": "ready: {a} · scraped: {b} · errors: {c}", "otwórz": "open",
  "Pracuję: {x}": "Working: {x}", "Nie działa": "Idle", "stop": "stop", "{a}/{b} filmów · błędy: {c}": "{a}/{b} movies · errors: {c}",
  "Log pojawi się po uruchomieniu.": "The log will appear once you start.", "Zatrzymuję...": "Stopping...", "Start: {n} filmów": "Started: {n} movies",
  "uruchom": "run", "na żywo": "live", "wszystkie pakiety": "all packs", "Limit filmów": "Movie limit", "bez limitu": "no limit",
  "Kadrów na film": "Frames per movie", "tylko z błędem": "only failed", "od nowa (kasuje kadry i wybory)": "from scratch (deletes frames and picks)",
  "Bez zaznaczeń pobiera tylko filmy, których jeszcze nie ma.": "With nothing checked it only scrapes movies that are missing.",
  "Od nowa skasuje kadry i wybory dla tych filmów. Na pewno?": "From scratch deletes frames and picks for these movies. Are you sure?",
  "edycja": "edit", "Nazwa": "Name", "np. Komedie": "e.g. Comedies", "Kolor": "Colour", "Opis": "Description", "Krótko, jedno zdanie.": "Short, one sentence.",
  "Nazwa po angielsku": "English name", "Opis po angielsku": "English description", "np. Comedy": "e.g. Comedy",
  "Filmy (opcjonalnie, jeden w linii: Tytuł (Rok))": "Movies (optional, one per line: Title (Year))", "utwórz": "create", "Zapisano": "Saved",
  "edytuj": "edit", "usuń pakiet": "delete pack", "filmów na liście": "movies on the list", "pobrane (w grze)": "scraped (playable)",
  "z wybranymi kadrami": "with picked frames", "błędy": "errors", "filmy": "movies", "dodaj film": "add movie", "wklej listę": "paste a list",
  "wybieraj kadry": "pick frames", "zaznacz wszystkie": "select all", "zaznacz": "select", "Film": "Movie", "Status": "Status", "Kadry": "Frames",
  "link: {x}": "link: {x}", "zapytanie: {x}": "query: {x}", "gotowe ": "ready", "błąd": "error", "czeka": "waiting",
  "wybierz kadry": "pick frames", "pobierz kadry (od nowa)": "scrape frames (from scratch)",
  "Brak filmów. Dodaj pierwszy albo wklej listę.": "No movies yet. Add the first one or paste a list.", "pobierz kadry": "scrape frames",
  "Zaznacz filmy w tabeli, żeby pobrać tylko je (od nowa).": "Check movies in the table to scrape only those (from scratch).",
  "Zaznaczone: {n}. Uruchom pobierze tylko je, od nowa.": "Selected: {n}. Run will scrape only these, from scratch.",
  "Usunąć pakiet \"{name}\" razem z {n} filmami i kadrami?": "Delete the pack \"{name}\" with its {n} movies and frames?",
  "Jeden film w linii, np. <b>Heat (1995)</b> albo <b>Heat, 1995</b>. Duplikaty pominę.": "One movie per line, e.g. <b>Heat (1995)</b> or <b>Heat, 1995</b>. Duplicates are skipped.",
  "dodaj": "add", "Dodano {a}, pominięto {b} duplikatów": "Added {a}, skipped {b} duplicates", "Dodano {a}": "Added {a}",
  "Pominięte duplikaty:": "Skipped duplicates:", "już jest: {x}": "already there: {x}", "Wynik dodawania": "Add result", "ok": "ok",
  "Usunąć \"{t}\"?": "Delete \"{t}\"?", "Pobrać od nowa? Obecne kadry i wybory zostaną skasowane.": "Scrape again? Current frames and picks will be deleted.",
  "edytuj film": "edit movie", "Tytuł (oryginalny, po nim gracze zgadują)": "Title (original, players guess this)", "Rok": "Year",
  "Własne zapytanie YouTube (opcjonalnie)": "Custom YouTube query (optional)", "np. IT 2017 official trailer Pennywise": "e.g. IT 2017 official trailer Pennywise",
  "Bezpośredni link YouTube (opcjonalnie, ma pierwszeństwo)": "Direct YouTube link (optional, takes priority)",
  "Wszystkie filmy mają komplet wyborów": "All movies have complete picks", "wybór kadrów": "frame picker", "gotowe {a} / {b}": "done {a} / {b}",
  "Brak kadrów: {x}": "No frames: {x}", "film jeszcze nie pobrany": "movie not scraped yet", "Trailer": "Trailer", "jest": "set", "brak": "none",
  "zapisano": "saved", "&larr; poprzedni": "&larr; previous", "następny &rarr;": "next &rarr;", "następny bez wyboru": "next without picks",
  "pobierz od nowa": "scrape again",
  "Klawisze: <span class=\"kbd\">&larr;</span> <span class=\"kbd\">&rarr;</span> filmy, <span class=\"kbd\">N</span> następny bez wyboru, najedź na kadr i <span class=\"kbd\">1</span> trudny <span class=\"kbd\">2</span> średni <span class=\"kbd\">3</span> łatwy.":
    "Keys: <span class=\"kbd\">&larr;</span> <span class=\"kbd\">&rarr;</span> movies, <span class=\"kbd\">N</span> next without picks, hover a frame and press <span class=\"kbd\">1</span> hard <span class=\"kbd\">2</span> medium <span class=\"kbd\">3</span> easy.",
  "okładka": "cover", "ustaw jako okładkę pakietu": "set as pack cover", "okł.": "cover", "Ustawiono okładkę pakietu": "Pack cover set",
  "Pobrać od nowa? Kadry i wybory tego filmu zostaną skasowane.": "Scrape again? Frames and picks of this movie will be deleted.",
  "Nie znaleziono trailera na YouTube": "No trailer found on YouTube",
  "Za mało dobrych kadrów ({n}) po {k} próbach": "Too few good frames ({n}) after {k} attempts",
  "Żaden z {k} trailerów nie dał się pobrać": "None of the {k} trailers could be downloaded",
  "Brak trailera: {x}": "No trailer: {x}",
});
const ROLES = [["hard",T("trudny")],["medium",T("średni")],["easy",T("łatwy")]];
const KEYS_PL = "Klawisze: <span class=\"kbd\">&larr;</span> <span class=\"kbd\">&rarr;</span> filmy, <span class=\"kbd\">N</span> nast\u0119pny bez wyboru, najed\u017a na kadr i <span class=\"kbd\">1</span> trudny <span class=\"kbd\">2</span> \u015bredni <span class=\"kbd\">3</span> \u0142atwy.";
function errText(e) {
  if (!e) return "";
  const [code, a, b] = String(e).split(":");
  if (code === "no_trailer") return T("Nie znaleziono trailera na YouTube");
  if (code === "few_frames") return T("Za mało dobrych kadrów ({n}) po {k} próbach", {n: a, k: b});
  if (code === "all_failed") return T("Żaden z {k} trailerów nie dał się pobrać", {k: a});
  return e;
}
const ICON = {
  pick:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h18v14H3zm2 2v10h14V7zm2 8 3-4 2 3 2-2 3 3z"/></svg>',
  run:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4v16l13-8z"/></svg>',
  edit:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.3V21h3.7l11-11-3.7-3.7zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z"/></svg>',
  del:'<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 7h12l-1 14H7zm3-4h6l1 2h4v2H4V5h4z"/></svg>',
};
let packs = [], logTimer = null;

async function api(url, method = "GET", body) {
  const r = await fetch(url, {method, headers: body ? {"Content-Type":"application/json", "X-Lang": LANG} : {"X-Lang": LANG}, body: body ? JSON.stringify(body) : undefined});
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith("/login")) { showLogin(); throw new Error(T("Zaloguj się")); }
  if (!r.ok) { const err = new Error(d.error || T("Błąd")); err.data = d; throw err; }
  return d;
}
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), 2600); }
function modal(html, onSubmit) {
  const f = $("#mform"); f.innerHTML = html; $("#modal").classList.remove("hidden");
  f.querySelector("[data-close]")?.addEventListener("click", () => $("#modal").classList.add("hidden"));
  f.onsubmit = async e => { e.preventDefault(); try { await onSubmit(new FormData(f)); $("#modal").classList.add("hidden"); } catch (err) { toast(err.message); } };
  f.querySelector("input,textarea")?.focus();
}
const closeModal = () => $("#modal").classList.add("hidden");

/* logowanie */
function showLogin() { $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); $("#pw").focus(); }
$("#lf").onsubmit = async e => {
  e.preventDefault(); $("#lerr").textContent = "";
  try { await api("/api/admin/login", "POST", {password: $("#pw").value}); $("#pw").value = ""; function bulkReport(r) {
  const head = r.skipped ? T("Dodano {a}, pominięto {b} duplikatów", {a: r.added, b: r.skipped}) : T("Dodano {a}", {a: r.added});
  if (!r.skipped) return toast(head);
  setTimeout(() => modal(`<h2>${T("Wynik dodawania")}</h2><p style="margin:0 0 8px"><b>${esc(head)}</b></p>
    <p class="muted" style="margin:0 0 6px">${T("Pominięte duplikaty:")}</p>
    <ul class="duplist">${r.skipped_items.map(x => `<li><b>${esc(x.title)}${x.year ? ` (${x.year})` : ""}</b> <span class="muted">${T("już jest: {x}", {x: esc(x.existing)})}</span></li>`).join("")}</ul>
    <div class="actions"><button class="pill orange">${T("ok")}</button></div>`, async () => {}), 0);
}
boot(); }
  catch (err) { $("#lerr").textContent = err.message; $("#pw").select(); }
};
$("#logout").onclick = async () => { await api("/api/admin/logout", "POST"); showLogin(); };

async function boot() {
  const me = await api("/api/admin/me");
  if (!me.admin) return showLogin();
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  route();
}
async function loadPacks() { packs = await api("/api/admin/packs"); renderNav(); }
function renderNav() {
  const h = location.hash;
  $("#sidenav").innerHTML = `<a href="#/" class="${h === "" || h === "#/" ? "on" : ""}">${T("Pulpit")}</a>
    <a href="#/scraper" class="${h === "#/scraper" ? "on" : ""}">${T("Scraper")}</a>
    <a href="#/settings" class="${h === "#/settings" ? "on" : ""}">${T("Ustawienia")}</a>
    <span class="lbl">${T("Pakiety")}</span>
    ${packs.map(p => `<a href="#/pack/${p.id}" class="${h.startsWith("#/pack/" + p.id) || h === "#/pl/" + p.id ? "on" : ""}"><span class="dot" style="background:${p.color}"></span>${esc(packName(p))}<span class="cnt">${p.ok || 0}/${p.total}</span></a>`).join("")}
    <a href="#/new"${h === "#/new" ? ' class="on"' : ""}>${T("+ nowy pakiet")}</a>`;
}
window.onhashchange = route;
async function route() {
  clearInterval(logTimer); logTimer = null;
  document.onkeydown = null;
  await loadPacks();
  const h = location.hash.slice(1) || "/";
  let m;
  if (h === "/") return dashboard();
  if (h === "/scraper") return scraperPage();
  if (h === "/settings") return settingsPage();
  if ((m = h.match(/^\/pl\/(\d+)$/))) return plTitlesPage(+m[1]);
  if (h === "/new") return packForm(null);
  if ((m = h.match(/^\/pack\/(\d+)$/))) return packPage(+m[1]);
  if ((m = h.match(/^\/pick\/(\d+)\/(\d+)$/))) return picker(+m[1], +m[2]);
  location.hash = "#/";
}

/* pulpit */
function packBar(p) {
  const t = p.total || 1;
  return `<div class="bar" title="${T("gotowe {a}, pobrane {b}, błędy {c}", {a:p.picked || 0, b:p.ok || 0, c:p.err || 0})}">
    <i style="width:${(p.picked || 0) / t * 100}%;background:var(--ok)"></i><i style="width:${((p.ok || 0) - (p.picked || 0)) / t * 100}%;background:var(--orange)"></i><i style="width:${(p.err || 0) / t * 100}%;background:var(--err)"></i></div>`;
}
async function dashboard() {
  const s = await api("/api/admin/stats");
  $("#main").innerHTML = `<div class="ph1"><h1>${T("pulpit")}<span class="ast">*</span></h1><a class="pill orange" href="#/new">${T("nowy pakiet")}</a></div>
    <div class="stats">
      <div class="stat hl"><b>${s.ok}</b><span>${T("filmów z kadrami")}</span></div>
      <div class="stat"><b>${s.picked}</b><span>${T("z wybranymi 3 kadrami")}</span></div>
      <div class="stat"><b>${s.pending}</b><span>${T("czeka na pobranie")}</span></div>
      <div class="stat"><b>${s.error}</b><span>${T("z błędem")}</span></div>
      <div class="stat"><b>${s.rooms}</b><span>${T("aktywne pokoje ({n} graczy)", {n:s.players})}</span></div>
      <div class="stat"><b>${s.db_mb}</b><span>${T("MB baza, {n} kadrów", {n:s.frames})}</span></div>
    </div>
    <div class="grid2">
      <div class="panel"><h2>${T("pakiety")}</h2><table class="ptable"><thead><tr><th>${T("Pakiet")}</th><th class="hide-m">${T("Postęp")}</th><th>${T("W grze")}</th><th></th></tr></thead><tbody>
        ${packs.map(p => `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="pk-swatch" style="background:${p.color};width:34px;height:34px;border-radius:10px"></span><div><div class="t">${esc(packName(p))}</div><div class="sub">${T("{n} filmów", {n:p.total})}</div></div></div></td>
          <td class="hide-m">${packBar(p)}<div class="sub" style="margin-top:4px">${T("gotowe: {a} · pobrane: {b} · błędy: {c}", {a:p.picked || 0, b:p.ok || 0, c:p.err || 0})}</div></td>
          <td class="t">${p.ok || 0}</td><td><div class="acts"><a class="pill small light" href="#/pack/${p.id}">${T("otwórz")}</a></div></td></tr>`).join("")}
      </tbody></table></div>
      <div class="panel"><h2>scraper</h2><div id="scrapebox"></div></div>
    </div>`;
  startLog();
}

/* log scrapera */
function startLog() {
  clearInterval(logTimer);
  const tick = async () => {
    const box = $("#scrapebox"); if (!box) return;
    let s; try { s = await api("/api/admin/scrape"); } catch { return; }
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    const atBottom = !$("#log") || $("#log").scrollTop + $("#log").clientHeight >= $("#log").scrollHeight - 20;
    box.innerHTML = `<div class="row" style="justify-content:space-between"><b>${s.running ? T("Pracuję: {x}", {x: esc(s.current || "...")}) : T("Nie działa")}</b>
      ${s.running ? `<button class="pill small" id="stop">${T("stop")}</button>` : ""}</div>
      <div class="prog"><i style="width:${pct}%"></i></div>
      <div class="sub muted" style="font-size:14px;margin-bottom:8px">${T("{a}/{b} filmów · błędy: {c}", {a:s.done, b:s.total, c:s.failed})}</div>
      <div class="log" id="log">${s.log.length ? s.log.map(l => `<div class="${/BŁĄD|ERROR:|pomijam|skipping/.test(l) ? "e" : /OK -/.test(l) ? "o" : ""}">${esc(l)}</div>`).join("") : T("Log pojawi się po uruchomieniu.")}</div>`;
    if (atBottom) $("#log").scrollTop = 1e9;
    const st = $("#stop"); if (st) st.onclick = async () => { await api("/api/admin/scrape/stop", "POST"); toast(T("Zatrzymuję...")); };
    if (s.running && !box.dataset.was) box.dataset.was = "1";
    if (!s.running && box.dataset.was) { delete box.dataset.was; if (box.dataset.reload) route(); }
  };
  tick(); logTimer = setInterval(tick, 1200);
}
async function runScrape(opts) {
  try { const r = await api("/api/admin/scrape", "POST", opts); toast(T("Start: {n} filmów", {n:r.count})); const b = $("#scrapebox"); if (b) { b.dataset.was = "1"; b.dataset.reload = "1"; } }
  catch (e) { toast(e.message); }
}

function scraperPage() {
  $("#main").innerHTML = `<div class="ph1"><h1>${T("Scraper").toLowerCase()}<span class="ast">*</span></h1></div>
    <div class="grid2"><div class="panel"><h2>${T("uruchom")}</h2>${scrapeForm(true)}</div><div class="panel"><h2>${T("na żywo")}</h2><div id="scrapebox"></div></div></div>`;
  bindScrapeForm(null); startLog();
}
function scrapeForm(withPack) {
  return `<form id="sf" class="form-grid">
    ${withPack ? `<label class="field full">${T("Pakiet")}<select class="input sm" name="pack"><option value="">${T("wszystkie pakiety")}</option>${packs.map(p => `<option value="${p.id}">${esc(packName(p))}</option>`).join("")}</select></label>` : ""}
    <label class="field">${T("Limit filmów")}<input class="input sm" type="number" min="1" name="limit" placeholder="${T("bez limitu")}"></label>
    <label class="field">${T("Kadrów na film")}<input class="input sm" type="number" min="3" max="24" name="frames" value="10"></label>
    <label class="check"><input type="checkbox" name="retry">${T("tylko z błędem")}</label>
    <label class="check"><input type="checkbox" name="redo">${T("od nowa (kasuje kadry i wybory)")}</label>
    <div class="full row"><button class="pill orange">${T("uruchom")}</button><span class="muted" style="font-size:14px">${T("Bez zaznaczeń pobiera tylko filmy, których jeszcze nie ma.")}</span></div></form>`;
}
function bindScrapeForm(packId, getSelected) {
  $("#sf").onsubmit = e => {
    e.preventDefault(); const f = e.target;
    const sel = getSelected ? getSelected() : [];
    if (f.redo.checked && !confirm(T("Od nowa skasuje kadry i wybory dla tych filmów. Na pewno?"))) return;
    runScrape({pack_id: packId || (f.pack && f.pack.value) || null, limit: f.limit.value || null, frames: f.frames.value,
               retry_failed: f.retry.checked, redo: f.redo.checked || sel.length > 0, movie_ids: sel});
  };
}

/* pakiety */
function packForm(p) {
  const isNew = !p;
  const html = `<div class="ph1"><h1>${isNew ? T("nowy pakiet") : T("edycja")}<span class="ast">*</span></h1></div>
    <form class="panel form-grid" id="pf" style="max-width:720px">
      <label class="field">${T("Nazwa")} (PL)<input class="input sm" name="name" required maxlength="40" value="${esc(p?.name || "")}" placeholder="${T("np. Komedie")}"></label>
      <label class="field">${T("Kolor")}<input type="color" name="color" value="${p?.color || "#F26B1D"}"></label>
      <label class="field full">${T("Opis")} (PL)<input class="input sm" name="description" maxlength="300" value="${esc(p?.description || "")}" placeholder="${T("Krótko, jedno zdanie.")}"></label>
      <label class="field">${T("Nazwa po angielsku")} (EN)<input class="input sm" name="name_en" maxlength="40" value="${esc(p?.name_en || "")}" placeholder="${T("np. Comedy")}"></label>
      <span></span>
      <label class="field full">${T("Opis po angielsku")} (EN)<input class="input sm" name="description_en" maxlength="300" value="${esc(p?.description_en || "")}" placeholder="${T("Krótko, jedno zdanie.")}"></label>
      ${isNew ? `<label class="field full">${T("Filmy (opcjonalnie, jeden w linii: Tytuł (Rok))")}<textarea class="input" name="bulk" placeholder="The Mask (1994)\nSuperbad (2007)"></textarea></label>` : ""}
      <div class="full row"><button class="pill orange">${isNew ? T("utwórz") : T("zapisz")}</button><a class="pill ghost" href="${isNew ? "#/" : "#/pack/" + p.id}">${T("anuluj")}</a></div>
    </form>`;
  $("#main").innerHTML = html;
  $("#pf").onsubmit = async e => {
    e.preventDefault(); const f = e.target;
    const body = {name: f.name.value, color: f.color.value, description: f.description.value, name_en: f.name_en.value, description_en: f.description_en.value, cover_frame_id: p?.cover_frame_id};
    try {
      if (isNew) {
        const r = await api("/api/admin/packs", "POST", body);
        if (f.bulk.value.trim()) bulkReport(await api(`/api/admin/packs/${r.id}/movies`, "POST", {text: f.bulk.value}));
        location.hash = "#/pack/" + r.id;
      } else { await api(`/api/admin/packs/${p.id}`, "PUT", body); toast(T("Zapisano")); location.hash = "#/pack/" + p.id; }
    } catch (err) { toast(err.message); }
  };
}

async function packPage(id) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const movies = await api(`/api/admin/packs/${id}/movies`);
  $("#main").innerHTML = `<div class="ph1"><div class="pk-head"><span class="pk-swatch" style="background:${p.color}"></span><div><h1>${esc(packName(p))}</h1><div class="muted">${esc(packDesc(p))}</div></div></div>
      <div class="row"><button class="pill light" id="editp">${T("edytuj")}</button><button class="pill ghost" id="delp">${T("usuń pakiet")}</button></div></div>
    <div class="stats">
      <div class="stat"><b>${p.total}</b><span>${T("filmów na liście")}</span></div>
      <div class="stat hl"><b>${p.ok || 0}</b><span>${T("pobrane (w grze)")}</span></div>
      <div class="stat"><b>${p.picked || 0}</b><span>${T("z wybranymi kadrami")}</span></div>
      <div class="stat"><b>${p.err || 0}</b><span>${T("błędy")}</span></div>
    </div>
    <div class="grid2">
      <div class="panel">
        <div class="row" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0">${T("filmy")}</h2>
          <div class="row"><button class="pill small orange" id="add">${T("dodaj film")}</button><button class="pill small light" id="bulk">${T("wklej listę")}</button><a class="pill small light" href="#/pl/${id}">${T("polskie tytuły")}</a>
          ${movies.some(m => m.status === "ok") ? `<a class="pill small" href="#/pick/${id}/${(movies.find(m => m.status === "ok" && !(m.easy && m.medium && m.hard)) || movies.find(m => m.status === "ok")).id}">${T("wybieraj kadry")}</a>` : ""}</div></div>
        <div style="overflow-x:auto"><table class="ptable"><thead><tr><th><input type="checkbox" id="all" aria-label="${T("zaznacz wszystkie")}"></th><th>${T("Film")}</th><th>${T("Status")}</th><th class="hide-m">${T("Kadry")}</th><th></th></tr></thead><tbody>
        ${movies.map(m => `<tr data-id="${m.id}"><td><input type="checkbox" class="sel" value="${m.id}" aria-label="${T("zaznacz")}"></td>
          <td><div class="t">${esc(m.title)} <span class="muted">(${m.year || "?"})</span></div>
            ${m.pl_title ? `<div class="sub">${T("PL: {x}", {x: esc(m.pl_title)})}</div>` : ""}
            <div class="dbadges">${m.poster ? `<span>${T("plakat")}</span>` : ""}${castN(m) ? `<span>${T("obsada {n}", {n: castN(m)})}</span>` : ""}${quoteN(m) ? `<span>${T("cytaty {n}", {n: quoteN(m)})}</span>` : ""}</div>
            ${m.yt_url ? `<div class="sub">${T("link: {x}", {x: esc(m.yt_url)})}</div>` : m.query ? `<div class="sub">${T("zapytanie: {x}", {x: esc(m.query)})}</div>` : ""}
            ${m.status === "error" ? `<div class="sub" style="color:var(--err)">${esc(errText(m.error))}</div>` : ""}
            ${m.video_title && m.status === "ok" ? `<div class="sub"><a href="${esc(m.video_url)}" target="_blank" rel="noopener">${esc(m.video_title)}</a></div>` : ""}</td>
          <td><span class="badge ${m.status}">${{ok:T("gotowe"), error:T("błąd"), pending:T("czeka")}[m.status] || m.status}</span></td>
          <td class="hide-m"><span class="picks">${ROLES.map(([r]) => `<i class="${r} ${m[r] ? "on" : ""}" title="${r}"></i>`).join("")}</span> <span class="sub">${m.nframes}</span></td>
          <td><div class="acts">
            ${m.status === "ok" ? `<a class="ibtn" title="${T("wybierz kadry")}" href="#/pick/${id}/${m.id}">${ICON.pick}</a>` : ""}
            <button class="ibtn" data-a="run" title="${T("pobierz kadry (od nowa)")}">${ICON.run}</button>
            <button class="ibtn" data-a="edit" title="${T("edytuj")}">${ICON.edit}</button>
            <button class="ibtn danger" data-a="del" title="${T("usuń")}">${ICON.del}</button></div></td></tr>`).join("") || `<tr><td colspan="5" class="empty">${T("Brak filmów. Dodaj pierwszy albo wklej listę.")}</td></tr>`}
        </tbody></table></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:20px">
        <div class="panel" id="modespanel"><h2>${T("tryby gry")}</h2><div class="muted">${T("Wczytuję...")}</div></div>
        <div class="panel"><h2>${T("pobierz kadry")}</h2>${scrapeForm(false)}<p class="muted" style="font-size:14px;margin:10px 0 0" id="selinfo">${T("Zaznacz filmy w tabeli, żeby pobrać tylko je (od nowa).")}</p></div>
        <div class="panel"><h2>${T("na żywo")}</h2><div id="scrapebox"></div></div>
      </div>
    </div>`;
  const selected = () => [...document.querySelectorAll(".sel:checked")].map(c => +c.value);
  const updSel = () => { const n = selected().length; $("#selinfo").textContent = n ? T("Zaznaczone: {n}. Uruchom pobierze tylko je, od nowa.", {n}) : T("Zaznacz filmy w tabeli, żeby pobrać tylko je (od nowa)."); };
  document.querySelectorAll(".sel").forEach(c => c.onchange = updSel);
  $("#all").onchange = e => { document.querySelectorAll(".sel").forEach(c => c.checked = e.target.checked); updSel(); };
  bindScrapeForm(id, selected); startLog();
  $("#scrapebox").dataset.reload = "1";
  modesPanel(id);
  $("#editp").onclick = () => packForm(p);
  $("#delp").onclick = async () => { if (confirm(T("Usunąć pakiet \"{name}\" razem z {n} filmami i kadrami?", {name: packName(p), n: p.total}))) { await api(`/api/admin/packs/${id}`, "DELETE"); location.hash = "#/"; } };
  $("#add").onclick = () => movieModal(id, null);
  $("#bulk").onclick = () => modal(`<h2>${T("wklej listę")}</h2><p class="muted" style="margin:0 0 10px">${T("Jeden film w linii, np. <b>Heat (1995)</b> albo <b>Heat, 1995</b>. Duplikaty pominę.")}</p>
      <textarea class="input" name="text" required placeholder="Heat (1995)\nRonin (1998)"></textarea>
      <div class="actions"><button type="button" class="pill ghost" data-close>${T("anuluj")}</button><button class="pill orange">${T("dodaj")}</button></div>`,
    async fd => { const r = await api(`/api/admin/packs/${id}/movies`, "POST", {text: fd.get("text")}); await route(); bulkReport(r); });
  document.querySelectorAll("tr[data-id] [data-a]").forEach(b => b.onclick = async () => {
    const mid = +b.closest("tr").dataset.id, m = movies.find(x => x.id === mid);
    if (b.dataset.a === "del" && confirm(T("Usunąć \"{t}\"?", {t: m.title}))) { await api(`/api/admin/movies/${mid}`, "DELETE"); route(); }
    if (b.dataset.a === "edit") movieModal(id, m);
    if (b.dataset.a === "run") { if (m.status !== "ok" || confirm(T("Pobrać od nowa? Obecne kadry i wybory zostaną skasowane."))) runScrape({movie_ids: [mid], redo: true}); }
  });
}
function movieModal(packId, m) {
  modal(`<h2>${m ? T("edytuj film") : T("dodaj film")}</h2>
    <div class="form-grid">
      <label class="field full">${T("Tytuł (oryginalny, po nim gracze zgadują)")}<input class="input sm" name="title" required value="${esc(m?.title || "")}"></label>
      <label class="field">${T("Rok")}<input class="input sm" name="year" type="number" min="1900" max="2100" value="${m?.year || ""}"></label>
      <span></span>
      <label class="field full">${T("Własne zapytanie YouTube (opcjonalnie)")}<input class="input sm" name="query" value="${esc(m?.query || "")}" placeholder="${T("np. IT 2017 official trailer Pennywise")}"></label>
      <label class="field full">${T("Bezpośredni link YouTube (opcjonalnie, ma pierwszeństwo)")}<input class="input sm" name="yt_url" value="${esc(m?.yt_url || "")}" placeholder="https://www.youtube.com/watch?v=..."></label>
      ${m ? `<label class="field full">${T("Polski tytuł (opcjonalnie)")}<input class="input sm" name="pl_title" value="${esc(m.pl_title || "")}"></label>
      <label class="field full">${T("Aliasy, też akceptowane (jeden w linii albo po średniku)")}<textarea class="input sm" name="aliases" rows="2">${esc(m.aliases || "")}</textarea></label>
      <label class="field full">${T("Cytaty do trybu Cytat (jeden w linii, bez tytułu filmu)")}<textarea class="input sm" name="quotes" rows="4">${esc(m.quotes || "")}</textarea></label>` : ""}
    </div>
    <div class="actions"><button type="button" class="pill ghost" data-close>${T("anuluj")}</button><button class="pill orange">${T("zapisz")}</button></div>`,
    async fd => {
      const body = Object.fromEntries(fd);
      if (m) await api(`/api/admin/movies/${m.id}`, "PUT", body);
      else {
        let r;
        try { r = await api(`/api/admin/packs/${packId}/movies`, "POST", body); }
        catch (e) { if (e.data && e.data.skipped_items) { closeModal(); return bulkReport(e.data); } throw e; }
        if (r.skipped) { closeModal(); return bulkReport(r); }
      }
      toast(T("Zapisano")); route();
    });
}

/* wybór kadrów */
async function picker(packId, movieId) {
  const p = packs.find(x => x.id === packId);
  const movies = await api(`/api/admin/packs/${packId}/movies`);
  const st = await api(`/api/admin/movies/${movieId}`);
  const ok = movies.filter(m => m.status === "ok");
  const done = m => m.easy && m.medium && m.hard;
  const go = d => { const i = ok.findIndex(m => m.id === movieId); const n = ok[Math.max(0, Math.min(ok.length - 1, i + d))]; if (n && n.id !== movieId) location.hash = `#/pick/${packId}/${n.id}`; };
  const nextTodo = () => { const i = ok.findIndex(m => m.id === movieId); const n = [...ok.slice(i + 1), ...ok.slice(0, i)].find(m => !done(m)); if (n) location.hash = `#/pick/${packId}/${n.id}`; else toast(T("Wszystkie filmy mają komplet wyborów")); };
  const {movie, frames, pick} = st;
  const render = () => {
    $("#main").innerHTML = `<div class="ph1"><div><a href="#/pack/${packId}" class="muted" style="font-weight:700;text-decoration:none">&larr; ${esc(packName(p))}</a><h1>${T("wybór kadrów")}</h1></div>
      <div class="muted" style="font-weight:700">${T("gotowe {a} / {b}", {a: ok.filter(done).length, b: ok.length})}</div></div>
      <div class="pick-layout">
        <div class="panel" style="padding:12px"><div class="mlist">${movies.map(m => `<a href="#/pick/${packId}/${m.id}" class="${m.id === movieId ? "on" : ""}"><span>${esc(m.title)}</span><span class="s">${m.status !== "ok" ? (m.status === "error" ? T("błąd") : T("czeka")) : done(m) ? T("gotowe") : ROLES.filter(([r]) => m[r]).length + "/3"}</span></a>`).join("")}</div></div>
        <div>
          <h2 style="font-size:40px">${esc(movie.title)} <span class="muted">(${movie.year || "?"})</span></h2>
          ${movie.status !== "ok" ? `<div class="errbox" style="margin-top:12px">${T("Brak kadrów: {x}", {x: esc(errText(movie.error) || T("film jeszcze nie pobrany"))})}</div>` : `
          <div class="muted" style="margin-top:6px">${T("Trailer")}: <a href="${esc(movie.video_url)}" target="_blank" rel="noopener">${esc(movie.video_title || movie.video_url)}</a></div>
          <div class="picksum">${ROLES.map(([r, l]) => `<span class="badge ${pick[r] ? "ok" : "pending"}">${l}: ${pick[r] ? T("jest") : T("brak")}</span>`).join("")}
            <span class="saved" id="saved">${T("zapisano")}</span>
            <span style="flex:1"></span>
            <button class="pill small light" id="prev">${T("&larr; poprzedni")}</button><button class="pill small light" id="next">${T("następny &rarr;")}</button>
            <button class="pill small orange" id="todo">${T("następny bez wyboru")}</button>
            <button class="pill small ghost" id="redo">${T("pobierz od nowa")}</button></div>
          <p class="muted" style="font-size:14px;margin:-6px 0 14px">${T(KEYS_PL)}</p>
          <div class="picker-grid">${frames.map(f => {
            const role = ROLES.find(([r]) => pick[r] === f.id);
            return `<div class="fcard ${role ? role[0] : ""}" data-f="${f.id}"><div class="iw"><img src="/frame/${f.id}.jpg" alt="" loading="lazy">
              ${role ? `<span class="role ${role[0]}">${role[1]}</span>` : ""}${p.cover_frame_id === f.id ? `<span class="cover">${T("okładka")}</span>` : ""}
              <span class="ts">${Math.floor(f.ts / 60)}:${String(Math.floor(f.ts % 60)).padStart(2, "0")}</span></div>
              <div class="btns">${ROLES.map(([r, l]) => `<button class="rb ${r} ${pick[r] === f.id ? "on" : ""}" data-r="${r}">${l}</button>`).join("")}<button class="rb" data-cover title="${T("ustaw jako okładkę pakietu")}">${T("okł.")}</button></div></div>`; }).join("")}</div>`}
        </div></div>`;
    $(".mlist a.on")?.scrollIntoView({block: "nearest"});
    if (movie.status !== "ok") return;
    $("#prev").onclick = () => go(-1); $("#next").onclick = () => go(1); $("#todo").onclick = nextTodo;
    $("#redo").onclick = async () => { if (confirm(T("Pobrać od nowa? Kadry i wybory tego filmu zostaną skasowane."))) { await runScrape({movie_ids: [movieId], redo: true}); location.hash = `#/pack/${packId}`; } };
    document.querySelectorAll(".fcard").forEach(c => {
      const fid = +c.dataset.f;
      c.querySelectorAll("[data-r]").forEach(b => b.onclick = () => setRole(b.dataset.r, fid));
      c.querySelector("[data-cover]").onclick = async () => { await api(`/api/admin/packs/${packId}`, "PUT", {...p, cover_frame_id: fid}); p.cover_frame_id = fid; toast(T("Ustawiono okładkę pakietu")); render(); };
      c.onmouseenter = () => hover = fid;
    });
  };
  let hover = null;
  const setRole = async (role, fid) => {
    if (pick[role] === fid) pick[role] = null;
    else { for (const [r] of ROLES) if (pick[r] === fid) pick[r] = null; pick[role] = fid; }
    try { await api("/api/admin/pick", "POST", {movie_id: movieId, ...pick}); }
    catch (e) { return toast(e.message); }
    const m = movies.find(x => x.id === movieId); Object.assign(m, pick);
    render(); const s = $("#saved"); s.classList.add("show"); setTimeout(() => s && s.classList.remove("show"), 1200);
  };
  render();
  document.onkeydown = e => {
    if (e.target.matches("input,textarea,select")) return;
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key.toLowerCase() === "n") nextTodo();
    else if (hover && ["1","2","3"].includes(e.key)) setRole(ROLES[+e.key - 1][0], hover);
  };
}

function bulkReport(r) {
  const head = r.skipped ? T("Dodano {a}, pominięto {b} duplikatów", {a: r.added, b: r.skipped}) : T("Dodano {a}", {a: r.added});
  if (!r.skipped) return toast(head);
  setTimeout(() => modal(`<h2>${T("Wynik dodawania")}</h2><p style="margin:0 0 8px"><b>${esc(head)}</b></p>
    <p class="muted" style="margin:0 0 6px">${T("Pominięte duplikaty:")}</p>
    <ul class="duplist">${r.skipped_items.map(x => `<li><b>${esc(x.title)}${x.year ? ` (${x.year})` : ""}</b> <span class="muted">${T("już jest: {x}", {x: esc(x.existing)})}</span></li>`).join("")}</ul>
    <div class="actions"><button class="pill orange">${T("ok")}</button></div>`, async () => {}), 0);
}
boot();


/* faza 3: tryby, TMDB, polskie tytuły */
const castN = m => { try { return JSON.parse(m.cast_json || "[]").length; } catch { return 0; } };
const quoteN = m => (m.quotes || "").split("\n").filter(x => x.trim()).length;
const MODE_NAMES = {kadry: "Kadry", zoom: "Zoom", licytacja: "Licytacja", rok: "Który rok", kolejnosc: "Ułóż po kolei", plakat: "Plakat", aktorzy: "Aktorzy", cytat: "Cytat"};
const NEED_TXT = {frames: "filmy z kadrami", movies: "filmy w pakiecie", years: "filmy z rokiem", posters: "plakaty", cast: "filmy z obsadą", quotes: "cytaty"};
const MODE_NEED = {kadry: "frames", zoom: "frames", licytacja: "movies", rok: "years", kolejnosc: "years", plakat: "posters", aktorzy: "cast", cytat: "quotes"};

async function modesPanel(id) {
  const box = $("#modespanel"); if (!box) return;
  const d = await api(`/api/admin/packs/${id}/modes`);
  box.innerHTML = `<h2>${T("tryby gry")}</h2>
    <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Odznacz, żeby wyłączyć tryb w tym pakiecie. Tryb bez danych jest niedostępny w grze.")}</p>
    <div class="mtoggles">${d.modes.map(k => { const a = d.avail[k], on = !d.modes_off.includes(k), enough = a.have >= a.need;
      return `<label class="mt ${enough ? "" : "lack"}"><input type="checkbox" value="${k}" ${on ? "checked" : ""}><b>${T(MODE_NAMES[k])}</b>
        <span class="sub">${T(NEED_TXT[MODE_NEED[k]])}: ${a.have}/${a.need}${enough ? "" : " - " + T("za mało")}</span></label>`; }).join("")}</div>
    <div class="tmdb">
      <h3>${T("dane TMDB (plakaty, obsada)")}</h3>
      ${d.tmdb_key ? `<label class="chk"><input type="checkbox" id="fillpl"> ${T("uzupełnij puste polskie tytuły z TMDB")}</label>
        <label class="chk"><input type="checkbox" id="tmdbredo"> ${T("pobierz od nowa także filmy, które już mają dane")}</label>
        <button class="pill orange small" id="tmdbgo">${T("Pobierz dane TMDB")}</button>`
      : `<p class="muted" style="font-size:14px">${T("Plakat i Aktorzy wymagają klucza API TMDB.")} <a href="#/settings">${T("Wpisz klucz w ustawieniach.")}</a></p>`}
    </div>`;
  box.querySelectorAll(".mt input").forEach(cb => cb.onchange = async () => {
    const off = [...box.querySelectorAll(".mt input")].filter(x => !x.checked).map(x => x.value);
    await api(`/api/admin/packs/${id}`, "PUT", {modes_off: off}); toast(T("Zapisano"));
  });
  const go = $("#tmdbgo");
  if (go) go.onclick = async () => {
    try { const r = await api(`/api/admin/packs/${id}/tmdb`, "POST", {fill_pl: $("#fillpl").checked, redo: $("#tmdbredo").checked});
      toast(T("TMDB: {n} filmów w kolejce", {n: r.count})); startLog(); $("#scrapebox").scrollIntoView({behavior: "smooth", block: "center"}); }
    catch (e) { toast(e.message); }
  };
}

async function settingsPage() {
  const s = await api("/api/admin/settings");
  $("#main").innerHTML = `<div class="ph1"><h1>${T("ustawienia")}<span class="ast">*</span></h1></div>
    <div class="panel" style="max-width:720px"><h2>${T("klucz API TMDB")}</h2>
      <p class="muted" style="font-size:15px">${T("Potrzebny do trybów Plakat i Aktorzy. Darmowy klucz założysz na themoviedb.org (Ustawienia konta, API). Działa klucz v3 albo token v4. Zapisuję go lokalnie w config.local.json, poza gitem i poza eksportem .sql.")}</p>
      <p><b>${T("Stan")}:</b> ${s.tmdb_key ? T("klucz zapisany ({m})", {m: esc(s.tmdb_masked)}) + (s.from_env ? " " + T("(ze zmiennej TMDB_API_KEY)") : "") : T("brak klucza")}</p>
      <form id="kf" class="row" style="flex-wrap:wrap;gap:10px" autocomplete="off">
        <input class="input sm" name="k" id="tk" type="password" style="flex:1;min-width:240px" placeholder="${T("wklej klucz API")}" autocomplete="off">
        <button class="pill orange">${T("sprawdź i zapisz")}</button>
        ${s.tmdb_key && !s.from_env ? `<button type="button" class="pill ghost" id="kdel">${T("usuń klucz")}</button>` : ""}
      </form>
      <p class="muted" style="font-size:13px;margin-top:14px">${T("Dane pochodzą z TMDB. Ta aplikacja korzysta z API TMDB, ale nie jest przez TMDB wspierana ani certyfikowana.")}</p>
    </div>`;
  $("#kf").onsubmit = async e => { e.preventDefault(); const k = $("#tk").value.trim(); if (!k) return;
    try { await api("/api/admin/settings", "PUT", {tmdb_key: k}); toast(T("Klucz działa, zapisano")); settingsPage(); } catch (err) { toast(err.message); } };
  if ($("#kdel")) $("#kdel").onclick = async () => { if (confirm(T("Usunąć klucz TMDB?"))) { await api("/api/admin/settings", "PUT", {tmdb_key: ""}); settingsPage(); } };
}

const PL_STATUS = {matched: "dopasowano", unmatched: "nie ma w pakiecie", ambiguous: "kilka filmów, dopisz rok", repeated: "film już był wyżej", bad_format: "zły format"};
async function plTitlesPage(id) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const movies = await api(`/api/admin/packs/${id}/movies`);
  const withPl = movies.filter(m => m.pl_title).length;
  $("#main").innerHTML = `<div class="ph1"><div><a href="#/pack/${id}" class="muted" style="font-weight:700;text-decoration:none">&larr; ${esc(packName(p))}</a><h1>${T("polskie tytuły")}</h1></div>
      <span class="tag">${T("{a} z {b} ma polski tytuł", {a: withPl, b: movies.length})}</span></div>
    <div class="grid2 pl-grid">
      <div class="panel"><h2>${T("wklej listę")}</h2>
        <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Jedna linia na film: <b>Original Title (rok) = Polski tytuł</b> albo <b>Original Title = Polski tytuł</b>. Dopasowuję po znormalizowanym tytule. Najpierw podgląd, potem zapis.")}</p>
        <textarea class="input" id="pltext" rows="9" placeholder="The Thing (1982) = Coś\nAlien = Obcy - 8. pasażer Nostromo"></textarea>
        <div class="row" style="margin-top:10px"><button class="pill light" id="plprev">${T("podgląd")}</button><button class="pill orange" id="plsave" disabled>${T("zapisz dopasowane")}</button></div>
        <div id="plres"></div>
      </div>
      <div class="panel"><h2>${T("edycja w tabeli")}</h2>
        <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Zmiana zapisuje się po wyjściu z pola. Aliasy rozdzielaj średnikiem.")}</p>
        <div style="overflow-x:auto"><table class="ptable pltable"><thead><tr><th>${T("Film")}</th><th>${T("Polski tytuł")}</th><th class="hide-m">${T("Aliasy")}</th></tr></thead><tbody>
        ${movies.map(m => `<tr data-id="${m.id}"><td><div class="t">${esc(m.title)}</div><span class="muted">${m.year || "?"}</span></td>
          <td><input class="input sm" data-f="pl_title" value="${esc(m.pl_title || "")}" aria-label="${T("Polski tytuł")}"></td>
          <td class="hide-m"><input class="input sm" data-f="aliases" value="${esc((m.aliases || "").split("\n").join("; "))}" aria-label="${T("Aliasy")}"></td></tr>`).join("") || `<tr><td colspan="3" class="empty">${T("Brak filmów.")}</td></tr>`}
        </tbody></table></div>
      </div>
    </div>`;
  let lastText = "";
  const preview = async apply => {
    const text = $("#pltext").value; if (!text.trim()) return toast(T("Wklej listę"));
    const r = await api(`/api/admin/packs/${id}/pl_titles`, "POST", {text, apply});
    lastText = text;
    $("#plres").innerHTML = `<p class="plsum"><b>${T("dopasowane: {n}", {n: r.matched})}</b> · ${T("niedopasowane: {n}", {n: r.unmatched})}${apply ? " · " + T("zapisano: {n}", {n: r.saved}) : ""}</p>
      <table class="ptable plprev"><thead><tr><th>${T("Linia")}</th><th>${T("Film w pakiecie")}</th><th>${T("Polski tytuł")}</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr class="${x.status}"><td>${esc(x.line)}</td><td>${x.status === "matched" ? esc(x.movie) : `<span class="badge error">${T(PL_STATUS[x.status])}</span>`}</td>
        <td>${x.status === "matched" ? `<b>${esc(x.pl_title)}</b>${x.current && x.current !== x.pl_title ? `<div class="sub">${T("było: {x}", {x: esc(x.current)})}</div>` : ""}` : ""}</td></tr>`).join("")}</tbody></table>`;
    $("#plsave").disabled = apply || !r.matched;
    if (apply) { toast(T("Zapisano {n} polskich tytułów", {n: r.saved})); setTimeout(() => plTitlesPage(id).then(() => { $("#pltext").value = text; }), 900); }
  };
  $("#plprev").onclick = () => preview(false).catch(e => toast(e.message));
  $("#plsave").onclick = () => { if ($("#pltext").value !== lastText) return preview(false); preview(true).catch(e => toast(e.message)); };
  $("#pltext").oninput = () => { $("#plsave").disabled = true; };
  document.querySelectorAll(".pltable input").forEach(inp => {
    inp.dataset.orig = inp.value;
    inp.onchange = async () => {
      const mid = +inp.closest("tr").dataset.id, f = inp.dataset.f;
      const val = f === "aliases" ? inp.value.split(";").map(x => x.trim()).filter(Boolean).join("\n") : inp.value.trim();
      try { await api(`/api/admin/movies/${mid}`, "PUT", {[f]: val}); inp.classList.add("saved"); setTimeout(() => inp.classList.remove("saved"), 1200); toast(T("Zapisano")); }
      catch (e) { toast(e.message); inp.value = inp.dataset.orig; }
    };
  });
}
