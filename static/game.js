"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const COLORS = ["#F26B1D","#1B1712","#2F8F55","#C8392B","#7A5AF8","#E0A21B","#1F7A8C","#B5487A"];
const avColor = name => COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const LEVELS = [["hard",T("trudny"),1000],["medium",T("średni"),600],["easy",T("łatwy"),300]];
const FLOWER = `<svg class="flower" viewBox="0 0 200 200" aria-hidden="true"><g fill="currentColor">${[0,60,120,180,240,300].map(a=>`<ellipse cx="100" cy="52" rx="30" ry="46" transform="rotate(${a} 100 100)"/>`).join("")}</g><circle cx="100" cy="100" r="34" fill="#FCFAF5"/><rect x="80" y="86" width="40" height="28" rx="6" fill="#1B1712"/><circle cx="100" cy="100" r="8" fill="#FCFAF5"/></svg>`;

async function api(url, body) {
  const r = await fetch(url, body === undefined ? {headers:{"X-Lang":LANG}} : {method:"POST", headers:{"Content-Type":"application/json","X-Lang":LANG}, body:JSON.stringify(body)});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(d.error || T("Coś poszło nie tak")); err.key = d.key; throw err; }
  return d;
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), 2600);
}
const savedName = () => localStorage.getItem("kadr_name") || "";
const creds = code => JSON.parse(localStorage.getItem("kadr_room_" + code) || "null");
const setCreds = (code, d) => localStorage.setItem("kadr_room_" + code, JSON.stringify({pid:d.pid, token:d.token}));

function askName(title, sub, onOk) {
  const f = $("#mform");
  f.innerHTML = `<h2>${esc(title)}</h2><p class="muted" style="margin:0 0 14px">${esc(sub)}</p>
    <label class="field">${T("Twój nick")}<input class="input" name="n" maxlength="18" required value="${esc(savedName())}" placeholder="${T("np. Ola")}"></label>
    <div class="actions"><button type="button" class="pill ghost" id="mcancel">${T("anuluj")}</button><button class="pill orange">${T("dalej")}</button></div>`;
  $("#modal").classList.remove("hidden");
  f.n.focus(); f.n.select();
  $("#mcancel").onclick = () => $("#modal").classList.add("hidden");
  f.onsubmit = async e => {
    e.preventDefault();
    const n = f.n.value.trim(); if (!n) return;
    localStorage.setItem("kadr_name", n);
    try { await onOk(n); $("#modal").classList.add("hidden"); } catch (err) { toast(err.message); }
  };
}

/* ---------------- strona główna ---------------- */
async function loadPacks() {
  const box = $("#packs");
  let packs;
  try { packs = await api("/api/packs"); } catch (e) { box.textContent = e.message; return; }
  box.innerHTML = "";
  packs.forEach((p, i) => {
    const rounds = {n: 10};
    const w = document.createElement("div"); w.className = "packet-wrap";
    const isCustom = p.custom || p.id === "custom";
    const imgs = isCustom
      ? `<span class="qmark" aria-hidden="true">?</span>`
      : (p.thumbs.length >= 2 ? p.thumbs.map(id => `<img class="ph" src="/frame/${id}.jpg" alt="" loading="lazy">`).join("") : FLOWER);
    if (isCustom) w.classList.add("custom-pack");
    w.innerHTML = `
      <div class="packet${isCustom ? " custom-card" : ""}" style="--c:${isCustom ? "#F26B1D" : p.color};--tilt:${isCustom ? 0 : [-1.5,1.2,-.6,1.6][i % 4]}deg">
        <div class="kit"><span>${T("quiz<br>filmowy")}</span><b>${BRAND}*</b></div>
        <h3>${esc(packName(p))}</h3>
        <div class="collage${isCustom ? " qcollage" : ""}">${imgs}</div>
        <div class="stamp">${p.playable}<small>${T("gotowe")}</small></div>
        <div class="foot"><span>${esc(packDesc(p))}</span></div>
      </div>
      <p class="pack-modes">${p.modes.length ? T("tryby: {list}", {list: p.modes.map(modeName).join(", ")}) : T("brak dostępnych trybów")}</p>
      <div class="pack-pills">
        <span class="chip-pill"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v14H3zM5 7v2h2V7zm0 4v2h2v-2zm0 4v2h2v-2zm12-8v2h2V7zm0 4v2h2v-2zm0 4v2h2v-2z"/></svg>${T("{total} filmów | {n} w grze", {total:p.total, n:p.playable})}</span>
        <div class="stepper" role="group" aria-label="${T("Liczba rund")}">
          <button type="button" class="minus" aria-label="${T("mniej rund")}">-</button>
          <span class="n">${plRounds(rounds.n)}</span>
          <button type="button" class="plus" aria-label="${T("więcej rund")}">+</button>
          <button type="button" class="go" ${p.modes.length ? "" : "disabled"}>${p.modes.length ? T("graj") : T("wkrótce")}</button>
        </div>
      </div>`;
    const n = w.querySelector(".n");
    const upd = d => { rounds.n = Math.max(1, Math.min(30, rounds.n + d)); n.textContent = plRounds(rounds.n); };
    upd(0);
    w.querySelector(".minus").onclick = () => upd(-1);
    w.querySelector(".plus").onclick = () => upd(1);
    w.querySelector(".go").onclick = () => {
      if (p.custom || p.id === "custom") return openCustom(packs.filter(x => !x.custom && x.id !== "custom"), rounds.n);
      askName(T("pakiet {name}", {name: packName(p).toLowerCase()}), T("{rounds}. Jak cię nazywać?", {rounds: plRounds(rounds.n)}), async name => {
        const d = await api("/api/rooms", {pack_id:p.id, rounds:rounds.n, name});
        setCreds(d.code, d); location.href = "/r/" + d.code;
      });
    };
    box.append(w);
  });
  renderMostEntry();
}

function openCustom(packs, nrounds) {
  const f = $("#mform");
  f.innerHTML = `<h2>${T("Custom")}</h2>
    <p class="muted" style="margin:0 0 14px">${T("Zaznacz pakiety, które chcesz złożyć w jedną pulę. Potem jak zwykle dobierzesz tryby w lobby.")}</p>
    <div class="packpicks">${packs.map(p => `<label class="check"><input type="checkbox" name="pk" value="${p.id}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(packName(p))} <small class="muted">${p.total}</small></label>`).join("") || `<p class="muted">${T("Brak pakietów do złożenia.")}</p>`}</div>
    <label class="field" style="margin-top:12px">${T("Twój nick")}<input class="input" name="n" maxlength="18" required value="${esc(savedName())}" placeholder="${T("np. Ola")}"></label>
    <div class="actions"><button type="button" class="pill ghost" id="mcancel">${T("anuluj")}</button><button class="pill orange">${T("dalej")}</button></div>`;
  $("#modal").classList.remove("hidden");
  $("#mcancel").onclick = () => $("#modal").classList.add("hidden");
  f.onsubmit = async e => {
    e.preventDefault();
    const ids = [...f.querySelectorAll("input[name=pk]:checked")].map(x => +x.value);
    const name = f.n.value.trim();
    if (!ids.length) return toast(T("Wybierz przynajmniej jeden pakiet"));
    if (!name) return;
    localStorage.setItem("kadr_name", name);
    try {
      const d = await api("/api/rooms", {kind:"custom", pack_id:"custom", pack_ids:ids, rounds:nrounds, name});
      setCreds(d.code, d); location.href = "/r/" + d.code;
    } catch (err) { toast(err.message); }
  };
}

function renderMostEntry() {
  const host = document.querySelector("#filmrun-home");
  if (!host) return;
  const rounds = {n: 3};
  host.innerHTML = `
    <div class="filmrun-box" id="most">
      <div class="filmrun-copy">
        <p class="filmrun-kicker">${T("gra osobna")}</p>
        <h2>Filmrun</h2>
        <p class="filmrun-sub">${T("Wikipedia run, ale o filmach")}</p>
        <p class="filmrun-desc">${T("Dostajecie dwóch znanych aktorów. Start otwiera profil pierwszego. Na Filmwebie albo IMDb szukacie drugiego. Kto pierwszy wróci i wciśnie Stop, wygrywa rundę.")}</p>
        <button type="button" class="pill orange big" id="mostgo">${T("graj")}</button>
      </div>
      <div class="filmrun-art" aria-hidden="true">
        <figure class="fr-bust photo"><img src="/static/filmrun/photos/nm0000199.jpg" alt=""><figcaption>Al Pacino</figcaption></figure>
        <span class="fr-to">→</span>
        <figure class="fr-bust photo goal"><img src="/static/filmrun/photos/nm0000134.jpg" alt=""><figcaption>Robert De Niro</figcaption></figure>
      </div>
    </div>`;
  host.querySelector("#mostgo").onclick = () => askName(T("Filmrun"), T("{rounds}. Jak cię nazywać?", {rounds: plRounds(rounds.n)}), async name => {
    const d = await api("/api/rooms", {kind:"filmrun", pack_id:"most", rounds:rounds.n, name});
    setCreds(d.code, d); location.href = "/r/" + d.code;
  });
}

$("#dolacz").onsubmit = async e => {
  e.preventDefault();
  const code = $("#jcode").value.trim().toUpperCase(), name = $("#jname").value.trim();
  if (code.length !== 4 || !name) return toast(T("Podaj 4-znakowy kod i nick"));
  try {
    localStorage.setItem("kadr_name", name);
    const d = await api(`/api/rooms/${code}/join`, {name});
    setCreds(code, d); location.href = "/r/" + code;
  } catch (err) { toast(err.message); }
};

/* ---------------- pokój ---------------- */
let CODE, ME, S = null, titles = [], pollT, localT0 = 0, lastKey = "", tickT;

async function enterRoom(code) {
  CODE = code; document.title = `${BRAND}* - ${T("pokój {code}", {code})}`;
  $("#home").classList.add("hidden"); $("#room").classList.remove("hidden");
  ME = creds(code);
  if (!ME) {
    try { await api(`/api/rooms/${code}/peek`); } catch (e) { $("#view").innerHTML = `<div class="panel center"><h2>${T("nie ma takiego pokoju")}</h2><p class="muted">${T("Sprawdź kod albo załóż nowy pokój.")}</p><a class="pill orange" href="/">${T("na start")}</a></div>`; return; }
    const doJoin = async name => { const d = await api(`/api/rooms/${code}/join`, {name}); setCreds(code, d); ME = creds(code); poll(); };
    askName(T("pokój {code}", {code}), T("Dołączasz do gry. Jak cię nazywać?"), doJoin);
    $("#view").innerHTML = `<div class="wait"><span class="spin"></span>${T("Czekam na nick...")}</div>`;
    return;
  }
  poll();
}

const WS_MODE = window.KADR_RT === "ws";
let ws = null, wsRetry = 0, wsSeq = 0, wsPending = {}, wsPing = null, wsDead = false;

async function gotState(s) {
  if (!titles.length || (S && S.pack.id !== s.pack.id)) {
    if (s.kind === "most" || s.pack.id === "most") titles = [];
    else if (s.pack.id === "custom") titles = await api(`/api/packs/custom/titles?packs=${(s.pack.source_ids || []).join(",")}`);
    else titles = await api(`/api/packs/${s.pack.id}/titles`);
  }
  S = s; localT0 = performance.now(); render();
}
function roomGone(msg) {
  wsDead = true; localStorage.removeItem("kadr_room_" + CODE);
  $("#view").innerHTML = `<div class="panel center"><h2>${T("pokój wygasł")}</h2><p class="muted">${esc(msg)}</p><a class="pill orange" href="/">${T("na start")}</a></div>`;
}
/* WebSocket (Cloudflare Durable Object): serwer sam wysyła stan, klient łączy się ponownie po zerwaniu */
function wsConnect() {
  if (wsDead || (ws && ws.readyState <= 1)) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const sock = ws = new WebSocket(`${proto}//${location.host}/api/rooms/${CODE}/ws?pid=${encodeURIComponent(ME.pid)}&token=${encodeURIComponent(ME.token)}&lang=${LANG}`);
  sock.onopen = () => { wsRetry = 0; clearInterval(wsPing); wsPing = setInterval(() => { if (sock.readyState === 1) sock.send("ping"); }, 25000); };
  sock.onmessage = ev => {
    if (ev.data === "pong") return;
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.t === "state") gotState(m.s).catch(() => {});
    else if (m.t === "r") { const p = wsPending[m.id]; delete wsPending[m.id]; if (p) m.ok ? p.ok(m.d) : p.fail(Object.assign(new Error(m.error || T("Coś poszło nie tak")), {key: m.key})); }
    else if (m.t === "err") roomGone(m.error);
  };
  sock.onclose = ev => {
    clearInterval(wsPing);
    for (const id in wsPending) { wsPending[id].fail(new Error(T("Coś poszło nie tak"))); delete wsPending[id]; }
    if (ev.code === 4403 || ev.code === 4404 || wsDead || ws !== sock) return;
    const wait = Math.min(5000, 400 * 2 ** wsRetry++);
    setTimeout(wsConnect, wait);
  };
}
function rpc(a, b = {}) {
  return new Promise((ok, fail) => {
    if (!ws || ws.readyState !== 1) { wsConnect(); return fail(new Error(T("Łączę ponownie..."))); }
    const id = ++wsSeq; wsPending[id] = {ok, fail};
    ws.send(JSON.stringify({id, a, b}));
    setTimeout(() => { if (wsPending[id]) { delete wsPending[id]; fail(new Error(T("Coś poszło nie tak"))); } }, 8000);
  });
}
if (WS_MODE) document.addEventListener("visibilitychange", () => { if (!document.hidden && CODE && ME) wsConnect(); });
/* jedno wywołanie akcji pokoju, niezależnie od transportu */
const roomCall = (action, body = {}) => WS_MODE ? rpc(action, body) : api(`/api/rooms/${CODE}/${action}`, {pid:ME.pid, token:ME.token, ...body});

async function poll() {
  if (WS_MODE) return wsConnect();
  clearTimeout(pollT);
  try {
    const s = await api(`/api/rooms/${CODE}?pid=${ME.pid}&token=${encodeURIComponent(ME.token)}`);
    await gotState(s);
  } catch (e) {
    if (/Nie jesteś|Nie ma pokoju/.test(e.key || e.message)) { roomGone(e.message); return; }
  }
  pollT = setTimeout(poll, S && S.phase === "round" ? 800 : 1200);
}
async function act(action, body = {}) {
  try { const d = await roomCall(action, body); lastKey = ""; if (!WS_MODE) { S = d; localT0 = performance.now(); render(); } }
  catch (e) { toast(e.message); }
}

const isHost = () => S.host === S.me;
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c;

function playerList(players, opts = {}) {
  return `<ul class="plist">${players.map(p => `<li class="${p.online ? "" : "off"}">
    <span class="avatar" style="background:${avColor(p.name)}">${esc([...p.name][0].toUpperCase())}</span>
    <span class="who"><span class="nm">${esc(p.name)}</span>${p.id === S.me ? `<span class="you">${T("ty")}</span>` : ""}${p.id === S.host ? `<span class="host">${T("gospodarz")}</span>` : ""}${opts.status && (p.got || p.done) ? `<span class="mark ok" title="${T("zgadł")}"></span>` : ""}</span>
    ${opts.score ? `<span class="sc">${p.score}</span>` : ""}</li>`).join("")}</ul>`;
}

/* ---------------- tryby ---------------- */
const MODE_INFO = {
  kadry: ["Kadry", "Trzy kadry z filmu, od najtrudniejszego. Im szybciej zgadniesz, tym więcej punktów."],
  zoom: ["Zoom", "Mocne zbliżenie fragmentu kadru, które powoli się oddala. Zgadnij tytuł jak najwcześniej."],
  licytacja: ["Licytacja", "Pytanie z listą odpowiedzi. Gracze licytują po kolei. Zwycięzca wymienia odpowiedzi, a timer puszcza przeciwnik. Gdy czas minie, pozostali decydują (tak/nie), czy zaliczył zadanie. Sukces: 200 pkt za każdą zadeklarowaną dla licytującego. Porażka: pozostali dostają po 100 pkt za każdą."],
  rok: ["Który rok", "Podaj rok premiery. Dokładny rok to 1000 pkt, każdy rok różnicy zabiera około 30 procent, ponad 8 lat to zero."],
  kolejnosc: ["Ułóż po kolei", "Ułóż 4 filmy od najstarszego do najnowszego. 250 pkt za każde dobre miejsce."],
  plakat: ["Plakat", "Plakat odsłania się stopniowo. Im wcześniej zgadniesz, tym więcej punktów."],
  aktorzy: ["Aktorzy", "Obsada pojawia się po kolei, od najmniej znanych nazwisk. Mniej nazwisk na ekranie to więcej punktów."],
  top: ["Top", "Najpierw układacie własną topkę tych samych filmów, od najlepszego do najgorszego (przeciągnij kafelki). Potem odtwarzacie topkę wylosowanego gracza. Za każdy film: pełne punkty za dokładne miejsce, o 1 mniej za każde miejsce pomyłki."],
  most: ["Filmrun", "Dostajecie dwóch znanych aktorów. Start otwiera profil pierwszego (Filmweb po polsku, IMDb po angielsku). Na tamtej stronie szukacie drugiego aktora, chodząc po filmach i obsadzie. Kto pierwszy wróci i wciśnie Stop, wygrywa rundę. Ruchy na Filmwebie/IMDb są poza naszą stroną — nie śledzimy ścieżki."],
};
const modeName = k => T((MODE_INFO[k] && MODE_INFO[k][0]) || k);
function modeHint(k, a) {
  const v = {need: a.need, have: a.have};
  return T({disabled: "Wyłączony przez admina dla tego pakietu.",
    questions: "Brak pytań do licytacji. Admin dodaje je w edytorze trybów.",
    frames: "Potrzebny co najmniej {need} film z kadrami (jest {have}).",
    movies: "Potrzeba co najmniej {need} filmów w pakiecie (jest {have}).",
    years: k === "kolejnosc" ? "Potrzeba {need} filmów z różnymi latami premiery (jest {have})." : "Potrzeba {need} filmów z rokiem premiery (jest {have}).",
    posters: "Za mało plakatów ({have}/{need}). Admin: edytor trybów, plakaty.",
    cast: "Za mało filmów z obsadą ({have}/{need}). Admin: edytor trybów, aktorzy.",
    quotes: "Za mało cytatów ({have}/{need}). Admin dopisuje je w edytorze trybów.",
    movies: "Za mało filmów w puli ({have}/{need})."}[a.reason] || "", v);
}
function normTitleKey(s) {
  s = String(s || "").replace(/ł/g, "l").replace(/Ł/g, "L").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  s = s.replace(/^(the|a|an) /, "").replace(/ (19|20)\d\d$/, "");
  return s.replace(/ /g, "");
}
function remakeTags(items) {
  const rows = Array.isArray(items) ? items : [];
  const n = rows.length;
  const keys = rows.map(m => {
    const ks = new Set();
    const title = normTitleKey(m && m.title);
    if (title) ks.add(title);
    const pl = normTitleKey(m && m.pl_title);
    if (pl) ks.add(pl);
    return ks;
  });
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (!keys[i].size || !keys[j].size) continue;
    for (const k of keys[i]) { if (keys[j].has(k)) { union(i, j); break; } }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const tags = {};
  for (const g of groups.values()) {
    const dated = g.filter(i => rows[i] && rows[i].year != null);
    const years = new Set(dated.map(i => Number(rows[i].year)));
    if (dated.length < 2 || years.size < 2) continue;
    dated.sort((a, b) => Number(rows[a].year) - Number(rows[b].year) || (rows[a].id || 0) - (rows[b].id || 0));
    if (dated.length === 2) {
      tags[rows[dated[0]].id] = "starszy";
      tags[rows[dated[1]].id] = "nowszy";
    } else {
      for (const i of dated) tags[rows[i].id] = String(Number(rows[i].year));
    }
  }
  return tags;
}
function applyRemakeTags(items) {
  const list = items || [];
  const tags = remakeTags(list);
  for (const i of list) {
    if (i && tags[i.id] && !i.remake) i.remake = tags[i.id];
  }
  return list;
}
function remakeSuffix(o) {
  const tag = o && o.remake;
  if (!tag) return "";
  const s = String(tag);
  const label = /^\d{4}$/.test(s) ? s : T(s);
  return ` <span class="remake">(${esc(label)})</span>`;
}
function titlesMode() {
  const v = (S && S.settings && S.settings.titles) || "ui";
  if (v === "pl" || v === "en" || v === "both") return v;
  return LANG === "pl" ? "both" : "en";
}
const showTitle = o => {
  if (!o) return "";
  const tag = remakeSuffix(o);
  const mode = titlesMode();
  const pl = o.pl_title || "", en = o.title || "";
  if (mode === "pl") return esc(pl || en) + tag;
  if (mode === "en") return esc(en || pl) + tag;
  if (pl && en && fold(pl) !== fold(en)) {
    const main = LANG === "en" ? en : pl;
    const sub = LANG === "en" ? pl : en;
    return `${esc(main)}${tag} <small class="orig">(${esc(sub)})</small>`;
  }
  return esc(en || pl) + tag;
};


function renderMeta() {
  $("#roommeta").innerHTML = `<span class="tag" style="--c:${S.pack.color}"><span class="dot"></span>${esc(packName(S.pack))}</span>
    <span class="tag dark">${T("pokój {code}", {code:S.code})}</span>${S.phase === "round" || S.phase === "reveal" ? `<span class="tag">${T("runda {r}/{n}", {r:S.round, n:S.rounds})}</span><span class="tag mode">${modeName(S.mode)}</span>` : ""}`;
}

function roundKey() {
  if (S.phase !== "round") return "";
  const claims = (S.claims || []).map(c => c.pid + c.st + c.vote + c.can).join(";");
  return [S.mode, S.stage, (S.cast || []).length, S.hint_year, S.sub, (S.found || []).length, JSON.stringify(S.mine ?? null),
    claims, S.can_claim, S.can_peek, !!S.solution, S.judge, S.turn, S.bid, (S.history || []).length, S.can_count, S.closing === null ? "" : "c",
    S.bidder, S.untimed, !!S.can_advance, S.timer_started, S.can_start_timer, S.can_verdict,
    S.can_start, S.can_stop, S.winner, (S.started_names || []).join(), (S.back_names || S.stopped_names || []).join()].join(",");
}
function shellKey() {
  if (S.phase === "lobby")
    return ["lobby", S.modes.join(), S.rounds, JSON.stringify(S.settings), S.players.map(p => p.id + p.name + p.online).join(), S.host].join("|");
  if (S.phase === "round") return ["round", S.round, roundKey()].join("|");
  if (S.phase === "reveal") return ["reveal", S.round, S.mode].join("|");
  return [S.phase, S.round].join("|");
}
function patchLive() {
  const b = $("#board");
  if (b) {
    const open = b.classList.contains("open");
    b.outerHTML = board();
    if (open) { $("#board")?.classList.add("open"); $("#sheetbg")?.classList.add("open"); }
    wireCommon();
  }
  const hs = $("#sheetbtn");
  if (hs) hs.textContent = T("{pts} pkt", {pts: me().score || 0});
}
function render() {
  renderMeta();
  document.body.classList.toggle("inround", S.phase === "round" || S.phase === "reveal");
  if (S.phase === "round") updateClock();
  const key = shellKey();
  if (key === lastKey) { patchLive(); return; }
  const v = $("#view");
  const keepInput = S.phase === "round" && lastKey.startsWith("round|" + S.round + "|");
  lastKey = key;
  if (S.phase === "lobby") return renderLobby(v);
  if (S.phase === "round") return renderRound(v, keepInput);
  if (S.phase === "reveal") return renderReveal(v);
  if (S.phase === "final") return renderFinal(v);
}

/* ---------------- ustawienia gry (lobby) ---------------- */
const SKEY = "kadr_settings";
const VOICE_OK = ["kadry", "zoom", "plakat", "aktorzy", "licytacja"];
const DEF_TIME = {kadry: 45, zoom: 30, plakat: 30, top: 45, rok: 25, kolejnosc: 40, most: 90};
const NUM_KEYS = new Set(["time", "lic_answer", "lic_bid", "final_x", "top_n", "top_own", "top_guess", "most_time"]);
let ADV_OPEN = false;

function saveSettings() {
  try { localStorage.setItem(SKEY, JSON.stringify({settings: S.settings, modes: S.modes, rounds: S.rounds})); } catch {}
}
function sendSetup(body) {
  const b = {modes: S.modes, settings: S.settings, ...body};
  return roomCall("setup", b).then(d => { if (!WS_MODE) { S = d; localT0 = performance.now(); } lastKey = ""; render(); saveSettings(); })
    .catch(e => toast(e.message));
}
const patch = p => sendSetup({settings: {...S.settings, ...p}});
function applySaved() {
  const flag = "kadr_applied_" + S.code;
  if (sessionStorage.getItem(flag)) return false;
  sessionStorage.setItem(flag, "1");
  let saved; try { saved = JSON.parse(localStorage.getItem(SKEY) || "null"); } catch { saved = null; }
  if (!saved || !saved.settings) return false;
  const modes = (saved.modes || []).filter(k => S.avail[k] && S.avail[k].ok);
  sendSetup({settings: saved.settings, modes: modes.length ? modes : S.modes, rounds: saved.rounds});
  return true;
}
const seg = (name, opts, val, dis) => `<div class="seg" role="group">${opts.map(([v, l]) =>
  `<button type="button" class="${String(v) === String(val) ? "on" : ""}" data-set="${name}" data-v="${v}" aria-pressed="${String(v) === String(val)}" ${dis ? "disabled" : ""}>${l}</button>`).join("")}</div>`;
const grp = (title, desc, body, cls = "") => `<div class="sgrp ${cls}"><div class="sh"><b>${title}</b>${desc ? `<span>${desc}</span>` : ""}</div>${body}</div>`;
const voiceUsed = c => S.modes.some(k => VOICE_OK.includes(k) && (c.mode_answer[k] || c.answer) === "voice");

function modePicker() {
  const host = isHost(), fixed = S.settings.order === "fixed";
  const list = fixed ? S.modes.concat(S.all_modes.filter(k => !S.modes.includes(k))) : S.all_modes;
  return `<div class="modes">${list.map(k => {
    const a = S.avail[k], on = S.modes.includes(k), idx = S.modes.indexOf(k);
    return `<label class="modecard ${a.ok ? "" : "off"} ${on ? "on" : ""}">
      <input type="checkbox" value="${k}" ${on ? "checked" : ""} ${a.ok && host ? "" : "disabled"}>
      <span class="mtop"><b>${fixed && on ? `<i class="ord">${idx + 1}</i>` : ""}${modeName(k)}</b><span class="tick" aria-hidden="true"></span></span>
      <span class="mdesc">${T(MODE_INFO[k][1])}</span>
      ${fixed && on && host && S.modes.length > 1 ? `<span class="mmove"><button type="button" class="pill small ghost" data-mv="${k}" data-d="-1" ${idx ? "" : "disabled"} aria-label="${T("wcześniej")}">&larr;</button><button type="button" class="pill small ghost" data-mv="${k}" data-d="1" ${idx < S.modes.length - 1 ? "" : "disabled"} aria-label="${T("później")}">&rarr;</button></span>` : ""}
      ${a.ok ? "" : `<span class="mhint">${esc(modeHint(k, a))}</span>`}</label>`;
  }).join("")}</div>`;
}

function settingsPanel() {
  const c = S.settings, host = isHost(), dis = !host, d = dis ? "disabled" : "";
  const sec = n => T("{n} s", {n});
  const timeOpts = [[0, T("domyślny")], ...[15, 20, 30, 45, 60].map(n => [n, sec(n)])];
  const titleModes = S.modes.filter(k => k !== "licytacja");
  const voiceModes = S.modes.filter(k => VOICE_OK.includes(k));
  const judgeDesc = {rotate: T("Co rundę ocenia kolejny gracz. Sędzia widzi odpowiedź i nie zgaduje."),
    host: T("Zawsze ocenia gospodarz. Gospodarz widzi odpowiedź i nie zgaduje."),
    vote: T("Wszyscy grają, a o każdym zgłoszeniu decyduje większość pozostałych.")}[c.judge];
  const basic = [
    grp(T("rundy"), c.per_mode ? T("Ustawione osobno dla trybów w opcjach zaawansowanych.") : T("Ile rund zagracie. Tryby przeplatają się."),
      c.per_mode ? `<span class="tag">${plRounds(S.rounds)}</span>`
        : `<div class="stepper small" role="group" aria-label="${T("Liczba rund")}"><button type="button" id="rminus" ${d} aria-label="${T("mniej rund")}">-</button><span class="n">${plRounds(S.rounds)}</span><button type="button" id="rplus" ${d} aria-label="${T("więcej rund")}">+</button></div>`),
    grp(T("czas na rundę"), c.time === -1 ? T("Bez odliczania. Runda czeka, aż gospodarz kliknie „zakończ rundę”.") : (c.time ? T("Każdy tryb dostaje {n} s. Kadry dzielą czas na 3 etapy.", {n: c.time}) : T("Każdy tryb ma swój czas, np. Kadry 3 x 15 s, Zoom 30 s. Gospodarz i tak może zakończyć rundę wcześniej.")),
      seg("time", [[-1, T("bez limitu")], ...timeOpts], [ -1, 0, 15, 20, 30, 45, 60].includes(c.time) ? c.time : "x", dis) +
      (c.time === -1 ? "" : `<label class="range"><input type="range" id="trange" min="10" max="120" step="5" value="${c.time || 30}" ${d} aria-label="${T("czas na rundę")}"><span id="tval">${c.time ? sec(c.time) : T("domyślny")}</span></label>`)),
    grp(T("tytuły filmów"), T("Jak pokazywać nazwy w rundzie, w wynikach i w podpowiedziach."),
      seg("titles", [["ui", T("jak język gry")], ["pl", T("tylko polski")], ["en", T("tylko angielski")], ["both", T("polski i oryginał")]], c.titles || "ui", dis)),
    S.modes.includes("licytacja") ? grp(T("licytacja"), T("Gracze licytują po kolei. Timer puszcza przeciwnik, a po czasie pozostali oceniają, czy zadanie zostało zaliczone. Czas odpowiedzi: {n} s.", {n: c.lic_answer}),
      `<div class="sub2"><span>${T("czas na odpowiedź")}</span>${seg("lic_answer", [20, 30, 45, 60].map(n => [n, sec(n)]), c.lic_answer, dis)}</div>
       <div class="sub2"><span>${T("czas na turę")}</span>${seg("lic_bid", [5, 10, 15, 20].map(n => [n, sec(n)]), c.lic_bid, dis)}</div>`) : "",
    S.modes.includes("top") ? grp(T("Top"), T("Za każdy film: {n} pkt za dokładne miejsce, o 1 mniej za każde miejsce pomyłki (minimum 0). Przy {n} filmach maksimum to {m}.", {n: c.top_n || 5, m: (c.top_n || 5) * (c.top_n || 5)}),
      `<div class="sub2"><span>${T("liczba filmów")}</span>${seg("top_n", [3,4,5,6,7,8].map(n => [n, String(n)]), c.top_n || 5, dis)}</div>
       <div class="sub2"><span>${T("czas na własną topkę")}</span>${seg("top_own", [[-1, T("bez limitu")], ...[30,45,60,90].map(n => [n, sec(n)])], c.top_own ?? 45, dis)}</div>
       <div class="sub2"><span>${T("czas na zgadywanie")}</span>${seg("top_guess", [[-1, T("bez limitu")], ...[30,45,60,90].map(n => [n, sec(n)])], c.top_guess ?? 45, dis)}</div>`) : "",
  ].join("");
  const sel = (attr, k, opts, val) => `<select class="input sel" data-${attr}="${k}" ${d}>${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const adv = [
    grp(T("czas dla trybu"), T("Nadpisuje czas ogólny tylko dla wybranego trybu."),
      `<div class="mgrid">${titleModes.map(k => `<label><span>${modeName(k)}</span>${sel("mt", k, [[0, c.time === -1 ? T("ogólny (bez limitu)") : (k === "aktorzy" ? T("ogólny (6 s na aktora)") : T("ogólny ({n} s)", {n: c.time || DEF_TIME[k]}))], [-1, T("bez limitu")], ...[15, 20, 30, 45, 60, 90].map(n => [n, sec(n)])], c.mode_time[k] || 0)}</label>`).join("") || `<span class="muted">-</span>`}</div>`),
    grp(T("rundy na tryb"), T("Zamiast ogólnej liczby rund: ile rund każdego trybu."),
      `<label class="toggle"><input type="checkbox" id="permode" ${c.per_mode ? "checked" : ""} ${d}><span>${T("ustaw osobno")}</span></label>
       ${c.per_mode ? `<div class="mgrid">${S.modes.map(k => `<label><span>${modeName(k)}</span>${sel("mr", k, Array.from({length: 10}, (_, i) => [i + 1, String(i + 1)]), c.mode_rounds[k] || 1)}</label>`).join("")}</div>` : ""}`),
    grp(T("podpowiedzi tytułów"), T("Lista tytułów pojawia się podczas wpisywania."),
      `<label class="toggle"><input type="checkbox" id="hints" ${c.hints ? "checked" : ""} ${d}><span>${c.hints ? T("włączone") : T("wyłączone")}</span></label>`),
    grp(T("finał"), T("Punkty w ostatniej rundzie są mnożone."), seg("final_x", [[1, "x1"], [2, "x2"], [3, "x3"]], c.final_x, dis)),
  ].join("");
  if (S.kind === "most") {
    const roundsOnly = grp(T("rundy"), T("Ile rund zagracie. W każdej nowa para aktorów."),
      `<div class="stepper small" role="group" aria-label="${T("Liczba rund")}"><button type="button" id="rminus" ${d} aria-label="${T("mniej rund")}">-</button><span class="n">${plRounds(S.rounds)}</span><button type="button" id="rplus" ${d} aria-label="${T("więcej rund")}">+</button></div>`);
    return `<div class="panel setup filmrun-setup" id="setup">
      <div class="setup-head"><h3 style="font-size:30px">Filmrun</h3>${host ? "" : `<span class="tag">${T("ustawia gospodarz")}</span>`}</div>
      <p class="filmrun-sub">${T("Wikipedia run, ale o filmach")}</p>
      <ol class="fr-rules">
        <li>${T("Dostajecie dwóch znanych aktorów i ich zdjęcia. Start otwiera profil pierwszego (Filmweb po polsku, IMDb po angielsku).")}</li>
        <li>${T("Bez limitu czasu szukacie drugiego aktora na tamtej stronie, chodząc po filmach i obsadzie.")}</li>
        <li>${T("Ruchy na Filmwebie i IMDb są poza naszą stroną — nie śledzimy, którą drogą poszliście. Wygrywa ten, kto pierwszy wróci i wciśnie Stop.")}</li>
        <li>${T("Zwycięzca rundy dostaje 1000 pkt (razy mnożnik finału, jeśli jest). Potem kolejna runda z nową parą, aż do ustawionej liczby rund.")}</li>
      </ol>
      <div class="sgrid">${roundsOnly}</div>
    </div>`;
  }
  return `<div class="panel setup" id="setup">
    <div class="setup-head"><h3 style="font-size:30px">${T("ustawienia gry")}</h3>${host ? "" : `<span class="tag">${T("ustawia gospodarz")}</span>`}</div>
    <div class="sgrp"><div class="sh"><b>${T("tryby gry")}</b><span>${host ? (S.pack && S.pack.id === "custom" ? T("Zaznacz tryby. Filmy biorą się z wybranych pakietów.") : T("Zaznacz tryby. Filmy losujemy tylko z tego pakietu.")) : T("Gospodarz wybiera tryby.")}</span></div>
      ${seg("order", [["mix", T("losowa kolejność")], ["fixed", T("moja kolejność")]], c.order, dis)}</div>
    ${modePicker()}
    <div class="sgrid">${basic}</div>
    <details class="adv" ${ADV_OPEN ? "open" : ""}><summary>${T("zaawansowane")}</summary><div class="sgrid">${adv}</div></details>
  </div>`;
}

function renderLobby(v) {
  if (isHost() && applySaved()) return;
  const link = `${location.origin}/r/${S.code}`;
  v.innerHTML = `<div class="lobby">
    <div class="panel">
      <p class="muted" style="margin:0 0 4px;font-weight:700">${T("kod pokoju")}</p>
      <div class="bigcode">${S.code}</div>
      <p style="margin:14px 0 0">${T("Wyślij znajomym link albo kod. Wpisują go na stronie głównej.")}</p>
      <div class="share"><input class="input" readonly value="${esc(link)}" id="link"><button class="pill" id="copy">${T("kopiuj link")}</button></div>
    </div>
    <div class="panel">
      <h3 style="font-size:30px">${T("gracze")} <span class="ast">${S.players.length}</span></h3>
      ${playerList(S.players)}
    </div>
    ${settingsPanel()}
    <div class="dock lobbydock">${isHost()
        ? `<button class="pill orange big" style="width:100%" id="start">${T("zaczynamy")} · ${plRounds(S.rounds)}</button>`
        : `<div class="wait"><span class="spin"></span>${T("Czekamy, aż gospodarz zacznie...")}</div>`}</div>
    </div>`;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast(T("Skopiowano link")); } catch { $("#link").select(); document.execCommand("copy"); toast(T("Skopiowano link")); } };
  const adv = v.querySelector(".adv"); if (adv) adv.ontoggle = () => { ADV_OPEN = adv.open; };
  if (!isHost()) return;
  $("#start").onclick = () => act("start");
  const sp = $("#setup");
  if ($("#rminus")) { $("#rminus").onclick = () => sendSetup({rounds: S.rounds - 1}); $("#rplus").onclick = () => sendSetup({rounds: S.rounds + 1}); }
  sp.querySelectorAll("[data-set]").forEach(b => b.onclick = () => {
    const k = b.dataset.set; patch({[k]: NUM_KEYS.has(k) ? +b.dataset.v : b.dataset.v});
  });
  const tr = $("#trange");
  if (tr) {
    tr.oninput = () => { $("#tval").textContent = T("{n} s", {n: tr.value}); };
    tr.onchange = () => patch({time: +tr.value});
  }
  sp.querySelectorAll("[data-mt]").forEach(x => x.onchange = () => patch({mode_time: {...S.settings.mode_time, [x.dataset.mt]: +x.value}}));
  sp.querySelectorAll("[data-ma]").forEach(x => x.onchange = () => { const ma = {...S.settings.mode_answer}; if (x.value) ma[x.dataset.ma] = x.value; else delete ma[x.dataset.ma]; patch({mode_answer: ma}); });
  sp.querySelectorAll("[data-mr]").forEach(x => x.onchange = () => patch({mode_rounds: {...S.settings.mode_rounds, [x.dataset.mr]: +x.value}}));
  if ($("#permode")) $("#permode").onchange = e => patch({per_mode: e.target.checked});
  if ($("#hints")) $("#hints").onchange = e => patch({hints: e.target.checked});
  sp.querySelectorAll("[data-mv]").forEach(b => b.onclick = e => {
    e.preventDefault();
    const ms = S.modes.slice(), i = ms.indexOf(b.dataset.mv), j = i + +b.dataset.d;
    [ms[i], ms[j]] = [ms[j], ms[i]]; sendSetup({modes: ms});
  });
  sp.querySelectorAll(".modecard input").forEach(cb => cb.onchange = () => {
    const picked = [...sp.querySelectorAll(".modecard input:checked")].map(x => x.value);
    if (!picked.length) { cb.checked = true; return toast(T("Zostaw co najmniej jeden tryb")); }
    const modes = S.modes.filter(k => picked.includes(k)).concat(picked.filter(k => !S.modes.includes(k)));
    sendSetup({modes});
  });
}

function feedText(f) {
  if (f.text) return f.text;
  return T({join:"{name} dołącza", guess:"{name} zgaduje (+{pts})", leave:"{name} wychodzi", bid:"{name} licytuje: {pts}",
    bidwin:"{name} wygrywa licytację: {pts}", answered:"{name} odpowiada", claim:"{name}: Mam!", wrong:"{name}: pudło",
    pass:"{name} pasuje"}[f.k] || "{name}", {name:f.name, pts:f.pts});
}
function me() { return S.players.find(p => p.id === S.me) || {}; }

const board = () => `<aside class="panel board" id="board"><div class="sheethead"><h3>${T("wyniki")}</h3><button type="button" class="pill small ghost sheetclose" id="sheetx">${T("zamknij")}</button></div>${playerList(S.players, {score:true, status:true})}
  <div class="feed">${S.feed.slice().reverse().map(f => `<span>${esc(feedText(f))}</span>`).join("")}</div>
  </aside>`;
const hud = () => `<div class="hud"><span class="hr">${T("runda {r}/{n}", {r:S.round, n:S.rounds})}</span><span class="hm">${modeName(S.mode)}</span>${S.mult > 1 ? `<span class="hx">x${S.mult}</span>` : ""}
  ${S.phase === "round" && S.mode !== "most" ? `<span class="hc" id="hclock"></span>` : ""}<button type="button" class="hs" id="sheetbtn" aria-label="${T("wyniki")}">${T("{pts} pkt", {pts: me().score || 0})}</button></div>`;
const bar = () => S.untimed ? "" : `<div class="timeline one"><div class="cur"><i id="bar1"></i></div></div>`;
function orderWrap(listHtml, topLab, botLab) {
  return `<div class="orderwrap"><div class="olab-top">${esc(topLab)}</div>${listHtml}<div class="olab-bot">${esc(botLab)}</div></div>`;
}
function cmpCol(title, items, marks, year) {
  const lis = (items || []).map((i, n) => `<li class="${(marks && marks[n]) || ""}">${i.img && !year ? `<img src="${i.img}" alt="">` : (i.img && year ? `<img src="${i.img}" alt="">` : "")}<span class="tpos">${n + 1}</span><span class="ot">${showTitle(i)}</span>${year && i.year ? `<span class="oy">${i.year}</span>` : ""}</li>`).join("");
  return `<div class="cmp-col"><h3>${title}</h3><ol class="orderlist done cmp-list">${lis || `<li class="miss">${T("brak układu")}</li>`}</ol></div>`;
}
function hostDock() {
  if (!isHost() || S.phase !== "round" || S.mode === "most") return "";
  const bits = [];
  if (S.can_advance && S.mode === "kadry") bits.push(`<button type="button" class="pill ghost big" id="adv">${T("kolejny kadr")}</button>`);
  else if (S.can_advance && S.mode === "aktorzy") bits.push(`<button type="button" class="pill ghost big" id="adv">${T("kolejna osoba")}</button>`);
  else if (S.can_advance && S.mode === "top") bits.push(`<button type="button" class="pill ghost big" id="adv">${T("przejdź do zgadywania")}</button>`);
  bits.push(`<button type="button" class="pill ${S.untimed ? "orange" : "ghost"} ${bits.length ? "" : "big"}" id="endround">${S.untimed ? T("zakończ rundę") : T("pomiń rundę")}</button>`);
  return `<div class="hostbar">${bits.join("")}</div>`;
}
const guessForm = ph => `<form class="guess" id="gf" autocomplete="off"><ul class="ac hidden" id="ac"></ul>
  <input class="input" id="g" placeholder="${ph || T("Jaki to film?")}" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="${T("Tytuł filmu")}">
  <button class="pill orange big">${T("zgaduję")}</button></form><div class="feedback" id="fb"></div>`;
const gotBox = (m, sub) => `<div class="gotit"><span class="display">+${m.got.points}</span><div><b>${T("Brawo, zgadłeś!")}</b><br><span style="opacity:.75">${sub || T("Czekamy na resztę.")}</span></div></div>`;
const waitBox = (txt, sub) => `<div class="gotit wait-box"><div><b>${txt}</b><br><span style="opacity:.75">${sub || T("Czekamy na resztę.")}</span></div></div>`;
let ORDER = {round: 0, ids: []}, BID = {round: 0, n: 1};

/* mówione odpowiedzi: zgłoszenia, sędzia, głosowanie */
function solutionCard() {
  const o = S.solution; if (!o) return "";
  return `<div class="solution"><span class="muted">${T("poprawna odpowiedź")}</span><b>${esc(o.title)}</b>${o.pl_title && fold(o.pl_title) !== fold(o.title) ? `<span>${esc(o.pl_title)}</span>` : ""}<span class="sy">${o.year || ""}</span></div>`;
}
function claimList() {
  const cl = S.claims || [];
  if (!cl.length) return `<p class="muted small-note">${T("Nikt jeszcze nie zgłosił odpowiedzi.")}</p>`;
  return `<ol class="claims">${cl.map(c => `<li class="st-${c.st}"><span class="cn">${esc(c.name)}</span><span class="cs">${T("{n} s", {n: c.secs})}</span>
    ${c.st === "ok" ? `<span class="badge ok">${T("dobrze")}</span>` : c.st === "no" ? `<span class="badge no">${T("źle")}</span>`
      : c.can ? `<span class="verdict"><button type="button" class="pill vbad ${c.vote === false ? "on" : ""}" data-j="${c.pid}" data-v="0">${T("źle")}</button><button type="button" class="pill vok ${c.vote === true ? "on" : ""}" data-j="${c.pid}" data-v="1">${T("dobrze")}</button></span>`
      : `<span class="badge wait">${T("czeka")}</span>`}</li>`).join("")}</ol>`;
}
function voiceDock(m) {
  const vote = S.judge_mode === "vote", judging = !vote && S.judge === S.me && S.players.length > 1;
  const mine = (S.claims || []).find(c => c.pid === S.me && c.st === "wait");
  let top = "";
  if (judging) top = `<div class="judgebox"><b>${T("Jesteś sędzią")}</b><span>${T("Słuchaj odpowiedzi i oceniaj po kolei. Nie zgadujesz w tej rundzie.")}</span></div>`;
  else if (m.got) top = gotBox(m);
  else if (mine) top = waitBox(T("Mów tytuł na głos!"), vote ? T("Pozostali głosują.") : T("Ocenia: {name}", {name: esc(S.judge_name || "")}));
  else if (S.can_claim) top = `<button type="button" class="pill orange claimbtn" id="claim">${T("Mam! Odpowiadam")}</button>`;
  else if (!S.plays) top = waitBox(T("Znasz odpowiedź"), T("W tej rundzie tylko oceniasz."));
  else top = waitBox(T("Czas minął"), T("Czekamy na ocenę zgłoszeń."));
  const peek = S.can_peek ? `<button type="button" class="pill ghost small" id="peek">${T("pokaż odpowiedź (nie zgadujesz w tej rundzie)")}</button>` : "";
  const who = vote ? T("ocenia większość graczy") : T("sędzia: {name}", {name: esc(S.judge_name || "")});
  return `${top}${solutionCard()}<div class="claimwrap"><div class="claimhead"><b>${T("kolejność zgłoszeń")}</b><span class="muted">${who}</span></div>${claimList()}${peek}</div>`;
}

function renderRound(v, keepInput) {
  const prev = keepInput ? ($("#g")?.value || "") : "";
  const prevY = keepInput ? ($("#y")?.value || "") : "";
  const hadFocus = keepInput && ["g", "y"].includes(document.activeElement?.id);
  const m = me(), mode = S.mode;
  let stage = "", input = "";
  const titleInput = () => S.voice ? voiceDock(m) : m.got ? gotBox(m) : guessForm();
  if (mode === "kadry") {
    const lvl = LEVELS[S.stage];
    stage = `<div class="stage"><img src="/frame/${S.frames[S.stage]}.jpg" alt="${T("Kadr z filmu")}"><span class="lvl">${T("kadr {lvl} · do {pts} pkt", {lvl:lvl[1], pts:lvl[2] * (S.mult || 1)})}</span><span class="clock" id="clock"></span></div>
      <div class="timeline" id="tl">${LEVELS.map((l, i) => `<div class="${i === S.stage ? "cur" : ""}"><i></i></div>`).join("")}</div>
      <div class="timeline-labels">${LEVELS.map((l, i) => `<span class="${i <= S.stage ? "on" : ""}">${l[1]}</span>`).join("")}</div>`;
    input = S.voice ? voiceDock(m) : m.got ? gotBox(m, LANG === "en" ? T("Na kadrze {lvl} po {secs} s. Czekamy na resztę.", {lvl: LEVELS[m.got.stage][1], secs: m.got.secs}) : `Na kadrze ${LEVELS[m.got.stage][1]}m po ${m.got.secs} s. Czekamy na resztę.`) : guessForm();
  } else if (mode === "zoom") {
    stage = `<div class="stage zoom"><img id="zimg" src="${S.img}" alt="${T("Fragment kadru")}" style="transform-origin:${S.ox * 100}% ${S.oy * 100}%"><span class="lvl">${T("zoom · kadr się oddala")}</span><span class="clock" id="clock"></span></div>${bar()}`;
    input = titleInput();
  } else if (mode === "plakat") {
    stage = `<div class="stage posterstage"><canvas id="pc" width="400" height="600" aria-label="${T("Plakat filmu")}"></canvas><span class="lvl">${S.style === "pix" ? T("plakat · wyostrza się") : T("plakat · odsłania się")}</span><span class="clock" id="clock"></span></div>${bar()}`;
    input = titleInput();
  } else if (mode === "aktorzy") {
    stage = `<div class="stage textstage"><span class="lvl">${T("aktorzy · {k} z {n}", {k:S.cast.length, n:S.cast_total})}</span><span class="clock" id="clock"></span>
      <ol class="castlist">${Array.from({length:S.cast_total}, (_, i) => actorLi(S.cast[i])).join("")}</ol>
      <p class="muted small-note">${T("od najmniej do najbardziej znanych")}</p></div>${bar()}`;
    input = titleInput();
  } else if (mode === "top") {
    if (ORDER.round !== S.round || ORDER.sub !== S.sub) ORDER = {round: S.round, sub: S.sub, ids: (S.mine || S.items.map(i => i.id))};
    const byId = Object.fromEntries(S.items.map(i => [i.id, i]));
    const ids = S.mine || ORDER.ids;
    const label = S.sub === "guess"
      ? T("ułóż topkę tak, jak {name}", {name: (S.target && S.target.name) || "?"})
      : T("twoja topka · od najlepszego do najgorszego");
    const topList = `<ol class="orderlist toplist bigtop" id="toplist">${ids.map((id, i) => `<li draggable="false" data-i="${i}" data-id="${id}">
        <span class="tpos">${i + 1}</span>
        <span class="ot">${byId[id] ? showTitle(byId[id]) : ""}</span>
      </li>`).join("")}</ol>`;
    stage = `<div class="stage textstage orderstage topstage"><span class="lvl">${esc(label)}</span><span class="clock" id="clock"></span>
      <p class="muted small-note">${T("Chwyć kafelek i przeciągnij. Za każdy film: {n} pkt za dokładne miejsce, o 1 mniej za każde miejsce pomyłki.", {n: S.top_n || S.items.length})}</p>
      ${orderWrap(topList, T("najlepszy"), T("najgorszy"))}</div>${bar()}`;
    input = S.mine ? waitBox(S.sub === "guess" ? T("Zgadnięcie wysłane") : T("Topka wysłana, czekamy na resztę"))
      : `<button class="pill orange big" id="osend" style="width:100%">${T("zatwierdzam topkę")}</button>`;
  } else if (mode === "most") {
    [stage, input] = renderMost(m);
  } else if (mode === "rok") {
    stage = `<div class="stage textstage yearstage">${S.img ? `<img class="thumb" src="${S.img}" alt="">` : ""}<span class="lvl">${T("który rok?")}</span><span class="clock" id="clock"></span>
      <h2 class="ytitle">${showTitle(S.movie)}</h2></div>${bar()}`;
    input = S.mine ? waitBox(T("Twoja odpowiedź: {y}", {y:S.mine}))
      : `<form class="guess" id="yf"><input class="input" id="y" type="number" inputmode="numeric" min="1900" max="2030" placeholder="${T("np. 1984")}" aria-label="${T("Rok premiery")}"><button class="pill orange big">${T("odpowiadam")}</button></form>`;
  } else if (mode === "kolejnosc") {
    applyRemakeTags(S.items);
    if (ORDER.round !== S.round) ORDER = {round: S.round, ids: S.items.map(i => i.id)};
    const byId = Object.fromEntries(S.items.map(i => [i.id, i]));
    const ids = S.mine || ORDER.ids;
    const ordList = `<ol class="orderlist">${ids.map((id, i) => `<li>${byId[id].img ? `<img src="${byId[id].img}" alt="">` : `<span class="noimg"></span>`}<span class="ot">${showTitle(byId[id])}</span>
        ${S.mine ? "" : `<span class="ob"><button type="button" class="pill small" data-up="${i}" ${i ? "" : "disabled"} aria-label="${T("wyżej")}">&uarr;</button><button type="button" class="pill small" data-dn="${i}" ${i < ids.length - 1 ? "" : "disabled"} aria-label="${T("niżej")}">&darr;</button></span>`}</li>`).join("")}</ol>`;
    stage = `<div class="stage textstage orderstage"><span class="lvl">${T("od najstarszego do najnowszego")}</span><span class="clock" id="clock"></span>
      ${orderWrap(ordList, T("najstarszy"), T("najnowszy"))}</div>${bar()}`;
    input = S.mine ? waitBox(T("Kolejność wysłana")) : `<button class="pill orange big" id="osend" style="width:100%">${T("zatwierdzam kolejność")}</button>`;
  } else if (mode === "licytacja") {
    [stage, input] = renderAuction(m);
  }
  v.innerHTML = `<div class="game"><div class="gmain">${hud()}${stage}<div class="dock" id="dock">${input}${hostDock()}</div></div>${board()}</div><div class="sheetbg" id="sheetbg"></div>`;
  wireCommon();
  updateClock(true);
  const fine = matchMedia("(pointer:fine)").matches;
  if ($("#gf")) setupGuess(prev, hadFocus || (!keepInput && fine), mode === "licytacja");
  if ($("#yf")) {
    const y = $("#y"); y.value = prevY; if (hadFocus || (!keepInput && fine)) y.focus({preventScroll: true});
    $("#yf").onsubmit = async e => { e.preventDefault(); const n = parseInt(y.value, 10); if (!(n >= 1880 && n <= 2100)) return toast(T("Podaj rok, np. 1984")); await guessAct({year:n}); };
  }
  if ((mode === "kolejnosc" || mode === "top") && !S.mine) {
    if (mode === "kolejnosc") v.querySelectorAll("[data-up],[data-dn]").forEach(b => b.onclick = () => {
      const i = +(b.dataset.up ?? b.dataset.dn), j = b.dataset.up !== undefined ? i - 1 : i + 1;
      [ORDER.ids[i], ORDER.ids[j]] = [ORDER.ids[j], ORDER.ids[i]]; lastKey = ""; render();
    });
    if ($("#osend")) $("#osend").onclick = () => guessAct({order: ORDER.ids});
    if (mode === "top") wireTopDrag();
  }
  if (mode === "most") wireMost();
  if ($("#claim")) $("#claim").onclick = () => guessAct({claim: true});
  if ($("#peek")) $("#peek").onclick = () => { if (confirm(T("Zobaczysz odpowiedź i nie zdobędziesz punktów w tej rundzie. Na pewno?"))) guessAct({peek: true}); };
  v.querySelectorAll("[data-j]").forEach(b => b.onclick = () => guessAct({judge: b.dataset.j, verdict: b.dataset.v === "1"}));
  if (mode === "licytacja" && S.sub === "bid" && S.turn === S.me) {
    const min = S.bid + 1;
    if (BID.round !== S.round || BID.n < min) BID = {round: S.round, n: min};
    const n = $("#bidn"), upd = d => { BID.n = Math.max(min, Math.min(S.total, BID.n + d)); n.textContent = BID.n; $("#bsend").textContent = T("podbijam do {n}", {n: BID.n}); };
    upd(0); $("#bminus").onclick = () => upd(-1); $("#bplus").onclick = () => upd(1);
    $("#bsend").onclick = () => guessAct({bid: BID.n});
    $("#bpass").onclick = () => guessAct({pass: true});
  }
  if ($("#ltimer")) $("#ltimer").onclick = () => guessAct({start_timer: true});
  if ($("#vyes")) $("#vyes").onclick = () => guessAct({verdict: true});
  if ($("#vno")) $("#vno").onclick = () => guessAct({verdict: false});
}
function wireCommon() {
  if ($("#skip")) $("#skip").onclick = () => act("next");
  if ($("#endround")) $("#endround").onclick = () => act("next");
  if ($("#adv")) $("#adv").onclick = () => act("advance");
  const open = o => { $("#board")?.classList.toggle("open", o); $("#sheetbg")?.classList.toggle("open", o); };
  if ($("#sheetbtn")) $("#sheetbtn").onclick = () => open(true);
  if ($("#sheetx")) $("#sheetx").onclick = () => open(false);
  if ($("#sheetbg")) $("#sheetbg").onclick = () => open(false);
}

function renderAuction(m) {
  const secs = S.answer_seconds;
  const notice = `<p class="notice30">${T("Masz tylko {n} s na odpowiedź", {n: secs})}</p>`;
  const rules = `<details class="rules" ${S.sub === "bid" ? "open" : ""}><summary>${T("zasady licytacji")}</summary>${notice}<ol>
    <li>${T("Gra losuje, kto zaczyna. Potem gracze po kolei: podbijasz ofertę albo pasujesz. Na ruch masz {n} s, potem automatyczny pas.", {n: S.bid_seconds})}</li>
    <li>${T("Licytacja kończy się, gdy zostanie jedna osoba. Wygrywa najwyższa oferta.")}</li>
    <li>${T("Zwycięzca wymienia odpowiedzi na głos. Timer puszcza przeciwnik (nie startuje sam). Na wypowiedź jest {n} s.", {n: secs})}</li>
    <li>${T("Po czasie pozostali decydują (tak/nie), czy zaliczył zadanie. Sukces: licytujący dostaje 200 pkt za każdą zadeklarowaną. Porażka: każdy z pozostałych dostaje po 100 pkt za każdą.")}</li></ol></details>`;
  const hist = (S.history || []).length ? `<p class="muted small-note">${S.history.map(h => h.bid ? T("{name}: {n}", {name: esc(h.name), n: h.bid}) : T("{name}: pas", {name: esc(h.name)})).join(" · ")}</p>` : "";
  if (S.sub === "bid") {
    const myTurn = S.turn === S.me;
    const order = `<ol class="border">${S.order.map(o => `<li class="${o.id === S.turn ? "cur" : ""} ${o.passed ? "passed" : ""} ${o.online ? "" : "off"}">${esc(o.name)}${o.id === S.leader ? ` <b>${S.bid}</b>` : ""}</li>`).join("")}</ol>`;
    const stage = `<div class="stage textstage auction"><span class="lvl">${T("licytacja · tury")}</span><span class="clock" id="clock"></span>
      <h2 class="ytitle qprompt">${esc(S.prompt)}</h2>
      <p class="starter">${T("Zaczyna: {name}", {name: esc(S.starter || "")})}</p>
      <div class="curbid"><span class="muted">${T("aktualna oferta")}</span><b class="bigbid">${S.bid || 0}</b><span>${S.leader_name ? esc(S.leader_name) : T("brak ofert")}</span></div>
      ${order}${hist}${rules}</div>`;
    const dock = myTurn
      ? `<div class="turnbox"><b>${T("Twoja tura")}</b><span class="tclock" id="bigclock"></span></div>
         ${S.bid >= S.total ? "" : `<div class="bidrow"><div class="stepper" role="group"><button type="button" id="bminus" aria-label="${T("mniej")}">-</button><span class="n" id="bidn">1</span><button type="button" id="bplus" aria-label="${T("więcej")}">+</button></div></div>`}
         <div class="bidbtns"><button type="button" class="pill ghost big" id="bpass">${T("pas")}</button>${S.bid >= S.total ? "" : `<button type="button" class="pill orange big" id="bsend">${T("podbijam")}</button>`}</div>`
      : `<div class="turnbox wait-turn"><span>${T("Teraz licytuje")}</span><b>${esc(S.turn_name || "")}</b><span class="tclock" id="bigclock"></span></div>`;
    return [stage, dock];
  }
  const mine = S.bidder === S.me;
  const sub = S.sub || "wait_timer";
  const stageHead = `<div class="stage textstage auction loose"><span class="lvl">${T("licytacja · {name} odpowiada", {name: esc(S.bidder_name)})}</span>${sub === "timed" ? `<span class="clock" id="clock"></span>` : ""}
    <h2 class="ytitle qprompt">${esc(S.prompt)}</h2>
    <div class="curbid loose-bid"><span class="muted">${T("deklaracja")}</span><b class="bigbid">${S.bid}</b></div>`;
  if (sub === "wait_timer") {
    const stage = `${stageHead}
      <p class="notice30 big">${T("Timer nie startuje sam. Puszcza go drugi gracz (albo pozostali, gdy gra więcej osób).")}</p>
      ${hist}</div>`;
    const dock = S.can_start_timer
      ? `<button type="button" class="pill orange big" id="ltimer">${T("Puść timer ({n} s)", {n: secs})}</button>`
      : waitBox(mine ? T("Czekasz na timer") : T("Czekamy"), T("Timer puszcza przeciwnik."));
    return [stage, dock];
  }
  if (sub === "verdict") {
    const votes = (S.verdicts || []).map(v => `<li class="${v.vote === true ? "ok" : v.vote === false ? "miss" : ""}">${esc(v.name)}: ${v.vote === true ? T("tak") : v.vote === false ? T("nie") : T("czeka")}</li>`).join("");
    const stage = `${stageHead}
      <p class="notice30 big">${T("Czas minął. Pozostali gracze decydują, czy {name} zaliczył zadanie (wymienił {n} odpowiedzi).", {name: esc(S.bidder_name), n: S.bid})}</p>
      <ul class="results">${votes}</ul>${hist}</div>`;
    const dock = S.can_verdict && S.my_verdict === undefined
      ? `<div class="verdict-row"><button type="button" class="pill ghost big" id="vno">${T("nie zaliczył")}</button><button type="button" class="pill orange big" id="vyes">${T("zaliczył")}</button></div>`
      : waitBox(S.my_verdict === undefined ? T("Czekamy na ocenę") : (S.my_verdict ? T("Twój głos: tak") : T("Twój głos: nie")), T("Gdy wszyscy ocenią, runda się kończy."));
    return [stage, dock];
  }
  const stage = `${stageHead}
    <p class="notice30 big">${mine ? T("Wymieniaj odpowiedzi na głos. Masz {n} s.", {n: secs}) : T("{name} wymienia odpowiedzi. Masz {n} s na słuchanie, potem ocenisz, czy zaliczył.", {name: esc(S.bidder_name), n: secs})}</p>
    <div class="bigclock" id="bigclock"></div>
    ${hist}</div>`;
  const dock = mine ? waitBox(T("Mów odpowiedzi na głos!"), T("Po czasie ocenią pozostali."))
    : waitBox(T("Słuchaj odpowiedzi"), T("Po sygnale ocenisz, czy zadanie zostało zaliczone."));
  return [stage, dock];
}

async function guessAct(body) {
  try { await roomCall("guess", body); lastKey = ""; if (!WS_MODE) poll(); }
  catch (e) { toast(e.message); }
}

let drawn = "";
function updateClock(force) {
  if (!S || S.phase !== "round") return;
  const el = S.elapsed + (performance.now() - localT0) / 1000;
  const c = $("#clock"), hc = $("#hclock"), bc = $("#bigclock");
  const setT = t => { const x = Math.max(0, Math.ceil(t)) + " s"; if (c) c.textContent = x; if (hc) hc.textContent = x; if (bc) { bc.textContent = x; bc.classList.toggle("low", t <= 10); } };
  const auctionTick = S.mode === "licytacja" && (S.sub === "bid" || S.sub === "timed");
  const timed = auctionTick || (!(S.untimed || S.duration == null) && S.mode !== "most");
  const visual = S.mode === "zoom" || S.mode === "plakat";
  if (S.mode === "most" || (S.mode === "licytacja" && !auctionTick)) {
    if (c) c.textContent = "";
    if (hc) hc.textContent = "";
    return;
  }
  if (!timed) {
    if (c) c.textContent = "";
    if (hc) hc.textContent = T("bez limitu");
    if (visual) {
      const dur = DEF_TIME[S.mode] || 30, f = Math.max(0, Math.min(1, el / dur));
      if (S.mode === "zoom") { const z = $("#zimg"); if (z) z.style.transform = `scale(${(1 + 5 * Math.pow(1 - f, 1.5)).toFixed(3)})`; }
      if (S.mode === "plakat") drawPoster(f, force);
    }
    return;
  }
  if (S.mode === "kadry") {
    setT(S.stage_seconds * 3 - el);
    document.querySelectorAll("#tl i").forEach((bar, i) => {
      const f = Math.max(0, Math.min(1, (el - i * S.stage_seconds) / S.stage_seconds));
      bar.style.width = (f * 100) + "%";
    });
    return;
  }
  const dur = S.duration || DEF_TIME[S.mode] || 30, f = Math.max(0, Math.min(1, el / dur));
  setT(dur - el);
  const b = $("#bar1"); if (b) b.style.width = (f * 100) + "%";
  if (S.mode === "zoom") { const z = $("#zimg"); if (z) z.style.transform = `scale(${(1 + 5 * Math.pow(1 - f, 1.5)).toFixed(3)})`; }
  if (S.mode === "plakat") drawPoster(f, force);
}

let posterImg = null;
function drawPoster(f, force) {
  const cv = $("#pc"); if (!cv) return;
  if (!posterImg || posterImg.dataset.src !== S.img) { posterImg = new Image(); posterImg.dataset.src = S.img; posterImg.onload = () => drawPoster(f, true); posterImg.src = S.img; return; }
  if (!posterImg.complete || !posterImg.naturalWidth) return;
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  if (S.style === "pix") {
    const steps = [4, 6, 9, 13, 18, 26, 36, 52, 75, 110, 400];
    const k = steps[Math.min(steps.length - 1, Math.floor(f * steps.length))];
    const key = S.img + "p" + k; if (key === drawn && !force) return; drawn = key;
    const w = Math.max(2, Math.round(k * W / 400)), h = Math.max(3, Math.round(w * H / W));
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
    tmp.getContext("2d").drawImage(posterImg, 0, 0, w, h);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(tmp, 0, 0, W, H);
  } else {
    const cols = 4, rows = 6, n = cols * rows;
    const shown = Math.min(n, 1 + Math.floor(f * n * 0.95));
    const key = S.img + "t" + shown; if (key === drawn && !force) return; drawn = key;
    let s = S.seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const order = [...Array(n).keys()].sort(() => rnd() - .5);
    ctx.fillStyle = "#1B1712"; ctx.fillRect(0, 0, W, H);
    const tw = W / cols, th = H / rows, sw = posterImg.naturalWidth / cols, sh = posterImg.naturalHeight / rows;
    order.slice(0, shown).forEach(i => { const x = i % cols, y = Math.floor(i / cols);
      ctx.drawImage(posterImg, x * sw, y * sh, sw, sh, x * tw, y * th, tw + .5, th + .5); });
    ctx.strokeStyle = "#F26B1D"; ctx.lineWidth = 2;
    for (let i = 1; i < cols; i++) { ctx.beginPath(); ctx.moveTo(i * tw, 0); ctx.lineTo(i * tw, H); ctx.stroke(); }
    for (let i = 1; i < rows; i++) { ctx.beginPath(); ctx.moveTo(0, i * th); ctx.lineTo(W, i * th); ctx.stroke(); }
  }
}
tickT = setInterval(updateClock, 200);
/* klawiatura na telefonie: dok z polem odpowiedzi trzyma się nad klawiaturą */
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onVV = () => {
    const layoutH = document.documentElement.clientHeight;
    const already = layoutH <= vv.height + 48;
    const raw = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const kb = already ? 0 : raw;
    document.documentElement.style.setProperty("--kb", kb + "px");
    document.body.classList.toggle("kbopen", raw > 80 || (layoutH - vv.height) > 80);
  };
  vv.addEventListener("resize", onVV); vv.addEventListener("scroll", onVV);
}

function fold(s) { return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function titleMatchesText(text, q) {
  const query = fold(q);
  if (!query) return false;
  const f = fold(text);
  const bare = f.replace(/^(the|a|an|le|la|el|il|der|die|das)\s+/, "");
  if (f.startsWith(query) || bare.startsWith(query)) return true;
  const words = f.split(" ").filter(Boolean);
  const qw = query.split(" ").filter(Boolean);
  if (qw.length === 1 && words.some(w => w.startsWith(qw[0]))) return true;
  if (qw.length > 1) {
    for (let i = 0; i <= words.length - qw.length; i++) {
      if (qw.every((w, k) => (words[i + k] || "").startsWith(w))) return true;
    }
  }
  return false;
}
function titleHaystacks(t) {
  if (!t) return [];
  if (typeof t === "string") return [t];
  return [t.title, t.pl_title].filter(Boolean);
}
function titleMatches(title, q) {
  return titleHaystacks(title).some(s => titleMatchesText(s, q));
}
function fillTitle(t) {
  if (!t) return "";
  if (typeof t === "string") return t;
  const mode = titlesMode();
  const pl = t.pl_title || "", en = t.title || "";
  if (mode === "pl") return pl || en;
  if (mode === "en") return en || pl;
  return LANG === "en" ? (en || pl) : (pl || en);
}
function hintLabel(t) {
  if (typeof t === "string") return esc(t);
  return showTitle(t);
}
function titleHints(pool, q, limit) {
  return (pool || []).filter(t => titleMatches(t, q)).slice(0, limit || 8);
}

function setupGuess(prev, focus, auction) {
  const g = $("#g"), ac = $("#ac"), fb = $("#fb");
  let sel = -1, items = [];
  g.value = prev;
  if (focus) g.focus({preventScroll: true});
  const show = () => {
    const q = fold(g.value);
    const off = auction || (S.settings && S.settings.hints === false);
    items = (!q || off) ? [] : titleHints(titles, g.value, 8);
    sel = -1;
    ac.innerHTML = items.map((t, i) => `<li data-i="${i}">${hintLabel(t)}</li>`).join("");
    ac.classList.toggle("hidden", !items.length);
  };
  g.oninput = () => { show(); fb.textContent = ""; fb.className = "feedback"; };
  g.onkeydown = e => {
    if (ac.classList.contains("hidden")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      ac.querySelectorAll("li").forEach((li, i) => li.classList.toggle("on", i === sel));
    } else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); g.value = fillTitle(items[sel]); ac.classList.add("hidden"); submit(); }
    else if (e.key === "Escape") ac.classList.add("hidden");
  };
  ac.onpointerdown = e => { const li = e.target.closest("li"); if (!li) return; e.preventDefault(); g.value = fillTitle(items[+li.dataset.i]); ac.classList.add("hidden"); submit(); };
  g.onblur = () => setTimeout(() => ac.classList.add("hidden"), 150);
  const submit = async () => {
    const text = g.value.trim(); if (!text) return;
    try {
      const r = await roomCall("guess", {text});
      if (r.correct) { if (auction) { g.value = ""; toast(T("Zaliczone: {t}", {t: r.title})); } lastKey = ""; if (!WS_MODE) poll(); }
      else if (r.duplicate) { fb.textContent = (auction ? T("Ta odpowiedź już była.") : T("Ten film już był.")); fb.className = "feedback bad"; g.select(); }
      else { fb.textContent = auction ? T("\"{text}\" nie ma na liście.", {text}) : T("Nie, to nie \"{text}\". Próbuj dalej.", {text}); fb.className = "feedback bad"; g.select(); }
    } catch (e) { toast(e.message); }
  };
  $("#gf").onsubmit = e => { e.preventDefault(); ac.classList.add("hidden"); submit(); };
}

function wireTopDrag() {
  const list = $("#toplist");
  if (!list || list.dataset.wired) return;
  list.dataset.wired = "1";
  let drag = null;
  const sync = () => {
    ORDER.ids = [...list.children].map(el => +el.dataset.id);
    [...list.children].forEach((el, i) => {
      el.dataset.i = String(i);
      const pos = el.querySelector(".tpos");
      if (pos) pos.textContent = String(i + 1);
    });
  };
  list.addEventListener("pointerdown", e => {
    const li = e.target.closest("#toplist li");
    if (!li || S.mine) return;
    e.preventDefault();
    drag = {li, y: e.clientY};
    li.classList.add("dragging");
    try { li.setPointerCapture(e.pointerId); } catch {}
  });
  list.addEventListener("pointermove", e => {
    if (!drag) return;
    e.preventDefault();
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest("#toplist li");
    if (!over || over === drag.li) return;
    const kids = [...list.children];
    const from = kids.indexOf(drag.li), to = kids.indexOf(over);
    if (from < 0 || to < 0 || from === to) return;
    if (from < to) list.insertBefore(drag.li, over.nextSibling);
    else list.insertBefore(drag.li, over);
    sync();
  }, {passive: false});
  const end = () => {
    if (!drag) return;
    drag.li.classList.remove("dragging");
    drag = null;
    sync();
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
}

function markedList(arr, marks, cls="") {
  return `<ol class="orderlist done bigtop cmp-list ${cls}">${(arr || []).map((i, n) =>
    `<li class="${(marks && marks[n]) || ""}"><span class="tpos">${n + 1}</span><span class="ot">${showTitle(i)}</span></li>`).join("") || `<li class="miss">${T("brak układu")}</li>`}</ol>`;
}
function renderTopReveal(a) {
  const mine = a.mine && a.mine.target ? `<div class="toprev-me">
      <h2>${T("zgadywałeś topkę gracza {name}", {name: esc(a.mine.target)})}</h2>
      <div class="cmp">
        <div class="cmp-col">
          <h3>${T("twój układ")}</h3>
          ${orderWrap(markedList(a.mine.guess, a.mine.marks), T("najlepszy"), T("najgorszy"))}
        </div>
        <div class="cmp-col">
          <h3>${T("poprawna topka")}</h3>
          ${orderWrap(markedList(a.mine.truth, (a.mine.truth || []).map(() => "ok")), T("najlepszy"), T("najgorszy"))}
        </div>
      </div>
      <p class="muted">${T("Masz {pts} pkt. Za każdy film: pełne punkty za dokładne miejsce, o 1 mniej za każde miejsce pomyłki.", {pts: a.mine.points || 0})}</p>
    </div>` : (a.mine ? `<div class="toprev-me"><h3>${T("twoja topka")}</h3>${orderWrap(markedList(a.mine.own), T("najlepszy"), T("najgorszy"))}</div>` : "");
  const all = (a.tops || []).map(t => `<div class="toprev">
      <h3>${esc(t.name)}</h3>${orderWrap(markedList(t.own), T("najlepszy"), T("najgorszy"))}
    </div>`).join("");
  return `<h2>${T("topki")}</h2>${mine}${all}`;
}

function mostNode(n) {
  if (!n) return "";
  if (n.kind === "person") {
    const img = n.photo ? `<img src="${n.photo}" alt="">` : `<span class="noimg"></span>`;
    return `<div class="mostnode person">${img}<span>${esc(n.name || "")}</span></div>`;
  }
  const img = n.poster ? `<img src="${n.poster}" alt="">` : `<span class="noimg"></span>`;
  return `<div class="mostnode movie">${img}<span>${esc(n.title || "")}${n.year ? ` <small>${n.year}</small>` : ""}</span></div>`;
}

function personCard(n, label) {
  if (!n) return "";
  const img = n.photo ? `<img src="${n.photo}" alt="">` : `<span class="noimg">?</span>`;
  return `<div class="fr-card"><span class="fr-lab">${esc(label || "")}</span>${img}<b>${esc(n.name || "")}</b></div>`;
}

function renderMost() {
  const start = S.start || {}, goal = S.goal || {};
  const running = (S.started_names || []).length;
  const back = S.returned || [];
  const status = S.winner_name
    ? `<p class="fr-status win">${T("Rundę wygrywa {name}.", {name: esc(S.winner_name)})}</p>`
    : `<p class="fr-status">${running ? T("Wyszło: {list}", {list: (S.started_names || []).map(esc).join(", ")}) : T("Kliknij Start, żeby otworzyć profil pierwszego aktora.")}
       ${back.length ? " · " + T("Wrócili: {list}", {list: back.map(esc).join(", ")}) : ""}</p>`;
  const stage = `<div class="stage textstage moststage filmrun-stage"><span class="lvl">Filmrun</span>
    <div class="fr-pair">${personCard(start, T("start"))}<span class="mostarrow" aria-hidden="true">→</span>${personCard(goal, T("cel"))}</div>
    <p class="muted fr-note">${T("Na {src} szukacie drugiego aktora, chodząc po filmach i obsadzie. Ruchy tam są poza naszą stroną. Wygrywa ten, kto pierwszy wróci i wciśnie Stop.", {src: (S.link && S.link.label) || (LANG === "pl" ? "Filmwebie" : "IMDb")})}</p>
    ${status}
    </div>`;
  let input;
  if (S.winner) input = waitBox(T("Runda zakończona"), T("{name} wcisnął Stop jako pierwszy.", {name: esc(S.winner_name || "")}));
  else if (S.can_stop) input = `<button type="button" class="pill orange big" id="frstop">${T("Stop")}</button><p class="muted small-note">${T("Znalazłeś drugiego aktora? Wróć i wciśnij Stop.")}</p>`;
  else if (S.can_start) {
    const href = (S.link && S.link.url) || (S.start && S.start.link && S.start.link.url) || "";
    input = `<button type="button" class="pill orange big" id="frstart">${T("Start")}</button>${href ? `<a class="fr-open" href="${esc(href)}" target="_blank" rel="noopener">${T("otwórz profil {src}", {src: (S.link && S.link.label) || (LANG === "pl" ? "Filmweb" : "IMDb")})}</a>` : ""}`;
  }
  else input = waitBox(T("Runda w toku"), T("Czekamy, aż ktoś wróci i wciśnie Stop."));
  return [stage, input];
}

function wireMost() {
  if ($("#frstart")) $("#frstart").onclick = async ev => {
    ev.preventDefault();
    const known = (S.link && S.link.url) || (S.start && S.start.link && S.start.link.url);
    let popup = null;
    if (known) {
      popup = window.open(known, "_blank");
    }
    try {
      const r = await roomCall("guess", {start: true});
      const url = (r && r.link && r.link.url) || known;
      if (url) {
        if (popup && !popup.closed) {
          try { if (popup.location.href === "about:blank") popup.location = url; } catch {}
        } else if (!popup) {
          const a = document.createElement("a");
          a.href = url; a.target = "_blank"; a.rel = "noopener"; a.click();
        }
      } else if (popup) popup.close();
      lastKey = ""; if (!WS_MODE) poll();
    } catch (e) {
      if (popup && !known) popup.close();
      toast(e.message);
    }
  };
  if ($("#frstop")) $("#frstop").onclick = () => guessAct({stop: true});
  const open = document.querySelector(".fr-open");
  if (open) open.addEventListener("click", () => { roomCall("guess", {start: true}).catch(() => {}); });
}

async function loadMostOptions() {
  const box = $("#mostopts");
  if (!box || S.finished) { if (box && S.finished) box.innerHTML = `<p class="muted">${T("Cel osiągnięty.")}</p>`; return; }
  const cur = S.current || (S.path || [])[(S.path || []).length - 1];
  if (!cur) return;
  try {
    const kind = cur.kind === "person" ? "person" : "movie";
    const d = await api(`/api/most/${kind}/${cur.id}`);
    const items = kind === "person" ? (d.movies || []) : (d.cast || []);
    const local = d.local ? `<p class="muted small-note">${T("Lokalny graf z obsady pakietów (brak klucza TMDB albo zapas).")}</p>` : "";
    if (!items.length) {
      box.innerHTML = local + `<p class="muted">${T("Brak dalszych pozycji.")}</p>`;
      return;
    }
    const btn = n => n.kind === "person" || n.name
      ? `<button type="button" class="mostopt" data-kind="person" data-id="${n.id}" data-name="${esc(n.name || "")}" data-photo="${esc(n.photo || "")}">${n.photo ? `<img src="${n.photo}" alt="">` : `<span class="noimg"></span>`}<span>${esc(n.name || "")}</span></button>`
      : `<button type="button" class="mostopt" data-kind="movie" data-id="${n.id}" data-title="${esc(n.title || "")}" data-year="${n.year || ""}" data-poster="${esc(n.poster || "")}">${n.poster ? `<img src="${n.poster}" alt="">` : `<span class="noimg"></span>`}<span>${esc(n.title || "")}${n.year ? ` <small>${n.year}</small>` : ""}</span></button>`;
    box.innerHTML = local + `<h3 class="mosth">${kind === "person" ? T("filmy tej osoby") : T("obsada filmu")}</h3><div class="mostgrid">${items.map(btn).join("")}</div>`;
    box.querySelectorAll(".mostopt").forEach(b => b.onclick = () => {
      const step = b.dataset.kind === "person"
        ? {kind:"person", id:+b.dataset.id, name:b.dataset.name, photo:b.dataset.photo || null}
        : {kind:"movie", id:+b.dataset.id, title:b.dataset.title, year:b.dataset.year ? +b.dataset.year : null, poster:b.dataset.poster || null};
      guessAct(step.kind === "person" ? {person: step} : {movie: step});
    });
  } catch (e) {
    box.innerHTML = `<p class="errbox">${esc(e.message)}</p>`;
  }
}

function renderMostReveal(a) {
  const rows = a.results || a.paths || [];
  return `<h2>Filmrun</h2>
    <div class="fr-pair">${personCard(a.start, T("start"))}<span class="mostarrow">→</span>${personCard(a.goal, T("cel"))}</div>
    <p class="muted">${a.winner_name ? T("Rundę wygrywa {name} — pierwszy wcisnął Stop (1000 pkt).", {name: esc(a.winner_name)}) : T("Nikt nie wcisnął Stop.")}</p>
    <ul class="results">${rows.map(p => `<li class="${p.won || p.reached ? "" : "miss"}">${esc(p.name)} ${p.won || p.reached ? "+" + (p.points || 0) : "0"}</li>`).join("")}</ul>`;
}

function actorEntry(c) {
  if (!c) return null;
  if (typeof c === "string") return { name: c, photo: null };
  return { name: c.name || "", photo: c.photo || (c.photo_id ? "/actor/" + c.photo_id + ".jpg" : null) };
}
function actorLi(c, always) {
  const a = actorEntry(c);
  if (!a) return `<li class="hid">...</li>`;
  const img = a.photo ? `<img class="ahot" src="${a.photo}" alt="">` : `<span class="anoimg" aria-hidden="true"></span>`;
  return `<li class="in">${img}<span>${esc(a.name)}</span></li>`;
}

function roundResults() {
  const last = p => p.history.length ? p.history[p.history.length - 1] : 0;
  return `<ul class="results">${S.players.slice().sort((a, b) => last(b) - last(a)).map(p => `<li class="${last(p) ? "" : "miss"}">${esc(p.name)} ${last(p) ? "+" + last(p) : "0"}</li>`).join("")}</ul>`;
}

function renderReveal(v) {
  const a = S.answer, m = me(), mode = a.mode;
  const last = m.history && m.history.length ? m.history[m.history.length - 1] : 0;
  let head = `<p class="muted" style="margin:0;font-weight:700">${last ? T("+{pts} pkt w tej rundzie", {pts:last}) : T("tym razem nie wyszło")}</p>`, body = "";
  const titleBlock = `<h2>${showTitle(a)}</h2><div class="year">${a.year || ""}</div>`;
  if (mode === "kadry") body = titleBlock + `<div class="trio">${a.frames.map((id, i) => `<figure><img src="/frame/${id}.jpg" alt=""><figcaption><span class="lv ${LEVELS[i][0]}"></span>${T("kadr {lvl}", {lvl:LEVELS[i][1]})}</figcaption></figure>`).join("")}</div>`;
  else if (mode === "zoom" || mode === "plakat") body = titleBlock + `<div class="revimg ${mode}"><img src="${a.img}" alt=""></div>`;
  else if (mode === "aktorzy") body = titleBlock + `<ol class="castlist done">${a.cast.map(n => actorLi(n, true)).join("")}</ol>`;
  else if (mode === "top") body = renderTopReveal(a);
  else if (mode === "most") body = renderMostReveal(a);
  else if (mode === "rok") body = `<h2>${showTitle(a)}</h2><div class="year big">${a.year}</div>
    <ul class="guesses">${a.guesses.map(g => `<li><b>${esc(g.name)}</b><span>${g.year}</span><span class="d">${g.year === a.year ? T("dokładnie") : T("{d} lat różnicy", {d: Math.abs(g.year - a.year)})}</span><span class="sc">+${g.points}</span></li>`).join("") || `<li class="miss">${T("Nikt nie odpowiedział.")}</li>`}</ul>`;
  else if (mode === "kolejnosc") {
    applyRemakeTags(a.items);
    applyRemakeTags(a.order || []);
    applyRemakeTags(a.correct || a.items || []);
    const yearList = (arr, marks) => `<ol class="orderlist done cmp-list">${(arr || []).map((i, n) =>
      `<li class="${(marks && marks[n]) || ""}">${i.img ? `<img src="${i.img}" alt="">` : `<span class="noimg"></span>`}<span class="ot">${showTitle(i)}</span><span class="oy">${i.year || ""}</span></li>`).join("") || `<li class="miss">${T("brak układu")}</li>`}</ol>`;
    body = `<h2>${T("kolejność")}</h2>
      <div class="cmp">
        <div class="cmp-col"><h3>${T("twój układ")}</h3>${orderWrap(yearList(a.order, a.marks), T("najstarszy"), T("najnowszy"))}</div>
        <div class="cmp-col"><h3>${T("poprawna kolejność")}</h3>${orderWrap(yearList(a.correct || a.items, (a.correct || a.items || []).map(() => "ok")), T("najstarszy"), T("najnowszy"))}</div>
      </div>`;
  }
  else if (mode === "licytacja") {
    body = (a.prompt ? `<p class="muted qprompt-r">${esc(a.prompt)}</p>` : "") + (a.bidder_name ? `<h2>${a.success ? T("{name} zaliczył zadanie", {name: esc(a.bidder_name)}) : T("{name} nie zaliczył zadania", {name: esc(a.bidder_name)})}</h2>
      <div class="year">${T("deklaracja: {n}", {n: a.bid})}</div>
      <p class="muted">${T("Po timerze pozostali gracze zdecydowali, czy licytujący wymienił tyle odpowiedzi. Sukces: 200 pkt × deklaracja dla licytującego. Porażka: 100 pkt × deklaracja dla pozostałych.")}</p>
      <p class="muted">${T("Deklaracje: {list}", {list: (a.bids || []).map(b => esc(b.name) + " " + b.bid).join(", ")})}</p>
      ${(a.answers || a.missed || a.found || []).length ? `<p class="muted" style="margin:10px 0 4px">${T("Lista poprawnych odpowiedzi:")}</p><ul class="found">${(a.answers || a.missed || a.found).map(f => `<li>${showTitle(f)}</li>`).join("")}</ul>` : ""}`
      : `<h2>${T("nikt nie licytował")}</h2>`);
  }
  const waitNext = S.untimed
    ? (isHost() ? T("Gdy będziecie gotowi, puść następną rundę.") : T("Czekamy, aż gospodarz puści następną rundę."))
    : (S.round >= S.rounds ? T("Zaraz wyniki końcowe...") : T("Za chwilę kolejna runda..."));
  v.innerHTML = `<div class="game"><div class="gmain">${hud()}<div class="panel reveal">${head}${body}${roundResults()}</div>
      <div class="dock revdock">
        <div class="wait">${S.untimed && isHost() ? "" : `<span class="spin"></span>`}${waitNext}</div>
        ${isHost() ? `<button class="pill orange big" id="nx">${S.round >= S.rounds ? T("pokaż wyniki") : (S.untimed ? T("następna runda") : T("dalej"))}</button>` : ""}
      </div></div>${board()}</div><div class="sheetbg" id="sheetbg"></div>`;
  wireCommon();
  if (isHost()) $("#nx").onclick = () => act("next");
}

function renderFinal(v) {
  const top = S.players.slice(0, 3);
  const order = [1, 0, 2].filter(i => top[i]);
  v.innerHTML = `<div class="panel center" style="margin-bottom:40px">
    <h2 style="font-size:clamp(48px,8vw,90px)">${T("koniec")}<span class="ast">*</span></h2>
    <p class="muted" style="margin:8px 0 0">${top[0] ? T("Wygrywa {name} z wynikiem {pts} pkt", {name: esc(top[0].name), pts: top[0].score}) : ""}</p>
    <div class="podium">${order.map(i => `<div class="col p${i + 1}"><div class="name">${esc(top[i].name)}</div><div class="pts">${T("{pts} pkt", {pts: top[i].score})}</div><div class="block">${i + 1}</div></div>`).join("")}</div>
    <div style="max-width:520px;margin:0 auto;text-align:left">${playerList(S.players, {score:true})}</div>
    <div style="display:flex;gap:10px;justify-content:center;margin-top:24px;flex-wrap:wrap">
      ${isHost() ? `<button class="pill orange big" id="again">${T("zagraj jeszcze raz")}</button>` : `<div class="wait"><span class="spin"></span>${T("Gospodarz może zacząć nową grę")}</div>`}
      <a class="pill ghost big" href="/#pakiety">${T("inny pakiet")}</a></div></div>`;
  if (isHost()) $("#again").onclick = () => act("again");
}

const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{4})$/);
if (m) enterRoom(m[1].toUpperCase());
else {
  loadPacks(); $("#jname").value = savedName();
  const jc = $("#jcode"); jc.oninput = () => { jc.value = jc.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4); if (jc.value.length === 4 && !$("#jname").value) $("#jname").focus(); };
  $("#ctajoin").onclick = e => { e.preventDefault(); $("#dolacz").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth", block: "center"}); setTimeout(() => jc.focus({preventScroll: true}), 250); };
}
const mq = $("#marq"); if (mq) mq.textContent = (T("jeden kadr. trzy szanse. zgadnij film, zanim zrobią to znajomi*") + "\u00a0\u00a0 ").repeat(2);
