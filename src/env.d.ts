interface CloudflareExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    cfContext?: CloudflareExecutionContext;
  }
}
