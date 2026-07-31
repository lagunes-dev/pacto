import { mutationOptions, queryOptions } from "@tanstack/react-query";

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
