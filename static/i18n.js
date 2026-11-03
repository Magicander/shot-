"use strict";
/* i18n: Polska -> kadr* po polsku, reszta świata -> shot* po angielsku. Przełącznik PL/EN zapamiętuje wybór. */
(function () {
  const cookieLang = (document.cookie.match(/(?:^|;\s*)kadr_lang=(pl|en)/) || [])[1];
  const stored = localStorage.getItem("kadr_lang");
  const detected = (navigator.languages && navigator.languages[0] || navigator.language || "en").toLowerCase().startsWith("pl") ? "pl" : "en";
  const lang = stored || cookieLang || detected;
  const setCookie = l => { document.cookie = `kadr_lang=${l}; Path=/; Max-Age=31536000; SameSite=Lax`; };
  // serwer renderuje HTML wg ciasteczka/Accept-Language; gdy się różni od zapamiętanego wyboru - wyrównaj
  if (cookieLang !== lang) setCookie(lang);
  const served = document.documentElement.lang;
  if (served && served !== lang && !sessionStorage.getItem("kadr_lang_reload")) {
    sessionStorage.setItem("kadr_lang_reload", "1"); location.reload();
  } else sessionStorage.removeItem("kadr_lang_reload");
  window.LANG = lang;
  window.BRAND = lang === "pl" ? "kadr" : "shot";
  window.setLang = l => { localStorage.setItem("kadr_lang", l); setCookie(l); location.reload(); };
})();

const EN = {
  // wspólne
  "Coś poszło nie tak": "Something went wrong",
  "anuluj": "cancel", "dalej": "next", "zapisz": "save", "usuń": "delete", "zamknij": "close",
  // strona główna
  "graj": "play", "dołącz": "join", "jak grać": "how to play",
  "zgadnij film po jednym kadrze. ze znajomymi.": "guess the movie from a single frame. with friends.",
  "masz kod pokoju?": "got a room code?", "Kod": "Code", "Twój nick": "Your nickname", "np. Ola": "e.g. Alex",
  "dołącz do gry": "join the game",
  "jeden kadr. trzy szanse. zgadnij film, zanim zrobią to znajomi*": "one frame. three chances. name the movie before your friends do*",
  "pakiety": "packs",
  "Wybierz pakiet, ustaw liczbę rund i kliknij <b>graj</b>. Dostaniesz kod do wysłania znajomym.": "Pick a pack, set the number of rounds and hit <b>play</b>. You will get a code to send to your friends.",
  "Ładuję pakiety...": "Loading packs...",
  "trudny kadr": "hard frame", "coraz łatwiej": "easier and easier", "szybciej = więcej": "faster = more",
  "Najpierw widzicie najtrudniejszy kadr z trailera. Zgadniesz teraz, masz najwięcej punktów.": "First you see the hardest frame from the trailer. Guess now and you get the most points.",
  "Co 15 sekund pojawia się łatwiejszy kadr. Pisz tytuł, podpowiedzi pomogą z pisownią.": "Every 15 seconds an easier frame appears. Type the title, suggestions help with spelling.",
  "Liczy się kadr i czas. Pierwsza dobra odpowiedź dostaje premię. Literówki wybaczamy.": "The frame and the time both count. The first correct answer gets a bonus. Typos are forgiven.",
  "quiz filmowy dla znajomych": "a movie quiz for friends",
  "quiz<br>filmowy": "movie<br>quiz", "gotowe": "ready",
  "{total} filmów | {n} w grze": "{total} movies | {n} playable",
  "Liczba rund": "Number of rounds", "mniej rund": "fewer rounds", "więcej rund": "more rounds", "wkrótce": "soon",
  "pakiet {name}": "{name} pack", "{rounds}. Jak cię nazywać?": "{rounds}. What should we call you?",
  "Podaj 4-znakowy kod i nick": "Enter the 4-character code and a nickname",
  // pokój
  "pokój {code}": "room {code}", "nie ma takiego pokoju": "no such room",
  "Sprawdź kod albo załóż nowy pokój.": "Check the code or create a new room.", "na start": "back home",
  "Dołączasz do gry. Jak cię nazywać?": "You are joining the game. What should we call you?",
  "Czekam na nick...": "Waiting for a nickname...", "pokój wygasł": "room expired",
  "ty": "you", "gospodarz": "host", "zgadł": "guessed it", "runda {r}/{n}": "round {r}/{n}",
  "kod pokoju": "room code", "Wyślij znajomym link albo kod. Wpisują go na stronie głównej.": "Send your friends the link or the code. They enter it on the home page.",
  "kopiuj link": "copy link", "Skopiowano link": "Link copied",
  "{rounds} · pakiet {pack} · kadr co {s} s": "{rounds} · {pack} pack · new frame every {s} s",
  "gracze": "players", "zaczynamy": "start", "Możesz zacząć sam albo poczekać na resztę.": "You can start alone or wait for the others.",
  "Czekamy, aż gospodarz zacznie...": "Waiting for the host to start...",
  "Kadr z filmu": "Movie frame", "kadr {lvl} · do {pts} pkt": "{lvl} frame · up to {pts} pts",
  "trudny": "hard", "średni": "medium", "łatwy": "easy",
  "Brawo, zgadłeś!": "Nice, you got it!", "Na kadrze {lvl} po {secs} s. Czekamy na resztę.": "On the {lvl} frame after {secs} s. Waiting for the others.",
  "Jaki to film?": "Which movie is it?", "Tytuł filmu": "Movie title", "zgaduję": "guess",
  "wyniki": "scores", "pomiń rundę": "skip round",
  "Nie, to nie \"{text}\". Próbuj dalej.": "No, it is not \"{text}\". Keep trying.",
  "zgadłeś, +{pts} pkt": "you got it, +{pts} pts", "tym razem nie wyszło": "not this time",
  "kadr {lvl}": "{lvl} frame", "Zaraz wyniki końcowe...": "Final results coming up...", "Za chwilę kolejna runda...": "Next round in a moment...",
  "pokaż wyniki": "show results", "koniec": "the end", "Wygrywa {name} z wynikiem {pts} pkt": "{name} wins with {pts} pts",
  "{pts} pkt": "{pts} pts", "zagraj jeszcze raz": "play again", "Gospodarz może zacząć nową grę": "The host can start a new game",
  "inny pakiet": "another pack",
  "{name} dołącza": "{name} joined", "{name} zgaduje (+{pts})": "{name} got it (+{pts})", "{name} wychodzi": "{name} left",
};

function T(pl, vars) {
  let s = (window.LANG === "en" && EN[pl] !== undefined) ? EN[pl] : pl;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] !== undefined ? vars[k] : m);
  return s;
}
const plRounds = n => n + " " + (window.LANG === "en" ? (n === 1 ? "round" : "rounds")
  : n === 1 ? "runda" : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? "rundy" : "rund");
const packName = p => (window.LANG === "en" ? (p.name_en || p.name) : p.name) || "";
const packDesc = p => (window.LANG === "en" ? (p.description_en || p.description) : p.description) || "";

function langSwitch() {
  return `<span class="langsw" role="group" aria-label="Language">${["pl", "en"].map(l =>
    `<button type="button" class="${l === window.LANG ? "on" : ""}" onclick="setLang('${l}')" aria-pressed="${l === window.LANG}">${l.toUpperCase()}</button>`).join("")}</span>`;
}
function applyI18n(root = document) {
  root.querySelectorAll("[data-t]").forEach(el => { const k = el.innerHTML.trim(); el.innerHTML = T(k); });
  root.querySelectorAll("[data-tp]").forEach(el => { el.placeholder = T(el.placeholder); });
  root.querySelectorAll("[data-ta]").forEach(el => { el.setAttribute("aria-label", T(el.getAttribute("aria-label"))); });
  root.querySelectorAll("[data-langsw]").forEach(el => { el.innerHTML = langSwitch(); });
}
document.addEventListener("DOMContentLoaded", () => applyI18n());
