import type { QueryClient } from "@tanstack/react-query";

import { clearRevokedPartnershipCache, partnershipKeys } from "../partnership/queries";
import { preferenceKeys } from "../preferences/queries";
import { supportKeys } from "../support/queries";

export type RealtimeSubscription = {
  actorId: string;
  partnershipId: string;
  onPartnershipChange: () => void;
  onPreferencesChange: () => void;
  onSupportChange: () => void;
  onInactive: () => void;
};

export type RealtimeCleanup = () => Promise<void>;

export interface RealtimePort {
  subscribe(subscription: RealtimeSubscription): RealtimeCleanup;
}

export function createUnavailableRealtimePort(): RealtimePort {
  return { subscribe: () => async () => undefined };
}

export function createRealtimeLifecycle(port: RealtimePort, client: QueryClient) {
  let active: { key: string; cleanup: RealtimeCleanup } | undefined;
  let desiredKey: string | undefined;

  const cleanupActive = async (key?: string) => {
    if (!active || (key && active.key !== key)) return;
    const current = active;
    active = undefined;
    await current.cleanup();
  };

  const stop = async (key?: string) => {
    if (key && desiredKey !== key) return;
    desiredKey = undefined;
    await cleanupActive(key);
  };

  return {
    start(actorId: string, partnershipId: string, isActive: boolean) {
      if (!isActive) {
        void stop();
        return;
      }
      const key = `${actorId}:${partnershipId}`;
      desiredKey = key;
      if (active?.key === key) return;
      void cleanupActive().then(() => {
        if (desiredKey !== key || active) return;
        const invalidate = (queryKey: readonly unknown[]) => {
          void client.invalidateQueries({ queryKey, refetchType: "active" });
        };
        const cleanup = port.subscribe({
          actorId,
          partnershipId,
          onPartnershipChange: () => invalidate(partnershipKeys.mine(actorId)),
          onPreferencesChange: () => invalidate(preferenceKeys.mine(actorId)),
          onSupportChange: () => invalidate(supportKeys.all(actorId)),
          onInactive: () => {
            void stop(key);
            void clearRevokedPartnershipCache(client, actorId).then(() =>
              client.invalidateQueries({ queryKey: partnershipKeys.mine(actorId), refetchType: "active" }),
            );
          },
        });
        active = { key, cleanup };
      });
    },
    stop,
  };
}
