import { useEffect, useState } from "react";

/**
 * Tracks a form's pending state across a native `method="POST"` submission — React's built-in
 * form-status hook only reports pending for its own `<form action={fn}>` actions, never for a
 * plain native POST. The caller sets `submitting` to true once client-side validation passes, right before the
 * native submit proceeds; this hook resets it to false if the page is restored from the
 * back/forward cache (`pageshow` with `persisted`), so a bfcache Back never leaves a stuck
 * disabled button.
 */
export function useSubmittingState() {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setSubmitting(false);
      }
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return [submitting, setSubmitting] as const;
}
