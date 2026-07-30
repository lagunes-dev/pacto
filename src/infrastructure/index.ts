import type { AuthPort } from "../features/auth/port";
import type { HabitRepository } from "../features/habits/repository";
import type { ProgressRepository } from "../features/progress/repository";
import type { PartnershipRepository } from "../features/partnership/repository";
import type { PreferenceRepository } from "../features/preferences/repository";
import type { SupportRepository } from "../features/support/repository";
import type { DailyCheckinRepository } from "../features/checkin/repository";
import type { OfflineQueuePort } from "../features/offline-queue/port";
import type { RealtimePort } from "../features/realtime/port";
import { createUnavailableRealtimePort } from "../features/realtime/port";
import { createFixtureServices } from "./fixture/services";
import { createSupabaseAuthPort, createUnavailableAuthPort } from "./supabase/auth";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "./supabase/client";
import { asLifecycleClient, createSupabaseLifecycleRepositories } from "./supabase/repositories/lifecycle";
import { asPrivateDataClient, createSupabasePrivateRepositories } from "./supabase/repositories/private";
import { createIndexedDbOfflineQueue } from "./indexeddb/offlineQueue";
import { createSupabaseRealtimePort } from "./supabase/realtime";
import type { PushSubscriptionPort } from "../features/push/port";
import { createUnavailablePushPort } from "../features/push/port";
import { createSupabasePushPort } from "./supabase/push";
import { asCheckinClient, createSupabaseDailyCheckinRepository } from "./supabase/repositories/checkin";

export type AppServices = {
  auth: AuthPort;
  habits: HabitRepository;
  progress: ProgressRepository;
  partnership: PartnershipRepository;
  preferences: PreferenceRepository;
  support: SupportRepository;
  checkin: DailyCheckinRepository;
  offlineQueue: OfflineQueuePort;
  realtime: RealtimePort;
  push: PushSubscriptionPort;
};

export type AppEnvironment = {
  adapter: string;
  isDevelopment: boolean;
  isE2E: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
  vapidPublicKey?: string;
};

function readEnvironment(): AppEnvironment {
  return {
    adapter: import.meta.env.MODE === "e2e" ? "fixture" : import.meta.env.VITE_DATA_ADAPTER ?? "",
    isDevelopment: import.meta.env.DEV,
    isE2E: import.meta.env.MODE === "e2e",
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
    supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    vapidPublicKey: import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "",
  };
}

export function createAppServices(environment = readEnvironment()): AppServices {
  const offlineQueue = createIndexedDbOfflineQueue();
  if (environment.adapter === "fixture" && (environment.isDevelopment || environment.isE2E)) return { ...createFixtureServices(), offlineQueue, realtime: createUnavailableRealtimePort(), push: createUnavailablePushPort() };

  const config = { url: environment.supabaseUrl, publishableKey: environment.supabasePublishableKey };
  if (environment.adapter === "supabase" && isSupabaseConfigured(config)) {
    const client = createSupabaseBrowserClient(config);
    const privateRepositories = createSupabasePrivateRepositories(asPrivateDataClient(client));
    const lifecycleRepositories = createSupabaseLifecycleRepositories(asLifecycleClient(client));
    return {
      auth: createSupabaseAuthPort(client),
      ...privateRepositories,
      ...lifecycleRepositories,
      checkin: createSupabaseDailyCheckinRepository(asCheckinClient(client)),
      offlineQueue,
      realtime: createSupabaseRealtimePort(client),
      push: createSupabasePushPort(client, environment.vapidPublicKey ?? ""),
    };
  }

  const auth = createUnavailableAuthPort(new Error(environment.adapter === "supabase"
    ? "Falta configurar el límite público de Supabase. No se guardaron cambios."
    : environment.adapter === "fixture"
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
  const checkin: DailyCheckinRepository = { loadToday: unavailable, save: unavailable };
  return { auth, habits, progress, partnership, preferences, support, checkin, offlineQueue, realtime: createUnavailableRealtimePort(), push: createUnavailablePushPort() };
}

export function createAuthPort(): AuthPort { return createAppServices().auth; }
