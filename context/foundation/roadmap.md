---
project: "Panel Ekspertów"
version: 1
status: draft
created: 2026-09-22
updated: 2026-09-25
prd_version: 2
main_goal: market-feedback
top_blocker: time
milestone_id: mvp-divergent-panel
milestone_seq: 1
milestone_status: open
---

# Roadmap: Panel Ekspertów

> Derived from `context/foundation/prd.md` (v2) + `context/foundation/tech-stack.md` + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-01: MVP panelu z wymuszoną rozbieżnością** — Status: open

- **Intent:** Dostarczyć MVP, w którym użytkownik opisuje decyzję, a panel predefiniowanych doradców wydaje realnie rozbieżne oceny, konfrontuje je w rundzie drugiej z atrybucją zmian zdania i kończy syntezą pokazującą oś sporu — dowodząc, że mechanika wymuszania sporu działa end-to-end.
- **Source materials:** `context/foundation/prd.md` (v2)
- **Done when:** każdy `F-NN` i `S-NN` poniżej jest `done`, a Kryterium Primary (średni rozrzut ocen rundy pierwszej > 2 pkt) jest zmierzone na realnych sesjach.
- **Scope anchors:** FR-001–FR-010, US-01, oraz Kryterium Sukcesu (Primary/Secondary) i guardrail izolacji per użytkownik.

## Vision recap

Ludzie podejmują decyzje średniej wagi bez dostępu do bezstronnej kontry: konsultacja jest za droga, otoczenie zwraca echo własnego myślenia, a zwykły czat z modelem utwierdza w decyzji zamiast ją testować. Panel Ekspertów wpuszcza użytkownika w sesję z zestawem doradczych person o celowo sprzecznych skrzywieniach. Sednem produktu nie jest sam "panel wielu person" (to oczywiste), lecz **wymuszenie realnej rozbieżności** — izolacja opinii w rundzie pierwszej, ocena liczbowa przed uzasadnieniem, obowiązek wskazania autora argumentu przy zmianie zdania i synteza, która pokazuje spór zamiast go wygładzać. Cel nadrzędny: skrócić czas między pojawieniem się pomysłu a wykryciem jego najpoważniejszej wady.

## North star

**S-01: Użytkownik uruchamia rundę pierwszą i widzi rozbieżne, streamowane na żywo opinie** — to milestone walidacyjny: jeśli rozrzut ocen między personami nie przekracza 2 pkt, produkt nie działa, więc ten slice trzeba dostarczyć najwcześniej, jak pozwolą zależności.

> "Gwiazda przewodnia" (north star) to najmniejszy przepływ end-to-end, którego udane dostarczenie udowadnia główną hipotezę produktu — umieszczony tak wcześnie, jak pozwalają zależności, bo cała reszta ma znaczenie tylko wtedy, gdy on zadziała.

## At a glance

| ID    | Change ID               | Outcome (user can …)                                              | Prerequisites | PRD refs                          | Status   |
| ----- | ----------------------- | ---------------------------------------------------------------- | ------------- | --------------------------------- | -------- |
| F-01  | advisor-llm-adapter     | (foundation) adapter LLM + rejestr predefiniowanych doradców     | —             | FR-003, FR-009, NFR-rozrzut       | done    |
| F-02  | session-store-rls       | (foundation) trwałość sesji + polityka RLS izolacji per użytkownik | —           | FR-001, FR-006, guardrail         | done |
| S-01  | first-divergent-round   | opisać decyzję i zobaczyć rozbieżne, streamowane opinie rundy 1   | F-01, F-02    | US-01, FR-001, FR-002, FR-003, FR-006, FR-009 | in-progress |
| S-02  | round-two-attribution   | uruchomić rundę 2, gdzie zmiana oceny wskazuje autora argumentu   | S-01          | US-01, FR-004, FR-010             | proposed |
| S-03  | session-synthesis       | zakończyć sesję i otrzymać syntezę z co najmniej jedną osią sporu | S-01          | US-01, FR-005, FR-010             | proposed |
| S-04  | advisor-side-thread     | dopytać wybraną personę w wątku pobocznym bez przerywania debaty | S-01          | FR-007                            | proposed |
| S-05  | session-history         | zobaczyć listę zapisanych sesji i wrócić do wybranej             | S-01          | FR-006                            | proposed |
| S-06  | resume-session-round    | wrócić do sesji, dorzucić kontekst i uruchomić kolejną rundę      | S-05, S-02    | FR-008                            | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                     | Chain                                   | Note                                                                        |
| ------ | ------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| A      | Debata rdzeniowa          | `F-01` → `S-01` → `S-02` → `S-03`       | Łańcuch mechaniki LLM — niesie cel `market-feedback`: najpierw dowód rozbieżności. |
| B      | Trwałość i powroty        | `F-02` → `S-05` → `S-06`                | `F-02` zasila też `S-01` w strumieniu A; `S-06` łączy się z `S-02`.         |
| C      | Wątek poboczny            | `S-04`                                  | Samodzielny slice; dołącza do strumienia A w `S-01`.                        |

## Baseline

What's already in place in the codebase as of `2026-09-22` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 7 + React 19 + Tailwind 4 + shadcn/ui; obecnie tylko formularze auth i strony scaffoldu (`src/pages/index.astro`, `dashboard.astro`, `src/components/auth/*`). Brak UI panelu.
- **Backend / API:** partial — trasy API Astro istnieją, ale wyłącznie dla auth (`src/pages/api/auth/{signin,signup,signout}.ts`). Brak endpointów sesji/LLM.
- **Data:** absent — `supabase/` zawiera tylko `config.toml`; zero migracji, brak tabel.
- **Auth:** present — cookie-owy klient `@supabase/ssr` + middleware ustawiający `locals.user` + `PROTECTED_ROUTES` (`src/lib/supabase.ts`, `src/middleware.ts`).
- **Deploy / infra:** present — `@astrojs/cloudflare` + wrangler + `.github/workflows/ci.yml` (lint/check/build/smoke).
- **Observability:** absent — brak loggera (`@/lib/logger` wspomniany w regułach, ale nieutworzony), brak error trackingu i metryk.

## Foundations

### F-01: Adapter LLM + rejestr predefiniowanych doradców

- **Outcome:** (foundation) w kodzie jest minimalny port do dostawcy LLM (OpenRouter) zdolny do równoległych, streamowanych odpowiedzi oraz rejestr predefiniowanych person doradczych z celowo sprzecznymi profilami (optymista, sceptyk, pragmatyk, analityk). Nie obejmuje żadnej logiki rund ani UI.
- **Change ID:** advisor-llm-adapter
- **PRD refs:** FR-003, FR-009, NFR (rozrzut ocen > 2 pkt)
- **Unlocks:** S-01 (round-one generuje opinie przez ten adapter), S-02, S-03, S-04; redukuje ryzyko mechaniki rozbieżności (najbardziej ryzykowne założenie produktu).
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowany pierwszy, bo bez klienta LLM i person nie da się zbudować gwiazdy przewodniej. Ryzyko: ograniczenia długości streamowanej odpowiedzi na edge runtime Cloudflare (jedyny gotcha z `tech-stack.md`) — mierzone realnie dopiero przy S-01.
- **Status:** done

### F-02: Trwałość sesji + polityka RLS izolacji per użytkownik

- **Outcome:** (foundation) istnieje minimalny schemat trwałości sesji (sesje + opinie doradców, powiązane z użytkownikiem) z włączonym RLS i politykami per-operacja/per-rola, ustanawiający wzorzec izolacji per użytkownik. Nie obejmuje całej domeny danych — tylko tyle, by S-01 mógł zapisać pierwszą sesję.
- **Change ID:** session-store-rls
- **PRD refs:** FR-001 (widzi wyłącznie własne sesje), FR-006, guardrail (izolacja per użytkownik)
- **Unlocks:** S-01 (zapis pierwszej sesji), S-05, S-06; ustanawia wzorzec RLS reużywany przez każdy późniejszy slice dotykający danych.
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Zobowiązania prywatności i retencji dla przechowywanych opisów decyzji (PRD Otwarte pytanie #3) — Owner: user. Block: no.
- **Risk:** Sekwencjonowany wcześnie, bo US-01 kończy się "sesja zapisuje się na koncie", a izolacja per użytkownik jest guardrailem. Ryzyko: pominięcie RLS na starcie oznacza późną, kosztowną poprawkę izolacji — dlatego wzorzec RLS powstaje tu, nie później.
- **Status:** done

## Slices

### S-01: Runda pierwsza — rozbieżne, streamowane opinie

- **Outcome:** zalogowany użytkownik opisuje decyzję z kontekstem, uruchamia panel i widzi każdego doradcę piszącego równolegle na żywo swoją niezależną opinię (ocena 1–10, teza, argumenty); sesja zapisuje się na koncie.
- **Change ID:** first-divergent-round
- **PRD refs:** US-01, FR-002, FR-003, FR-006 (zapis), FR-009, FR-001 (dostęp zalogowany)
- **Prerequisites:** F-01, F-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Kształt onboardingu przed pierwszą sesją, by rejestracja nie odstraszała (PRD Otwarte pytanie #1) — Owner: user. Block: no.
  - Czy izolacja person w rundzie pierwszej realnie daje rozrzut > 2 pkt — Owner: user. Block: no (weryfikowane pomiarem na tym slice).
- **Risk:** Gwiazda przewodnia i milestone walidacyjny — sekwencjonowana zaraz po fundamentach, bo tu mierzy się Kryterium Primary. Ryzyko: równoległy streaming wielu doradców na edge runtime może dobić limity odpowiedzi (patrz F-01).
- **Status:** in-progress

### S-02: Runda druga — atrybucja zmiany zdania

- **Outcome:** użytkownik uruchamia rundę drugą, w której persony odnoszą się do stanowisk pozostałych, a każda zmiana oceny wymaga wskazania autora przekonującego argumentu.
- **Change ID:** round-two-attribution
- **PRD refs:** US-01, FR-004, FR-010 (kolejna runda)
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Jakość atrybucji ("teatr atrybucji" — model rytualnie wskazuje autora bez merytorycznej zmiany zdania); wymaga kontroli w prototypie rundy drugiej (PRD Otwarte pytanie #2) — Owner: user. Block: no (rozstrzygane przez zbudowanie i ocenę prototypu; warunkuje wiarygodność Kryterium Secondary).
- **Risk:** Sekwencjonowana zaraz po gwiazdie, bo atrybucja to drugie najbardziej ryzykowne założenie (cel `market-feedback` każe wyciągać ryzyko wcześnie). Ryzyko: pusta, teatralna atrybucja podważa Kryterium Secondary.
- **Status:** proposed

### S-03: Synteza na zakończenie sesji

- **Outcome:** użytkownik jawnie kończy sesję i otrzymuje syntezę: punkty zgody, co najmniej jedną realną oś sporu, ryzyka według wagi i rekomendowany następny krok.
- **Change ID:** session-synthesis
- **PRD refs:** US-01, FR-005, FR-010 (zakończenie → synteza)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Ryzyko, że synteza przemyci uśrednioną odpowiedź zamiast pokazać spór — Owner: user. Block: no (wymóg: obowiązkowa co najmniej jedna oś sporu).
- **Risk:** Zależy od opinii rundy pierwszej (oś sporu istnieje już po rundzie 1), więc prereq to tylko S-01; z S-02 daje bogatszą syntezę, stąd `Parallel with: S-02`. Ryzyko: wygładzenie sporu przeczy sednu produktu.
- **Status:** proposed

### S-04: Wątek poboczny z wybraną personą

- **Outcome:** użytkownik dopytuje wybraną personę w osobnym wątku pobocznym, nie przerywając głównej debaty.
- **Change ID:** advisor-side-thread
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:**
  - Brak historyjki Given/When/Then dla FR-007 (PRD Otwarte pytanie #4) — Owner: user. Block: no (treść FR + Business Logic wystarcza do planowania; scenariusz do doprecyzowania w `/10x-plan`).
- **Risk:** Świadome rozszerzenie zakresu ponad budżet (override przy Otwartym pytaniu #5) — osobny model danych i UI. Sekwencjonowany po core loop, bo nie warunkuje walidacji; kandydat do parkowania, jeśli budżet 3 tyg. napnie się mocniej.
- **Status:** proposed

### S-05: Historia sesji — lista i powrót

- **Outcome:** użytkownik widzi listę swoich zapisanych sesji i wraca do wybranej z historii (dostępnej z wielu urządzeń).
- **Change ID:** session-history
- **PRD refs:** FR-006 (powrót z historii)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mały slice reużywający trwałości i RLS z F-02. Sekwencjonowany po S-01, bo bez zapisanych sesji nie ma czego listować. Ryzyko niskie.
- **Status:** proposed

### S-06: Powrót do sesji, nowy kontekst, kolejna runda

- **Outcome:** użytkownik wraca do zapisanej sesji, dorzuca nowy kontekst i uruchamia kolejną rundę na jej bazie.
- **Change ID:** resume-session-round
- **PRD refs:** FR-008
- **Prerequisites:** S-05, S-02
- **Parallel with:** S-03, S-04
- **Blockers:** —
- **Unknowns:**
  - Brak historyjki Given/When/Then dla FR-008 (PRD Otwarte pytanie #4) — Owner: user. Block: no.
  - Kontrola kosztu wielu rund: limit rund, cache, krótsze odpowiedzi w dalszych rundach (przeciwdziałania z briefu) — Owner: user. Block: no.
- **Risk:** Zależy od historii (S-05) i mechaniki kolejnej rundy (S-02). Sekwencjonowany na końcu, bo domyka pętlę powrotów. Ryzyko: bez limitu rund funkcja jest nieopłacalna (ryzyko wprost z briefu).
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID               | Suggested issue title                                    | Ready for `/10x-plan` | Notes |
| ---------- | ----------------------- | -------------------------------------------------------- | --------------------- | ----- |
| F-01       | advisor-llm-adapter     | Adapter LLM + rejestr predefiniowanych doradców           | yes                   | Uruchamia gwiazdę przewodnią S-01; najwyższy fan-out |
| F-02       | session-store-rls       | Trwałość sesji + polityka RLS izolacji per użytkownik      | yes                   | Ustanawia wzorzec RLS dla wszystkich slice'ów danych |
| S-01       | first-divergent-round   | Runda 1: rozbieżne, streamowane opinie doradców           | no                    | Wymaga F-01 i F-02 |
| S-02       | round-two-attribution   | Runda 2: atrybucja zmiany zdania                          | no                    | Wymaga S-01 |
| S-03       | session-synthesis       | Synteza sesji z osią sporu                                | no                    | Wymaga S-01 |
| S-04       | advisor-side-thread     | Wątek poboczny z wybraną personą                          | no                    | Wymaga S-01; brak US (OQ#4) |
| S-05       | session-history         | Historia sesji: lista i powrót                            | no                    | Wymaga S-01 |
| S-06       | resume-session-round    | Powrót do sesji + nowy kontekst + kolejna runda           | no                    | Wymaga S-05, S-02; brak US (OQ#4) |

## Open Roadmap Questions

1. **Kształt onboardingu przy kontach od MVP** — jak zminimalizować barierę rejestracji przed pierwszą sesją. Owner: user. Block: S-01 (UX rejestracji).
2. **Jakość atrybucji w rundzie drugiej** — wymóg wskazania autora nie gwarantuje merytorycznej zmiany zdania; kontrola w prototypie. Owner: user. Block: S-02 (warunkuje wiarygodność Kryterium Secondary).
3. **Zobowiązania prywatności i retencji dla historii sesji** — przechowywanie opisów decyzji rodzi obowiązki niedoprecyzowane jako NFR. Owner: user. Block: F-02 / S-01 (polityka danych).
4. **Brakujące historyjki dla FR-007 i FR-008** — wątek poboczny oraz powrót+kontekst+runda nie mają scenariuszy Given/When/Then. Owner: user. Block: S-04, S-06 (klarowność planu).
5. **Zakres MVP vs budżet 3 tygodni** — świadome rozszerzenie o FR-007/FR-008 jako must-have, override miękkiej bramki budżetu. Owner: user. Block: roadmap-wide (do rewizji przy planowaniu; kandydaci do parkowania: S-04, S-06).

## Parked

- **Brak dostępu do aktualnych danych rynkowych/finansowych** — Why parked: PRD §Non-Goals; opinie opierają się wyłącznie na kontekście użytkownika.
- **Doradztwo o statusie prawnym/inwestycyjnym** — Why parked: PRD §Non-Goals; produkt symuluje perspektywy, nie zastępuje doradcy.
- **Praca wieloosobowa w czasie rzeczywistym** — Why parked: PRD §Non-Goals; sesja jest jednoosobowa.
- **Integracje z zewnętrznymi systemami** — Why parked: PRD §Non-Goals.
- **Ograniczanie domeny decyzji** — Why parked: PRD §Non-Goals; otwartość wejścia jest cechą.
- **Definiowanie własnych doradców i wybór składu panelu** — Why parked: PRD §odroczenia do v2.
- **Wizualizacja rozkładu ocen między rundami** — Why parked: PRD §odroczenia do v2.
- **Eksport sesji do PDF** — Why parked: PRD §odroczenia do v2.
- **Biblioteka gotowych składów panelu** — Why parked: PRD §odroczenia do v2.

## Milestone History

(Append-only. Empty on the first milestone.)

## Done

- **F-01: (foundation) w kodzie jest minimalny port do dostawcy LLM (OpenRouter) zdolny do równoległych, streamowanych odpowiedzi oraz rejestr predefiniowanych person doradczych z celowo sprzecznymi profilami (optymista, sceptyk, pragmatyk, analityk). Nie obejmuje żadnej logiki rund ani UI.** — Archived 2026-09-23 → `context/archive/2026-09-23-advisor-llm-adapter/`. Lesson: —.
- **F-02: (foundation) istnieje minimalny schemat trwałości sesji (sesje + opinie doradców, powiązane z użytkownikiem) z włączonym RLS i politykami per-operacja/per-rola, ustanawiający wzorzec izolacji per użytkownik. Nie obejmuje całej domeny danych — tylko tyle, by S-01 mógł zapisać pierwszą sesję.** — Archived 2026-09-23 → `context/archive/2026-09-23-session-store-rls/`. Lesson: —.
