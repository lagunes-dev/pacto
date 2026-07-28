import { z } from "zod";

export const supportTypes = ["encouragement", "check_in", "practical_help"] as const;
export const createSupportRequestSchema = z.object({ type: z.enum(supportTypes) }).strict();
export type SupportType = (typeof supportTypes)[number];
export type SupportStatus = "pending" | "acknowledged" | "closed";
export type SupportRequestView = {
  id: string;
  type: SupportType;
  status: SupportStatus;
  requestedBy: "me" | "partner";
  createdAt: string;
  updatedAt: string;
};
