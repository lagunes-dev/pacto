import { z } from "zod";

export const timezoneSchema = z.string().refine((value) => {
  try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
}, "Zona horaria inválida.");

export const preferenceUpdateSchema = z.object({
  shareCheckinCompleted: z.boolean().optional(),
  shareGeneralStatus: z.boolean().optional(),
  shareHabitDetails: z.boolean().optional(),
  shareCravingLevel: z.boolean().optional(),
  sharePercentages: z.boolean().optional(),
  noThreats: z.boolean().optional(),
  askBeforeAdvice: z.boolean().optional(),
  noComparisons: z.boolean().optional(),
  pauseAllowed: z.boolean().optional(),
  preferredSupport: z.string().trim().min(1).max(160).optional(),
  timezone: timezoneSchema.optional(),
}).strict();

export type PreferenceUpdate = z.infer<typeof preferenceUpdateSchema>;
export type PreferenceView = Required<PreferenceUpdate> & { updatedAt: string };
export const onboardingInputSchema = preferenceUpdateSchema.required().extend({ goal: z.string().trim().min(1).max(80) });
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
