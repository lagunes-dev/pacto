import type {
  DetailedEventRecord,
  RecoveryRecord,
  SaveRecoveryInput,
  WeeklyReviewRecord,
} from "./model";

export interface RecoveryRepository {
  timeline(): Promise<RecoveryRecord[]>;
  save(input: SaveRecoveryInput): Promise<RecoveryRecord>;
}

export interface RegistroRecordRepository {
  detailedEvents(): Promise<DetailedEventRecord[]>;
  weeklyReviews(): Promise<WeeklyReviewRecord[]>;
}
