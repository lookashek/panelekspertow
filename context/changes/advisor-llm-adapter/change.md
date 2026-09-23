---
change_id: advisor-llm-adapter
title: Adapter LLM (OpenRouter) + rejestr predefiniowanych doradców
status: impl_reviewed
created: 2026-09-23
updated: 2026-09-23
archived_at: null
---

## Notes

Roadmap F-01 (foundation, stream A, status `ready`). Minimalny port do dostawcy LLM (OpenRouter) zdolny do
równoległych, streamowanych odpowiedzi oraz rejestr predefiniowanych person doradczych z celowo sprzecznymi
profilami (optymista, sceptyk, pragmatyk, analityk). Nie obejmuje logiki rund ani UI.

- PRD refs: FR-003, FR-009, NFR (rozrzut ocen > 2 pkt)
- Unlocks: S-01 (gwiazda przewodnia), S-02, S-03, S-04 — najwyższy fan-out.
- Prerequisites: — (równoległy z F-02)
- Ryzyko: limity długości streamowanej odpowiedzi na edge runtime Cloudflare (jedyny gotcha z tech-stack.md),
  mierzone realnie dopiero przy S-01.
