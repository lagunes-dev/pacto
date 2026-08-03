import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { partnershipKeys } from "../partnership/queries";
import { preferenceKeys } from "../preferences/queries";
import { supportKeys } from "../support/queries";
import { createSupabaseRealtimePort } from "../../infrastructure/supabase/realtime";
import { createRealtimeLifecycle, type RealtimePort, type RealtimeSubscription } from "./port";
import { AppProviders } from "../../app/providers";
import type { AuthPort } from "../auth/port";
import type { OfflineQueuePort } from "../offline-queue/port";
import type { PartnershipRepository } from "../partnership/repository";
import type { PartnershipView } from "../partnership/model";
import { useAuth } from "../auth/queries/AuthProvider";

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

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"] as const)("evicts the channel on terminal status without recursive removal (%s)", async (status) => {
    let statusCallback: ((status: string) => void) | undefined;
    const channels = Array.from({ length: 2 }, () => ({
      on: vi.fn(),
      subscribe: vi.fn(),
    }));
    channels.forEach((channel) => {
      channel.on.mockReturnValue(channel);
      channel.subscribe.mockImplementation((callback: (status: string) => void) => {
        statusCallback = callback;
        return channel;
      });
    });
    let channelIndex = 0;
    const client = {
      channel: vi.fn(() => channels[channelIndex++]),
      removeChannel: vi.fn(async () => "ok"),
    };
    const port = createSupabaseRealtimePort(client as never);
    const input = {
      actorId: "actor-a",
      partnershipId: "partnership-a",
      onPartnershipChange: vi.fn(),
      onPreferencesChange: vi.fn(),
      onSupportChange: vi.fn(),
      onInactive: vi.fn(),
    };

    const cleanup = port.subscribe(input);
    statusCallback?.(status);
    expect(client.removeChannel).not.toHaveBeenCalled();

    const resubscribeCleanup = port.subscribe(input);
    expect(client.channel).toHaveBeenCalledTimes(2);
    await cleanup();
    expect(client.removeChannel).not.toHaveBeenCalled();
    await resubscribeCleanup();
    expect(client.removeChannel).toHaveBeenCalledOnce();
  });
});

describe("mounted realtime coordinator", () => {
  it("cleans up on partnership pause, end, and sign-out", async () => {
    const mock = createMockPort();
    let status: PartnershipView["status"] = "active";
    const session = { user: { id: "actor-a", email: "a@example.com" } };
    const authPort: AuthPort = {
      getSession: async () => session,
      register: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(async () => undefined),
    };
    const offlineQueue: OfflineQueuePort = {
      activateActor: vi.fn(async () => undefined),
      enqueue: vi.fn(),
      list: vi.fn(),
      purge: vi.fn(),
    } as unknown as OfflineQueuePort;
    const partnershipRepository: PartnershipRepository = {
      getMine: async () => ({ id: "partnership-a", status, partner: { userId: "partner", displayName: "Partner" }, createdAt: "", updatedAt: "" }),
      createInvite: vi.fn(), acceptInvite: vi.fn(), rejectInvite: vi.fn(), cancelInvite: vi.fn(), pause: vi.fn(), end: vi.fn(),
    } as unknown as PartnershipRepository;
    function Probe() {
      const client = useQueryClient();
      const auth = useAuth();
      const changeStatus = (next: PartnershipView["status"]) => { status = next; void client.invalidateQueries({ queryKey: partnershipKeys.mine(session.user.id) }); };
      return <><button onClick={() => changeStatus("paused")}>pause</button><button onClick={() => changeStatus("ended")}>end</button><button onClick={() => changeStatus("active")}>activate</button><button onClick={() => void auth.logout()}>sign out</button></>;
    }

    const user = userEvent.setup();
    render(<AppProviders authPort={authPort} offlineQueue={offlineQueue} partnershipRepository={partnershipRepository} realtime={mock.port}><Probe /></AppProviders>);
    await screen.findByRole("button", { name: "pause" });
    await waitFor(() => expect(mock.subscriptions).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "pause" }));
    await waitFor(() => expect(mock.cleanups[0]).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "activate" }));
    await waitFor(() => expect(mock.subscriptions).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "end" }));
    await waitFor(() => expect(mock.cleanups[1]).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "activate" }));
    await waitFor(() => expect(mock.subscriptions).toHaveLength(3));
    await user.click(screen.getByRole("button", { name: "sign out" }));
    await waitFor(() => expect(authPort.logout).toHaveBeenCalledOnce());
    await waitFor(() => expect(mock.cleanups[2]).toHaveBeenCalledOnce());
  });
});
