export interface AdvisorSprite {
  grid: string[];
}

/** Shared fill legend for all advisor sprites — values are `var(--token)`, never a literal hex. */
export const ADVISOR_SPRITE_FILLS: Record<string, string> = {
  V: "var(--primary)",
  D: "var(--chart-3)",
  C: "var(--accent)",
  W: "var(--foreground)",
  B: "var(--background)",
};

/**
 * Central 12×12 pixel-art avatars for the 4 stable persona ids (src/lib/schemas/advisor.ts:27).
 * Single source for AdvisorCard, RoundSummary, and Welcome.astro — moved here from Welcome.astro
 * so the sprite data isn't duplicated as more consumers need it.
 */
const ADVISOR_SPRITES: Record<string, AdvisorSprite> = {
  optymista: {
    grid: [
      "....CC......",
      "....CC......",
      "..VVVVVVVV..",
      ".VVVVVVVVVV.",
      ".VVWWVVWWVV.",
      ".VVWCVVCWVV.",
      ".VVVVVVVVVV.",
      ".VVVVVVVVVV.",
      ".VVBVVVVBVV.",
      ".VVVBBBBVVV.",
      "..VVVVVVVV..",
      "...V....V...",
    ],
  },
  sceptyk: {
    grid: [
      "............",
      "..DDDDDDDD..",
      ".DDDDDDDDDD.",
      ".DDWWDDWWDD.",
      ".DDWCDDCWDD.",
      ".DDDDDDDDDD.",
      ".DDDDDDDDDD.",
      ".DDBBBBBBDD.",
      ".DDDDDDDDDD.",
      "..DDDDDDDD..",
      "...D....D...",
      "............",
    ],
  },
  pragmatyk: {
    grid: [
      "............",
      "..WWWWWWWW..",
      "..WWWWWWWW..",
      ".VVVVVVVVVV.",
      ".VVWCVVCWVV.",
      ".VVVVVVVVVV.",
      ".VVVVVVVVVV.",
      ".VVVBBBBVVV.",
      ".VVVVVVVVVV.",
      "..VVVVVVVV..",
      "...V....V...",
      "............",
    ],
  },
  analityk: {
    grid: [
      "............",
      "..VVVVVVVV..",
      ".VVVVVVVVVV.",
      ".CCCCVVCCCC.",
      ".CWWCVVCWWC.",
      ".CCCCVVCCCC.",
      ".VVVVVVVVVV.",
      ".VVVVVVVVVV.",
      ".VVVBBBBVVV.",
      "..VVVVVVVV..",
      "...V....V...",
      "............",
    ],
  },
};

const NEUTRAL_SPRITE: AdvisorSprite = {
  grid: [
    "............",
    "............",
    "..WWWWWWWW..",
    ".WWWWWWWWWW.",
    ".WWWWWWWWWW.",
    ".WWWWWWWWWW.",
    ".WWWWWWWWWW.",
    ".WWWWWWWWWW.",
    ".WWWWWWWWWW.",
    "..WWWWWWWW..",
    "............",
    "............",
  ],
};

/** Returns the pixel-art sprite for a persona id, or a neutral fallback for an unknown one. */
export function advisorSprite(id: string): AdvisorSprite {
  return ADVISOR_SPRITES[id] ?? NEUTRAL_SPRITE;
}
