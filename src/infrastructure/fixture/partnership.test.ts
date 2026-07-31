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
    expect(await a.preferences.updateMine({ sharePercentages: true })).toMatchObject({ sharePercentages: true });
    expect(await b.preferences.getMine()).toMatchObject({ sharePercentages: false });
    await a.partnership.pause();
    expect(await b.preferences.updateMine({ shareGeneralStatus: false })).toMatchObject({ shareGeneralStatus: false });
    expect(await a.preferences.getMine()).toMatchObject({ sharePercentages: true, shareGeneralStatus: true });
    await expect(a.preferences.updateMine({ sharePercentages: false, ownerId: userB.id } as never)).rejects.toThrow();
    expect(await b.preferences.getMine()).toMatchObject({ sharePercentages: false, shareGeneralStatus: false });
    expect(() => preferenceUpdateSchema.parse({ sharePercentages: true, ownerId: userB.id, privateNote: "secret" })).toThrow();
  });

  it("keeps a one-sided resume paused until the other member confirms", async () => {
    const { a, b } = setup();
    await activate(a, b);
    await a.partnership.pause();
    expect(await a.partnership.requestResume()).toMatchObject({ status: "paused", resumeStatus: "requested-by-me" });
    expect(await b.partnership.getMine()).toMatchObject({ status: "paused", resumeStatus: "awaiting-my-confirmation" });
    await expect(a.partnership.confirmResume()).rejects.toThrow("Partner confirmation required");
    expect(await b.partnership.confirmResume()).toMatchObject({ status: "active", resumeStatus: "none" });
  });

  it("allows only the other active member to acknowledge and close support", async () => {
    const { a, b } = setup();
    await activate(a, b);
    const request = await a.support.create({ type: "conversation" });
    await expect(a.support.acknowledge(request.id, "available_now")).rejects.toThrow("unavailable");
    expect((await b.support.acknowledge(request.id, "available_now")).status).toBe("acknowledged");
    expect((await b.support.close(request.id)).status).toBe("closed");
    expect(() => createSupportRequestSchema.parse({ type: "conversation", privateNote: "secret", ownerId: userA.id })).toThrow();
  });

  it("revokes support immediately on pause and after termination", async () => {
    const { a, b } = setup();
    await activate(a, b);
    const pendingRequest = await a.support.create({ type: "motivation" });
    const acknowledgedRequest = await a.support.create({ type: "food_choice" });
    await b.support.acknowledge(acknowledgedRequest.id, "here_with_you");
    expect((await b.partnership.pause()).status).toBe("paused");
    await expect(a.support.list()).rejects.toThrow("Active partnership required");
    await expect(b.support.create({ type: "food_choice" })).rejects.toThrow("Active partnership required");
    expect((await a.partnership.end()).status).toBe("ended");
    await expect(b.partnership.pause()).rejects.toThrow("Invalid partnership transition");
    await expect(a.support.list()).rejects.toThrow("Active partnership required");
    await expect(b.support.create({ type: "conversation" })).rejects.toThrow("Active partnership required");
    await expect(b.support.acknowledge(pendingRequest.id, "available_later")).rejects.toThrow("Active partnership required");
    await expect(b.support.close(acknowledgedRequest.id)).rejects.toThrow("Active partnership required");
  });

  it("returns DTO allow-lists without email, owner identity, notes, or metadata", async () => {
    const { a, b } = setup();
    await activate(a, b);
    const preference = await a.preferences.getMine();
    const request = await a.support.create({ type: "motivation" });
    const payload = JSON.stringify({ partnership: await b.partnership.getMine(), preference, request });
    expect(payload).not.toMatch(/email|ownerId|privateNote|notes|metadata|a@example\.com|b@example\.com/);
    expect(Object.keys(preference)).toEqual(expect.arrayContaining(["shareCheckinCompleted", "shareGeneralStatus", "shareHabitDetails", "shareCravingLevel", "sharePercentages", "noThreats", "askBeforeAdvice", "noComparisons", "pauseAllowed", "preferredSupport", "timezone", "updatedAt"]));
    expect(Object.keys(request)).toEqual(["id", "type", "status", "requestedBy", "createdAt", "updatedAt"]);
  });
});
