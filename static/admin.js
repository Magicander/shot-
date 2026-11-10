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
  "cloud_note": "Cloud note",
  "edycje w nakładce": "overlay edits",
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
const CLOUD = !!window.KADR_CLOUD;
const CLOUD_NOTE_PL = "Chmura: edytujesz cytaty, licytację, polskie tytuły, tryby, plakaty (link/plik do 1,5 MB) i obsadę. Scraper, nowe pakiety i kadry z YouTube działają tylko lokalnie (python app.py), a potem deploy_cloudflare.py.";
const CLOUD_NOTE_EN = "Cloud: edit quotes, auction questions, Polish titles, mode toggles, posters (URL/file up to 1.5 MB) and cast. Scraper, new packs and YouTube frames stay local (python app.py), then deploy_cloudflare.py.";

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
  if (!(me.admin || (CLOUD && me.ok))) return showLogin();
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  route();
}
async function loadPacks() { packs = await api("/api/admin/packs"); renderNav(); }
function renderNav() {
  const h = location.hash;
  $("#sidenav").innerHTML = `<a href="#/" class="${h === "" || h === "#/" ? "on" : ""}">${T("Pulpit")}</a>
    ${CLOUD ? "" : `<a href="#/scraper" class="${h === "#/scraper" ? "on" : ""}">${T("Scraper")}</a>`}
    ${CLOUD ? "" : `<a href="#/settings" class="${h === "#/settings" ? "on" : ""}">${T("Ustawienia")}</a>`}
    <span class="lbl">${T("Pakiety")}</span>
    ${packs.map(p => `<a href="#/pack/${p.id}" class="${h.startsWith("#/pack/" + p.id) || new RegExp("^#/(pl|modes|posters|cast|quotes|questions)/" + p.id + "$").test(h) ? "on" : ""}"><span class="dot" style="background:${p.color}"></span>${esc(packName(p))}<span class="cnt">${p.ok || 0}/${p.total}</span></a>`).join("")}
    ${CLOUD ? "" : `<a href="#/new"${h === "#/new" ? ' class="on"' : ""}>${T("+ nowy pakiet")}</a>`}`;
}
window.onhashchange = route;
async function route() {
  clearInterval(logTimer); logTimer = null;
  document.onkeydown = null;
  await loadPacks();
  const h = location.hash.slice(1) || "/";
  let m;
  if (h === "/") return dashboard();
  if (h === "/scraper") { if (CLOUD) return (location.hash = "#/"); return scraperPage(); }
  if (h === "/settings") { if (CLOUD) return (location.hash = "#/"); return settingsPage(); }
  if ((m = h.match(/^\/pl\/(\d+)$/))) return plTitlesPage(+m[1]);
  if (h === "/new") { if (CLOUD) return (location.hash = "#/"); return packForm(null); }
  if ((m = h.match(/^\/pack\/(\d+)$/))) return packPage(+m[1]);
  if ((m = h.match(/^\/pick\/(\d+)\/(\d+)$/))) { if (CLOUD) return (location.hash = "#/pack/" + m[1]); return picker(+m[1], +m[2]); }
  if ((m = h.match(/^\/(modes|posters|cast|quotes|questions)\/(\d+)$/))) return EDITORS[m[1]](+m[2]);
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
  const note = document.documentElement.lang === "en" ? CLOUD_NOTE_EN : CLOUD_NOTE_PL;
  const cloudBanner = CLOUD ? `<div class="panel" style="border-left:6px solid var(--orange);margin-bottom:14px"><p style="margin:0;line-height:1.45">${note}</p></div>` : "";
  $("#main").innerHTML = `<div class="ph1"><h1>${T("pulpit")}<span class="ast">*</span></h1>${CLOUD ? "" : `<a class="pill orange" href="#/new">${T("nowy pakiet")}</a>`}</div>${cloudBanner}
    <div class="stats">
      <div class="stat hl"><b>${s.ok}</b><span>${T("filmów z kadrami")}</span></div>
      <div class="stat"><b>${s.picked}</b><span>${T("z wybranymi 3 kadrami")}</span></div>
      <div class="stat"><b>${s.pending}</b><span>${T("czeka na pobranie")}</span></div>
      <div class="stat"><b>${s.error}</b><span>${T("z błędem")}</span></div>
      <div class="stat"><b>${s.rooms || 0}</b><span>${T("aktywne pokoje ({n} graczy)", {n:s.players || 0})}</span></div>
      <div class="stat"><b>${s.db_mb != null ? s.db_mb : (s.overlay ? Object.values(s.overlay).reduce((a,b)=>a+(+b||0),0) : "-")}</b><span>${CLOUD ? T("edycje w nakładce") : T("MB baza, {n} kadrów", {n:s.frames || 0})}</span></div>
    </div>
    <div class="grid2">
      <div class="panel"><h2>${T("pakiety")}</h2><table class="ptable"><thead><tr><th>${T("Pakiet")}</th><th class="hide-m">${T("Postęp")}</th><th>${T("W grze")}</th><th></th></tr></thead><tbody>
        ${packs.map(p => `<tr><td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="pk-swatch" style="background:${p.color};width:34px;height:34px;border-radius:10px"></span><div><div class="t">${esc(packName(p))}</div><div class="sub">${T("{n} filmów", {n:p.total})}</div></div></div></td>
          <td class="hide-m">${packBar(p)}<div class="sub" style="margin-top:4px">${T("gotowe: {a} · pobrane: {b} · błędy: {c}", {a:p.picked || 0, b:p.ok || 0, c:p.err || 0})}</div></td>
          <td class="t">${p.ok || 0}</td><td><div class="acts"><a class="pill small light" href="#/pack/${p.id}">${T("otwórz")}</a></div></td></tr>`).join("")}
      </tbody></table></div>
      ${CLOUD ? `<div class="panel"><h2>${T("scraper")}</h2><p class="muted" style="margin:0;line-height:1.45">${note}</p></div>` : `<div class="panel"><h2>scraper</h2><div id="scrapebox"></div></div>`}
    </div>`;
  if (!CLOUD) startLog();
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
          <div class="row"><button class="pill small orange" id="add">${T("dodaj film")}</button><button class="pill small light" id="bulk">${T("wklej listę")}</button><a class="pill small light" href="#/pl/${id}">${T("polskie tytuły")}</a><a class="pill small orange" href="#/modes/${id}">${T("edytor trybów")}</a>
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
        ${CLOUD ? `<div class="panel"><h2>${T("scraper")}</h2><p class="muted" style="font-size:14px;margin:0">${document.documentElement.lang === "en" ? CLOUD_NOTE_EN : CLOUD_NOTE_PL}</p></div>` : `<div class="panel"><h2>${T("pobierz kadry")}</h2>${scrapeForm(false)}<p class="muted" style="font-size:14px;margin:10px 0 0" id="selinfo">${T("Zaznacz filmy w tabeli, żeby pobrać tylko je (od nowa).")}</p></div>
        <div class="panel"><h2>${T("na żywo")}</h2><div id="scrapebox"></div></div>`}
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
      <p class="full muted" style="font-size:14px;margin:0">${T("Plakat, obsadę i cytaty edytujesz w edytorze trybów.")} <a href="#/modes/${packId}">${T("Otwórz edytor trybów")}</a></p>` : ""}
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
const quoteN = m => m.nquotes || 0;
const MODE_NAMES = {kadry: "Kadry", zoom: "Zoom", licytacja: "Licytacja", rok: "Który rok", kolejnosc: "Ułóż po kolei", plakat: "Plakat", aktorzy: "Aktorzy", cytat: "Cytat"};
const NEED_TXT = {frames: "filmy z kadrami", movies: "filmy w pakiecie", years: "filmy z rokiem", posters: "plakaty", cast: "filmy z obsadą", quotes: "cytaty", questions: "pytania"};
const MODE_NEED = {kadry: "frames", zoom: "frames", licytacja: "questions", rok: "years", kolejnosc: "years", plakat: "posters", aktorzy: "cast", cytat: "quotes"};

async function modesPanel(id) {
  const box = $("#modespanel"); if (!box) return;
  const d = await api(`/api/admin/packs/${id}/modes`);
  box.innerHTML = `<h2>${T("tryby gry")}</h2>
    <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Odznacz, żeby wyłączyć tryb w tym pakiecie. Tryb bez danych jest niedostępny w grze.")}</p>
    <div class="mtoggles">${d.modes.map(k => { const a = d.avail[k], on = !d.modes_off.includes(k), enough = a.have >= a.need;
      return `<label class="mt ${enough ? "" : "lack"}"><input type="checkbox" value="${k}" ${on ? "checked" : ""}><b>${T(MODE_NAMES[k])}</b>
        <span class="sub">${T(NEED_TXT[MODE_NEED[k]])}: ${a.have}/${a.need}${enough ? "" : " - " + T("za mało")}</span></label>`; }).join("")}</div>
    <div class="tmdb"><a class="pill orange small" href="#/modes/${id}">${T("Otwórz edytor trybów")}</a>
      <span class="muted" style="font-size:14px">${T("Plakaty, obsada, cytaty i pytania do licytacji.")}</span>
    </div>`;
  box.querySelectorAll(".mt input").forEach(cb => cb.onchange = async () => {
    const off = [...box.querySelectorAll(".mt input")].filter(x => !x.checked).map(x => x.value);
    await api(`/api/admin/packs/${id}`, "PUT", {modes_off: off}); toast(T("Zapisano"));
  });
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


/* faza 4: edytor trybów */
const SRC_NAMES = {auto: "auto (z zapasowym)", imdb: "IMDb", filmweb: "Filmweb", tmdb: "TMDB", upload: "plik", url: "link", manual: "ręcznie"};
const MODE_DESC = {
  kadry: "Zgadnij film po kadrze. Dane: kadry z YouTube i Twoje wybory.",
  zoom: "Kadr powoli się oddala. Dane: te same kadry.",
  licytacja: "Gracze licytują, ile odpowiedzi podadzą. Dane: Twoje pytania.",
  rok: "Zgadnij rok premiery. Dane: rok filmu.",
  kolejnosc: "Ułóż filmy od najstarszego. Dane: rok filmu.",
  plakat: "Rozmyty plakat wyostrza się. Dane: plakaty z IMDb, Filmweb albo TMDB.",
  aktorzy: "Nazwiska z obsady odsłaniane po kolei, gwiazda na końcu. Dane: obsada.",
  cytat: "Zgadnij film po cytacie. Dane: cytaty, które wpiszesz."};
const MODE_EDITOR = {kadry: "pack", zoom: "pack", rok: "pack", kolejnosc: "pack", plakat: "posters", aktorzy: "cast", cytat: "quotes", licytacja: "questions"};
const EDIT_NAMES = {pack: "lista filmów", posters: "edytor plakatów", cast: "edytor obsady", quotes: "edytor cytatów", questions: "pytania do licytacji"};

function edHead(p, title, extra = "") {
  return `<div class="ph1"><div><a href="#/modes/${p.id}" class="muted backl">&larr; ${esc(packName(p))} · ${T("edytor trybów")}</a><h1>${title}<span class="ast">*</span></h1></div>${extra}</div>`;
}
function srcSelect(id, kind) {
  const opts = kind === "poster" ? ["auto", "imdb", "filmweb", "tmdb"] : ["auto", "filmweb", "imdb", "tmdb"];
  return `<select class="input sm" id="${id}">${opts.map(o => `<option value="${o}">${T(SRC_NAMES[o])}</option>`).join("")}</select>`;
}
function webPanel(id, kind) {
  if (CLOUD) {
    const note = document.documentElement.lang === "en" ? CLOUD_NOTE_EN : CLOUD_NOTE_PL;
    return `<div class="panel webpanel"><h2>${T("scraper")}</h2><p class="muted" style="font-size:14px;margin:0">${note}</p></div>`;
  }
  return `<div class="panel webpanel"><h2>${kind === "poster" ? T("pobierz plakaty") : T("pobierz obsadę")}</h2>
    <p class="muted" style="font-size:14px;margin:0 0 10px">${kind === "poster"
      ? T("Auto: najpierw IMDb, potem Filmweb, potem TMDB (jeśli masz klucz). Plakaty zapisuję lokalnie w bazie.")
      : T("Auto: najpierw Filmweb (pełna obsada), potem IMDb, potem TMDB (jeśli masz klucz). Zapisuję aktorów w kolejności z napisów, razem ze zdjęciami.")}</p>
    <div class="form-grid">
      <label class="field">${T("Źródło")}${srcSelect("wsrc", kind)}</label>
      ${kind === "cast" ? `<label class="field">${T("Ilu aktorów")}<input class="input sm" type="number" id="wn" min="3" max="15" value="6"></label>` : "<span></span>"}
      <label class="check full"><input type="checkbox" id="wredo">${T("pobierz od nowa także filmy, które już mają dane")}</label>
      <label class="check full"><input type="checkbox" id="wfill">${T("uzupełnij puste polskie tytuły (Filmweb, TMDB)")}</label>
      <div class="full row"><button class="pill orange" id="wgo">${T("pobierz dla pakietu")}</button>
        ${kind === "cast" ? `<button class="pill light" id="wphotos">${T("dociągnij brakujące zdjęcia (imiona zostają)")}</button>` : ""}</div>
    </div>
    <div id="scrapebox" style="margin-top:14px"></div></div>`;
}
function bindWeb(id, kind) {
  if (CLOUD || !$("#wgo")) return;
  const startJob = async (extra) => {
    const r = await api(`/api/admin/packs/${id}/web`, "POST", {
      kind, source: $("#wsrc").value, n: +($("#wn")?.value || 6),
      redo: $("#wredo").checked, fill_pl: $("#wfill").checked, ...extra});
    toast(extra && extra.photos_only ? T("Zdjęcia: {n} filmów w kolejce", {n: r.count}) : T("Start: {n} filmów", {n: r.count}));
    const b = $("#scrapebox"); b.dataset.was = "1"; b.dataset.reload = "1";
  };
  $("#wgo").onclick = async () => { try { await startJob({}); } catch (e) { toast(e.message); } };
  if ($("#wphotos")) $("#wphotos").onclick = async () => { try { await startJob({photos_only: true, redo: false}); } catch (e) { toast(e.message); } };
  startLog(); $("#scrapebox").dataset.reload = "1";
}

/* hub */
async function modesHub(id) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const d = await api(`/api/admin/packs/${id}/modes`);
  $("#main").innerHTML = `<div class="ph1"><div><a href="#/pack/${id}" class="muted backl">&larr; ${esc(packName(p))}</a><h1>${T("edytor trybów")}<span class="ast">*</span></h1></div>
      <span class="tag">${T("{a} z {b} trybów gotowych", {a: d.modes.filter(k => d.avail[k].ok).length, b: d.modes.length})}</span></div>
    <p class="muted" style="margin:-6px 0 16px;font-size:15px">${T("Każdy tryb potrzebuje swoich danych. Przełącznik wyłącza tryb tylko w tym pakiecie.")}</p>
    <div class="hub">${d.modes.map(k => { const a = d.avail[k], on = !d.modes_off.includes(k), enough = a.have >= a.need, ed = MODE_EDITOR[k];
      const pct = Math.min(100, Math.round(a.have / Math.max(1, a.need) * 100));
      const note = k === "licytacja" && !(d.questions || 0) && enough ? T("Brak własnych pytań: zostaje proste pytanie o filmy z pakietu.") : "";
      return `<div class="hubcard ${enough ? "ok" : "lack"} ${on ? "" : "off"}">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h3>${T(MODE_NAMES[k])}</h3>
          <label class="switch" title="${T("tryb włączony w tym pakiecie")}"><input type="checkbox" value="${k}" ${on ? "checked" : ""} aria-label="${T("włączony")}"><i></i></label></div>
        <p class="muted">${T(MODE_DESC[k])}</p>
        <div class="ready"><span class="badge ${enough ? "ok" : "error"}">${!on ? T("wyłączony") : enough ? T("gotowy") : T("za mało danych")}</span>
          <span class="sub">${T(NEED_TXT[MODE_NEED[k]])}: <b>${a.have}</b> / ${T("min. {n}", {n: a.need})}</span></div>
        <div class="prog"><i style="width:${pct}%"></i></div>
        ${note ? `<p class="sub muted" style="margin:6px 0 0">${note}</p>` : ""}
        <a class="pill small ${ed === "pack" ? "light" : "orange"}" href="#/${ed === "pack" ? "pack" : ed}/${id}">${T(EDIT_NAMES[ed])}</a></div>`; }).join("")}</div>`;
  document.querySelectorAll(".hub .switch input").forEach(cb => cb.onchange = async () => {
    const off = [...document.querySelectorAll(".hub .switch input")].filter(x => !x.checked).map(x => x.value);
    await api(`/api/admin/packs/${id}`, "PUT", {modes_off: off}); toast(T("Zapisano")); modesHub(id);
  });
}

/* plakaty */
async function postersPage(id) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const movies = await api(`/api/admin/packs/${id}/movies`);
  const n = movies.filter(m => m.poster).length;
  $("#main").innerHTML = edHead(p, T("plakaty"), `<span class="tag">${T("{a} z {b} ma plakat", {a: n, b: movies.length})}</span>`) + `
    <div class="ed-grid">${webPanel(id, "poster")}
      <div class="panel"><h2>${T("filmy")}</h2>
        ${CLOUD ? "" : `<div class="row" style="margin-bottom:12px"><span class="muted" style="font-size:14px">${T("Źródło dla przycisku pobierz:")}</span>${srcSelect("psrc", "poster")}</div>`}
        <div class="pgrid">${movies.map(m => { const [src, upd] = (m.poster_meta || "|").split("|");
          return `<div class="pcard" data-id="${m.id}">
            <div class="pimg">${m.poster ? `<img src="/poster/${m.id}.jpg?v=${Math.round(+upd || 0)}" alt="${esc(m.title)}" loading="lazy">` : `<span>${T("brak plakatu")}</span>`}</div>
            <div class="t">${esc(m.title)} <span class="muted">${m.year || ""}</span></div>
            ${m.pl_title ? `<div class="sub">${esc(m.pl_title)}</div>` : ""}
            <div class="sub">${m.poster ? T("źródło: {x}", {x: T(SRC_NAMES[src] || src || "?")}) : "&nbsp;"}</div>
            <div class="pacts">${CLOUD ? "" : `<button class="pill small orange" data-a="fetch">${m.poster ? T("pobierz ponownie") : T("pobierz")}</button>`}
              <button class="pill small light" data-a="url">${T("link")}</button>
              <label class="pill small light">${T("plik")}<input type="file" accept="image/jpeg,image/png,image/webp" hidden></label>
              ${m.poster ? `<button class="pill small ghost" data-a="del">${T("usuń")}</button>` : ""}</div></div>`; }).join("") || `<p class="empty">${T("Brak filmów.")}</p>`}</div>
      </div></div>`;
  bindWeb(id, "poster");
  document.querySelectorAll(".pcard").forEach(c => {
    const mid = +c.dataset.id, m = movies.find(x => x.id === mid);
    const busy = on => c.classList.toggle("busy", on);
    c.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
      try {
        if (b.dataset.a === "fetch") { busy(true); const r = await api(`/api/admin/movies/${mid}/poster`, "POST", {source: $("#psrc").value}); toast(T("Plakat: {x}", {x: T(SRC_NAMES[r.source])})); }
        if (b.dataset.a === "del") { if (!confirm(T("Usunąć plakat \"{t}\"?", {t: m.title}))) return; await api(`/api/admin/movies/${mid}/poster`, "DELETE"); }
        if (b.dataset.a === "url") return modal(`<h2>${T("plakat z linku")}</h2><p class="muted" style="margin:0 0 10px">${esc(m.title)}</p>
          <label class="field">${T("Bezpośredni link do obrazka (JPEG, PNG, WebP)")}<input class="input sm" name="url" type="url" required placeholder="https://..."></label>
          <div class="actions"><button type="button" class="pill ghost" data-close>${T("anuluj")}</button><button class="pill orange">${T("zapisz")}</button></div>`,
          async fd => { await api(`/api/admin/movies/${mid}/poster`, "PUT", {url: fd.get("url")}); toast(T("Zapisano")); postersPage(id); });
        postersPage(id);
      } catch (e) { busy(false); toast(e.message); }
    });
    c.querySelector("input[type=file]").onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 6e6) return toast(T("Plik jest za duży (max 6 MB)"));
      const rd = new FileReader();
      rd.onload = async () => { try { busy(true); await api(`/api/admin/movies/${mid}/poster`, "PUT", {data: rd.result}); toast(T("Zapisano")); postersPage(id); } catch (err) { busy(false); toast(err.message); } };
      rd.readAsDataURL(f);
    };
  });
}

/* aktorzy */
const parseCast = m => { try { return JSON.parse(m.cast_json || "[]"); } catch { return []; } };
async function castPage(id) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const movies = await api(`/api/admin/packs/${id}/movies`);
  const n = movies.filter(m => parseCast(m).length >= 3).length;
  $("#main").innerHTML = edHead(p, T("aktorzy"), `<span class="tag">${T("{a} z {b} ma obsadę", {a: n, b: movies.length})}</span>`) + `
    <div class="ed-grid">${webPanel(id, "cast")}
      <div class="panel"><h2>${T("filmy")}</h2>
        <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Lista w kolejności odsłaniania w grze: pierwszy pojawia się na początku, ostatni (zwykle gwiazda) na końcu.")}</p>
        ${CLOUD ? "" : `<div class="row" style="margin-bottom:12px"><span class="muted" style="font-size:14px">${T("Źródło dla przycisku pobierz:")}</span>${srcSelect("csrc", "cast")}</div>`}
        <div class="clist">${movies.map(m => { const c = parseCast(m);
          return `<div class="ccard" data-id="${m.id}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
              <div><div class="t">${esc(m.title)} <span class="muted">${m.year || ""}</span></div>
              <div class="sub">${c.length ? T("{n} aktorów · {x}", {n: c.length, x: T(SRC_NAMES[m.cast_source] || m.cast_source || "?")}) : T("brak obsady")}</div></div>
              <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="pill small light" data-a="edit">${T("edytuj")}</button>${CLOUD ? "" : `<button class="pill small orange" data-a="fetch">${T("pobierz")}</button>`}${!CLOUD && c.length && c.some(a => !a.photo_id) ? `<button class="pill small light" data-a="photos">${T("dociągnij zdjęcia")}</button>` : ""}</div></div>
            ${c.length ? `<ol class="castol">${c.map(a => `<li>${a.photo_id ? `<img class="athumb" src="/actor/${a.photo_id}.jpg" alt="">` : `<span class="athumb empty" title="${T("brak zdjęcia")}"></span>`}<span><b>${esc(a.name)}</b>${a.character ? ` <span class="muted">${esc(a.character)}</span>` : ""}</span></li>`).join("")}</ol>` : ""}</div>`; }).join("") || `<p class="empty">${T("Brak filmów.")}</p>`}</div>
      </div></div>`;
  bindWeb(id, "cast");
  document.querySelectorAll(".ccard").forEach(c => {
    const mid = +c.dataset.id, m = movies.find(x => x.id === mid);
    const fetchBtn = c.querySelector("[data-a=fetch]");
    if (fetchBtn) fetchBtn.onclick = async () => {
      c.classList.add("busy");
      try { const r = await api(`/api/admin/movies/${mid}/cast`, "POST", {source: $("#csrc").value, n: +($("#wn")?.value || 6)}); toast(T("Obsada: {x}", {x: T(SRC_NAMES[r.source])})); castPage(id); }
      catch (e) { c.classList.remove("busy"); toast(e.message); }
    };
    const phBtn = c.querySelector("[data-a=photos]");
    if (phBtn) phBtn.onclick = async () => {
      c.classList.add("busy");
      try { await api(`/api/admin/movies/${mid}/cast`, "POST", {source: $("#csrc")?.value || "auto", n: +($("#wn")?.value || 6), photos_only: true}); toast(T("Zapisano")); castPage(id); }
      catch (e) { c.classList.remove("busy"); toast(e.message); }
    };
    c.querySelector("[data-a=edit]").onclick = () => castModal(id, m);
  });
}
function castModal(id, m) {
  let rows = parseCast(m).map(a => ({...a}));
  const draw = () => {
    const box = $("#castrows"); if (!box) return;
    box.innerHTML = rows.map((a, i) => `<div class="crow" data-i="${i}"><span class="num">${i + 1}</span>
      ${a.photo_id ? `<img class="athumb" src="/actor/${a.photo_id}.jpg?t=${Date.now()}" alt="">` : `<span class="athumb empty" title="${T("brak zdjęcia")}"></span>`}
      <input class="input sm" data-f="name" value="${esc(a.name)}" placeholder="${T("Aktor")}" aria-label="${T("Aktor")}">
      <input class="input sm" data-f="character" value="${esc(a.character || "")}" placeholder="${T("Postać")}" aria-label="${T("Postać")}">
      <label class="phup" title="${T("wgraj zdjęcie")}"><input type="file" accept="image/jpeg,image/png,image/webp" data-up hidden>${T("wgraj zdjęcie")}</label>
      <button type="button" class="ibtn" data-m="-1" aria-label="${T("wyżej")}">&uarr;</button><button type="button" class="ibtn" data-m="1" aria-label="${T("niżej")}">&darr;</button>
      <button type="button" class="ibtn" data-m="x" aria-label="${T("usuń")}">&times;</button></div>`).join("") || `<p class="muted">${T("Brak aktorów. Dodaj albo pobierz.")}</p>`;
    box.querySelectorAll("input[data-f]").forEach(inp => inp.oninput = () => { rows[+inp.closest(".crow").dataset.i][inp.dataset.f] = inp.value; });
    box.querySelectorAll("input[data-up]").forEach(inp => inp.onchange = async () => {
      const i = +inp.closest(".crow").dataset.i, f = inp.files && inp.files[0];
      if (!f) return;
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      try {
        const body = { data, name: rows[i].name || "" };
        const r = rows[i].photo_id
          ? await api(`/api/admin/actors/${rows[i].photo_id}`, "PUT", body)
          : await api(`/api/admin/actors`, "POST", body);
        rows[i].photo_id = r.id;
        toast(T("Zapisano"));
        draw();
      } catch (e) { toast(e.message); }
    });
    box.querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
      const i = +b.closest(".crow").dataset.i, d = b.dataset.m;
      if (d === "x") rows.splice(i, 1); else { const j = i + +d; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; }
      draw();
    });
  };
  modal(`<h2>${T("obsada")}: ${esc(m.title)}</h2>
    <p class="muted" style="margin:0 0 10px;font-size:14px">${T("Kolejność odsłaniania w grze, od góry. Ostatni na liście pojawia się na końcu, więc daj tam gwiazdę.")}</p>
    <div id="castrows" class="castrows"></div>
    <div class="row" style="margin-top:10px"><button type="button" class="pill small light" id="cadd">${T("dodaj aktora")}</button>
      <button type="button" class="pill small light" id="crev">${T("odwróć kolejność")}</button>
      <button type="button" class="pill small light" id="cbill">${T("gwiazda na końcu (wg napisów)")}</button></div>
    <div class="actions"><button type="button" class="pill ghost" data-close>${T("anuluj")}</button><button class="pill orange">${T("zapisz")}</button></div>`,
    async () => { await api(`/api/admin/movies/${m.id}/cast`, "PUT", {cast: rows.filter(r => (r.name || "").trim())}); toast(T("Zapisano")); castPage(id); });
  draw();
  $("#cadd").onclick = () => { rows.push({name: "", character: ""}); draw(); $("#castrows").querySelector(".crow:last-child input")?.focus(); };
  $("#crev").onclick = () => { rows.reverse(); draw(); };
  $("#cbill").onclick = () => { rows.sort((a, b) => (b.billing || 99) - (a.billing || 99)); draw(); };
}

/* cytaty */
const Q_STATUS = {matched: "dopasowano", unmatched: "nie ma w pakiecie", ambiguous: "kilka filmów, dopisz rok", duplicate: "już jest taki cytat", bad_format: "zły format"};
const langSel = (v, attr = "") => `<select class="input sm qlang" ${attr} aria-label="${T("Język")}"><option value="" ${!v ? "selected" : ""}>${T("oba")}</option><option value="pl" ${v === "pl" ? "selected" : ""}>PL</option><option value="en" ${v === "en" ? "selected" : ""}>EN</option></select>`;
async function quotesPage(id, keepText) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const films = await api(`/api/admin/packs/${id}/quotes`);
  const total = films.reduce((s, f) => s + f.quotes.length, 0);
  $("#main").innerHTML = edHead(p, T("cytaty"), `<span class="tag">${T("{a} cytatów · {b} filmów z cytatem", {a: total, b: films.filter(f => f.quotes.length).length})}</span>`) + `
    <div class="ed-grid">
      <div class="panel"><h2>${T("wklej listę")}</h2>
        <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Jedna linia na cytat: <b>Tytuł filmu = cytat</b>. Tytuł oryginalny albo polski, rok opcjonalnie, np. <b>Lśnienie (1980) = Here's Johnny!</b>. Język oznacz na początku cytatu: <b>[pl]</b> albo <b>[en]</b>. Polska wersja gry woli cytaty [pl].")}</p>
        <textarea class="input" id="qtext" rows="9" placeholder="Alien (1979) = In space no one can hear you scream.\nCoś = [pl] Nikt nikomu już nie ufa."></textarea>
        <div class="row" style="margin-top:10px"><button class="pill light" id="qprev">${T("podgląd")}</button><button class="pill orange" id="qsave" disabled>${T("zapisz dopasowane")}</button></div>
        <div id="qres"></div>
      </div>
      <div class="panel"><h2>${T("cytaty w filmach")}</h2>
        <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Zmiana zapisuje się po wyjściu z pola.")}</p>
        <div class="qfilms">${films.map(f => `<details class="qfilm" data-id="${f.id}" ${f.quotes.length ? "open" : ""}><summary><b>${esc(f.title)}</b> <span class="muted">${f.year || ""}${f.pl_title ? " · " + esc(f.pl_title) : ""}</span><span class="cnt">${f.quotes.length}</span></summary>
          ${f.quotes.map(q => `<div class="qrow" data-q="${q.id}"><textarea class="input sm" rows="1" aria-label="${T("Cytat")}">${esc(q.text)}</textarea>${langSel(q.lang)}<button class="ibtn" data-a="del" aria-label="${T("usuń")}">&times;</button></div>`).join("")}
          <div class="qrow qnew"><textarea class="input sm" rows="1" placeholder="${T("nowy cytat")}" aria-label="${T("nowy cytat")}"></textarea>${langSel("")}<button class="pill small orange" data-a="add">${T("dodaj")}</button></div></details>`).join("") || `<p class="empty">${T("Brak filmów.")}</p>`}</div>
      </div></div>`;
  if (keepText) $("#qtext").value = keepText;
  let last = "";
  const preview = async apply => {
    const text = $("#qtext").value; if (!text.trim()) return toast(T("Wklej listę"));
    const r = await api(`/api/admin/packs/${id}/quotes`, "POST", {text, apply}); last = text;
    $("#qres").innerHTML = `<p class="plsum"><b>${T("dopasowane: {n}", {n: r.matched})}</b> · ${T("niedopasowane: {n}", {n: r.unmatched})}${apply ? " · " + T("zapisano: {n}", {n: r.saved}) : ""}</p>
      <div style="overflow-x:auto"><table class="ptable plprev"><thead><tr><th>${T("Film w pakiecie")}</th><th>${T("Cytat")}</th></tr></thead><tbody>
      ${r.rows.map(x => `<tr class="${x.status}"><td>${x.status === "matched" ? `<b>${esc(x.movie)}</b>` : `<span class="badge error">${T(Q_STATUS[x.status])}</span><div class="sub">${esc(x.title || x.line)}</div>`}</td>
        <td>${esc(x.quote || x.line)}${x.lang ? ` <span class="tag sm">${x.lang.toUpperCase()}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
    $("#qsave").disabled = apply || !r.matched;
    if (apply) { toast(T("Zapisano {n} cytatów", {n: r.saved})); setTimeout(() => quotesPage(id), 900); }
  };
  $("#qprev").onclick = () => preview(false).catch(e => toast(e.message));
  $("#qsave").onclick = () => { if ($("#qtext").value !== last) return preview(false); preview(true).catch(e => toast(e.message)); };
  $("#qtext").oninput = () => { $("#qsave").disabled = true; };
  document.querySelectorAll(".qrow[data-q]").forEach(r => {
    const qid = +r.dataset.q, ta = r.querySelector("textarea"), sel = r.querySelector("select");
    const save = async () => { try { await api(`/api/admin/quotes/${qid}`, "PUT", {text: ta.value, lang: sel.value}); ta.classList.add("saved"); setTimeout(() => ta.classList.remove("saved"), 1200); toast(T("Zapisano")); } catch (e) { toast(e.message); } };
    ta.onchange = save; sel.onchange = save;
    r.querySelector("[data-a=del]").onclick = async () => { if (confirm(T("Usunąć cytat?"))) { await api(`/api/admin/quotes/${qid}`, "DELETE"); quotesPage(id); } };
  });
  document.querySelectorAll(".qnew").forEach(r => r.querySelector("[data-a=add]").onclick = async () => {
    const mid = +r.closest(".qfilm").dataset.id, ta = r.querySelector("textarea");
    if (!ta.value.trim()) return ta.focus();
    try { await api(`/api/admin/movies/${mid}/quotes`, "POST", {text: ta.value, lang: r.querySelector("select").value}); toast(T("Dodano")); quotesPage(id); } catch (e) { toast(e.message); }
  });
}

/* pytania do licytacji */
const ansText = q => q.answers.map(a => [a.text, ...(a.aliases || [])].join("; ")).join("\n");
function questionModal(id, q) {
  modal(`<h2>${q ? T("edytuj pytanie") : T("nowe pytanie")}</h2>
    <div class="form-grid">
      <label class="field full">${T("Pytanie po polsku")}<input class="input sm" name="prompt_pl" value="${esc(q?.prompt_pl || "")}" placeholder="${T("np. Wymień filmy Johna Carpentera")}"></label>
      <label class="field full">${T("Pytanie po angielsku (opcjonalnie)")}<input class="input sm" name="prompt_en" value="${esc(q?.prompt_en || "")}" placeholder="Name John Carpenter films"></label>
      <label class="field full">${T("Akceptowane odpowiedzi: jedna w linii, aliasy po średniku")}<textarea class="input sm" name="answers_text" id="qans" rows="9" placeholder="The Thing; Coś\nHalloween\nThe Fog; Mgła">${esc(q ? ansText(q) : "")}</textarea></label>
      <div class="full row"><button type="button" class="pill small light" id="qauto">${T("wstaw filmy z pakietu")}</button><span class="muted" style="font-size:13px" id="qcount"></span></div>
    </div>
    <div class="actions"><button type="button" class="pill ghost" data-close>${T("anuluj")}</button><button class="pill orange">${T("zapisz")}</button></div>`,
    async fd => { const body = Object.fromEntries(fd);
      if (q) await api(`/api/admin/questions/${q.id}`, "PUT", body); else await api(`/api/admin/packs/${id}/questions`, "POST", body);
      toast(T("Zapisano")); questionsPage(id); });
  const cnt = () => { $("#qcount").textContent = T("odpowiedzi: {n}", {n: $("#qans").value.split("\n").filter(x => x.trim()).length}); };
  $("#qans").oninput = cnt; cnt();
  $("#qauto").onclick = async () => { const r = await api(`/api/admin/packs/${id}/answers_auto`); const cur = $("#qans").value.trim(); $("#qans").value = (cur ? cur + "\n" : "") + r.text; cnt(); };
}
async function questionsPage(id) {
  const p = packs.find(x => x.id === id); if (!p) return (location.hash = "#/");
  const qs = await api(`/api/admin/packs/${id}/questions`);
  $("#main").innerHTML = edHead(p, T("licytacja: pytania"), `<button class="pill orange" id="qnew">${T("nowe pytanie")}</button>`) + `
    <p class="muted" style="margin:-6px 0 16px;font-size:15px">${T("Gracze licytują, ile poprawnych odpowiedzi podadzą. Najwyższa oferta wpisuje odpowiedzi na czas. Odpowiedzi sprawdzam po znormalizowanym tekście, z aliasami i literówkami.")}</p>
    <div class="ed-grid">
      <div class="panel"><h2>${T("pytania")} <span class="muted">(${qs.length})</span></h2>
        ${qs.length ? `<div class="qlist">${qs.map(q => `<div class="qq" data-id="${q.id}"><div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
            <div><div class="t">${esc(q.prompt_pl || q.prompt_en)}</div>${q.prompt_pl && q.prompt_en ? `<div class="sub">EN: ${esc(q.prompt_en)}</div>` : !q.prompt_pl ? `<div class="sub">${T("tylko EN")}</div>` : ""}</div>
            <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="ibtn" data-a="edit" title="${T("edytuj")}">${ICON.edit || T("edytuj")}</button><button class="ibtn" data-a="del" title="${T("usuń")}">${ICON.del || "&times;"}</button></div></div>
            <div class="sub"><b>${T("odpowiedzi: {n}", {n: q.answers.length})}</b> · ${q.answers.slice(0, 8).map(a => esc(a.text)).join(", ")}${q.answers.length > 8 ? ", ..." : ""}</div></div>`).join("")}</div>`
        : `<p class="empty">${T("Brak pytań. Bez nich licytacja zadaje jedno proste pytanie: ile filmów z pakietu wymienisz.")}</p>`}
      </div>
      <div class="panel"><h2>${T("wklej wiele pytań")}</h2>
        <p class="muted" style="font-size:14px;margin:0 0 10px">${T("Pytania oddziel pustą linią. Pierwsza linia: <b>pytanie PL | pytanie EN</b> (EN opcjonalnie), dalej odpowiedzi, jedna w linii, aliasy po średniku.")}</p>
        <textarea class="input" id="bqtext" rows="10" placeholder="Wymień filmy Carpentera | Name Carpenter films\nThe Thing; Coś\nHalloween\nThe Fog; Mgła\n\nWymień potwory z filmów | Name movie monsters\nXenomorph; Obcy\nPennywise"></textarea>
        <div class="row" style="margin-top:10px"><button class="pill light" id="bqprev">${T("podgląd")}</button><button class="pill orange" id="bqsave" disabled>${T("zapisz poprawne")}</button></div>
        <div id="bqres"></div>
      </div></div>`;
  $("#qnew").onclick = () => questionModal(id, null);
  document.querySelectorAll(".qq").forEach(el => {
    const q = qs.find(x => x.id === +el.dataset.id);
    el.querySelector("[data-a=edit]").onclick = () => questionModal(id, q);
    el.querySelector("[data-a=del]").onclick = async () => { if (confirm(T("Usunąć pytanie?"))) { await api(`/api/admin/questions/${q.id}`, "DELETE"); questionsPage(id); } };
  });
  let last = "";
  const preview = async apply => {
    const text = $("#bqtext").value; if (!text.trim()) return toast(T("Wklej listę"));
    const r = await api(`/api/admin/packs/${id}/questions`, "POST", {bulk: text, apply}); last = text;
    $("#bqres").innerHTML = `<p class="plsum"><b>${T("poprawne: {n}", {n: r.ok})}</b> · ${T("błędne: {n}", {n: r.rows.length - r.ok})}</p>
      ${r.rows.map(x => `<div class="qq ${x.status}"><div class="t">${esc(x.prompt_pl || x.prompt_en || "?")}${x.status !== "ok" ? ` <span class="badge error">${T("potrzeba pytania i 2 odpowiedzi")}</span>` : ""}</div>
        ${x.prompt_pl && x.prompt_en ? `<div class="sub">EN: ${esc(x.prompt_en)}</div>` : ""}<div class="sub">${T("odpowiedzi: {n}", {n: x.answers.length})} · ${x.answers.map(a => esc(a.text) + (a.aliases.length ? ` <span class="muted">(${a.aliases.map(esc).join(", ")})</span>` : "")).join(", ")}</div></div>`).join("")}`;
    $("#bqsave").disabled = apply || !r.ok;
    if (apply) { toast(T("Zapisano {n} pytań", {n: r.saved})); setTimeout(() => questionsPage(id), 900); }
  };
  $("#bqprev").onclick = () => preview(false).catch(e => toast(e.message));
  $("#bqsave").onclick = () => { if ($("#bqtext").value !== last) return preview(false); preview(true).catch(e => toast(e.message)); };
  $("#bqtext").oninput = () => { $("#bqsave").disabled = true; };
}
const EDITORS = {modes: modesHub, posters: postersPage, cast: castPage, quotes: quotesPage, questions: questionsPage};
