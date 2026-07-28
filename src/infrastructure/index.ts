import type { AuthPort } from "../features/auth/port";
import { createFixtureServices } from "./fixture/services";
import { createSupabaseAuthBoundary } from "./supabase/boundary";

export function createAuthPort(): AuthPort {
  const adapter = import.meta.env.VITE_DATA_ADAPTER ?? "fixture";
  if (adapter === "fixture" && import.meta.env.DEV) return createFixtureServices().auth;
  return createSupabaseAuthBoundary({
    url: import.meta.env.VITE_SUPABASE_URL ?? "",
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  });
}
