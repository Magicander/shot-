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
    const imgs = p.thumbs.length >= 2 ? p.thumbs.map(id => `<img class="ph" src="/frame/${id}.jpg" alt="" loading="lazy">`).join("") : FLOWER;
    w.innerHTML = `
      <div class="packet" style="--c:${p.color};--tilt:${[-1.5,1.2,-.6,1.6][i % 4]}deg">
        <div class="kit"><span>${T("quiz<br>filmowy")}</span><b>${BRAND}*</b></div>
        <h3>${esc(packName(p))}</h3>
        <div class="collage">${imgs}</div>
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
    w.querySelector(".go").onclick = () => askName(T("pakiet {name}", {name: packName(p).toLowerCase()}), T("{rounds}. Jak cię nazywać?", {rounds: plRounds(rounds.n)}), async name => {
      const d = await api("/api/rooms", {pack_id:p.id, rounds:rounds.n, name});
      setCreds(d.code, d); location.href = "/r/" + d.code;
    });
    box.append(w);
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
  if (!titles.length || (S && S.pack.id !== s.pack.id)) titles = await api(`/api/packs/${s.pack.id}/titles`);
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
    <span>${esc(p.name)}</span>${p.id === S.me ? `<span class="you">${T("ty")}</span>` : ""}${p.id === S.host ? `<span class="host">${T("gospodarz")}</span>` : ""}
    ${opts.status && (p.got || p.done) ? `<span class="mark ok" title="${T("zgadł")}"></span>` : ""}
    ${opts.score ? `<span class="sc">${p.score}</span>` : ""}</li>`).join("")}</ul>`;
}

/* ---------------- tryby ---------------- */
const MODE_INFO = {
  kadry: ["Kadry", "Trzy kadry z filmu, od najtrudniejszego. Im szybciej zgadniesz, tym więcej punktów."],
  zoom: ["Zoom", "Mocne zbliżenie fragmentu kadru, które powoli się oddala. Zgadnij tytuł jak najwcześniej."],
  licytacja: ["Licytacja", "Pytanie z listą odpowiedzi. Każdy deklaruje, ile poda. Najwyższa oferta wpisuje odpowiedzi na czas. Uda się: 200 pkt za każdą zadeklarowaną. Nie uda się: pozostali dostają po 100 pkt za każdą."],
  rok: ["Który rok", "Podaj rok premiery. Dokładny rok to 1000 pkt, każdy rok różnicy zabiera około 30 procent, ponad 8 lat to zero."],
  kolejnosc: ["Ułóż po kolei", "Ułóż 4 filmy od najstarszego do najnowszego. 250 pkt za każde dobre miejsce."],
  plakat: ["Plakat", "Plakat odsłania się stopniowo. Im wcześniej zgadniesz, tym więcej punktów."],
  aktorzy: ["Aktorzy", "Obsada pojawia się po kolei, od najmniej znanych nazwisk. Mniej nazwisk na ekranie to więcej punktów."],
  cytat: ["Cytat", "Cytat z filmu. W połowie czasu pojawia się rok premiery jako podpowiedź."],
};
const modeName = k => T(MODE_INFO[k][0]);
function modeHint(k, a) {
  const v = {need: a.need, have: a.have};
  return T({disabled: "Wyłączony przez admina dla tego pakietu.",
    questions: "Brak pytań do licytacji. Admin dodaje je w edytorze trybów.",
    frames: "Potrzebny co najmniej {need} film z kadrami (jest {have}).",
    movies: "Potrzeba co najmniej {need} filmów w pakiecie (jest {have}).",
    years: k === "kolejnosc" ? "Potrzeba {need} filmów z różnymi latami premiery (jest {have})." : "Potrzeba {need} filmów z rokiem premiery (jest {have}).",
    posters: "Za mało plakatów ({have}/{need}). Admin: edytor trybów, plakaty.",
    cast: "Za mało filmów z obsadą ({have}/{need}). Admin: edytor trybów, aktorzy.",
    quotes: "Za mało cytatów ({have}/{need}). Admin dopisuje je w edytorze trybów."}[a.reason] || "", v);
}
const showTitle = o => o.pl_title && LANG === "pl" && fold(o.pl_title) !== fold(o.title) ? `${esc(o.pl_title)} <small class="orig">(${esc(o.title)})</small>` : esc(o.title);

function renderMeta() {
  $("#roommeta").innerHTML = `<span class="tag" style="--c:${S.pack.color}"><span class="dot"></span>${esc(packName(S.pack))}</span>
    <span class="tag dark">${T("pokój {code}", {code:S.code})}</span>${S.phase === "round" || S.phase === "reveal" ? `<span class="tag">${T("runda {r}/{n}", {r:S.round, n:S.rounds})}</span><span class="tag mode">${modeName(S.mode)}</span>` : ""}`;
}

function render() {
  renderMeta();
  const extra = S.phase === "round" ? [S.mode, S.stage, (S.cast || []).length, S.hint_year, S.sub, (S.found || []).length, (S.bidders || []).length, S.my_bid, JSON.stringify(S.mine ?? null)].join(",") : "";
  const key = [S.phase, S.round, extra, S.players.map(p => p.id + p.name + p.score + !!p.got + !!p.done + p.online).join(), S.host,
    S.phase === "lobby" ? S.modes.join() + S.rounds : ""].join("|");
  if (S.phase === "round") updateClock();
  if (key === lastKey) return;
  const v = $("#view");
  const keepInput = S.phase === "round" && lastKey.startsWith("round|" + S.round + "|");
  lastKey = key;
  if (S.phase === "lobby") return renderLobby(v);
  if (S.phase === "round") return renderRound(v, keepInput);
  if (S.phase === "reveal") return renderReveal(v);
  if (S.phase === "final") return renderFinal(v);
}

function modePicker() {
  const host = isHost();
  return `<div class="modes">${S.all_modes.map(k => {
    const a = S.avail[k], on = S.modes.includes(k);
    return `<label class="modecard ${a.ok ? "" : "off"} ${on ? "on" : ""}">
      <input type="checkbox" value="${k}" ${on ? "checked" : ""} ${a.ok && host ? "" : "disabled"}>
      <span class="mtop"><b>${modeName(k)}</b><span class="tick" aria-hidden="true"></span></span>
      <span class="mdesc">${T(MODE_INFO[k][1])}</span>
      ${a.ok ? "" : `<span class="mhint">${esc(modeHint(k, a))}</span>`}</label>`;
  }).join("")}</div>`;
}

function renderLobby(v) {
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
      <div style="margin-top:20px">${isHost()
        ? `<button class="pill orange big" style="width:100%" id="start">${T("zaczynamy")}</button><p class="muted center" style="font-size:14px;margin:8px 0 0">${T("Możesz zacząć sam albo poczekać na resztę.")}</p>`
        : `<div class="wait"><span class="spin"></span>${T("Czekamy, aż gospodarz zacznie...")}</div>`}</div>
    </div>
    <div class="panel setup">
      <div class="setup-head"><h3 style="font-size:30px">${T("tryby gry")}</h3>
        ${isHost() ? `<div class="stepper small" role="group" aria-label="${T("Liczba rund")}"><button type="button" id="rminus" aria-label="${T("mniej rund")}">-</button><span class="n">${plRounds(S.rounds)}</span><button type="button" id="rplus" aria-label="${T("więcej rund")}">+</button></div>`
          : `<span class="tag">${plRounds(S.rounds)}</span>`}</div>
      <p class="muted" style="margin:4px 0 14px">${isHost() ? T("Zaznacz tryby. Rundy będą je przeplatać, filmy losujemy tylko z tego pakietu.") : T("Gospodarz wybiera tryby. Rundy będą je przeplatać.")}</p>
      ${modePicker()}
    </div></div>`;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast(T("Skopiowano link")); } catch { $("#link").select(); document.execCommand("copy"); toast(T("Skopiowano link")); } };
  if (!isHost()) return;
  $("#start").onclick = () => act("start");
  const setup = (modes, rounds) => act("setup", {modes, rounds});
  $("#rminus").onclick = () => setup(S.modes, S.rounds - 1);
  $("#rplus").onclick = () => setup(S.modes, S.rounds + 1);
  v.querySelectorAll(".modecard input").forEach(cb => cb.onchange = () => {
    const modes = [...v.querySelectorAll(".modecard input:checked")].map(x => x.value);
    if (!modes.length) { cb.checked = true; return toast(T("Zostaw co najmniej jeden tryb")); }
    setup(modes, S.rounds);
  });
}

function feedText(f) {
  if (f.text) return f.text;
  return T({join:"{name} dołącza", guess:"{name} zgaduje (+{pts})", leave:"{name} wychodzi", bid:"{name} licytuje",
    bidwin:"{name} wygrywa licytację: {pts}", answered:"{name} odpowiada"}[f.k] || "{name}", {name:f.name, pts:f.pts});
}
function me() { return S.players.find(p => p.id === S.me) || {}; }

const board = () => `<aside class="panel board"><h3>${T("wyniki")}</h3>${playerList(S.players, {score:true, status:true})}
  <div class="feed">${S.feed.slice().reverse().map(f => `<span>${esc(feedText(f))}</span>`).join("")}</div>
  ${isHost() ? `<button class="pill ghost small" style="margin-top:14px" id="skip">${T("pomiń rundę")}</button>` : ""}</aside>`;
const bar = () => `<div class="timeline one"><div class="cur"><i id="bar1"></i></div></div>`;
const guessForm = ph => `<form class="guess" id="gf" autocomplete="off"><ul class="ac hidden" id="ac"></ul>
  <input class="input" id="g" placeholder="${ph || T("Jaki to film?")}" enterkeyhint="send" autocapitalize="off" spellcheck="false" aria-label="${T("Tytuł filmu")}">
  <button class="pill orange big">${T("zgaduję")}</button></form><div class="feedback" id="fb"></div>`;
const gotBox = (m, sub) => `<div class="gotit"><span class="display">+${m.got.points}</span><div><b>${T("Brawo, zgadłeś!")}</b><br><span style="opacity:.75">${sub || T("Czekamy na resztę.")}</span></div></div>`;
const waitBox = txt => `<div class="gotit wait-box"><div><b>${txt}</b><br><span style="opacity:.75">${T("Czekamy na resztę.")}</span></div></div>`;
let ORDER = {round: 0, ids: []}, BID = {round: 0, n: 3};

function renderRound(v, keepInput) {
  const prev = keepInput ? ($("#g")?.value || "") : "";
  const prevY = keepInput ? ($("#y")?.value || "") : "";
  const hadFocus = keepInput && ["g", "y"].includes(document.activeElement?.id);
  const m = me(), mode = S.mode;
  let stage = "", input = "";
  const titleInput = () => m.got ? gotBox(m) : guessForm();
  if (mode === "kadry") {
    const lvl = LEVELS[S.stage];
    stage = `<div class="stage"><img src="/frame/${S.frames[S.stage]}.jpg" alt="${T("Kadr z filmu")}"><span class="lvl">${T("kadr {lvl} · do {pts} pkt", {lvl:lvl[1], pts:lvl[2]})}</span><span class="clock" id="clock"></span></div>
      <div class="timeline" id="tl">${LEVELS.map((l, i) => `<div class="${i === S.stage ? "cur" : ""}"><i></i></div>`).join("")}</div>
      <div class="timeline-labels">${LEVELS.map((l, i) => `<span class="${i <= S.stage ? "on" : ""}">${l[1]}</span>`).join("")}</div>`;
    input = m.got ? gotBox(m, LANG === "en" ? T("Na kadrze {lvl} po {secs} s. Czekamy na resztę.", {lvl: LEVELS[m.got.stage][1], secs: m.got.secs}) : `Na kadrze ${LEVELS[m.got.stage][1]}m po ${m.got.secs} s. Czekamy na resztę.`) : guessForm();
  } else if (mode === "zoom") {
    stage = `<div class="stage zoom"><img id="zimg" src="${S.img}" alt="${T("Fragment kadru")}" style="transform-origin:${S.ox * 100}% ${S.oy * 100}%"><span class="lvl">${T("zoom · kadr się oddala")}</span><span class="clock" id="clock"></span></div>${bar()}`;
    input = titleInput();
  } else if (mode === "plakat") {
    stage = `<div class="stage posterstage"><canvas id="pc" width="400" height="600" aria-label="${T("Plakat filmu")}"></canvas><span class="lvl">${S.style === "pix" ? T("plakat · wyostrza się") : T("plakat · odsłania się")}</span><span class="clock" id="clock"></span></div>${bar()}`;
    input = titleInput();
  } else if (mode === "aktorzy") {
    stage = `<div class="stage textstage"><span class="lvl">${T("aktorzy · {k} z {n}", {k:S.cast.length, n:S.cast_total})}</span><span class="clock" id="clock"></span>
      <ol class="castlist">${Array.from({length:S.cast_total}, (_, i) => S.cast[i] ? `<li class="in">${esc(S.cast[i])}</li>` : `<li class="hid">...</li>`).join("")}</ol>
      <p class="muted small-note">${T("od najmniej do najbardziej znanych")}</p></div>${bar()}`;
    input = titleInput();
  } else if (mode === "cytat") {
    stage = `<div class="stage textstage"><span class="lvl">${T("cytat")}</span><span class="clock" id="clock"></span>
      <blockquote class="quote">${esc(S.quote)}</blockquote>${S.hint_year ? `<p class="hint">${T("podpowiedź: rok {y}", {y:S.hint_year})}</p>` : ""}</div>${bar()}`;
    input = titleInput();
  } else if (mode === "rok") {
    stage = `<div class="stage textstage yearstage">${S.img ? `<img class="thumb" src="${S.img}" alt="">` : ""}<span class="lvl">${T("który rok?")}</span><span class="clock" id="clock"></span>
      <h2 class="ytitle">${showTitle(S.movie)}</h2></div>${bar()}`;
    input = S.mine ? waitBox(T("Twoja odpowiedź: {y}", {y:S.mine}))
      : `<form class="guess" id="yf"><input class="input" id="y" type="number" inputmode="numeric" min="1900" max="2030" placeholder="${T("np. 1984")}" aria-label="${T("Rok premiery")}"><button class="pill orange big">${T("odpowiadam")}</button></form>`;
  } else if (mode === "kolejnosc") {
    if (ORDER.round !== S.round) ORDER = {round: S.round, ids: S.items.map(i => i.id)};
    const byId = Object.fromEntries(S.items.map(i => [i.id, i]));
    const ids = S.mine || ORDER.ids;
    stage = `<div class="stage textstage orderstage"><span class="lvl">${T("od najstarszego do najnowszego")}</span><span class="clock" id="clock"></span>
      <ol class="orderlist">${ids.map((id, i) => `<li>${byId[id].img ? `<img src="${byId[id].img}" alt="">` : `<span class="noimg"></span>`}<span class="ot">${showTitle(byId[id])}</span>
        ${S.mine ? "" : `<span class="ob"><button type="button" class="pill small" data-up="${i}" ${i ? "" : "disabled"} aria-label="${T("wyżej")}">&uarr;</button><button type="button" class="pill small" data-dn="${i}" ${i < ids.length - 1 ? "" : "disabled"} aria-label="${T("niżej")}">&darr;</button></span>`}</li>`).join("")}</ol>
      <div class="olabels"><span>${T("najstarszy")}</span><span>${T("najnowszy")}</span></div></div>${bar()}`;
    input = S.mine ? waitBox(T("Kolejność wysłana")) : `<button class="pill orange big" id="osend" style="width:100%">${T("zatwierdzam kolejność")}</button>`;
  } else if (mode === "licytacja") {
    stage = renderAuction(m);
  }
  v.innerHTML = `<div class="game"><div>${stage}${input}</div>${board()}</div>`;
  if (isHost()) $("#skip").onclick = () => act("next");
  updateClock(true);
  if ($("#gf")) setupGuess(prev, hadFocus || !keepInput, mode === "licytacja");
  if ($("#yf")) {
    const y = $("#y"); y.value = prevY; if ((hadFocus || !keepInput) && matchMedia("(pointer:fine)").matches) y.focus();
    $("#yf").onsubmit = async e => { e.preventDefault(); const n = parseInt(y.value, 10); if (!(n >= 1880 && n <= 2100)) return toast(T("Podaj rok, np. 1984")); await guessAct({year:n}); };
  }
  if (mode === "kolejnosc" && !S.mine) {
    v.querySelectorAll("[data-up],[data-dn]").forEach(b => b.onclick = () => {
      const i = +(b.dataset.up ?? b.dataset.dn), j = b.dataset.up !== undefined ? i - 1 : i + 1;
      [ORDER.ids[i], ORDER.ids[j]] = [ORDER.ids[j], ORDER.ids[i]]; lastKey = ""; render();
    });
    $("#osend").onclick = () => guessAct({order: ORDER.ids});
  }
  if (mode === "licytacja" && S.sub === "bid" && !S.my_bid) {
    if (BID.round !== S.round) BID = {round: S.round, n: Math.min(3, S.total)};
    const n = $("#bidn"), upd = d => { BID.n = Math.max(1, Math.min(S.total, BID.n + d)); n.textContent = BID.n; };
    upd(0); $("#bminus").onclick = () => upd(-1); $("#bplus").onclick = () => upd(1);
    $("#bsend").onclick = () => guessAct({bid: BID.n});
  }
}

function renderAuction(m) {
  const rules = `<details class="rules" ${S.sub === "bid" ? "open" : ""}><summary>${T("zasady licytacji")}</summary><ol>
    <li>${T("Każdy po cichu deklaruje, ile poprawnych odpowiedzi poda (lista ma {n}).", {n:S.total})}</li>
    <li>${T("Najwyższa deklaracja wygrywa (przy remisie: kto pierwszy). Ta osoba wpisuje odpowiedzi na czas: 15 s + 5 s za każdą.")}</li>
    <li>${T("Liczą się tylko odpowiedzi z listy, bez powtórek. Drobne literówki przechodzą. Wszyscy widzą postęp na żywo.")}</li>
    <li>${T("Uda się: licytujący dostaje 200 pkt za każdą zadeklarowaną odpowiedź. Nie uda się: każdy z pozostałych dostaje po 100 pkt za każdą.")}</li></ol></details>`;
  if (S.sub === "bid") {
    return `<div class="stage textstage auction"><span class="lvl">${T("licytacja · deklaracje")}</span><span class="clock" id="clock"></span>
      <h2 class="ytitle qprompt">${esc(S.prompt)}</h2>
      <p class="muted small-note">${T("Ile poprawnych odpowiedzi podasz? Na liście jest {n}.", {n: S.total})}</p>
      ${S.my_bid ? `<p class="bigbid">${S.my_bid}</p><p class="muted">${T("Twoja deklaracja. Czekamy na pozostałych.")}</p>`
        : `<div class="bidrow"><div class="stepper" role="group"><button type="button" id="bminus" aria-label="${T("mniej")}">-</button><span class="n" id="bidn">3</span><button type="button" id="bplus" aria-label="${T("więcej")}">+</button></div>
           <button class="pill orange big" id="bsend">${T("licytuję")}</button></div>`}
      <p class="muted small-note">${S.bidders.length ? T("Zadeklarowali: {names}", {names: S.bidders.map(esc).join(", ")}) : T("Nikt jeszcze nie zadeklarował.")}</p>
      ${rules}</div>${bar()}`;
  }
  const mine = S.bidder === S.me;
  return `<div class="stage textstage auction"><span class="lvl">${T("licytacja · {name} wpisuje", {name: esc(S.bidder_name)})}</span><span class="clock" id="clock"></span>
    <h2 class="ytitle qprompt">${esc(S.prompt)}</h2>
    <p class="muted small-note">${mine ? T("Wpisz {n} odpowiedzi, jedna po drugiej.", {n:S.bid}) : T("{name} musi podać {n} odpowiedzi.", {name: esc(S.bidder_name), n:S.bid})}</p>
    <div class="aprog"><div class="prog"><i style="width:${Math.min(100, S.found.length / Math.max(1, S.bid) * 100)}%"></i></div>
      <p class="progressn"><b>${S.found.length}</b> / ${S.bid}${S.misses ? ` <small class="muted">${T("pudła: {n}", {n: S.misses})}</small>` : ""}</p></div>
    <ul class="found">${S.found.map(f => `<li>${showTitle(f)}</li>`).join("")}${Array.from({length: Math.max(0, S.bid - S.found.length)}, () => `<li class="slot"></li>`).join("")}</ul>
    ${rules}</div>${bar()}${mine ? guessForm(T("Twoja odpowiedź...")) : `<div class="feedback">${T("Patrzymy, czy da radę...")}</div>`}`;
}

async function guessAct(body) {
  try { await roomCall("guess", body); lastKey = ""; if (!WS_MODE) poll(); }
  catch (e) { toast(e.message); }
}

let drawn = "";
function updateClock(force) {
  if (!S || S.phase !== "round") return;
  const el = S.elapsed + (performance.now() - localT0) / 1000;
  const c = $("#clock");
  if (S.mode === "kadry") {
    if (c) c.textContent = Math.max(0, Math.ceil(S.stage_seconds * 3 - el)) + " s";
    document.querySelectorAll("#tl i").forEach((bar, i) => {
      const f = Math.max(0, Math.min(1, (el - i * S.stage_seconds) / S.stage_seconds));
      bar.style.width = (f * 100) + "%";
    });
    return;
  }
  const dur = S.duration || 30, f = Math.max(0, Math.min(1, el / dur));
  if (c) c.textContent = Math.max(0, Math.ceil(dur - el)) + " s";
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

function fold(s) { return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function setupGuess(prev, focus, auction) {
  const g = $("#g"), ac = $("#ac"), fb = $("#fb");
  let sel = -1, items = [];
  g.value = prev;
  if (focus && matchMedia("(pointer:fine)").matches) g.focus();
  const show = () => {
    const q = fold(g.value);
    items = q.length < 1 || auction ? [] : titles.filter(t => fold(t).split(" ").some(w => w.startsWith(q.split(" ")[0])) && fold(t).includes(q.split(" ").slice(1).join(" "))
      || fold(t).startsWith(q) || fold(t).replace(/^the /, "").startsWith(q)).slice(0, 6);
    sel = -1;
    ac.innerHTML = items.map((t, i) => `<li data-i="${i}">${esc(t)}</li>`).join("");
    ac.classList.toggle("hidden", !items.length);
  };
  g.oninput = () => { show(); fb.textContent = ""; fb.className = "feedback"; };
  g.onkeydown = e => {
    if (ac.classList.contains("hidden")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      ac.querySelectorAll("li").forEach((li, i) => li.classList.toggle("on", i === sel));
    } else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); g.value = items[sel]; ac.classList.add("hidden"); submit(); }
    else if (e.key === "Escape") ac.classList.add("hidden");
  };
  ac.onpointerdown = e => { const li = e.target.closest("li"); if (!li) return; e.preventDefault(); g.value = items[+li.dataset.i]; ac.classList.add("hidden"); submit(); };
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
  else if (mode === "aktorzy") body = titleBlock + `<ol class="castlist done">${a.cast.map(n => `<li class="in">${esc(n)}</li>`).join("")}</ol>`;
  else if (mode === "cytat") body = titleBlock + `<blockquote class="quote small">${esc(a.quote)}</blockquote>`;
  else if (mode === "rok") body = `<h2>${showTitle(a)}</h2><div class="year big">${a.year}</div>
    <ul class="guesses">${a.guesses.map(g => `<li><b>${esc(g.name)}</b><span>${g.year}</span><span class="d">${g.year === a.year ? T("dokładnie") : T("{d} lat różnicy", {d: Math.abs(g.year - a.year)})}</span><span class="sc">+${g.points}</span></li>`).join("") || `<li class="miss">${T("Nikt nie odpowiedział.")}</li>`}</ul>`;
  else if (mode === "kolejnosc") body = `<h2>${T("dobra kolejność")}</h2><ol class="orderlist done">${a.items.map(i => `<li>${i.img ? `<img src="${i.img}" alt="">` : `<span class="noimg"></span>`}<span class="ot">${showTitle(i)}</span><span class="oy">${i.year}</span></li>`).join("")}</ol>`;
  else if (mode === "licytacja") {
    body = (a.prompt ? `<p class="muted qprompt-r">${esc(a.prompt)}</p>` : "") + (a.bidder_name ? `<h2>${a.success ? T("{name} dał radę", {name: esc(a.bidder_name)}) : T("{name} nie dał rady", {name: esc(a.bidder_name)})}</h2>
      <div class="year">${T("{f} z {b} zadeklarowanych", {f: a.found.length, b: a.bid})}</div>
      <p class="muted">${T("Deklaracje: {list}", {list: a.bids.map(b => esc(b.name) + " " + b.bid).join(", ")})}</p>
      <ul class="found">${a.found.map(f => `<li>${showTitle(f)}</li>`).join("")}</ul>
      ${a.missed && a.missed.length ? `<p class="muted" style="margin:10px 0 4px">${T("Inne poprawne odpowiedzi:")}</p><ul class="found missed">${a.missed.map(f => `<li>${showTitle(f)}</li>`).join("")}</ul>` : ""}`
      : `<h2>${T("nikt nie licytował")}</h2>`);
  }
  v.innerHTML = `<div class="game"><div class="panel reveal">${head}${body}${roundResults()}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:20px;flex-wrap:wrap">
        <div class="wait"><span class="spin"></span>${S.round >= S.rounds ? T("Zaraz wyniki końcowe...") : T("Za chwilę kolejna runda...")}</div>
        ${isHost() ? `<button class="pill orange" id="nx">${S.round >= S.rounds ? T("pokaż wyniki") : T("dalej")}</button>` : ""}
      </div></div>
    <aside class="panel board"><h3>${T("wyniki")}</h3>${playerList(S.players, {score:true})}</aside></div>`;
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
else { loadPacks(); $("#jname").value = savedName(); }
const mq = $("#marq"); if (mq) mq.textContent = (T("jeden kadr. trzy szanse. zgadnij film, zanim zrobią to znajomi*") + "\u00a0\u00a0 ").repeat(2);
