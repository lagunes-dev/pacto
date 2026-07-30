import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type PropsWithChildren } from "react";

import type { AuthPort } from "../features/auth/port";
import { AuthProvider } from "../features/auth/queries/AuthProvider";
import type { HabitRepository } from "../features/habits/repository";
import type { ProgressRepository } from "../features/progress/repository";
import type { PartnershipRepository } from "../features/partnership/repository";
import type { PreferenceRepository } from "../features/preferences/repository";
import type { SupportRepository } from "../features/support/repository";
import type { OfflineQueuePort } from "../features/offline-queue/port";
import type { RealtimePort } from "../features/realtime/port";
import { RealtimeCoordinator } from "../features/realtime/RealtimeCoordinator";
import { createAppServices, type AppServices } from "../infrastructure";

type ProviderOverrides = {
  authPort?: AuthPort;
  habitRepository?: HabitRepository;
  progressRepository?: ProgressRepository;
  partnershipRepository?: PartnershipRepository;
  preferenceRepository?: PreferenceRepository;
  supportRepository?: SupportRepository;
  offlineQueue?: OfflineQueuePort;
  realtime?: RealtimePort;
};

const RepositoryContext = createContext<Omit<AppServices, "auth" | "offlineQueue"> | null>(null);

export function AppProviders({ children, authPort, habitRepository, progressRepository, partnershipRepository, preferenceRepository, supportRepository, offlineQueue, realtime }: PropsWithChildren<ProviderOverrides>) {
  const [services] = useState(() => createAppServices());
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const repositories = {
    habits: habitRepository ?? services.habits,
    progress: progressRepository ?? services.progress,
    partnership: partnershipRepository ?? services.partnership,
    preferences: preferenceRepository ?? services.preferences,
    support: supportRepository ?? services.support,
    realtime: realtime ?? services.realtime,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider authPort={authPort ?? services.auth} offlineQueue={offlineQueue ?? services.offlineQueue}>
        <RepositoryContext.Provider value={repositories}>
          <RealtimeCoordinator>{children}</RealtimeCoordinator>
        </RepositoryContext.Provider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function useRepositories() {
  const repositories = useContext(RepositoryContext);
  if (!repositories) throw new Error("useRepositories must be used inside AppProviders");
  return repositories;
}
