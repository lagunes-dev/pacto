import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import type { OnboardingInput, PreferenceUpdate } from "./model";

export const preferenceKeys = {
  mine: (ownerId: string) => ["preferences", ownerId, "mine"] as const,
};

export function useMyPreferences() {
  const { preferences } = useRepositories();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "anonymous";
  return useQuery({ queryKey: preferenceKeys.mine(ownerId), queryFn: preferences.getMine, enabled: Boolean(session) });
}

export function useUpdateMyPreferences() {
  const { preferences } = useRepositories();
  const client = useQueryClient();
  const ownerId = useAuth().session?.user.id ?? "anonymous";
  return useMutation({
    mutationKey: ["preferences", ownerId, "update-mine"],
    mutationFn: (input: PreferenceUpdate) => preferences.updateMine(input),
    onSuccess: (next) => client.setQueryData(preferenceKeys.mine(ownerId), next),
  });
}

export function useCompleteSetup() {
  const { preferences } = useRepositories();
  const client = useQueryClient();
  const ownerId = useAuth().session?.user.id ?? "anonymous";
  return useMutation({
    mutationKey: ["preferences", ownerId, "complete-setup"],
    mutationFn: (input: OnboardingInput) => preferences.completeSetup(input),
    onSuccess: (next) => client.setQueryData(preferenceKeys.mine(ownerId), next),
  });
}
