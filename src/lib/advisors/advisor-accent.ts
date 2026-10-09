export type AdvisorAccent = { text: string; border: string; bg: string };

/**
 * Maps each stable persona id to its identity token class set (frontend.md §5 — advisor-1…4,
 * identity only, never buttons or status). Class strings are static so Tailwind sees them literally.
 */
const ADVISOR_ACCENTS: Record<string, AdvisorAccent> = {
  optymista: { text: "text-advisor-1", border: "border-advisor-1", bg: "bg-advisor-1" },
  sceptyk: { text: "text-advisor-2", border: "border-advisor-2", bg: "bg-advisor-2" },
  pragmatyk: { text: "text-advisor-3", border: "border-advisor-3", bg: "bg-advisor-3" },
  analityk: { text: "text-advisor-4", border: "border-advisor-4", bg: "bg-advisor-4" },
};

const NEUTRAL_ACCENT: AdvisorAccent = { text: "text-foreground", border: "border-border", bg: "bg-secondary" };

/** Returns the identity accent for a persona id, or a neutral fallback for an unknown one. */
export function advisorAccent(id: string): AdvisorAccent {
  return ADVISOR_ACCENTS[id] ?? NEUTRAL_ACCENT;
}
