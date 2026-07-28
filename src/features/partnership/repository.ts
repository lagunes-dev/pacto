import type { InviteView, PartnershipView } from "./model";

export interface PartnershipRepository {
  getMine(): Promise<PartnershipView | null>;
  createInvite(inviteeEmail: string): Promise<InviteView>;
  acceptInvite(code: string): Promise<PartnershipView>;
  rejectInvite(code: string): Promise<void>;
  cancelInvite(): Promise<void>;
  pause(): Promise<PartnershipView>;
  end(): Promise<PartnershipView>;
}
