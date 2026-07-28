import { INVITE_UNAVAILABLE } from "../../features/partnership/model";
import { assertPartnershipTransition } from "../../features/partnership/transitions";
import { preferenceUpdateSchema } from "../../features/preferences/model";
import { createSupportRequestSchema } from "../../features/support/model";
import { createPartnershipFixture, type FixtureUser } from "./partnership";

const userA: FixtureUser = { id: "user-a", email: "a@example.com", displayName: "Alex" };
const userB: FixtureUser = { id: "user-b", email: "b@example.com", displayName: "Blair" };

function setup(now?: () => Date, inviteTtlMs?: number) {
  const fixture = createPartnershipFixture({ users: [userA, userB], now, inviteTtlMs });
  return { a: fixture.forUser(userA.id), b: fixture.forUser(userB.id) };
}

async function activate(a: ReturnType<typeof setup>["a"], b: ReturnType<typeof setup>["b"]) {
  const invite = await a.partnership.createInvite(userB.email);
  await b.partnership.acceptInvite(invite.code);
  return invite;
}

describe("partnership transition guards", () => {
  it("allows only pending to active, active to paused or ended, and paused to ended", () => {
    expect(() => assertPartnershipTransition("pending", "active")).not.toThrow();
    expect(() => assertPartnershipTransition("active", "paused")).not.toThrow();
    expect(() => assertPartnershipTransition("paused", "ended")).not.toThrow();
    expect(() => assertPartnershipTransition("ended", "active")).toThrow("Invalid partnership transition");
    expect(() => assertPartnershipTransition("paused", "active")).toThrow("Invalid partnership transition");
  });
});

describe("two-user partnership fixture", () => {
  it("requires the intended invitee's explicit acceptance", async () => {
    const { a, b } = setup();
    const invite = await a.partnership.createInvite(userB.email);
    expect((await a.partnership.getMine())?.status).toBe("pending");
    await expect(a.partnership.acceptInvite(invite.code)).rejects.toThrow(INVITE_UNAVAILABLE);
    expect((await b.partnership.acceptInvite(invite.code)).status).toBe("active");
    await expect(b.partnership.acceptInvite(invite.code)).rejects.toThrow(INVITE_UNAVAILABLE);
  });

  it("makes rejected, cancelled, expired, and unknown invites neutrally unavailable", async () => {
    const rejected = setup();
    const rejectedInvite = await rejected.a.partnership.createInvite(userB.email);
    await rejected.b.partnership.rejectInvite(rejectedInvite.code);
    await expect(rejected.b.partnership.acceptInvite(rejectedInvite.code)).rejects.toThrow(INVITE_UNAVAILABLE);
    expect(await rejected.a.partnership.getMine()).toBeNull();

    const cancelled = setup();
    const cancelledInvite = await cancelled.a.partnership.createInvite(userB.email);
    await cancelled.a.partnership.cancelInvite();
    await expect(cancelled.b.partnership.acceptInvite(cancelledInvite.code)).rejects.toThrow(INVITE_UNAVAILABLE);

    let instant = new Date("2026-01-01T00:00:00.000Z");
    const expired = setup(() => instant, 1000);
    const expiredInvite = await expired.a.partnership.createInvite(userB.email);
    instant = new Date("2026-01-01T00:00:02.000Z");
    await expect(expired.b.partnership.acceptInvite(expiredInvite.code)).rejects.toThrow(INVITE_UNAVAILABLE);
    expect(await expired.a.partnership.getMine()).toBeNull();
    await expect(expired.b.partnership.acceptInvite("unknown")).rejects.toThrow(INVITE_UNAVAILABLE);
  });

  it("keeps preferences owner-scoped and rejects unsafe fields", async () => {
    const { a, b } = setup();
    await activate(a, b);
    expect(await a.preferences.updateMine({ shareProgress: true })).toMatchObject({ shareProgress: true });
    expect(await b.preferences.getMine()).toMatchObject({ shareProgress: false });
    await a.partnership.pause();
    expect(await b.preferences.updateMine({ allowSupportRequests: false })).toMatchObject({ allowSupportRequests: false });
    expect(await a.preferences.getMine()).toMatchObject({ shareProgress: true, allowSupportRequests: true });
    await expect(a.preferences.updateMine({ shareProgress: false, ownerId: userB.id } as never)).rejects.toThrow();
    expect(await b.preferences.getMine()).toMatchObject({ shareProgress: false, allowSupportRequests: false });
    expect(() => preferenceUpdateSchema.parse({ shareProgress: true, ownerId: userB.id, privateNote: "secret" })).toThrow();
  });

  it("allows only the other active member to acknowledge and close support", async () => {
    const { a, b } = setup();
    await activate(a, b);
    const request = await a.support.create("check_in");
    await expect(a.support.acknowledge(request.id)).rejects.toThrow("unavailable");
    expect((await b.support.acknowledge(request.id)).status).toBe("acknowledged");
    expect((await b.support.close(request.id)).status).toBe("closed");
    expect(() => createSupportRequestSchema.parse({ type: "check_in", privateNote: "secret", ownerId: userA.id })).toThrow();
  });

  it("revokes support immediately on pause and after termination", async () => {
    const { a, b } = setup();
    await activate(a, b);
    const pendingRequest = await a.support.create("encouragement");
    const acknowledgedRequest = await a.support.create("practical_help");
    await b.support.acknowledge(acknowledgedRequest.id);
    expect((await b.partnership.pause()).status).toBe("paused");
    await expect(a.support.list()).rejects.toThrow("Active partnership required");
    await expect(b.support.create("practical_help")).rejects.toThrow("Active partnership required");
    expect((await a.partnership.end()).status).toBe("ended");
    await expect(b.partnership.pause()).rejects.toThrow("Invalid partnership transition");
    await expect(a.support.list()).rejects.toThrow("Active partnership required");
    await expect(b.support.create("check_in")).rejects.toThrow("Active partnership required");
    await expect(b.support.acknowledge(pendingRequest.id)).rejects.toThrow("Active partnership required");
    await expect(b.support.close(acknowledgedRequest.id)).rejects.toThrow("Active partnership required");
  });

  it("returns DTO allow-lists without email, owner identity, notes, or metadata", async () => {
    const { a, b } = setup();
    await activate(a, b);
    const preference = await a.preferences.getMine();
    const request = await a.support.create("encouragement");
    const payload = JSON.stringify({ partnership: await b.partnership.getMine(), preference, request });
    expect(payload).not.toMatch(/email|ownerId|privateNote|notes|metadata|a@example\.com|b@example\.com/);
    expect(Object.keys(preference)).toEqual(["shareProgress", "allowSupportRequests", "updatedAt"]);
    expect(Object.keys(request)).toEqual(["id", "type", "status", "requestedBy", "createdAt", "updatedAt"]);
  });
});
