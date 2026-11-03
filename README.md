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
Nowe kolumny (polski tytuł, aliasy, cytaty, obsada, plakaty, wyłączone tryby) dodają się same przy starcie (ALTER TABLE), istniejące dane zostają.

## Tryby gry

Gospodarz wybiera pakiet, a w poczekalni zaznacza tryby i liczbę rund. Filmy losowane są tylko z tego pakietu, rundy przeplatają zaznaczone tryby, punkty sumują się w jednym rankingu.

| Tryb | Zasady | Wymaga |
|---|---|---|
| Kadry | trzy kadry od trudnego do łatwego, wcześniej = więcej punktów | 1 film z kadrami |
| Zoom | mocne zbliżenie kadru, które się oddala (30 s) | 1 film z kadrami |
| Licytacja | każdy po cichu deklaruje, ile filmów z pakietu wymieni (15 s). Najwyższa oferta (remis: kto pierwszy) wpisuje tytuły na czas: 15 s + 5 s za film, max 90 s. Liczą się filmy z listy pakietu (tytuł, aliasy, w PL też polski tytuł), bez powtórek. Uda się: 200 pkt x deklaracja. Nie uda się: pozostali po 100 pkt x deklaracja | 5 filmów na liście |
| Który rok | podaj rok premiery: dokładnie 1000 pkt, każdy rok różnicy około -30 procent, ponad 8 lat 0 | 3 filmy z rokiem |
| Ułóż po kolei | 4 filmy od najstarszego do najnowszego, 250 pkt za każde dobre miejsce | 4 różne lata |
| Plakat | plakat się wyostrza (pikseloza) albo odsłania kafelkami | 3 plakaty z TMDB |
| Aktorzy | obsada pojawia się co 6 s, od najmniej znanych nazwisk; mniej nazwisk = więcej punktów | 3 filmy z obsadą z TMDB |
| Cytat | cytat wpisany przez admina, w połowie czasu podpowiedź z rokiem | 5 cytatów w pakiecie |

W trybach z tytułem pierwsza poprawna odpowiedź dostaje +100 pkt. Tryb bez wystarczających danych jest wyszarzony z podpowiedzią, czego brakuje.
Admin może wyłączyć dowolny tryb dla pakietu (strona pakietu, panel "tryby gry").

## TMDB (Plakat, Aktorzy)

1. Załóż darmowe konto na themoviedb.org i wygeneruj klucz API (v3) albo token (v4).
2. Panel admina, Ustawienia: wklej klucz. Jest sprawdzany i zapisywany w `config.local.json` (poza gitem i poza eksportem .sql). Można też użyć zmiennej `TMDB_API_KEY`.
3. Strona pakietu, "Pobierz dane TMDB": dla każdego filmu szuka go po tytule i roku, zapisuje plakat lokalnie w bazie i 8 głównych aktorów z popularnością. Opcjonalnie uzupełnia puste polskie tytuły. Postęp widać w logu "na żywo".

Bez klucza Plakat i Aktorzy są niedostępne. Nic nie jest zmyślane: dane pochodzą tylko z TMDB albo od admina.
Ta aplikacja korzysta z API TMDB, ale nie jest przez TMDB wspierana ani certyfikowana.

## Polskie tytuły i aliasy

- Strona pakietu, "polskie tytuły": wklej listę w formacie `Original Title (rok) = Polski tytuł` albo `Original Title = Polski tytuł`.
  "podgląd" pokazuje dopasowane i niedopasowane linie (brak w pakiecie, zły format, niejednoznaczne bez roku), "zapisz dopasowane" zapisuje tylko dopasowane.
- Obok tabela do edycji polskiego tytułu i aliasów w miejscu (zapis po wyjściu z pola, aliasy po średniku).
- Edycja filmu: polski tytuł, aliasy i cytaty (jeden w linii).
- W wersji PL gra przyjmuje oryginał, aliasy, polski tytuł oraz jego główny człon ("Obcy" dla "Obcy - 8. pasażer Nostromo"). Wyniki i podpowiedzi pokazują polski tytuł, oryginał mniejszą czcionką.

## Testy

```
python3 test_scraper_fallback.py
python3 test_game.py            # na kopii quiz.db: migracje, wklejanie PL, atrapa TMDB, gra 2 graczy we wszystkich trybach
```
