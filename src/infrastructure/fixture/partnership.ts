import { INVITE_UNAVAILABLE, type InviteStatus, type InviteView, type PartnershipStatus, type PartnershipView } from "../../features/partnership/model";
import type { PartnershipRepository } from "../../features/partnership/repository";
import { assertPartnershipTransition, isRedeemableInvite } from "../../features/partnership/transitions";
import { preferenceUpdateSchema, type PreferenceView } from "../../features/preferences/model";
import type { PreferenceRepository } from "../../features/preferences/repository";
import { createSupportRequestSchema, type SupportRequestView, type SupportStatus, type SupportType } from "../../features/support/model";
import type { SupportRepository } from "../../features/support/repository";

export type FixtureUser = { id: string; email: string; displayName: string };
type InviteRecord = { code: string; inviterId: string; inviteeId: string; status: InviteStatus; expiresAt: string };
type PartnershipRecord = { id: string; memberIds: [string, string]; status: PartnershipStatus; resumeRequestedBy?: string; createdAt: string; updatedAt: string };
type PreferenceRecord = PreferenceView;
type SupportRecord = { id: string; partnershipId: string; requesterId: string; type: SupportType; status: SupportStatus; createdAt: string; updatedAt: string };

export type PartnershipFixtureOptions = { users: [FixtureUser, FixtureUser]; now?: () => Date; inviteTtlMs?: number };

export function createPartnershipFixture({ users, now = () => new Date(), inviteTtlMs = 86_400_000 }: PartnershipFixtureOptions) {
  const invites: InviteRecord[] = [];
  const partnerships: PartnershipRecord[] = [];
  const preferences = new Map(users.map((user) => [user.id, {
    shareCheckinCompleted: true, shareGeneralStatus: true, shareHabitDetails: false,
    shareCravingLevel: false, sharePercentages: false, noThreats: true,
    askBeforeAdvice: true, noComparisons: true, pauseAllowed: true,
    preferredSupport: "Pregúntame antes de darme consejos", timezone: "America/Mexico_City", updatedAt: now().toISOString(),
  }]));
  const supportRequests: SupportRecord[] = [];
  const userById = (id: string) => users.find((user) => user.id === id);
  const membership = (actorId: string) => partnerships.find((item) => item.memberIds.includes(actorId));
  const pendingInvite = (actorId: string) => invites.find((item) => item.status === "pending" && (item.inviterId === actorId || item.inviteeId === actorId));
  const removePendingPartnership = (invite: InviteRecord) => {
    const index = partnerships.findIndex((item) => item.status === "pending" && item.memberIds.includes(invite.inviterId) && item.memberIds.includes(invite.inviteeId));
    if (index >= 0) partnerships.splice(index, 1);
  };
  const expirePendingInvites = () => invites.filter((invite) => invite.status === "pending" && !isRedeemableInvite(invite.status, invite.expiresAt, now())).forEach((invite) => {
    invite.status = "expired";
    removePendingPartnership(invite);
  });

  const mapPartnership = (record: PartnershipRecord, actorId: string): PartnershipView => {
    const partner = userById(record.memberIds.find((id) => id !== actorId) ?? "");
    if (!partner) throw new Error("Partnership unavailable.");
    return { id: record.id, status: record.status, partner: { userId: partner.id, displayName: partner.displayName }, resumeStatus: record.resumeRequestedBy ? (record.resumeRequestedBy === actorId ? "requested-by-me" : "awaiting-my-confirmation") : "none", createdAt: record.createdAt, updatedAt: record.updatedAt };
  };
  const mapInvite = ({ code, status, expiresAt }: InviteRecord): InviteView => ({ code, status, expiresAt });
  const mapPreference = (record: PreferenceRecord): PreferenceView => structuredClone(record);
  const mapSupport = (record: SupportRecord, actorId: string): SupportRequestView => ({
    id: record.id, type: record.type, status: record.status, requestedBy: record.requesterId === actorId ? "me" : "partner", createdAt: record.createdAt, updatedAt: record.updatedAt,
  });
  const activeMembership = (actorId: string) => {
    const record = membership(actorId);
    if (!record || record.status !== "active") throw new Error("Active partnership required.");
    return record;
  };
  function forUser(actorId: string): { partnership: PartnershipRepository; preferences: PreferenceRepository; support: SupportRepository } {
    if (!userById(actorId)) throw new Error("Fixture user unavailable.");

    const partnership: PartnershipRepository = {
      async getMine() {
        expirePendingInvites();
        const record = membership(actorId);
        if (!record) return null;
        const invite = pendingInvite(actorId);
        return record.status !== "pending" || invite ? mapPartnership(record, actorId) : null;
      },
      async createInvite(inviteeEmail) {
        expirePendingInvites();
        if (membership(actorId)) throw new Error("Partnership already exists.");
        const invitee = users.find((user) => user.email.toLowerCase() === inviteeEmail.trim().toLowerCase() && user.id !== actorId);
        if (!invitee) throw new Error(INVITE_UNAVAILABLE);
        const timestamp = now();
        const invite: InviteRecord = { code: crypto.randomUUID(), inviterId: actorId, inviteeId: invitee.id, status: "pending", expiresAt: new Date(timestamp.getTime() + inviteTtlMs).toISOString() };
        invites.push(invite);
        partnerships.push({ id: crypto.randomUUID(), memberIds: [actorId, invitee.id], status: "pending", createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() });
        return mapInvite(invite);
      },
      async acceptInvite(code) { return redeem(code, "accepted"); },
      async rejectInvite(code) { await redeem(code, "rejected"); },
      async cancelInvite() {
        expirePendingInvites();
        const invite = invites.find((item) => item.inviterId === actorId && item.status === "pending");
        if (!invite || !isRedeemableInvite(invite.status, invite.expiresAt, now())) throw new Error(INVITE_UNAVAILABLE);
        invite.status = "cancelled";
        removePendingPartnership(invite);
      },
      async pause() { return transition("paused"); },
      async requestResume() {
        const record = membership(actorId);
        if (!record || record.status !== "paused" || record.resumeRequestedBy) throw new Error("Paused partnership required.");
        record.resumeRequestedBy = actorId;
        record.updatedAt = now().toISOString();
        return mapPartnership(record, actorId);
      },
      async confirmResume() {
        const record = membership(actorId);
        if (!record || record.status !== "paused" || !record.resumeRequestedBy || record.resumeRequestedBy === actorId) throw new Error("Partner confirmation required.");
        record.status = "active";
        record.resumeRequestedBy = undefined;
        record.updatedAt = now().toISOString();
        return mapPartnership(record, actorId);
      },
      async end() { return transition("ended"); },
    };

    async function redeem(code: string, outcome: "accepted" | "rejected") {
      const invite = invites.find((item) => item.code === code);
      if (!invite || invite.inviteeId !== actorId || !isRedeemableInvite(invite.status, invite.expiresAt, now())) {
        if (invite?.status === "pending" && new Date(invite.expiresAt).getTime() <= now().getTime()) {
          invite.status = "expired";
          removePendingPartnership(invite);
        }
        throw new Error(INVITE_UNAVAILABLE);
      }
      const record = membership(actorId);
      if (!record) throw new Error(INVITE_UNAVAILABLE);
      invite.status = outcome;
      if (outcome === "rejected") {
        removePendingPartnership(invite);
        return mapPartnership(record, actorId);
      }
      assertPartnershipTransition(record.status, "active");
      record.status = "active";
      record.updatedAt = now().toISOString();
      return mapPartnership(record, actorId);
    }

    function transition(status: "paused" | "ended") {
      const record = membership(actorId);
      if (!record) throw new Error("Partnership unavailable.");
      assertPartnershipTransition(record.status, status);
      record.status = status;
      record.resumeRequestedBy = undefined;
      record.updatedAt = now().toISOString();
      return mapPartnership(record, actorId);
    }

    const preferenceRepository: PreferenceRepository = {
      async getMine() { return mapPreference(preferences.get(actorId)!); },
      async updateMine(input) {
        const safe = preferenceUpdateSchema.parse(input);
        const record = preferences.get(actorId)!;
        Object.assign(record, safe);
        record.updatedAt = now().toISOString();
        return mapPreference(record);
      },
      async completeSetup(input) {
        const { goal: _goal, ...preferencesInput } = input;
        return preferenceRepository.updateMine(preferencesInput);
      },
    };

    const support: SupportRepository = {
      async list() { const record = activeMembership(actorId); return supportRequests.filter((item) => item.partnershipId === record.id).map((item) => mapSupport(item, actorId)); },
      async create(type) {
        const partnershipRecord = activeMembership(actorId);
        const safe = createSupportRequestSchema.parse({ type });
        const timestamp = now().toISOString();
        const record: SupportRecord = { id: crypto.randomUUID(), partnershipId: partnershipRecord.id, requesterId: actorId, type: safe.type, status: "pending", createdAt: timestamp, updatedAt: timestamp };
        supportRequests.push(record);
        return mapSupport(record, actorId);
      },
      async acknowledge(id) { return updateSupport(id, "pending", "acknowledged"); },
      async close(id) { return updateSupport(id, "acknowledged", "closed"); },
    };

    function updateSupport(id: string, from: SupportStatus, to: SupportStatus) {
      const partnershipRecord = activeMembership(actorId);
      const record = supportRequests.find((item) => item.id === id && item.partnershipId === partnershipRecord.id);
      if (!record || record.requesterId === actorId || record.status !== from) throw new Error("Support request unavailable.");
      record.status = to;
      record.updatedAt = now().toISOString();
      return mapSupport(record, actorId);
    }

    return { partnership, preferences: preferenceRepository, support };
  }

  return { forUser };
}
