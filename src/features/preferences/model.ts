import { z } from "zod";

export const preferenceUpdateSchema = z.object({
  shareProgress: z.boolean().optional(),
  allowSupportRequests: z.boolean().optional(),
}).strict();

export type PreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;
export type PreferenceView = { shareProgress: boolean; allowSupportRequests: boolean; updatedAt: string };
