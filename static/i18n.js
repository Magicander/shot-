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
  "tryby: {list}": "modes: {list}",
  "brak dostępnych trybów": "no modes available",
  "tryby gry": "game modes",
  "Zaznacz tryby. Rundy będą je przeplatać, filmy losujemy tylko z tego pakietu.": "Pick the modes. Rounds rotate between them and films come only from this pack.",
  "Gospodarz wybiera tryby. Rundy będą je przeplatać.": "The host picks the modes. Rounds rotate between them.",
  "Zostaw co najmniej jeden tryb": "Keep at least one mode",
  "Czekamy na resztę.": "Waiting for the others.",
  "Fragment kadru": "Frame detail",
  "zoom · kadr się oddala": "zoom · the frame pulls back",
  "Plakat filmu": "Movie poster",
  "plakat · wyostrza się": "poster · getting sharper",
  "plakat · odsłania się": "poster · revealing",
  "aktorzy · {k} z {n}": "cast · {k} of {n}",
  "od najmniej do najbardziej znanych": "from least to most famous",
  "cytat": "quote",
  "podpowiedź: rok {y}": "hint: year {y}",
  "który rok?": "which year?",
  "Twoja odpowiedź: {y}": "Your answer: {y}",
  "np. 1984": "e.g. 1984",
  "Rok premiery": "Release year",
  "odpowiadam": "answer",
  "od najstarszego do najnowszego": "oldest to newest",
  "wyżej": "up",
  "niżej": "down",
  "najstarszy": "oldest",
  "najnowszy": "newest",
  "Kolejność wysłana": "Order sent",
  "zatwierdzam kolejność": "submit order",
  "Podaj rok, np. 1984": "Enter a year, e.g. 1984",
  "zasady licytacji": "auction rules",
  "Każdy po cichu deklaruje, ile filmów z tego pakietu wymieni (pakiet ma {n}).": "Everyone secretly declares how many films from this pack they can name (the pack has {n}).",
  "Najwyższa deklaracja wygrywa (przy remisie: kto pierwszy). Ta osoba wpisuje tytuły na czas: 15 s + 5 s za każdy film.": "The highest bid wins (ties go to whoever bid first). That player types titles against the clock: 15 s + 5 s per film.",
  "Liczą się tylko filmy z pakietu, bez powtórek. W wersji PL można wpisywać polskie tytuły.": "Only films from the pack count, no repeats. In the Polish version Polish titles are accepted too.",
  "Uda się: licytujący dostaje 200 pkt za każdy zadeklarowany film. Nie uda się: każdy z pozostałych dostaje po 100 pkt za każdy.": "Success: the bidder gets 200 pts per declared film. Failure: every other player gets 100 pts per film.",
  "licytacja · deklaracje": "auction · bids",
  "Ile filmów z pakietu wymienisz?": "How many films from the pack can you name?",
  "Twoja deklaracja. Czekamy na pozostałych.": "Your bid. Waiting for the others.",
  "mniej": "less",
  "więcej": "more",
  "licytuję": "bid",
  "Zadeklarowali: {names}": "Bids in: {names}",
  "Nikt jeszcze nie zadeklarował.": "No bids yet.",
  "licytacja · {name} wpisuje": "auction · {name} is typing",
  "Wpisz {n} filmów z pakietu": "Name {n} films from the pack",
  "{name} musi wymienić {n} filmów": "{name} has to name {n} films",
  "Tytuł z pakietu...": "Title from the pack...",
  "Patrzymy, czy da radę...": "Let's see if they make it...",
  "Zaliczone: {t}": "Counted: {t}",
  "Ten film już był.": "That film was already named.",
  "\"{text}\" nie pasuje do żadnego filmu z pakietu.": "\"{text}\" does not match any film in the pack.",
  "+{pts} pkt w tej rundzie": "+{pts} pts this round",
  "dokładnie": "exact",
  "{d} lat różnicy": "{d} years off",
  "Nikt nie odpowiedział.": "Nobody answered.",
  "dobra kolejność": "correct order",
  "{name} dał radę": "{name} made it",
  "{name} nie dał rady": "{name} did not make it",
  "{f} z {b} zadeklarowanych": "{f} of {b} declared",
  "Deklaracje: {list}": "Bids: {list}",
  "nikt nie licytował": "nobody bid",
  "Kadry": "Frames",
  "Zoom": "Zoom",
  "Licytacja": "Auction",
  "Który rok": "Which year",
  "Ułóż po kolei": "In order",
  "Plakat": "Poster",
  "Aktorzy": "Cast",
  "Cytat": "Quote",
  "Trzy kadry z filmu, od najtrudniejszego. Im szybciej zgadniesz, tym więcej punktów.": "Three frames from the film, hardest first. The faster you guess, the more points.",
  "Mocne zbliżenie fragmentu kadru, które powoli się oddala. Zgadnij tytuł jak najwcześniej.": "A tight close-up of a frame that slowly zooms out. Guess the title as early as you can.",
  "Każdy deklaruje, ile filmów z pakietu wymieni. Najwyższa oferta wpisuje tytuły na czas. Uda się: 200 pkt za każdy zadeklarowany film. Nie uda się: pozostali dostają po 100 pkt za każdy.": "Everyone declares how many films from the pack they can name. The top bidder types titles on a timer. Success: 200 pts per declared film. Failure: the others get 100 pts per film.",
  "Podaj rok premiery. Dokładny rok to 1000 pkt, każdy rok różnicy zabiera około 30 procent, ponad 8 lat to zero.": "Give the release year. Exact is 1000 pts, each year off costs about 30 percent, more than 8 years off scores zero.",
  "Ułóż 4 filmy od najstarszego do najnowszego. 250 pkt za każde dobre miejsce.": "Sort 4 films from oldest to newest. 250 pts per correct position.",
  "Plakat odsłania się stopniowo. Im wcześniej zgadniesz, tym więcej punktów.": "The poster reveals itself gradually. The earlier you guess, the more points.",
  "Obsada pojawia się po kolei, od najmniej znanych nazwisk. Mniej nazwisk na ekranie to więcej punktów.": "The cast appears one by one, least famous first. Fewer names on screen means more points.",
  "Cytat z filmu. W połowie czasu pojawia się rok premiery jako podpowiedź.": "A quote from the film. Halfway through, the release year appears as a hint.",
  "Wyłączony przez admina dla tego pakietu.": "Disabled by the admin for this pack.",
  "Wymaga klucza TMDB (panel admina, ustawienia).": "Needs a TMDB key (admin panel, settings).",
  "Potrzebny co najmniej {need} film z kadrami (jest {have}).": "Needs at least {need} film with frames (has {have}).",
  "Potrzeba co najmniej {need} filmów w pakiecie (jest {have}).": "Needs at least {need} films in the pack (has {have}).",
  "Potrzeba {need} filmów z różnymi latami premiery (jest {have}).": "Needs {need} films with different release years (has {have}).",
  "Potrzeba {need} filmów z rokiem premiery (jest {have}).": "Needs {need} films with a release year (has {have}).",
  "Za mało plakatów ({have}/{need}). Admin: Pobierz dane TMDB.": "Not enough posters ({have}/{need}). Admin: Fetch TMDB data.",
  "Za mało filmów z obsadą ({have}/{need}). Admin: Pobierz dane TMDB.": "Not enough films with cast ({have}/{need}). Admin: Fetch TMDB data.",
  "Za mało cytatów ({have}/{need}). Admin dopisuje je przy filmach.": "Not enough quotes ({have}/{need}). The admin adds them per film."
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
