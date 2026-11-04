// Komunikaty błędów po angielsku (klucze jak w app.py EN_ERRORS)
const EN = {
  "Nie ma takiej strony": "Page not found",
  "Nie ma takiego pakietu": "No such pack",
  "Ten pakiet nie ma jeszcze gotowych filmów": "This pack has no ready movies yet",
  "Nie ma takiego adresu": "No such address",
  "Nie ma pokoju o tym kodzie": "No room with this code",
  "Pokój jest pełny": "The room is full",
  "Nie jesteś w tym pokoju": "You are not in this room",
  "Tylko gospodarz może to zrobić": "Only the host can do that",
  "Złe hasło": "Wrong password",
  "Zaloguj się": "Please log in",
  "Panel admina w chmurze jest wyłączony (brak sekretu ADMIN_PASSWORD)": "The cloud admin is disabled (no ADMIN_PASSWORD secret)",
  "Za duże żądanie": "Request too large",
  "Zły format danych": "Bad data format",
};
export const errText = (key, lang) => (lang === "en" ? EN[key] || key : key);
