import { z } from "zod";

export const supportTypes = ["distraction", "food_choice", "motivation", "conversation", "presence_no_advice"] as const;
export const supportMessages = ["not_urgent", "when_available", "no_reply_needed"] as const;
export const supportResponses = ["available_now", "available_later", "here_with_you"] as const;
export const createSupportRequestSchema = z.object({ type: z.enum(supportTypes), message: z.enum(supportMessages).optional() }).strict();
export const acknowledgeSupportRequestSchema = z.object({ id: z.string().min(1), response: z.enum(supportResponses) }).strict();
export type SupportType = (typeof supportTypes)[number];
export type SupportMessage = (typeof supportMessages)[number];
export type SupportResponse = (typeof supportResponses)[number];
export type CreateSupportRequest = z.infer<typeof createSupportRequestSchema>;
export type SupportStatus = "pending" | "acknowledged" | "closed";
export type SupportRequestView = {
  id: string;
  type: SupportType;
  status: SupportStatus;
  requestedBy: "me" | "partner";
  message?: SupportMessage;
  response?: SupportResponse;
  createdAt: string;
  updatedAt: string;
};
