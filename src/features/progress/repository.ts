import type { PersonalProgress } from "./model";

export interface ProgressRepository {
  getMine(): Promise<PersonalProgress>;
}
