import type { AuthPort } from "../features/auth/port";
import type { HabitRepository } from "../features/habits/repository";
import type { ProgressRepository } from "../features/progress/repository";
import type { PartnershipRepository } from "../features/partnership/repository";
import type { PreferenceRepository } from "../features/preferences/repository";
import type { SupportRepository } from "../features/support/repository";
import { createFixtureServices } from "./fixture/services";
import { createSupabaseAuthBoundary, createUnavailableAuthPort } from "./supabase/auth";

export type AppServices = {
  auth: AuthPort;
  habits: HabitRepository;
  progress: ProgressRepository;
  partnership: PartnershipRepository;
  preferences: PreferenceRepository;
  support: SupportRepository;
};

export type AppEnvironment = {
  adapter: string;
  isDevelopment: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

function readEnvironment(): AppEnvironment {
  return {
    adapter: import.meta.env.VITE_DATA_ADAPTER ?? "",
    isDevelopment: import.meta.env.DEV,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
    supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}

export function createAppServices(environment = readEnvironment()): AppServices {
  if (environment.adapter === "fixture" && environment.isDevelopment) return createFixtureServices();

  const auth = environment.adapter === "supabase"
    ? createSupabaseAuthBoundary({ url: environment.supabaseUrl, publishableKey: environment.supabasePublishableKey })
    : createUnavailableAuthPort(new Error(environment.adapter === "fixture"
      ? "El fixture está deshabilitado fuera de desarrollo. No se guardaron cambios."
      : "No hay un adaptador de datos disponible. No se guardaron cambios."));
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
  const partnership: PartnershipRepository = {
    getMine: unavailable,
    createInvite: unavailable,
    acceptInvite: unavailable,
    rejectInvite: unavailable,
    cancelInvite: unavailable,
    pause: unavailable,
    end: unavailable,
  };
  const preferences: PreferenceRepository = { getMine: unavailable, updateMine: unavailable };
  const support: SupportRepository = { list: unavailable, create: unavailable, acknowledge: unavailable, close: unavailable };
  return { auth, habits, progress, partnership, preferences, support };
}

export function createAuthPort(): AuthPort { return createAppServices().auth; }
