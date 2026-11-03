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
    const rounds = {n: Math.min(10, p.playable) || 0};
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
      <div class="pack-pills">
        <span class="chip-pill"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 5h18v14H3zM5 7v2h2V7zm0 4v2h2v-2zm0 4v2h2v-2zm12-8v2h2V7zm0 4v2h2v-2zm0 4v2h2v-2z"/></svg>${T("{total} filmów | {n} w grze", {total:p.total, n:p.playable})}</span>
        <div class="stepper" role="group" aria-label="${T("Liczba rund")}">
          <button type="button" class="minus" aria-label="${T("mniej rund")}">-</button>
          <span class="n">${plRounds(rounds.n)}</span>
          <button type="button" class="plus" aria-label="${T("więcej rund")}">+</button>
          <button type="button" class="go" ${p.playable ? "" : "disabled"}>${p.playable ? T("graj") : T("wkrótce")}</button>
        </div>
      </div>`;
    const n = w.querySelector(".n");
    const upd = d => { rounds.n = Math.max(1, Math.min(p.playable || 1, rounds.n + d)); n.textContent = plRounds(rounds.n); };
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

async function poll() {
  clearTimeout(pollT);
  try {
    const s = await api(`/api/rooms/${CODE}?pid=${ME.pid}&token=${encodeURIComponent(ME.token)}`);
    if (!titles.length || (S && S.pack.id !== s.pack.id)) titles = await api(`/api/packs/${s.pack.id}/titles`);
    S = s; localT0 = performance.now(); render();
  } catch (e) {
    if (/Nie jesteś|Nie ma pokoju/.test(e.key || e.message)) { localStorage.removeItem("kadr_room_" + CODE); $("#view").innerHTML = `<div class="panel center"><h2>${T("pokój wygasł")}</h2><p class="muted">${esc(e.message)}</p><a class="pill orange" href="/">${T("na start")}</a></div>`; return; }
  }
  pollT = setTimeout(poll, S && S.phase === "round" ? 800 : 1200);
}
async function act(action, body = {}) {
  try { S = await api(`/api/rooms/${CODE}/${action}`, {pid:ME.pid, token:ME.token, ...body}); localT0 = performance.now(); lastKey = ""; render(); }
  catch (e) { toast(e.message); }
}

const isHost = () => S.host === S.me;
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c;

function playerList(players, opts = {}) {
  return `<ul class="plist">${players.map(p => `<li class="${p.online ? "" : "off"}">
    <span class="avatar" style="background:${avColor(p.name)}">${esc([...p.name][0].toUpperCase())}</span>
    <span>${esc(p.name)}</span>${p.id === S.me ? `<span class="you">${T("ty")}</span>` : ""}${p.id === S.host ? `<span class="host">${T("gospodarz")}</span>` : ""}
    ${opts.status && p.got ? `<span class="mark ok" title="${T("zgadł")}"></span>` : ""}
    ${opts.score ? `<span class="sc">${p.score}</span>` : ""}</li>`).join("")}</ul>`;
}

function renderMeta() {
  $("#roommeta").innerHTML = `<span class="tag" style="--c:${S.pack.color}"><span class="dot"></span>${esc(packName(S.pack))}</span>
    <span class="tag dark">${T("pokój {code}", {code:S.code})}</span>${S.phase === "round" || S.phase === "reveal" ? `<span class="tag">${T("runda {r}/{n}", {r:S.round, n:S.rounds})}</span>` : ""}`;
}

function render() {
  renderMeta();
  const key = [S.phase, S.round, S.stage, S.players.map(p => p.id + p.name + p.score + !!p.got + p.online).join(), S.host].join("|");
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

function renderLobby(v) {
  const link = `${location.origin}/r/${S.code}`;
  v.innerHTML = `<div class="lobby">
    <div class="panel">
      <p class="muted" style="margin:0 0 4px;font-weight:700">${T("kod pokoju")}</p>
      <div class="bigcode">${S.code}</div>
      <p style="margin:14px 0 0">${T("Wyślij znajomym link albo kod. Wpisują go na stronie głównej.")}</p>
      <div class="share"><input class="input" readonly value="${esc(link)}" id="link"><button class="pill" id="copy">${T("kopiuj link")}</button></div>
      <p class="muted" style="margin:18px 0 0">${T("{rounds} · pakiet {pack} · kadr co {s} s", {rounds: plRounds(S.rounds), pack: esc(packName(S.pack)), s: S.stage_seconds})}</p>
    </div>
    <div class="panel">
      <h3 style="font-size:30px">${T("gracze")} <span class="ast">${S.players.length}</span></h3>
      ${playerList(S.players)}
      <div style="margin-top:20px">${isHost()
        ? `<button class="pill orange big" style="width:100%" id="start">${T("zaczynamy")}</button><p class="muted center" style="font-size:14px;margin:8px 0 0">${T("Możesz zacząć sam albo poczekać na resztę.")}</p>`
        : `<div class="wait"><span class="spin"></span>${T("Czekamy, aż gospodarz zacznie...")}</div>`}</div>
    </div></div>`;
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(link); toast(T("Skopiowano link")); } catch { $("#link").select(); document.execCommand("copy"); toast(T("Skopiowano link")); } };
  if (isHost()) $("#start").onclick = () => act("start");
}

function feedText(f) {
  if (f.text) return f.text;
  return T({join:"{name} dołącza", guess:"{name} zgaduje (+{pts})", leave:"{name} wychodzi"}[f.k] || "{name}", {name:f.name, pts:f.pts});
}
function me() { return S.players.find(p => p.id === S.me) || {}; }

function renderRound(v, keepInput) {
  const prev = keepInput ? ($("#g")?.value || "") : "";
  const hadFocus = keepInput && document.activeElement?.id === "g";
  const lvl = LEVELS[S.stage], m = me();
  v.innerHTML = `<div class="game">
    <div>
      <div class="stage"><img src="/frame/${S.frames[S.stage]}.jpg" alt="${T("Kadr z filmu")}"><span class="lvl">${T("kadr {lvl} · do {pts} pkt", {lvl:lvl[1], pts:lvl[2]})}</span><span class="clock" id="clock"></span></div>
      <div class="timeline" id="tl">${LEVELS.map((l, i) => `<div class="${i === S.stage ? "cur" : ""}"><i></i></div>`).join("")}</div>
      <div class="timeline-labels">${LEVELS.map((l, i) => `<span class="${i <= S.stage ? "on" : ""}">${l[1]}</span>`).join("")}</div>
      ${m.got ? `<div class="gotit"><span class="display">+${m.got.points}</span><div><b>${T("Brawo, zgadłeś!")}</b><br><span style="opacity:.75">${LANG === "en" ? T("Na kadrze {lvl} po {secs} s. Czekamy na resztę.", {lvl: LEVELS[m.got.stage][1], secs: m.got.secs}) : `Na kadrze ${LEVELS[m.got.stage][1]}m po ${m.got.secs} s. Czekamy na resztę.`}</span></div></div>`
        : `<form class="guess" id="gf" autocomplete="off"><ul class="ac hidden" id="ac"></ul>
            <input class="input" id="g" placeholder="${T("Jaki to film?")}" enterkeyhint="send" autocapitalize="off" spellcheck="false" aria-label="${T("Tytuł filmu")}">
            <button class="pill orange big">${T("zgaduję")}</button></form>
           <div class="feedback" id="fb"></div>`}
    </div>
    <aside class="panel board"><h3>${T("wyniki")}</h3>${playerList(S.players, {score:true, status:true})}
      <div class="feed">${S.feed.slice().reverse().map(f => `<span>${esc(feedText(f))}</span>`).join("")}</div>
      ${isHost() ? `<button class="pill ghost small" style="margin-top:14px" id="skip">${T("pomiń rundę")}</button>` : ""}</aside>
  </div>`;
  if (isHost()) $("#skip").onclick = () => act("next");
  updateClock();
  if (!m.got) setupGuess(prev, hadFocus || !keepInput);
}

function updateClock() {
  if (!S || S.phase !== "round") return;
  const el = S.elapsed + (performance.now() - localT0) / 1000;
  const c = $("#clock"); if (c) c.textContent = Math.max(0, Math.ceil(S.stage_seconds * 3 - el)) + " s";
  document.querySelectorAll("#tl i").forEach((bar, i) => {
    const f = Math.max(0, Math.min(1, (el - i * S.stage_seconds) / S.stage_seconds));
    bar.style.width = (f * 100) + "%";
  });
}
tickT = setInterval(updateClock, 200);

function fold(s) { return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

function setupGuess(prev, focus) {
  const g = $("#g"), ac = $("#ac"), fb = $("#fb");
  let sel = -1, items = [];
  g.value = prev;
  if (focus && matchMedia("(pointer:fine)").matches) g.focus();
  const show = () => {
    const q = fold(g.value);
    items = q.length < 1 ? [] : titles.filter(t => fold(t).split(" ").some(w => w.startsWith(q.split(" ")[0])) && fold(t).includes(q.split(" ").slice(1).join(" "))
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
      const r = await api(`/api/rooms/${CODE}/guess`, {pid:ME.pid, token:ME.token, text});
      if (r.correct) { lastKey = ""; poll(); }
      else { fb.textContent = T("Nie, to nie \"{text}\". Próbuj dalej.", {text}); fb.className = "feedback bad"; g.select(); }
    } catch (e) { toast(e.message); }
  };
  $("#gf").onsubmit = e => { e.preventDefault(); ac.classList.add("hidden"); submit(); };
}

function renderReveal(v) {
  const a = S.answer, m = me();
  const got = S.players.filter(p => p.got).sort((x, y) => x.got.order - y.got.order);
  const miss = S.players.filter(p => !p.got);
  v.innerHTML = `<div class="game"><div class="panel reveal">
      <p class="muted" style="margin:0;font-weight:700">${m.got ? T("zgadłeś, +{pts} pkt", {pts:m.got.points}) : T("tym razem nie wyszło")}</p>
      <h2>${esc(a.title)}</h2><div class="year">${a.year || ""}</div>
      <div class="trio">${a.frames.map((id, i) => `<figure><img src="/frame/${id}.jpg" alt=""><figcaption><span class="lv ${LEVELS[i][0]}"></span>${T("kadr {lvl}", {lvl:LEVELS[i][1]})}</figcaption></figure>`).join("")}</div>
      <ul class="results">${got.map(p => `<li>${esc(p.name)} +${p.got.points}</li>`).join("")}${miss.map(p => `<li class="miss">${esc(p.name)} 0</li>`).join("")}</ul>
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
