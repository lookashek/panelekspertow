/**
 * Shared brevity wording reused by every persona's round 1/2 prompts (S-07 "session quality
 * polish" Phase 4). Centralizing the exact phrasing here — instead of letting each persona file
 * restate it — is what lets `advisor-prompts.test.ts` pin the behavior across all four personas
 * with one assertion per clause. `buildSideThreadPrompt` and synthesis prompts are out of scope
 * and must not import these.
 */

export const ARGUMENTS_LIMIT_CLAUSE = 'Podaj od 1 do 3 krótkich, jednozdaniowych argumentów w tablicy "arguments".';

export const RATIONALE_BREVITY_CLAUSE =
  "Napisz 2-3 zdania, które dodają jeden konkretny przykład lub konsekwencję wykraczającą poza twoje argumenty — nie powtarzaj argumentów, które już podałeś.";
