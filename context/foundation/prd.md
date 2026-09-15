---
project: "Panel Ekspertów"
version: 2
status: draft
created: 2026-09-15
context_type: greenfield
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# PRD — Panel Ekspertów

## Vision & Problem Statement

Każdy — od osoby prywatnej po foundera startupu — podejmuje decyzje średniej wagi (zmiana pracy, większy zakup, model cenowy, kontrakt) bez dostępu do realnej kontry: konsultacja ze specjalistą jest za droga i za wolna dla tej klasy decyzji, otoczenie zwraca wariant własnego myślenia (efekt echa), a zwykły czat z modelem językowym zachowuje się kooperacyjnie i utwierdza w decyzji zamiast ją testować. Kosztem jest błąd decyzyjny: najpoważniejsza wada pomysłu wychodzi na jaw późno, po poniesieniu kosztów. Dominująca kategoria bólu: paraliż/błąd decyzyjny — użytkownik nie widzi argumentów spoza własnej perspektywy. Użytkownik po prostu wpisuje, jaki ma problem lub decyzję do podjęcia, i startuje sesję z panelem doradców.

Insight: sam pomysł "panelu wielu person" jest oczywisty — trudna część, której naiwne podejścia wielopersonowe nie robią, to **wymuszenie realnej rozbieżności**. Bez mechaniki (izolacja person w rundzie pierwszej, ocena liczbowa przed uzasadnieniem, obowiązek wskazania autora argumentu przy zmianie zdania, kontrola rozrzutu ocen) użytkownik dostaje kilka wariantów tej samej opinii. Mechanika wymuszania sporu jest sednem produktu, nie dodatkiem. Cel nadrzędny produktu: skrócić czas między pojawieniem się pomysłu a wykryciem jego najpoważniejszej wady. Zakres wejścia: użytkownik może poddać pod panel dowolną decyzję — od błahej (np. kupno butów) po złożoną biznesową; produkt nie ogranicza domeny decyzji i nie jest adresowany wyłącznie do biznesu — jest dla każdego.

## User & Persona

Persona pierwotna: każda osoba stojąca przed decyzją średniej wagi — za małą, by płacić za konsultację, za dużą, by rozstrzygnąć intuicją — bez dostępu do bezstronnej kontry w otoczeniu. Typowe pytania: czy zmienić pracę, czy podpisać tę umowę, czy wchodzić w ten model cenowy, czy warto budować tę funkcję. Produkt nie zakłada żadnego profilu zawodowego użytkownika.

### Secondary persona

Founderzy i osoby prowadzące działalność testujący decyzje biznesowe; PM-owie/analitycy używający panelu jako próby generalnej przed obroną propozycji przed zarządem; studenci jako użytkownicy dydaktyczni. MVP służy personie pierwotnej.

## Success Criteria

### Primary

- Panel realnie się różni: średni rozrzut ocen między personami w rundzie pierwszej > 2 pkt w skali 1–10. Niespełnienie tego progu oznacza, że produkt nie działa (kilka wariantów jednej opinii).

### Secondary

- W typowej sesji co najmniej jedna persona zmienia ocenę w rundzie drugiej i wskazuje autora argumentu, który ją przekonał.

### Guardrails

- Izolacja sesji per użytkownik: użytkownik nigdy nie widzi cudzych sesji — prywatność danych decyzyjnych.

## User Stories

### US-01: Użytkownik poddaje decyzję pod panel i otrzymuje rozbieżne opinie

- **Given** zalogowany użytkownik wpisał opis problemu/decyzji z kontekstem (sytuacja, ograniczenia)
- **When** uruchamia sesję panelu
- **Then** widzi każdego doradcę z avatarem piszącego równolegle swoją niezależną opinię (odpowiedzi streamowane na żywo; ocena 1–10, teza, argumenty); może dopisać własny komentarz/kontekst i uruchomić kolejną rundę, w której zmiany ocen mają wskazanego autora argumentu; kończy sesję i otrzymuje syntezę z co najmniej jedną osią sporu; sesja zapisuje się na jego koncie

# TODO: user stories pokrywające FR-007 (dopytanie doradcy w wątku pobocznym) i FR-008 (powrót do zapisanej sesji + kolejna runda) — see Open Questions

## Functional Requirements

- FR-001: Użytkownik może założyć konto i zalogować się (email + hasło lub OAuth); widzi wyłącznie własne sesje. Priority: must-have
  > Socrates: Kontrargument rozważony: "bariera przed wartością — rejestracja przed
  > zobaczeniem czegokolwiek odstrasza, zanim panel udowodni wartość."
  > Rozwiązanie: kept; użytkownik świadomie wybrał konta od MVP (historia na koncie,
  > izolacja per użytkownik jako guardrail). Kształt onboardingu do rozstrzygnięcia
  > downstream — patrz Open Questions.
- FR-002: Użytkownik może opisać dowolny problem lub decyzję do rozstrzygnięcia i dodać kontekst (sytuacja, ograniczenia; dla decyzji biznesowych np. branża, wielkość firmy). Priority: must-have
  > Socrates: Kontrargument rozważony: "zbyt ubogi kontekst → puste opinie — jedno
  > mgliste zdanie i persony nie mają o co się spierać, rozrzut ocen spada."
  > Rozwiązanie: kept; formularz aktywnie dopytuje o minimum kontekstu przed
  > uruchomieniem panelu.
- FR-003: Użytkownik może uruchomić rundę pierwszą: zestaw predefiniowanych doradców o odrębnych, uniwersalnych profilach (np. optymista, sceptyk, pragmatyk, analityk — pasujących do dowolnej domeny decyzji) wydaje równoległe, niezależne opinie (ocena 1–10, teza, argumenty). Każdy doradca ma avatar i pisze w swoim własnym obszarze. Priority: must-have
  > Socrates: Kontrargument rozważony: "stały skład nie pasuje do każdej decyzji —
  > jałowa rola 'odhacza' perspektywę i rozmywa rozrzut ocen."
  > Rozwiązanie: kept; role są celowo uniwersalne (nie branżowe), a definiowanie
  > własnych doradców i wybór składu panelu pozostają kandydatami do v2; jałowość
  > roli w danej sprawie jest sygnałem do obserwacji w prototypie.
- FR-004: Użytkownik może uruchomić rundę drugą: persony odnoszą się do stanowisk pozostałych; zmiana oceny wymaga wskazania autora przekonującego argumentu. Priority: must-have
  > Socrates: Kontrargument rozważony: "atrybucja może być teatrem — model 'odgrywa'
  > zmianę zdania i wskazuje autora rytualnie, nie merytorycznie."
  > Rozwiązanie: kept; sam wymóg formatu nie wystarczy — jakość atrybucji wymaga
  > kontroli w prototypie rundy drugiej (patrz Open Questions).
- FR-005: Użytkownik może zobaczyć syntezę: punkty zgody, osie sporu, ryzyka według wagi, rekomendowany następny krok. Priority: must-have
  > Socrates: Kontrargument rozważony: "synteza może przemycić uśrednioną odpowiedź —
  > wygładzić spór i oddać tę 'jedną wyważoną opinię', przeciw której produkt jest zbudowany."
  > Rozwiązanie: kept; synteza ma obowiązek pokazać co najmniej jedną realną oś sporu,
  > nie konsensus (spójne z kryteriami sukcesu briefu).
- FR-006: Użytkownik może zapisać sesję na koncie i wrócić do niej z historii. Priority: must-have
  > Socrates: Kontrargument rozważony: "historia serwerowa = odpowiedzialność —
  > przechowywanie cudzych opisów decyzji biznesowych to obowiązki (prywatność,
  > retencja, bezpieczeństwo) rosnące szybciej niż wartość funkcji w MVP."
  > Rozwiązanie: kept; izolacja per użytkownik jest guardrailem, a zobowiązania
  > prywatności trafiają do NFR/Open Questions.
- FR-007: Użytkownik może dopytać wybraną personę w wątku pobocznym, nie przerywając debaty. Priority: must-have
  > Socrates: Kontrargument rozważony: "rozszerza zakres ponad budżet — brief sam
  > umieścił to w rozszerzeniach; wątki poboczne to osobny model danych i UI."
  > Rozwiązanie: kept jako must-have decyzją użytkownika (świadome rozszerzenie
  > zakresu odnotowane przy budżecie czasowym).
- FR-008: Użytkownik może wrócić do zapisanej sesji, dorzucić nowy kontekst i uruchomić kolejną rundę. Priority: must-have
  > Socrates: Kontrargument rozważony: "koszt rośnie z liczbą rund — bez limitu rund
  > funkcja jest nieopłacalna (ryzyko wprost z briefu)."
  > Rozwiązanie: kept; przeciwdziałania z briefu obowiązują: limit rund, cache,
  > krótsze odpowiedzi w rundach dalszych.
- FR-009: Odpowiedzi doradców są streamowane na żywo (token po tokenie), wszyscy doradcy piszą równolegle, każdy w swoim obszarze z avatarem — sesja ma wyglądać jak naturalna, tocząca się rozmowa, nie jak oczekiwanie na gotowy raport. Priority: must-have
- FR-010: Użytkownik może w trakcie sesji dopisać własny komentarz/nowy kontekst i uruchomić kolejną rundę, a następnie jawnie zakończyć sesję — zakończenie generuje syntezę (FR-005). Priority: must-have

## Non-Functional Requirements

- Średni rozrzut ocen między personami w rundzie pierwszej przekracza 2 pkt w skali 1–10 — mierzalny próg jakości potwierdzający, że panel realnie się różni.

# TODO: zobowiązania prywatności/retencji dla przechowywanych opisów decyzji (zadeklarowane przy FR-006, nie doprecyzowane) — see Open Questions

## Business Logic

Aplikacja wymusza na zestawie sprzecznych perspektyw niezależną ocenę decyzji użytkownika, konfrontuje je ze sobą i wskazuje, gdzie spór jest realny, a gdzie panel się zgadza — wraz z ryzykami według wagi.

Wejściem reguły jest opis problemu/decyzji użytkownika wraz z kontekstem (sytuacja, ograniczenia). Wyjściem — zestaw niezależnych stanowisk predefiniowanych doradców (ocena 1–10, teza, argumenty), kolejne rundy konfrontacji (opcjonalnie wzbogacone o dopisany przez użytkownika kontekst), w których zmiana oceny musi wskazywać autora przekonującego argumentu, oraz — po zakończeniu sesji przez użytkownika — synteza z punktami zgody, co najmniej jedną realną osią sporu, ryzykami według wagi i rekomendowanym następnym krokiem.

Użytkownik spotyka regułę w przepływie sesji: opinie rundy pierwszej powstają niezależnie od siebie (izolacja perspektyw jest warunkiem rozbieżności) i piszą się równolegle na oczach użytkownika (streaming), runda druga ujawnia reakcje i zmiany zdania, synteza nie wygładza sporu — pokazuje go. Doradcy mają celowe, zdefiniowane uprzedzenia (optymista przeszacowuje szanse, sceptyk szuka powodów do odmowy, pragmatyk redukuje wszystko do kosztu i wykonalności itd.); pełny obraz daje dopiero zderzenie skrzywień, nie ich uśrednienie.

Zasada projektowa z briefu (zapisana informacyjnie, nie jako NFR): interfejs jasno komunikuje symulowany charakter opinii; przy tematach prawnych/finansowych aplikacja kieruje do realnego doradcy.

## Access Control

Logowanie kontem (email + hasło lub OAuth) od MVP. Model płaski — jeden typ konta, bez ról admin/member; każdy zalogowany użytkownik widzi wyłącznie własne sesje (izolacja per użytkownik). Nieuwierzytelniony użytkownik na chronionej trasie kierowany do logowania. Historia sesji przypięta do konta, dostępna z wielu urządzeń.

## Non-Goals

- Brak dostępu do aktualnych danych rynkowych i finansowych — opinie opierają się wyłącznie na kontekście podanym przez użytkownika.
- Żadne doradztwo o statusie prawnym lub inwestycyjnym — produkt symuluje perspektywy, nie zastępuje doradcy.
- Brak pracy wieloosobowej w czasie rzeczywistym — sesja jest jednoosobowa.
- Brak integracji z zewnętrznymi systemami.
- Brak ograniczania domeny decyzji — aplikacja nie odrzuca "błahych" tematów; otwartość wejścia jest cechą, nie brakiem (patrz Vision, zakres wejścia).

Odroczenia do v2 (z briefu, nie twarde non-goals): definiowanie własnych doradców (nazwa, avatar, profil perspektywy) i wybór składu panelu — docelowo użytkownik będzie mógł dodawać nowych doradców, MVP ma wyłącznie predefiniowanych; wizualizacja rozkładu ocen między rundami; eksport sesji do PDF; biblioteka gotowych składów panelu.

## Open Questions

1. **Kształt onboardingu przy kontach od MVP** — rejestracja przed zobaczeniem wartości może odstraszać (kontrargument przy FR-001, świadomie zaakceptowany); jak zminimalizować barierę przed pierwszą sesją. Owner: user. By: przed projektowaniem przepływu rejestracji.
2. **Jakość atrybucji w rundzie drugiej** — sam wymóg wskazania autora argumentu nie gwarantuje merytorycznej zmiany zdania ("teatr atrybucji", kontrargument przy FR-004); wymaga kontroli w prototypie rundy drugiej. Owner: user. Block: przed uznaniem kryterium Secondary za wiarygodne.
3. **Zobowiązania prywatności i retencji dla historii sesji** — przechowywanie opisów decyzji biznesowych użytkowników rodzi obowiązki (prywatność, retencja, bezpieczeństwo) zadeklarowane przy FR-006, ale nie doprecyzowane jako NFR. Owner: user.
4. **User stories dla FR-007 i FR-008** — wątek poboczny z personą oraz dopisanie kontekstu i kolejna runda nie mają scenariuszy Given/When/Then; jedyna historia (US-01) pokrywa FR-001–FR-006. Owner: user.
5. **Zakres MVP vs budżet 3 tygodni** — użytkownik świadomie rozszerzył MVP o FR-007 i FR-008 jako must-have, znając ryzyko przekroczenia potwierdzonego budżetu (mvp_weeks: 3, praca po godzinach); decyzja odnotowana jako override miękkiej bramki. Owner: user. Block: no (świadoma decyzja, do rewizji przy planowaniu).
