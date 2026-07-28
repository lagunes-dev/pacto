import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { SupabaseConfigurationError } from "./errors";

export type SupabasePublicConfig = { url: string; publishableKey: string };
export type PactoSupabaseClient = SupabaseClient<Database>;

export function isSupabaseConfigured(config: SupabasePublicConfig) {
  return Boolean(config.url.trim() && config.publishableKey.trim());
}

export function createSupabaseBrowserClient(config: SupabasePublicConfig): PactoSupabaseClient {
  if (!isSupabaseConfigured(config)) throw new SupabaseConfigurationError();
  return createClient<Database>(config.url.trim(), config.publishableKey.trim());
}
