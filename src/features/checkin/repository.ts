import type { DailyCheckinView, SaveDailyCheckinInput, SavedCheckin } from "./model";

export type LoadDailyCheckinInput = {
  browserTimezone?: string;
  browserTimezoneConfirmed?: boolean;
};

export interface DailyCheckinRepository {
  loadToday(input?: LoadDailyCheckinInput): Promise<DailyCheckinView>;
  save(input: SaveDailyCheckinInput): Promise<SavedCheckin>;
}
