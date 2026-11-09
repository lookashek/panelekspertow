/**
 * Test-only helper (imported from `*.integration.test.ts` files) that produces a real
 * `@/lib/supabase`-compatible `Cookie` header for a freshly signed-up user against a running local
 * Supabase instance. Reuses `@supabase/ssr`'s own cookie serialization (via `createServerClient`'s
 * `setAll`) rather than hand-rolling the cookie format, so route-handler integration tests exercise
 * the exact same `createClient(request.headers, cookies)` path production code uses.
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RealSignedInUser {
  userId: string;
  cookieHeader: string;
  client: SupabaseClient;
}

export async function signUpAndGetCookieHeader(
  supabaseUrl: string,
  supabaseKey: string,
  email: string,
  password: string,
): Promise<RealSignedInUser> {
  const captured = new Map<string, string>();

  const client = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return Array.from(captured, ([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          captured.set(name, value);
        }
      },
    },
  });

  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.user) {
    throw new Error(`sign-up failed for ${email}: ${error?.message ?? "no user returned"}`);
  }

  const cookieHeader = Array.from(captured, ([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return { userId: data.user.id, cookieHeader, client };
}
