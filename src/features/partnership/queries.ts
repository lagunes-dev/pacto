import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import { supportKeys } from "../support/queries";
import type { InviteView, PartnershipView } from "./model";

export const partnershipKeys = {
  all: (actorId: string) => ["partnership", actorId] as const,
  mine: (actorId: string) => ["partnership", actorId, "mine"] as const,
  partnerProfile: (actorId: string) => ["partnership", actorId, "partner-profile"] as const,
  futureShared: (actorId: string) => ["partnership", actorId, "shared"] as const,
};

export async function clearRevokedPartnershipCache(client: QueryClient, actorId: string) {
  const revokedKeys = [supportKeys.all(actorId), partnershipKeys.partnerProfile(actorId), partnershipKeys.futureShared(actorId)];
  await Promise.all(revokedKeys.map((queryKey) => client.cancelQueries({ queryKey })));
  revokedKeys.forEach((queryKey) => client.removeQueries({ queryKey }));
}

export async function applyRevocationResult(client: QueryClient, actorId: string, next: PartnershipView) {
  await clearRevokedPartnershipCache(client, actorId);
  client.setQueryData(partnershipKeys.mine(actorId), next);
  await client.invalidateQueries({ queryKey: partnershipKeys.mine(actorId) });
}

function useActorId() {
  return useAuth().session?.user.id ?? "anonymous";
}

export function useMyPartnership() {
  const { partnership } = useRepositories();
  const { session } = useAuth();
  const actorId = session?.user.id ?? "anonymous";
  return useQuery({ queryKey: partnershipKeys.mine(actorId), queryFn: partnership.getMine, enabled: Boolean(session) });
}

function usePartnershipMutation<TInput, TOutput>(action: string, mutationFn: (value: TInput) => Promise<TOutput>) {
  const client = useQueryClient();
  const actorId = useActorId();
  return useMutation({
    mutationKey: [...partnershipKeys.all(actorId), action],
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: partnershipKeys.mine(actorId) }),
  });
}

export function useCreateInvite() {
  const { partnership } = useRepositories();
  return usePartnershipMutation<string, InviteView>("create-invite", (email) => partnership.createInvite(email));
}

export function useAcceptInvite() {
  const { partnership } = useRepositories();
  return usePartnershipMutation<string, PartnershipView>("accept-invite", (code) => partnership.acceptInvite(code));
}

export function useRejectInvite() {
  const { partnership } = useRepositories();
  return usePartnershipMutation<string, void>("reject-invite", (code) => partnership.rejectInvite(code));
}

export function useCancelInvite() {
  const { partnership } = useRepositories();
  return usePartnershipMutation<void, void>("cancel-invite", () => partnership.cancelInvite());
}

function useRevokePartnership(action: "pause" | "end", mutationFn: () => Promise<PartnershipView>) {
  const client = useQueryClient();
  const actorId = useActorId();
  return useMutation({
    mutationKey: [...partnershipKeys.all(actorId), action],
    mutationFn,
    onSuccess: (next) => applyRevocationResult(client, actorId, next),
  });
}

export function usePausePartnership() {
  const { partnership } = useRepositories();
  return useRevokePartnership("pause", partnership.pause);
}

export function useEndPartnership() {
  const { partnership } = useRepositories();
  return useRevokePartnership("end", partnership.end);
}
