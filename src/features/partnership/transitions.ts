import type { InviteStatus, PartnershipStatus } from "./model";

const partnershipTransitions: Record<PartnershipStatus, readonly PartnershipStatus[]> = {
  pending: ["active"],
  active: ["paused", "ended"],
  paused: ["ended"],
  ended: [],
};

export function assertPartnershipTransition(from: PartnershipStatus, to: PartnershipStatus) {
  if (!partnershipTransitions[from].includes(to)) throw new Error(`Invalid partnership transition: ${from} to ${to}.`);
}

export function isRedeemableInvite(status: InviteStatus, expiresAt: string, now: Date) {
  return status === "pending" && new Date(expiresAt).getTime() > now.getTime();
}
