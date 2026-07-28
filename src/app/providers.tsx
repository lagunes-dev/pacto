import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useState, type PropsWithChildren } from "react";

import type { AuthPort } from "../features/auth/port";
import { AuthProvider } from "../features/auth/queries/AuthProvider";
import type { HabitRepository } from "../features/habits/repository";
import type { ProgressRepository } from "../features/progress/repository";
import { createAppServices, type AppServices } from "../infrastructure";

type ProviderOverrides = {
  authPort?: AuthPort;
  habitRepository?: HabitRepository;
  progressRepository?: ProgressRepository;
};

const RepositoryContext = createContext<Pick<AppServices, "habits" | "progress"> | null>(null);

export function AppProviders({ children, authPort, habitRepository, progressRepository }: PropsWithChildren<ProviderOverrides>) {
  const [services] = useState(() => createAppServices());
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const repositories = {
    habits: habitRepository ?? services.habits,
    progress: progressRepository ?? services.progress,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider authPort={authPort ?? services.auth}>
        <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export function useRepositories() {
  const repositories = useContext(RepositoryContext);
  if (!repositories) throw new Error("useRepositories must be used inside AppProviders");
  return repositories;
}
