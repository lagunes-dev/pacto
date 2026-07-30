import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useRepositories } from "../../app/providers";
import { useAuth } from "../auth/queries/AuthProvider";
import type { SaveDailyCheckinInput } from "./model";

export const dailyCheckinKeys = {
  owner: (ownerId: string) => ["daily-checkin", ownerId] as const,
  today: (ownerId: string, browserTimezoneConfirmed: boolean) =>
    [...dailyCheckinKeys.owner(ownerId), "today", browserTimezoneConfirmed] as const,
};

function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function useDailyCheckin(browserTimezoneConfirmed = false) {
  const { checkin } = useRepositories();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const ownerId = session?.user.id ?? "anonymous";
  const today = useQuery({
    queryKey: dailyCheckinKeys.today(ownerId, browserTimezoneConfirmed),
    queryFn: () => checkin.loadToday({
      browserTimezone: browserTimezone(),
      browserTimezoneConfirmed,
    }),
    enabled: Boolean(session),
  });
  const save = useMutation({
    mutationFn: (input: SaveDailyCheckinInput) => checkin.save(input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dailyCheckinKeys.owner(ownerId) }),
        queryClient.invalidateQueries({ queryKey: ["progress", ownerId] }),
      ]);
    },
  });

  return { today, save };
}
