import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { partnershipKeys } from "../partnership/queries";
import { preferenceKeys } from "../preferences/queries";
import { supportKeys } from "../support/queries";
import { createSupabaseRealtimePort } from "../../infrastructure/supabase/realtime";
import { createRealtimeLifecycle, type RealtimePort, type RealtimeSubscription } from "./port";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function createMockPort() {
  const subscriptions: RealtimeSubscription[] = [];
  const cleanups: ReturnType<typeof vi.fn>[] = [];
  const port: RealtimePort = {
    subscribe(input) {
      subscriptions.push(input);
      const cleanup = vi.fn(async () => undefined);
      cleanups.push(cleanup);
      return cleanup;
    },
  };
  return { port, subscriptions, cleanups };
}

describe("realtime lifecycle", () => {
  it("deduplicates channels and cleans up on sign-out, unmount, or dependency change", async () => {
    const mock = createMockPort();
    const lifecycle = createRealtimeLifecycle(mock.port, new QueryClient());

    lifecycle.start("actor-a", "partnership-a", false);
    await flush();
    expect(mock.subscriptions).toHaveLength(0);

    lifecycle.start("actor-a", "partnership-a", true);
    lifecycle.start("actor-a", "partnership-a", true);
    await flush();
    expect(mock.subscriptions).toHaveLength(1);

    lifecycle.start("actor-a", "partnership-b", true);
    await flush();
    expect(mock.cleanups[0]).toHaveBeenCalledOnce();
    expect(mock.subscriptions).toHaveLength(2);

    await lifecycle.stop();
    expect(mock.cleanups[1]).toHaveBeenCalledOnce();
  });

  it("invalidates only allowlisted keys and clears shared caches when a link becomes inactive", async () => {
    const client = new QueryClient();
    const mock = createMockPort();
    const lifecycle = createRealtimeLifecycle(mock.port, client);
    const actorId = "actor-a";
    const unrelated = ["habits", actorId] as const;
    const keys = [partnershipKeys.mine(actorId), preferenceKeys.mine(actorId), supportKeys.all(actorId), unrelated];
    keys.forEach((key) => client.setQueryData(key, { cached: true }));
    client.setQueryData(partnershipKeys.partnerProfile(actorId), { cached: true });
    client.setQueryData(partnershipKeys.futureShared(actorId), { cached: true });

    lifecycle.start(actorId, "partnership-a", true);
    await flush();
    const subscription = mock.subscriptions[0];
    subscription.onPartnershipChange();
    subscription.onPreferencesChange();
    subscription.onSupportChange();
    await flush();

    expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true, true, false]);
    subscription.onInactive();
    await flush();
    expect(mock.cleanups[0]).toHaveBeenCalledOnce();
    expect(client.getQueryData(partnershipKeys.partnerProfile(actorId))).toBeUndefined();
    expect(client.getQueryData(partnershipKeys.futureShared(actorId))).toBeUndefined();
    expect(client.getQueryData(supportKeys.all(actorId))).toBeUndefined();
  });
});

describe("Supabase realtime filters", () => {
  it("uses actor and active-partnership scoped filters without consuming row details", async () => {
    const registrations: Array<{ config: Record<string, string>; callback: (payload: { new: Record<string, string> }) => void }> = [];
    const channel = {
      on: vi.fn((_kind, config, callback) => {
        registrations.push({ config, callback });
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => "ok"),
    };
    const onInactive = vi.fn();
    const port = createSupabaseRealtimePort(client as never);

    const cleanup = port.subscribe({
      actorId: "actor-a",
      partnershipId: "partnership-a",
      onPartnershipChange: vi.fn(),
      onPreferencesChange: vi.fn(),
      onSupportChange: vi.fn(),
      onInactive,
    });
    const duplicateCleanup = port.subscribe({
      actorId: "actor-a",
      partnershipId: "partnership-a",
      onPartnershipChange: vi.fn(),
      onPreferencesChange: vi.fn(),
      onSupportChange: vi.fn(),
      onInactive: vi.fn(),
    });

    expect(registrations.map(({ config }) => `${config.table}:${config.filter}`)).toEqual([
      "support_requests:partnership_id=eq.partnership-a",
      "sharing_preferences:user_id=eq.actor-a",
      "communication_preferences:user_id=eq.actor-a",
      "partnership_realtime_state:recipient_id=eq.actor-a",
    ]);
    expect(client.channel).toHaveBeenCalledOnce();
    await duplicateCleanup();
    expect(client.removeChannel).not.toHaveBeenCalled();
    registrations[3].callback({ new: { status: "paused", ignored_private_value: "never-used" } });
    expect(onInactive).toHaveBeenCalledOnce();
    await cleanup();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
