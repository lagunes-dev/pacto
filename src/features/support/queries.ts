import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import type { CreateSupportRequest, SupportResponse } from "./model";

export const supportKeys = {
  all: (actorId: string) => ["support", actorId] as const,
  list: (actorId: string) => ["support", actorId, "list"] as const,
};

function useActorId() {
  return useAuth().session?.user.id ?? "anonymous";
}

export function useSupportRequests() {
  const { support } = useRepositories();
  const { session } = useAuth();
  const actorId = session?.user.id ?? "anonymous";
  return useQuery({ queryKey: supportKeys.list(actorId), queryFn: support.list, enabled: Boolean(session) });
}

function useSupportMutation<T>(action: string, mutationFn: (value: T) => Promise<unknown>) {
  const client = useQueryClient();
  const actorId = useActorId();
  return useMutation({
    mutationKey: [...supportKeys.all(actorId), action],
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: supportKeys.all(actorId) }),
  });
}

export function useCreateSupportRequest() {
  const { support } = useRepositories();
  return useSupportMutation<CreateSupportRequest>("create", (input) => support.create(input));
}

export function useAcknowledgeSupportRequest() {
  const { support } = useRepositories();
  return useSupportMutation<{ id: string; response: SupportResponse }>("acknowledge", ({ id, response }) => support.acknowledge(id, response));
}

export function useCloseSupportRequest() {
  const { support } = useRepositories();
  return useSupportMutation<string>("close", (id) => support.close(id));
}
