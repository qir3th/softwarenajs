# mObywatel Serwer 🇵🇱

## Struktura folderów

```
twoj-folder/
  server.js          ← serwer (ten plik)
  package.json       ← konfiguracja Node.js
  software/          ← Twoje pliki HTML/CSS/JS (wrzuć całą zawartość ZIPa tutaj)
    assets/
    card.html
    dashboard.html
    generator.html
    ... itd
  data/              ← tworzy się automatycznie, tu są zapisane dowody
    cards.json
    config.json      ← tu jest Twój token admina
```

---

## Jak wrzucić na Railway (darmowy hosting) — krok po kroku

### 1. Przygotuj pliki
- Wrzuć plik `server.js` i `package.json` do jednego folderu
- W tym samym folderze utwórz folder `software/` i wrzuć do niego **całą zawartość ZIPa** (czyli foldery assets/, pliki .html itp.)

### 2. Wrzuć na GitHub
- Wejdź na https://github.com i utwórz konto (jeśli nie masz)
- Kliknij "New repository"
- Nazwij go np. `mobywatel`
- Wrzuć wszystkie pliki do tego repozytorium

### 3. Zarejestruj się na Railway
- Wejdź na https://railway.app
- Kliknij "Login" i zaloguj się przez GitHub

### 4. Wdróż projekt
- Kliknij "New Project"
- Wybierz "Deploy from GitHub repo"
- Wybierz Twoje repozytorium `mobywatel`
- Railway sam wykryje Node.js i uruchomi serwer

### 5. Znajdź swój token admina
- Po wdrożeniu kliknij na swój projekt
- Kliknij zakładkę "Logs"
- Znajdź linię: `Token admina: XXXXXXXXXX`
- **Zapisz ten token!** Będzie Ci potrzebny do logowania

### 6. Otwórz aplikację
- W Railway kliknij "Settings" → "Networking" → "Generate Domain"
- Kliknij w wygenerowany link np. `mobywatel.up.railway.app`
- Wejdź na `/login` i wpisz swój token

---

## Jak używać

### Logowanie do panelu
1. Wejdź na `twoja-domena.up.railway.app/login`
2. Wpisz token admina z logów Railway
3. Kliknij "Zaloguj się"

### Tworzenie nowego dowodu
1. W panelu kliknij "Utwórz"
2. Wpisz wszystkie dane osoby
3. Wgraj zdjęcie
4. Kliknij "Zapisz"
5. W panelu kliknij "Skopiuj URL" przy nowym dowodzie
6. Wyślij ten link osobie — gotowe! ✅

### Link dla odbiorcy wygląda tak:
```
twoja-domena.up.railway.app/id?card_token=UNIKALNY_TOKEN
```

Każda osoba ma swój unikalny token — link działa zawsze. 🔥

---

## Problemy?

**Serwer nie startuje** → Sprawdź czy folder `software/` jest na miejscu

**Nie mogę się zalogować** → Sprawdź logi Railway, token jest tam wypisany

**Zdjęcie nie ładuje** → Upewnij się że wgrałeś zdjęcie podczas tworzenia dowodu
