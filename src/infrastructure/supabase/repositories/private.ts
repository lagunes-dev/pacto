import { createHabitInputSchema, type Habit } from "../../../features/habits/model";
import type { HabitRepository } from "../../../features/habits/repository";
import type { PersonalProgress } from "../../../features/progress/model";
import type { ProgressRepository } from "../../../features/progress/repository";
import { derivePersonalInsights, type ProgressEventEvidence, type SupportResponseEvidence } from "../../../features/insights/model";
import type { WeeklyCooperation } from "../../../features/weekly-review/model";
import { onboardingInputSchema, preferenceUpdateSchema, type PreferenceUpdate, type PreferenceView } from "../../../features/preferences/model";
import type { PreferenceRepository } from "../../../features/preferences/repository";
import type { PactoSupabaseClient } from "../client";

type QueryResult = { data: unknown; error: { message?: string } | null };
type Query = PromiseLike<QueryResult> & {
  select(columns: string): Query;
  insert(values: unknown): Query;
  update(values: unknown): Query;
  delete(): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  single(): Promise<QueryResult>;
  maybeSingle(): Promise<QueryResult>;
};

export type PrivateDataClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: { message?: string } | null }> };
  from(table: string): Query;
  rpc(name: string, args?: Record<string, unknown>): Promise<QueryResult>;
};

type GoalRow = { id: string; user_id: string; name: string; priority: 1 | 2 | 3; active: boolean; created_at: string };
type DailyEntryRow = { entry_date: string; completed_at: string | null };
type RecoveryEventRow = { trigger: string; moment: string; alternative: string; recorded_at: string };
type SupportResponseRow = { created_at: string; acknowledged_at: string | null };
type CooperationRow = { checkins_completed: number; support_requests_responded: number; reviews_completed: number };
type SharingPreferenceRow = {
  share_checkin_completed: boolean; share_general_status: boolean; share_habit_details: boolean;
  share_craving_level: boolean; share_percentages: boolean; updated_at: string;
};
type CommunicationPreferenceRow = {
  no_threats: boolean; ask_before_advice: boolean; no_comparisons: boolean;
  pause_allowed: boolean; preferred_support: string; updated_at: string;
};
type ProfilePreferenceRow = { timezone: string };

const habitColumns = "id,user_id,name,priority,active,created_at";
const sharingColumns = "share_checkin_completed,share_general_status,share_habit_details,share_craving_level,share_percentages,updated_at";
const communicationColumns = "no_threats,ask_before_advice,no_comparisons,pause_allowed,preferred_support,updated_at";
const habitUpdateSchema = createHabitInputSchema.partial().strict().refine((value) => Object.keys(value).length > 0);

function resultError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message?.trim() || fallback);
}

function unwrap<T>(result: QueryResult, fallback: string): T {
  if (result.error) throw resultError(result.error, fallback);
  return result.data as T;
}

async function requireActorId(client: PrivateDataClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw resultError(error, "Authentication is unavailable.");
  if (!data.user) throw new Error("Authentication required.");
  return data.user.id;
}

function mapHabit(row: GoalRow): Habit {
  return {
    id: row.id,
    ownerId: row.user_id,
    name: row.name,
    priority: row.priority,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapPreference(sharing: SharingPreferenceRow, communication: CommunicationPreferenceRow, profile: ProfilePreferenceRow): PreferenceView {
  return {
    shareCheckinCompleted: sharing.share_checkin_completed,
    shareGeneralStatus: sharing.share_general_status,
    shareHabitDetails: sharing.share_habit_details,
    shareCravingLevel: sharing.share_craving_level,
    sharePercentages: sharing.share_percentages,
    noThreats: communication.no_threats,
    askBeforeAdvice: communication.ask_before_advice,
    noComparisons: communication.no_comparisons,
    pauseAllowed: communication.pause_allowed,
    preferredSupport: communication.preferred_support,
    timezone: profile.timezone,
    updatedAt: sharing.updated_at > communication.updated_at ? sharing.updated_at : communication.updated_at,
  };
}

export function createSupabasePrivateRepositories(client: PrivateDataClient): {
  habits: HabitRepository;
  progress: ProgressRepository;
  preferences: PreferenceRepository;
} {
  const habits: HabitRepository = {
    async create(input) {
      const safe = createHabitInputSchema.parse(input);
      const userId = await requireActorId(client);
      const result = await client.from("goals")
        .insert({ user_id: userId, name: safe.name, priority: safe.priority })
        .select(habitColumns)
        .single();
      return mapHabit(unwrap<GoalRow>(result, "Habit creation failed."));
    },
    async listMine() {
      const result = await client.from("goals").select(habitColumns).order("created_at", { ascending: true });
      return unwrap<GoalRow[]>(result, "Habits are unavailable.").map(mapHabit);
    },
    async update(id, input) {
      const safe = habitUpdateSchema.parse(input);
      const result = await client.from("goals").update(safe).eq("id", id).select(habitColumns).maybeSingle();
      const row = unwrap<GoalRow | null>(result, "Habit update failed.");
      if (!row) throw new Error("Habit not found.");
      return mapHabit(row);
    },
    async remove(id) {
      const result = await client.from("goals").delete().eq("id", id).select("id").maybeSingle();
      const row = unwrap<{ id: string } | null>(result, "Habit removal failed.");
      if (!row) throw new Error("Habit not found.");
    },
  };

  const progress: ProgressRepository = {
    async getMine(): Promise<PersonalProgress> {
      const actorId = await requireActorId(client);
      const [ownedHabits, entriesResult, recoveryResult, supportResult, cooperationResult] = await Promise.all([
        habits.listMine(),
        client.from("daily_entries").select("entry_date,completed_at"),
        client.from("recovery_event_records").select("trigger,moment,alternative,recorded_at").order("recorded_at", { ascending: true }),
        client.from("support_requests").select("created_at,acknowledged_at").eq("requester_id", actorId),
        client.rpc("get_progress_cooperation"),
      ]);
      const entries = unwrap<DailyEntryRow[]>(entriesResult, "Progress is unavailable.");
      const recoveryRows = unwrap<RecoveryEventRow[]>(recoveryResult, "Progress insights are unavailable.");
      const supportRows = unwrap<SupportResponseRow[]>(supportResult, "Support metrics are unavailable.");
      const cooperationRows = unwrap<CooperationRow[]>(cooperationResult, "Cooperation summary is unavailable.");
      const events: ProgressEventEvidence[] = recoveryRows.map((row) => ({
        trigger: row.trigger, moment: row.moment, alternative: row.alternative, recordedAt: row.recorded_at,
      }));
      const responses: SupportResponseEvidence[] = supportRows.map((row) => ({
        createdAt: row.created_at, acknowledgedAt: row.acknowledged_at,
      }));
      const cooperation: WeeklyCooperation | null = cooperationRows[0] ? {
        checkinsCompleted: Number(cooperationRows[0].checkins_completed),
        supportRequestsResponded: Number(cooperationRows[0].support_requests_responded),
        reviewsCompleted: Number(cooperationRows[0].reviews_completed),
      } : null;
      return {
        habits: ownedHabits,
        completedEntryCount: entries.filter((entry) => entry.completed_at !== null).length,
        activeDayCount: new Set(entries.map((entry) => entry.entry_date)).size,
        evidence: { personal: derivePersonalInsights(events, responses), cooperation },
      };
    },
  };

  const preferences: PreferenceRepository = {
    async getMine() {
      const [sharingResult, communicationResult, profileResult] = await Promise.all([
        client.from("sharing_preferences").select(sharingColumns).single(),
        client.from("communication_preferences").select(communicationColumns).single(),
        client.from("profiles").select("timezone").single(),
      ]);
      return mapPreference(
        unwrap<SharingPreferenceRow>(sharingResult, "Sharing preferences are unavailable."),
        unwrap<CommunicationPreferenceRow>(communicationResult, "Communication preferences are unavailable."),
        unwrap<ProfilePreferenceRow>(profileResult, "Profile preferences are unavailable."),
      );
    },
    async updateMine(input: PreferenceUpdate) {
      const safe = preferenceUpdateSchema.parse(input);
      const sharing: Record<string, boolean> = {};
      const communication: Record<string, boolean | string> = {};
      if (safe.shareCheckinCompleted !== undefined) sharing.share_checkin_completed = safe.shareCheckinCompleted;
      if (safe.shareGeneralStatus !== undefined) sharing.share_general_status = safe.shareGeneralStatus;
      if (safe.shareHabitDetails !== undefined) sharing.share_habit_details = safe.shareHabitDetails;
      if (safe.shareCravingLevel !== undefined) sharing.share_craving_level = safe.shareCravingLevel;
      if (safe.sharePercentages !== undefined) sharing.share_percentages = safe.sharePercentages;
      if (safe.noThreats !== undefined) communication.no_threats = safe.noThreats;
      if (safe.askBeforeAdvice !== undefined) communication.ask_before_advice = safe.askBeforeAdvice;
      if (safe.noComparisons !== undefined) communication.no_comparisons = safe.noComparisons;
      if (safe.pauseAllowed !== undefined) communication.pause_allowed = safe.pauseAllowed;
      if (safe.preferredSupport !== undefined) communication.preferred_support = safe.preferredSupport;
      const [sharingResult, communicationResult, profileResult] = await Promise.all([
        Object.keys(sharing).length ? client.from("sharing_preferences").update(sharing).select(sharingColumns).single() : Promise.resolve(null),
        Object.keys(communication).length ? client.from("communication_preferences").update(communication).select(communicationColumns).single() : Promise.resolve(null),
        safe.timezone ? client.from("profiles").update({ timezone: safe.timezone }).select("timezone").single() : Promise.resolve(null),
      ]);
      if (sharingResult) unwrap(sharingResult, "Sharing preference update failed.");
      if (communicationResult) unwrap(communicationResult, "Communication preference update failed.");
      if (profileResult) unwrap(profileResult, "Timezone update failed.");
      return preferences.getMine();
    },
    async completeSetup(input) {
      const safe = onboardingInputSchema.parse(input);
      const result = await client.rpc("complete_onboarding", {
        timezone_name: safe.timezone, goal_name: safe.goal,
        share_checkin: safe.shareCheckinCompleted, share_status: safe.shareGeneralStatus,
        share_habits: safe.shareHabitDetails, share_craving: safe.shareCravingLevel,
        share_rates: safe.sharePercentages, boundary_no_threats: safe.noThreats,
        boundary_ask_advice: safe.askBeforeAdvice, boundary_no_comparisons: safe.noComparisons,
        boundary_pause: safe.pauseAllowed, support_preference: safe.preferredSupport,
      });
      unwrap(result, "Onboarding could not be completed.");
      return preferences.getMine();
    },
  };

  return { habits, progress, preferences };
}

export function asPrivateDataClient(client: PactoSupabaseClient): PrivateDataClient {
  return client as unknown as PrivateDataClient;
}
