import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import type { CreateHabitInput } from "./model";

const keys = {
  habits: (ownerId: string) => ["habits", ownerId] as const,
  progress: (ownerId: string) => ["progress", ownerId] as const,
};

export function useMyHabits() {
  const { habits } = useRepositories();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "anonymous";
  return useQuery({ queryKey: keys.habits(ownerId), queryFn: () => habits.listMine(), enabled: Boolean(session) });
}

function useOwnerMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? "anonymous";
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.habits(ownerId) }),
        queryClient.invalidateQueries({ queryKey: keys.progress(ownerId) }),
      ]);
    },
  });
}

export function useCreateHabit() {
  const { habits } = useRepositories();
  return useOwnerMutation((input: CreateHabitInput) => habits.create(input));
}

export function useUpdateHabit() {
  const { habits } = useRepositories();
  return useOwnerMutation(({ id, input }: { id: string; input: CreateHabitInput }) => habits.update(id, input));
}

export function useDeleteHabit() {
  const { habits } = useRepositories();
  return useOwnerMutation((id: string) => habits.remove(id));
}
