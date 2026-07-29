import { createHabitInputSchema, type Habit } from "../../../features/habits/model";
import type { HabitRepository } from "../../../features/habits/repository";
import type { PersonalProgress } from "../../../features/progress/model";
import type { ProgressRepository } from "../../../features/progress/repository";
import { preferenceUpdateSchema, type PreferenceUpdate, type PreferenceView } from "../../../features/preferences/model";
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
};

type GoalRow = { id: string; user_id: string; name: string; priority: 1 | 2 | 3; active: boolean; created_at: string };
type DailyEntryRow = { entry_date: string; completed_at: string | null };
type PreferenceRow = { share_percentages: boolean; share_general_status: boolean; updated_at: string };

const habitColumns = "id,user_id,name,priority,active,created_at";
const preferenceColumns = "share_percentages,share_general_status,updated_at";
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

function mapPreference(row: PreferenceRow): PreferenceView {
  return {
    shareProgress: row.share_percentages,
    allowSupportRequests: row.share_general_status,
    updatedAt: row.updated_at,
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
      const [ownedHabits, entriesResult] = await Promise.all([
        habits.listMine(),
        client.from("daily_entries").select("entry_date,completed_at"),
      ]);
      const entries = unwrap<DailyEntryRow[]>(entriesResult, "Progress is unavailable.");
      return {
        habits: ownedHabits,
        completedEntryCount: entries.filter((entry) => entry.completed_at !== null).length,
        activeDayCount: new Set(entries.map((entry) => entry.entry_date)).size,
      };
    },
  };

  const preferences: PreferenceRepository = {
    async getMine() {
      const result = await client.from("sharing_preferences").select(preferenceColumns).single();
      return mapPreference(unwrap<PreferenceRow>(result, "Preferences are unavailable."));
    },
    async updateMine(input: PreferenceUpdate) {
      const safe = preferenceUpdateSchema.parse(input);
      const changes: Record<string, boolean> = {};
      if (safe.shareProgress !== undefined) changes.share_percentages = safe.shareProgress;
      if (safe.allowSupportRequests !== undefined) changes.share_general_status = safe.allowSupportRequests;
      if (Object.keys(changes).length === 0) return preferences.getMine();
      const result = await client.from("sharing_preferences").update(changes).select(preferenceColumns).single();
      return mapPreference(unwrap<PreferenceRow>(result, "Preference update failed."));
    },
  };

  return { habits, progress, preferences };
}

export function asPrivateDataClient(client: PactoSupabaseClient): PrivateDataClient {
  return client as unknown as PrivateDataClient;
}
