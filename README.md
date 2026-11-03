# kadr* - quiz filmowy dla znajomych

Zgadujcie film po kadrze z trailera. Najpierw trudny kadr, potem średni, na końcu łatwy. Im szybciej, tym więcej punktów.

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

Tytuły wpisuje się w oryginale (np. "The Shining"). Literówki są wybaczane.
