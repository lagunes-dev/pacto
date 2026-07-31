export type PartnershipStatus = "pending" | "active" | "paused" | "ended";
export type InviteStatus = "pending" | "accepted" | "rejected" | "cancelled" | "expired";

export type PartnerView = { userId: string; displayName: string };
export type PartnershipView = {
  id: string;
  status: PartnershipStatus;
  partner: PartnerView;
  resumeStatus?: "none" | "requested-by-me" | "awaiting-my-confirmation";
  createdAt: string;
  updatedAt: string;
};
export type InviteView = { code: string; status: InviteStatus; expiresAt: string };

export const INVITE_UNAVAILABLE = "Invite unavailable.";
