import type { Habit } from "../habits/model";

export type PersonalProgress = {
  habits: Habit[];
  completedEntryCount: number;
  activeDayCount: number;
};
