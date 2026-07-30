import { z } from "zod";

export const APPROVED_TRIGGERS = [
  "Antojo",
  "Comida social",
  "No había alternativa",
  "Hambre",
  "Estrés",
  "Costumbre",
] as const;

export const cravingLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const approvedTriggerSchema = z.enum(APPROVED_TRIGGERS);

export const habitAnswerSchema = z.discriminatedUnion("state", [
  z.object({ goalId: z.uuid(), state: z.literal("done"), trigger: z.null() }).strict(),
  z.object({ goalId: z.uuid(), state: z.literal("event"), trigger: approvedTriggerSchema }).strict(),
]);

export const saveDailyCheckinInputSchema = z.object({
  timezone: z.string().min(1),
  cravingLevel: cravingLevelSchema,
  habits: z.array(habitAnswerSchema).min(1),
}).strict().superRefine(({ habits }, context) => {
  const goalIds = habits.map(({ goalId }) => goalId);
  if (new Set(goalIds).size !== goalIds.length) {
    context.addIssue({ code: "custom", message: "Each goal can appear only once", path: ["habits"] });
  }
});

export type ApprovedTrigger = z.infer<typeof approvedTriggerSchema>;
export type CravingLevel = z.infer<typeof cravingLevelSchema>;
export type HabitAnswer = z.infer<typeof habitAnswerSchema>;
export type SaveDailyCheckinInput = z.infer<typeof saveDailyCheckinInputSchema>;

export type CheckinGoal = {
  id: string;
  name: string;
  priority: 1 | 2 | 3;
  answer: HabitAnswer | null;
};

export type SavedCheckin = {
  id: string;
  entryDate: string;
  cravingLevel: CravingLevel;
  completedAt: string;
  habits: HabitAnswer[];
};

export type DailyCheckinView = {
  entryDate: string;
  timezone: string;
  timezoneSource: "profile" | "default" | "browser";
  requiresBrowserConfirmation: boolean;
  goals: CheckinGoal[];
  saved: SavedCheckin | null;
};
