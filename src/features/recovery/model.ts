import { z } from "zod";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const saveRecoveryInputSchema = z.object({
  operationId: z.uuid(),
  expectedRevision: z.number().int().min(0),
  trigger: boundedText(200),
  moment: boundedText(200),
  need: boundedText(500),
  alternative: boundedText(500),
  privateNote: z.string().trim().max(4000).optional(),
}).strict();

export type SaveRecoveryInput = z.infer<typeof saveRecoveryInputSchema>;

export type RecoveryRecord = {
  id: string;
  revision: number;
  trigger: string;
  moment: string;
  need: string;
  alternative: string;
  privateNote: string | null;
  recordedAt: string;
};

export type WeeklyReviewRecord = {
  id: string;
  weekStart: string;
  revision: number;
  reflection: string;
  nextStep: string;
  recordedAt: string;
};

export type DetailedEventRecord = Omit<RecoveryRecord, "privateNote">;
