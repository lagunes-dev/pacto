import type { AuthPort } from "../../features/auth/port";

export type SupabasePublicConfig = { url: string; publishableKey: string };

export function createSupabaseAuthBoundary(config: SupabasePublicConfig): AuthPort {
  const unavailable = async (): Promise<never> => {
    const configured = Boolean(config.url && config.publishableKey);
    throw new Error(configured
      ? "Supabase está configurado, pero su adaptador todavía no está integrado ni verificado."
      : "Falta configurar el límite público de Supabase.");
  };
  return { getSession: async () => null, register: unavailable, login: unavailable, logout: unavailable };
}
