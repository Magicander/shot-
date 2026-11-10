# kadr* - quiz filmowy dla znajomych

Zgadujcie filmy z wybranego pakietu w kilku trybach: po kadrze, zbliżeniu, plakacie, obsadzie, cytacie, roku premiery, kolejności i w licytacji. Im szybciej, tym więcej punktów.

## Start

```
pip install -U "yt-dlp[default]" opencv-python
python app.py
```

Przeglądarka otworzy się sama na http://localhost:8000.

- Gra w sieci domowej: `python app.py --lan`. Znajomi wchodzą na adres IP komputera, który zobaczysz w konsoli.
- Inny port: `--port 9000`. Bez otwierania przeglądarki: `--no-browser`.
- Eksport bazy do SQL: `python app.py --export plik.sql`.

## Panel admina

Wejdź na `/admin`. Domyślne hasło to `SK45jh@WP`. Możesz je zmienić zmienną środowiskową `QUIZ_ADMIN_PASSWORD`.

W panelu możesz:
- tworzyć pakiety i edytować listy filmów (także wklejać wiele naraz w formacie `Tytuł (rok)`),
- uruchamiać i zatrzymywać scraper i oglądać jego log na żywo,
- wybierać kadry trudny, średni i łatwy. Skróty: strzałki, N, oraz 1/2/3 po najechaniu na kadr.
- w edytorze trybów pobierać plakaty i obsadę z IMDb lub Filmwebu, wpisywać cytaty i pytania do licytacji (opis niżej).

## Scraper z konsoli

```
python scraper.py --list
python scraper.py --pack horrory --limit 5
python scraper.py --pack marvel --retry-failed
python scraper.py --movie 12 --redo
```

YouTube czasem wymaga JS runtime: zainstaluj Deno albo Node, jeśli yt-dlp o to poprosi.

## Języki (kadr* / shot*)

Polska przeglądarka (navigator.language / Accept-Language = pl) dostaje **kadr*** po polsku, każda inna **shot*** po angielsku - gra i panel admina.
Przełącznik PL/EN (u góry strony, w pokoju, w panelu i na ekranie logowania) zapamiętuje wybór w localStorage i ciasteczku `kadr_lang`.
Nazwy i opisy pakietów mają wersje EN (pola "Nazwa po angielsku" / "Opis po angielsku" w edycji pakietu). Tytuły filmów się nie zmieniają.

## Duplikaty

W jednym pakiecie film może być tylko raz. Porównanie ignoruje wielkość liter, polskie znaki, interpunkcję, "the/a/an" na początku i spacje;
"Shining (1980)", "the shining" i "THE SHINING 1980" to ten sam film. Tytuł bez roku pasuje do istniejącego z rokiem (ten sam tytuł z innym rokiem, np. Halloween 1978 / 2018, jest dozwolony).
Pilnuje tego serwer (sprawdzenie + unikalny indeks w bazie), wklejanie listy pokazuje "dodano N, pominięto M duplikatów" z listą pominiętych. Przy starcie istniejące duplikaty są scalane (zostaje wiersz z wyborami/kadrami).

## Gdy trailer się nie pobiera

Scraper próbuje do 6 trailerów: ranking wyników wyszukiwania, potem zapytania zapasowe ("<tytuł> <rok> trailer", "<tytuł> trailer HD", "<tytuł> <rok> official teaser", "<tytuł> movie trailer").
Film niedostępny / prywatny / z ograniczeniem wiekowym / zablokowany w regionie / bot-check = przechodzi do następnego. Za mało dobrych kadrów = bierze kolejny trailer i łączy kadry z obu.
Na końcu luzuje progi jakości na najlepszym pobranym trailerze. Każda próba jest w logu panelu; ID nieudanych filmów są zapamiętywane (kolumna tried_ids) i przy ponownym pobieraniu idą na koniec kolejki.
Test bez sieci: `python3 test_scraper_fallback.py`.

## Dane

Wszystko trafia do jednego pliku `quiz.db`, który tworzy się przy pierwszym starcie. Jeśli obok leży stary `horror_quiz.db`, zostanie przeniesiony do pakietu Horrory.

Tytuły wpisuje się w oryginale (np. "The Shining"), a w wersji PL także po polsku, jeśli film ma polski tytuł. Literówki są wybaczane.

Aktualizacja (`git pull`) jest bezpieczna: `quiz.db` i `config.local.json` są w .gitignore, więc pull ich nie nadpisze.
Nowe kolumny i tabele (polski tytuł, aliasy, obsada, plakaty ze źródłem, cytaty, pytania do licytacji, wyłączone tryby) dodają się same przy starcie, istniejące dane zostają. Stare cytaty z kolumny `movies.quotes` przenoszą się do tabeli `quotes`.

## Tryby gry

Gospodarz wybiera pakiet, a w poczekalni zaznacza tryby i liczbę rund. Filmy losowane są tylko z tego pakietu, rundy przeplatają zaznaczone tryby, punkty sumują się w jednym rankingu.

| Tryb | Zasady | Wymaga |
|---|---|---|
| Kadry | trzy kadry od trudnego do łatwego, wcześniej = więcej punktów | 1 film z kadrami |
| Zoom | mocne zbliżenie kadru, które się oddala (30 s) | 1 film z kadrami |
| Licytacja | pytanie admina z listą odpowiedzi (np. "Wymień filmy Carpentera"). Każdy po cichu deklaruje, ile poprawnych odpowiedzi poda (15 s). Najwyższa oferta (remis: kto pierwszy) wpisuje je na czas: 15 s + 5 s za odpowiedź, max 90 s. Dopasowanie po znormalizowanym tekście z aliasami i drobnymi literówkami, powtórki odrzucane, postęp widzą wszyscy. Uda się: 200 pkt x deklaracja. Nie uda się: pozostali po 100 pkt x deklaracja. Odsłona pokazuje pominięte odpowiedzi | 1 pytanie (bez pytań: zapasowe "wymień filmy z pakietu", gdy pakiet ma 5 filmów) |
| Który rok | podaj rok premiery: dokładnie 1000 pkt, każdy rok różnicy około -30 procent, ponad 8 lat 0 | 3 filmy z rokiem |
| Ułóż po kolei | 4 filmy od najstarszego do najnowszego, 250 pkt za każde dobre miejsce | 4 różne lata |
| Plakat | plakat się wyostrza (pikseloza) albo odsłania kafelkami | 3 plakaty (IMDb, Filmweb, TMDB albo ręcznie) |
| Aktorzy | obsada pojawia się co 6 s, od najmniej znanych nazwisk (ze zdjęciem, jeśli jest); mniej nazwisk = więcej punktów | 3 filmy z obsadą (Filmweb, IMDb, TMDB albo ręcznie) |
| Cytat | cytat wpisany przez admina, w połowie czasu podpowiedź z rokiem | 5 cytatów w pakiecie |

W trybach z tytułem pierwsza poprawna odpowiedź dostaje +100 pkt. Tryb bez wystarczających danych jest wyszarzony z podpowiedzią, czego brakuje.
Admin może wyłączyć dowolny tryb dla pakietu (edytor trybów albo panel "tryby gry" na stronie pakietu).

## Ustawienia gry (lobby)

Gospodarz ustawia grę w lobby; pozostali gracze widzą ustawienia tylko do odczytu. Ostatnie ustawienia zapisują się w przeglądarce gospodarza i wracają przy kolejnej grze.

Podstawowe:
- **rundy** – liczba rund (tryby się przeplatają),
- **czas na rundę** – `domyślny` (każdy tryb swój, np. Kadry 3 x 15 s, Zoom 30 s) albo stały 10–120 s,
- **odpowiedzi** – `Wpisywanie` (gra sprawdza sama) albo `Na głos` (gracz klika *Mam!*, mówi tytuł, ktoś ocenia),
- **kto ocenia** (przy odpowiedziach na głos) – `kolejny gracz` (sędzia rotuje co rundę), `gospodarz` albo `głosowanie` (decyduje większość pozostałych),
- **licytacja** – czas na odpowiedź zwycięzcy (domyślnie 30 s) i czas na jedną turę licytacji (domyślnie 10 s).

Zaawansowane: czas osobno dla trybu, odpowiedzi osobno dla trybu (np. Kadry na głos, reszta wpisywana), liczba rund każdego trybu, kolejność trybów (losowa albo Twoja), podpowiedzi tytułów (wł./wył.), mnożnik punktów w finale (x1/x2/x3).

### Odpowiedzi na głos
Sędzia widzi poprawną odpowiedź i duże przyciski `dobrze` / `źle`, a zgłoszenia ocenia po kolei (liczy się kolejność kliknięcia *Mam!*). Sędzia nie zgaduje i nie ocenia sam siebie. Gdy sędzia się rozłączy, ocenia gospodarz. W trybie głosowania można podejrzeć odpowiedź, ale wtedy nie zdobywa się punktów w tej rundzie.

### Licytacja w turach
Gra losuje, kto zaczyna. Gracze po kolei podbijają ofertę albo pasują (brak ruchu w czasie tury = pas). Gdy zostaje jedna osoba, wygrywa najwyższa oferta, a zwycięzca ma **tylko 30 s na odpowiedź** (informacja jest w zasadach i na ekranie odpowiedzi z dużym zegarem). Przy odpowiedziach na głos sędzia liczy poprawne przyciskiem `+1` (z `cofnij`) albo zaznacza je na liście.

### Wersja mobilna
Duże przyciski *stwórz grę* / *dołącz* na stronie głównej, przyciski akcji zawsze na dole ekranu, wyniki w wysuwanym panelu, ekran nie skacze przy klawiaturze, a animacje wyłączają się przy ustawieniu „ogranicz ruch”.

Aktualizacja wersji na Cloudflare: zobacz sekcję **Aktualizacja do wersji z edycją w chmurze** poniżej.

## Edytor trybów

Strona pakietu, "edytor trybów" (`/admin#/modes/ID`): karta każdego trybu z gotowością (ile danych jest, ile trzeba), przełącznikiem włącz/wyłącz w tym pakiecie i linkiem do edytora.

- **Plakaty** (`#/posters/ID`): siatka plakatów. "pobierz dla pakietu" w tle z logiem na żywo (źródło: auto, IMDb, Filmweb, TMDB; opcjonalnie od nowa i z uzupełnieniem polskich tytułów). Na każdym plakacie: pobierz ponownie (z wybranego źródła), link do obrazka, plik z dysku (max 6 MB), usuń. Plakaty są zapisywane lokalnie w bazie, ze źródłem i datą.
- **Obsada** (`#/cast/ID`): pobieranie top N aktorów (3 do 15, domyślnie 6) w kolejności z napisów, **razem ze zdjęciami**. W grze nazwiska i fotki pojawiają się od ostatniego na liście, gwiazda na końcu. Edytor: miniatury, zmiana kolejności, edycja nazwiska i postaci, wgranie zdjęcia, dodawanie, usuwanie, odwrócenie, przywrócenie kolejności z napisów, pobierz ponownie. Jeśli film ma już imiona bez fotek: przycisk **dociągnij zdjęcia** (albo **dociągnij brakujące zdjęcia (imiona zostają)** dla całego pakietu) uzupełnia tylko fotki, bez kasowania ręcznie wpisanych imion.
- **Cytaty** (`#/quotes/ID`): cytaty przy każdym filmie (dodaj, edytuj, usuń, język PL/EN/oba). Wklejanie listy: `Tytuł (rok) = cytat`, tytuł oryginalny albo polski, rok opcjonalny, język tagiem `[pl]` albo `[en]` na początku cytatu. Podgląd pokazuje dopasowane, brak w pakiecie, niejednoznaczne, powtórki i zły format. Polska wersja gry woli cytaty `[pl]`, angielska `[en]`.
- **Pytania do licytacji** (`#/questions/ID`): pytanie PL i EN, odpowiedzi jedna w linii, aliasy po średniku ("The Thing; Coś"). "wstaw filmy z pakietu" wypełnia odpowiedzi tytułami, polskimi tytułami i aliasami. Wklejanie wielu pytań: bloki oddzielone pustą linią, pierwsza linia `pytanie PL | pytanie EN`.

## Źródła plakatów i obsady

Auto próbuje po kolei i zapisuje, z którego źródła przyszły dane:

- plakat: IMDb, Filmweb, TMDB
- obsada (imiona i zdjęcia): Filmweb, IMDb (gdy strona tytułu nie jest zablokowana), TMDB. Gdy źródło nie ma fotki, próba dociągnięcia z TMDB po imieniu (jeśli jest klucz).

IMDb: wyszukiwanie przez publiczny endpoint podpowiedzi. Strony tytułów IMDb są często zablokowane (AWS WAF, HTTP 202), wtedy plakat jest brany z podpowiedzi, a obsady z IMDb nie da się pobrać (podpowiedź ma tylko 2 nazwiska), więc auto przechodzi na Filmweb.
Filmweb: publiczne API strony (wyszukiwanie, dane filmu, plakat z fwcdn.pl) i strona obsady.
Blokady (403, 429, WAF) są zgłaszane w logu jako "blocked" z powodem. Scraper nie omija zabezpieczeń, wysyła zwykłe zapytania z przerwą między filmami. Gdy serwisy zmienią strony, zostaje TMDB albo ręczne uzupełnienie.

## TMDB (opcjonalnie)

1. Załóż darmowe konto na themoviedb.org i wygeneruj klucz API (v3) albo token (v4).
2. Panel admina, Ustawienia: wklej klucz. Jest sprawdzany i zapisywany w `config.local.json` (poza gitem i poza eksportem .sql). Można też użyć zmiennej `TMDB_API_KEY`.
3. TMDB staje się trzecim źródłem w trybie auto i można je wybrać wprost w edytorach.

Ta aplikacja korzysta z API TMDB, ale nie jest przez TMDB wspierana ani certyfikowana.

## Polskie tytuły i aliasy

- Strona pakietu, "polskie tytuły": wklej listę w formacie `Original Title (rok) = Polski tytuł` albo `Original Title = Polski tytuł`.
  "podgląd" pokazuje dopasowane i niedopasowane linie (brak w pakiecie, zły format, niejednoznaczne bez roku), "zapisz dopasowane" zapisuje tylko dopasowane.
- Obok tabela do edycji polskiego tytułu i aliasów w miejscu (zapis po wyjściu z pola, aliasy po średniku).
- Edycja filmu: polski tytuł i aliasy. Cytaty są w edytorze trybów.
- W wersji PL gra przyjmuje oryginał, aliasy, polski tytuł oraz jego główny człon ("Obcy" dla "Obcy - 8. pasażer Nostromo"). Wyniki i podpowiedzi pokazują polski tytuł, oryginał mniejszą czcionką.

## Testy

```
python3 test_scraper_fallback.py
python3 test_game.py            # na kopii quiz.db: migracje, wklejanie PL, atrapa TMDB, gra 2 graczy we wszystkich trybach
python3 test_editors.py         # na kopii quiz.db: scraper IMDb/Filmweb na atrapie (blokady, fallback), edytory, licytacja z pytaniem
```

## Odzyskiwanie quiz.db z Cloudflare

Dane w chmurze to Static Assets (JSON + kadry + plakaty), nie osobna baza D1. Worker blokuje publiczny dostęp do `/data/pack-*.json`. Cloudflare API też **nie pozwala pobrać** wdrożonych assetów (upload jest tylko do zapisu).

**Pułapka (chicken-egg):** przycisk **Pobierz bazę** i `GET /api/admin/export` istnieją dopiero po wdrożeniu nowego kodu. Zwykłe `python deploy_cloudflare.py` buduje assety z lokalnej `quiz.db` i **nadpisze** nowsze dane na Cloudflare. Dlatego najpierw wgrywamy **tylko kod** (`--code-only`, `keep_assets=true`), potem ściągamy dane, dopiero potem pełny deploy.

Aktualnie wdrożony Worker (ok. `951a404` / `287a12b`) **nie ma** eksportu — sam `pull_from_cloudflare.py` przeciwko niemu zakończy się komunikatem z instrukcją `--code-only`.

### PowerShell (kolejność!)

```powershell
cd C:\sciezka\do\shot-
git pull
cd cloudflare
npm install
cd ..
# 1) TYLKO kod Workera — assety (filmy/kadry) na live ZOSTAJĄ
python deploy_cloudflare.py --code-only
# 2) ściągnij dane z chmury do lokalnego quiz.db (stary plik -> quiz-backup-YYYYMMDD-HHMM.db)
python pull_from_cloudflare.py --url https://shot-quiz.<twoje>.workers.dev
# hasło admina = to samo co wrangler secret ADMIN_PASSWORD
python test_game.py
# 3) dopiero teraz pełny deploy (po lokalnych zmianach); --url porównuje liczby z live
python deploy_cloudflare.py --url https://shot-quiz.<twoje>.workers.dev
```

Albo po `--code-only` wejdź na `/admin`, kliknij **pobierz bazę** / **download database**, potem:

```powershell
python pull_from_cloudflare.py --from-file kadr-export.json --url https://shot-quiz.<twoje>.workers.dev
```

(`--url` jest potrzebne do ściągnięcia `/frame` i `/poster`.)

Przed pełnym deployem skrypt ostrzega, gdy lokalna baza ma mniej filmów/cytatów/pytań niż live (`--force` pomija pytanie).

**Czego nie da się odzyskać z chmury:** tylko 3 kadry na film (hard/medium/easy); pełna historia scrapingu yt/trailer (`yt_url`, `video_id`, `tried_ids`, query/status). Edycje z nakładki Content (cytaty, pytania, PL, modes_off, obsada, plakaty) są w eksporcie i w merge przed deployem.

## Wdrożenie na Cloudflare

Wersja w chmurze służy do grania ze znajomymi przez internet. **Scraping** (YouTube, nowe kadry) zostaje w lokalnym studiu (`python app.py`). **Edycja treści** działa też w chmurze w `/admin` (ten sam UI co lokalnie, bez scrapera).

### Co edytujesz w chmurze

Po zalogowaniu hasłem `ADMIN_PASSWORD` (sekret wranglera):

- cytaty (CRUD + wklejanie listy z podglądem)
- pytania licytacji (CRUD + hurtem + auto-uzupełnianie odpowiedzi z filmów pakietu)
- polskie tytuły i aliasy (inline + wklejanie listy)
- włączanie/wyłączanie trybów w pakiecie
- plakat: podmiana URL albo upload do 1,5 MB
- obsada: edycja, kolejność i zdjęcia (link/plik); scraper obsady tylko lokalnie
- metadane filmu (np. rok)

Scraper, nowe pakiety i ustawienia TMDB w chmurze są ukryte / zwracają 405 z krótką notką.

### Jak przechowywane są edycje (Content DO)

Static Assets są niemutowalne między deployami, więc zapisy idą do singletonowego Durable Object **Content** (SQLite, `idFromName("content")`):

- niski koszt żądań (jeden obiekt, nie D1 — bez `wrangler d1 create`)
- migracja `v2` w `wrangler.jsonc` tworzy klasę automatycznie przy deployu
- skuteczne dane = baza ze Static Assets + nakładka (overlay); nowe pokoje ładują merge

### Synchronizacja lokalnie ↔ chmura (bez utraty edycji)

| Kierunek | Zachowanie |
|---|---|
| **Pobierz bazę** / `pull_from_cloudflare.py` | eksport `kadr-export-v1` już ze **scaloną** nakładką |
| **Pełny deploy** | przed buildem: backup `quiz.db`, pobranie overlay, merge do lokalnej bazy (podsumowanie + konflikty), potem build+deploy; po sukcesie **czyszczenie overlay** (edycje są już w assetach) |
| **`--code-only`** | bez ruszania assetów; binding CONTENT zostaje; safety check działa |
| **Konflikty** | nowszy `updated_at` wygrywa; cytaty bez lokalnego timestampu → chmura + wpis w konfliktach |

### Aktualizacja do wersji z edycją w chmurze (PowerShell)

Jednorazowo (Content DO powstaje sam przy deployu — bez ręcznego D1):

```powershell
cd C:\sciezka\do\shot-
git pull
cd cloudflare
npm install
cd ..
# jeśli na live jest stary Worker bez eksportu, najpierw sam kod:
python deploy_cloudflare.py --code-only
python pull_from_cloudflare.py --url https://shot-quiz.<twoje>.workers.dev
python deploy_cloudflare.py --url https://shot-quiz.<twoje>.workers.dev
# ADMIN_PASSWORD już ustawione? pomiń; inaczej:
cd cloudflare; npx wrangler secret put ADMIN_PASSWORD; cd ..
```

Potem zwykłe aktualizacje: `git pull` → (opcjonalnie edycje w chmurze albo lokalnie) → `python deploy_cloudflare.py` (skrypt sam zmerguje nakładkę przed wysłaniem).

Architektura (plan Free):
- **Worker** `shot-quiz` — strony, API, admin z zapisem, geo PL/EN
- **Durable Object `Room`** — pokój + WebSocket (jak wcześniej)
- **Durable Object `Content`** — nakładka edycji (SQLite)
- **Workers Static Assets** — kadry / plakaty / JSON pakietów z `quiz.db` → `cloudflare/build/` (poza gitem)

Nie dotyka workera ani bazy `mozg` (osobna nazwa `shot-quiz`).

### Pierwsze wdrożenie (Windows, PowerShell)

1. Zainstaluj Node.js LTS (wersja 20 lub nowsza):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   ```
   Potem zamknij i otwórz ponownie PowerShell, a następnie sprawdź: `node -v`.
2. Pobierz najnowszy kod i zainstaluj wranglera:
   ```powershell
   cd C:\sciezka\do\shot-
   git pull
   cd cloudflare
   npm install
   ```
3. Zaloguj się do Cloudflare (otworzy się przeglądarka):
   ```powershell
   npx wrangler login
   npx wrangler whoami
   ```
4. Wyślij grę razem z danymi (z katalogu głównego repo):
   ```powershell
   cd ..
   python deploy_cloudflare.py
   ```
   Skrypt migruje `quiz.db` (jak zwykłe uruchomienie aplikacji), buduje `cloudflare\build\` i uruchamia `npx wrangler deploy`. Za pierwszym razem Cloudflare sam utworzy Durable Objecty Room i Content (migracje w wrangler.jsonc) — bez ręcznego zakładania D1 ani innych zasobów. Jeśli wrangler zapyta o subdomenę `workers.dev`, wybierz dowolną.
5. Na końcu wyniku pojawi się adres, np. `https://shot-quiz.TWOJA-SUBDOMENA.workers.dev`. Znajdziesz go też w panelu Cloudflare: Workers & Pages → shot-quiz.
6. Ustaw hasło do panelu `/admin` w chmurze (jednorazowo, wpisujesz je w konsoli i nie trafia do repo):
   ```powershell
   cd cloudflare
   npx wrangler secret put ADMIN_PASSWORD
   cd ..
   ```
   Bez sekretu panel w chmurze jest wyłączony, a gra działa normalnie.

### Aktualizacja po nowym scrapingu

Dodajesz filmy lokalnie (`python app.py`), a potem:
```powershell
cd C:\sciezka\do\shot-
git pull
python deploy_cloudflare.py
```
Po zmianach w kodzie (`git pull`) warto też odświeżyć zależności: `cd cloudflare; npm install; cd ..`. Inna baza: `python deploy_cloudflare.py --db D:\inna\quiz.db`. Samo zbudowanie bez wysyłania: `python deploy_cloudflare.py --build-only`. Lokalny podgląd wersji chmurowej: `python deploy_cloudflare.py --dev`, potem otwórz http://127.0.0.1:8787. Do testu panelu lokalnie utwórz plik `cloudflare\.dev.vars` z linią `ADMIN_PASSWORD=cos`; plik jest poza gitem.

Wysłanie nowej wersji na chwilę rozłącza trwające gry. Przeglądarki łączą się same ponownie i stan pokoju zostaje. Nowe dane trafiają do nowych pokoi, bo pokój pamięta swój pakiet z chwili założenia.

### Własna domena (opcjonalnie)

Domena musi być dodana do twojego konta Cloudflare. Wtedy w panelu: Workers & Pages → shot-quiz → Settings → Domains & Routes → Add → Custom domain (np. `quiz.twojadomena.pl`). Możesz też dopisać w `cloudflare/wrangler.jsonc`:
```jsonc
"routes": [{ "pattern": "quiz.twojadomena.pl", "custom_domain": true }]
```
i ponownie uruchomić `python deploy_cloudflare.py`.

### Limity planu Free

- 20 000 plików statycznych na wersję. Przy 3 kadrach i plakacie na film to około 4 900 filmów. Zdjęcia aktorów nie idą jako osobny plik na osobę: są spakowane w kilka plików `data/actors-XX.bin` plus indeks (deduplikacja po aktorze, małe headshoty). Skrypt przerwie wysyłkę, gdy łączny limit plików zostanie przekroczony.
- 100 000 żądań dziennie do Workera (kadry i plakaty jako pliki statyczne są darmowe i się nie liczą).
- Dla Durable Objects: 100 000 żądań dziennie i 13 000 GB-s dziennie. Wiadomości WebSocket liczą się 20:1. Wieczór ze znajomymi to drobny ułamek tego limitu.

Test end-to-end (dwóch graczy po WebSocket, wszystkie tryby): uruchom `npx wrangler dev --port 8788` w `cloudflare\`, a w drugim oknie `node test\ws_game.mjs`.
