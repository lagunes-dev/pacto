export class SupabaseConfigurationError extends Error {
  constructor() {
    super("Falta configurar el límite público de Supabase. No se guardaron cambios.");
    this.name = "SupabaseConfigurationError";
  }
}

export function normalizeSupabaseAuthError(error: { message?: string } | null): Error {
  return new Error(error?.message?.trim() || "No se pudo completar el acceso con Supabase.");
}
