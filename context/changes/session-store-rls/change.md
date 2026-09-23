---
change_id: session-store-rls
title: Trwałość sesji + polityka RLS izolacji per użytkownik (F-02)
status: implemented
created: 2026-09-23
updated: 2026-09-23
archived_at: null
---

## Notes

Roadmap: **F-02** (`context/foundation/roadmap.md`) — foundation, Stream B.

Outcome: minimalny schemat trwałości sesji (sesje + opinie doradców, powiązane z użytkownikiem) z włączonym RLS i politykami per-operacja/per-rola, ustanawiający wzorzec izolacji per użytkownik. Nie obejmuje całej domeny danych — tylko tyle, by S-01 mógł zapisać pierwszą sesję.

- PRD refs: FR-001 (widzi wyłącznie własne sesje), FR-006, guardrail (izolacja per użytkownik)
- Prerequisites: — (równolegle z F-01)
- Unlocks: S-01 (zapis pierwszej sesji), S-05, S-06; wzorzec RLS reużywany przez każdy późniejszy slice dotykający danych.
- Otwarte pytanie (roadmap #3): zobowiązania prywatności i retencji dla przechowywanych opisów decyzji — Owner: user. Block: no.
