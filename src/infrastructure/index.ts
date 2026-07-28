import type { AuthPort } from "../features/auth/port";
import type { HabitRepository } from "../features/habits/repository";
import type { ProgressRepository } from "../features/progress/repository";
import { createFixtureServices } from "./fixture/services";
import { createSupabaseAuthBoundary } from "./supabase/boundary";

export type AppServices = { auth: AuthPort; habits: HabitRepository; progress: ProgressRepository };

export function createAppServices(): AppServices {
  const adapter = import.meta.env.VITE_DATA_ADAPTER ?? "fixture";
  if (adapter === "fixture" && import.meta.env.DEV) return createFixtureServices();

  const auth = createSupabaseAuthBoundary({
    url: import.meta.env.VITE_SUPABASE_URL ?? "",
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  });
  const unavailable = async (): Promise<never> => {
    throw new Error("El servicio de datos no está disponible. No se guardaron cambios.");
  };
  const habits: HabitRepository = {
    create: unavailable,
    listMine: unavailable,
    update: unavailable,
    remove: unavailable,
  };
  const progress: ProgressRepository = { getMine: unavailable };
  return { auth, habits, progress };
}

export function createAuthPort(): AuthPort { return createAppServices().auth; }
