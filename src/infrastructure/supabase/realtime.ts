import type { RealtimeChannel } from "@supabase/supabase-js";

import type { RealtimePort, RealtimeSubscription } from "../../features/realtime/port";
import type { PactoSupabaseClient } from "./client";

export function createSupabaseRealtimePort(client: PactoSupabaseClient): RealtimePort {
  const channels = new Map<string, RealtimeChannel>();

  return {
    subscribe(input: RealtimeSubscription) {
      const key = `${input.actorId}:${input.partnershipId}`;
      if (channels.has(key)) return async () => undefined;
      const channel = client
          .channel(`pacto:${key}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "support_requests", filter: `partnership_id=eq.${input.partnershipId}` }, input.onSupportChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "sharing_preferences", filter: `user_id=eq.${input.actorId}` }, input.onPreferencesChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "communication_preferences", filter: `user_id=eq.${input.actorId}` }, input.onPreferencesChange)
          .on("postgres_changes", { event: "*", schema: "public", table: "partnership_realtime_state", filter: `recipient_id=eq.${input.actorId}` }, (payload) => {
            if ((payload.new as { status?: string }).status !== "active") input.onInactive();
            else input.onPartnershipChange();
          })
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              channels.delete(key);
              if (channel) void client.removeChannel(channel);
            }
          });
      channels.set(key, channel);

      return async () => {
        if (channels.get(key) !== channel) return;
        channels.delete(key);
        await client.removeChannel(channel);
      };
    },
  };
}
