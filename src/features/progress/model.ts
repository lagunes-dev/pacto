import type { Habit } from "../habits/model";
import type { ProgressEvidence } from "../insights/model";

export type PersonalProgress = {
  habits: Habit[];
  completedEntryCount: number;
  activeDayCount: number;
  evidence?: ProgressEvidence;
};
