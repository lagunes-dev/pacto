import { mutationOptions, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import { saveRecoveryInputSchema } from "./model";
import type { RecoveryRepository, RegistroRecordRepository } from "./repository";

export const recoveryKeys = {
  owner: (ownerId: string) => ["recovery", ownerId] as const,
  timeline: (ownerId: string) => [...recoveryKeys.owner(ownerId), "timeline"] as const,
  detailedEvents: (ownerId: string) => [...recoveryKeys.owner(ownerId), "detailed-events"] as const,
  weeklyReviews: (ownerId: string) => [...recoveryKeys.owner(ownerId), "weekly-reviews"] as const,
};

export function recoveryTimelineOptions(repository: RecoveryRepository, ownerId: string) {
  return queryOptions({ queryKey: recoveryKeys.timeline(ownerId), queryFn: () => repository.timeline() });
}

export function detailedEventOptions(repository: RegistroRecordRepository, ownerId: string) {
  return queryOptions({ queryKey: recoveryKeys.detailedEvents(ownerId), queryFn: () => repository.detailedEvents() });
}

export function weeklyReviewOptions(repository: RegistroRecordRepository, ownerId: string) {
  return queryOptions({ queryKey: recoveryKeys.weeklyReviews(ownerId), queryFn: () => repository.weeklyReviews() });
}

export function saveRecoveryOptions(repository: RecoveryRepository) {
  return mutationOptions({ mutationFn: (input: unknown) => repository.save(saveRecoveryInputSchema.parse(input)) });
}

export function useRecoveryTimeline() {
  const { recovery } = useRepositories();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "anonymous";
  return useQuery({ ...recoveryTimelineOptions(recovery, ownerId), enabled: Boolean(session) });
}

export function useSaveRecovery() {
  const { recovery } = useRepositories();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const ownerId = session?.user.id ?? "anonymous";
  return useMutation({
    ...saveRecoveryOptions(recovery),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recoveryKeys.owner(ownerId) }),
  });
}
