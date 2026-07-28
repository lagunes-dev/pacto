import { QueryClient } from "@tanstack/react-query";

import { preferenceKeys } from "../preferences/queries";
import { supportKeys } from "../support/queries";
import { applyRevocationResult, partnershipKeys } from "./queries";

describe("partnership revocation cache policy", () => {
  it.each(["pause", "end"])("removes partner-derived data on %s while retaining owner state", async (action) => {
    const client = new QueryClient();
    const actorId = "actor-a";
    const otherActorId = "actor-b";

    const next = {
      id: "partnership-a",
      status: action === "pause" ? "paused" as const : "ended" as const,
      partner: { userId: otherActorId, displayName: "Partner" },
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T01:00:00.000Z",
    };
    client.setQueryData(partnershipKeys.mine(actorId), { ...next, status: "active" });
    client.setQueryData(partnershipKeys.partnerProfile(actorId), { displayName: "Partner" });
    client.setQueryData(partnershipKeys.futureShared(actorId), { summary: "must disappear" });
    client.setQueryData(supportKeys.list(actorId), [{ id: "support-a" }]);
    client.setQueryData(preferenceKeys.mine(actorId), { shareProgress: false });
    client.setQueryData(supportKeys.list(otherActorId), [{ id: "support-b" }]);

    await applyRevocationResult(client, actorId, next);

    expect(client.getQueryData(partnershipKeys.partnerProfile(actorId))).toBeUndefined();
    expect(client.getQueryData(partnershipKeys.futureShared(actorId))).toBeUndefined();
    expect(client.getQueryData(supportKeys.list(actorId))).toBeUndefined();
    expect(client.getQueryData(partnershipKeys.mine(actorId))).toEqual(next);
    expect(client.getQueryData(preferenceKeys.mine(actorId))).toEqual({ shareProgress: false });
    expect(client.getQueryData(supportKeys.list(otherActorId))).toEqual([{ id: "support-b" }]);
  });
});
