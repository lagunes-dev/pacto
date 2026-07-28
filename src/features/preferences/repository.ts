import type { PreferenceUpdate, PreferenceView } from "./model";

export interface PreferenceRepository {
  getMine(): Promise<PreferenceView>;
  updateMine(input: PreferenceUpdate): Promise<PreferenceView>;
}
