---
project: "Panel Ekspertów"
context_type: greenfield
created: 2026-09-15
updated: 2026-09-15
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 8
  quality_check_status: accepted
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Shape notes — Panel Ekspertów

Seed: brief produktowy v0.1 (wrzesień 2026) dostarczony przez użytkownika przy wywołaniu /10x-shape.

## Vision & Problem Statement

Founder wczesnego startupu lub osoba prowadząca jednoosobową działalność podejmuje decyzje biznesowe średniej wagi (model cenowy, kontrakt, budowa funkcji) bez dostępu do realnej kontry: konsultacja ze specjalistą jest za droga i za wolna dla tej klasy decyzji, otoczenie zwraca wariant własnego myślenia (efekt echa), a zwykły czat z modelem językowym zachowuje się kooperacyjnie i utwierdza w decyzji zamiast ją testować. Kosztem jest błąd decyzyjny: najpoważniejsza wada pomysłu wychodzi na jaw późno, po poniesieniu kosztów. Dominująca kategoria bólu: paraliż/błąd decyzyjny — użytkownik nie widzi argumentów spoza własnej perspektywy.

Insight: sam pomysł "panelu wielu person LLM" jest oczywisty — trudna część, której naiwne multi-persona prompty nie robią, to **wymuszenie realnej rozbieżności**. Bez mechaniki (izolacja person w rundzie pierwszej, ocena liczbowa przed uzasadnieniem, obowiązek wskazania autora argumentu przy zmianie zdania, kontrola rozrzutu ocen) użytkownik dostaje pięć wariantów tej samej opinii. Mechanika wymuszania sporu jest sednem produktu, nie dodatkiem.

Cel nadrzędny produktu (z briefu): skrócić czas między pojawieniem się pomysłu a wykryciem jego najpoważniejszej wady.

Zakres wejścia (decyzja z Fazy 6): użytkownik może poddać pod panel dowolną decyzję — od błahej (np. kupno butów) po złożoną biznesową. Produkt nie ogranicza domeny decyzji; persona pierwotna pozostaje biznesowa, ale wejście jest otwarte.

Notatka ze skali (sonda 100x, Faza 6): przy tysiącach sesji dziennie koszt wywołań przestaje być optymalizacją i staje się częścią reguł gry produktu — limit rund, długość odpowiedzi i cache wchodzą do projektu produktu, nie tylko implementacji.

## User & Persona

Persona pierwotna: founder wczesnego startupu / osoba prowadząca jednoosobową działalność, podejmująca decyzje biznesowe bez zaplecza doradczego (brak prawnika, inwestora, osoby operacyjnej pod ręką). Moment sięgnięcia po produkt: decyzja średniej wagi — za mała, by płacić za konsultację, za duża, by rozstrzygnąć intuicją. Typowe pytania: czy wchodzić w ten model cenowy, czy ten kontrakt jest bezpieczny, czy warto budować tę funkcję.

### Secondary persona

PM-owie/analitycy używający panelu jako próby generalnej przed obroną propozycji przed zarządem; studenci biznesu jako użytkownicy dydaktyczni. MVP służy personie pierwotnej.

## Access Control

Logowanie kontem (email + hasło lub OAuth) od MVP. Model płaski — jeden typ konta, bez ról admin/member; każdy zalogowany użytkownik widzi wyłącznie własne sesje (izolacja per użytkownik). Nieuwierzytelniony użytkownik na chronionej trasie kierowany do logowania. Historia sesji przypięta do konta, dostępna z wielu urządzeń.

## Success Criteria

### Primary
- Panel realnie się różni: średni rozrzut ocen między personami w rundzie pierwszej > 2 pkt w skali 1–10. Niespełnienie tego progu oznacza, że produkt nie działa (pięć wariantów jednej opinii).

### Secondary
- W typowej sesji co najmniej jedna persona zmienia ocenę w rundzie drugiej i wskazuje autora argumentu, który ją przekonał.

### Guardrails
- Izolacja sesji per użytkownik: użytkownik nigdy nie widzi cudzych sesji — prywatność danych decyzyjnych.

## MVP flow (v1)

1. Użytkownik zakłada konto / loguje się (email lub OAuth).
2. Wpisuje opis decyzji + kontekst (branża, wielkość firmy, ograniczenia).
3. Runda 1 — pięć predefiniowanych person wydaje równoległe, niezależne opinie (ocena 1–10, teza, argumenty).
4. Runda 2 — persony widzą stanowiska pozostałych i reagują; zmiana oceny wymaga wskazania autora argumentu.
5. Synteza — punkty zgody, osie sporu, ryzyka wg wagi, rekomendowany następny krok.
6. Sesja zapisana na koncie; użytkownik może wrócić do historii.

Timeline: mvp_weeks = 3 (praca po godzinach); użytkownik potwierdził, że pełny przepływ z auth i historią serwerową mieści się w tym budżecie. Uwaga: w Fazie 4 użytkownik świadomie rozszerzył MVP o FR-007 (dopytanie persony) i FR-008 (nowy kontekst + kolejna runda) jako must-have, znając ryzyko powiększenia zakresu ponad potwierdzony budżet.

## Functional Requirements

- FR-001: Użytkownik może założyć konto i zalogować się (email + hasło lub OAuth); widzi wyłącznie własne sesje. Priority: must-have
  > Socrates: Kontrargument rozważony: "bariera przed wartością — rejestracja przed
  > zobaczeniem czegokolwiek odstrasza, zanim panel udowodni wartość."
  > Rozwiązanie: kept; użytkownik świadomie wybrał konta od MVP (historia na koncie,
  > izolacja per użytkownik jako guardrail). Kształt onboardingu do rozstrzygnięcia
  > downstream — patrz Open Questions.
- FR-002: Użytkownik może opisać decyzję do rozstrzygnięcia i dodać kontekst (branża, wielkość firmy, ograniczenia). Priority: must-have
  > Socrates: Kontrargument rozważony: "zbyt ubogi kontekst → puste opinie — jedno
  > mgliste zdanie i persony nie mają o co się spierać, rozrzut ocen spada."
  > Rozwiązanie: kept; formularz aktywnie dopytuje o minimum kontekstu przed
  > uruchomieniem panelu.
- FR-003: Użytkownik może uruchomić rundę pierwszą: pięć predefiniowanych person o odrębnych profilach wydaje równoległe, niezależne opinie (ocena 1–10, teza, argumenty). Priority: must-have
  > Socrates: Kontrargument rozważony: "stała piątka nie pasuje do każdej decyzji —
  > jałowa rola 'odhacza' perspektywę i rozmywa rozrzut ocen."
  > Rozwiązanie: kept; wybór składu panelu pozostaje kandydatem do v2, a jałowość
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

## User Stories

### US-01: Founder poddaje decyzję pod panel i otrzymuje rozbieżne opinie

- **Given** zalogowany użytkownik wpisał opis decyzji z kontekstem (branża, wielkość firmy, ograniczenia)
- **When** uruchamia panel
- **Then** widzi pięć niezależnych opinii (ocena 1–10, teza, argumenty); może uruchomić rundę drugą, w której zmiany ocen mają wskazanego autora argumentu; otrzymuje syntezę z co najmniej jedną osią sporu; sesja zapisuje się na jego koncie

## Business Logic

Aplikacja wymusza na pięciu sprzecznych perspektywach niezależną ocenę decyzji użytkownika, konfrontuje je ze sobą i wskazuje, gdzie spór jest realny, a gdzie panel się zgadza — wraz z ryzykami według wagi.

Wejściem reguły jest opis decyzji użytkownika wraz z kontekstem (branża, wielkość firmy, ograniczenia). Wyjściem — zestaw pięciu niezależnych stanowisk (ocena 1–10, teza, argumenty), runda konfrontacji, w której zmiana oceny musi wskazywać autora przekonującego argumentu, oraz synteza z punktami zgody, co najmniej jedną realną osią sporu, ryzykami według wagi i rekomendowanym następnym krokiem.

Użytkownik spotyka regułę w przepływie sesji: opinie rundy pierwszej powstają niezależnie od siebie (izolacja perspektyw jest warunkiem rozbieżności), runda druga ujawnia reakcje i zmiany zdania, synteza nie wygładza sporu — pokazuje go. Persony mają celowe, zdefiniowane uprzedzenia (inwestor przeszacowuje skalę, prawnik jest nadmiernie ostrożny itd.); pełny obraz daje dopiero zderzenie skrzywień, nie ich uśrednienie.

Zasada projektowa z briefu (zapisana informacyjnie, nie jako NFR): interfejs jasno komunikuje symulowany charakter opinii; przy tematach prawnych/finansowych aplikacja kieruje do realnego doradcy.

## Non-Functional Requirements

- Średni rozrzut ocen między personami w rundzie pierwszej przekracza 2 pkt w skali 1–10 — mierzalny próg jakości potwierdzający, że panel realnie się różni.

## Non-Goals

- Brak dostępu do aktualnych danych rynkowych i finansowych — opinie opierają się wyłącznie na kontekście podanym przez użytkownika.
- Żadne doradztwo o statusie prawnym lub inwestycyjnym — produkt symuluje perspektywy, nie zastępuje doradcy.
- Brak pracy wieloosobowej w czasie rzeczywistym — sesja jest jednoosobowa.
- Brak integracji z zewnętrznymi systemami.
- Brak ograniczania domeny decyzji — aplikacja nie odrzuca "błahych" tematów; otwartość wejścia jest cechą, nie brakiem (patrz Vision, zakres wejścia).

Odroczenia do v2 (z briefu, nie twarde non-goals): definiowanie własnych person i wybór składu panelu; wizualizacja rozkładu ocen między rundami; eksport sesji do PDF; biblioteka gotowych składów panelu.

## Product framing (frontmatter PRD)

- product_type: web-app
- target_scale.users: small (ja + garść osób)
- timeline_budget: mvp_weeks: 3, hard_deadline: null, after_hours_only: true
