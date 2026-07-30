import {
  habitAnswerSchema,
  saveDailyCheckinInputSchema,
  type CheckinGoal,
  type CravingLevel,
  type HabitAnswer,
  type SavedCheckin,
} from "../../../features/checkin/model";
import type { DailyCheckinRepository } from "../../../features/checkin/repository";
import { localDayAt, resolveTimezone } from "../../../features/checkin/timezone";
import type { PactoSupabaseClient } from "../client";

type DatabaseError = { message?: string } | null;
type Result = { data: unknown; error: DatabaseError };
type Query = PromiseLike<Result> & {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  maybeSingle(): Promise<Result>;
};

export type CheckinClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: DatabaseError }> };
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): Promise<Result>;
};

type ProfileRow = { timezone: string | null };
type GoalRow = { id: string; name: string; priority: 1 | 2 | 3 };
type DailyRow = { id: string; entry_date: string; craving_level: CravingLevel; completed_at: string };
type HabitRow = { goal_id: string; state: "done" | "event"; trigger: string | null };
type SavedRow = DailyRow & { habits: unknown };

function failure(error: DatabaseError, fallback: string): Error {
  return new Error(error?.message?.trim() || fallback);
}

function resultRows<T>(result: Result, fallback: string): T[] {
  if (result.error) throw failure(result.error, fallback);
  if (result.data === null) return [];
  return (Array.isArray(result.data) ? result.data : [result.data]) as T[];
}

async function actorId(client: CheckinClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw failure(error, "Authentication is unavailable.");
  if (!data.user) throw new Error("Authentication required.");
  return data.user.id;
}

function mapHabit(row: HabitRow): HabitAnswer {
  return habitAnswerSchema.parse({
    goalId: row.goal_id,
    state: row.state,
    trigger: row.state === "done" ? null : row.trigger,
  });
}

function mapSaved(row: SavedRow, habits = resultRows<HabitRow>({ data: row.habits, error: null }, "Check-in habits are unavailable.").map(mapHabit)): SavedCheckin {
  if (!row.id || !row.entry_date || !row.completed_at) throw new Error("Check-in response was incomplete.");
  return {
    id: row.id,
    entryDate: row.entry_date,
    cravingLevel: row.craving_level,
    completedAt: row.completed_at,
    habits,
  };
}

export function createSupabaseDailyCheckinRepository(
  client: CheckinClient,
  now: () => Date = () => new Date(),
): DailyCheckinRepository {
  return {
    async loadToday(input = {}) {
      const ownerId = await actorId(client);
      const profile = resultRows<ProfileRow>(
        await client.from("profiles").select("timezone").eq("id", ownerId).maybeSingle(),
        "Profile timezone is unavailable.",
      )[0];
      const resolution = resolveTimezone({
        profileTimezone: profile?.timezone,
        browserTimezone: input.browserTimezone,
        browserTimezoneConfirmed: input.browserTimezoneConfirmed,
      });
      const entryDate = localDayAt(now(), resolution.timezone);
      const goals = resultRows<GoalRow>(
        await client.from("goals").select("id,name,priority").eq("user_id", ownerId).eq("active", true).order("created_at"),
        "Active goals are unavailable.",
      );
      const daily = resultRows<DailyRow>(
        await client.from("daily_entries").select("id,entry_date,craving_level,completed_at").eq("user_id", ownerId).eq("entry_date", entryDate).maybeSingle(),
        "Daily check-in is unavailable.",
      )[0];
      const habits = daily
        ? resultRows<HabitRow>(
            await client.from("habit_entries").select("goal_id,state,trigger").eq("daily_entry_id", daily.id),
            "Check-in habits are unavailable.",
          ).map(mapHabit)
        : [];
      const answers = new Map(habits.map((answer) => [answer.goalId, answer]));

      return {
        entryDate,
        timezone: resolution.timezone,
        timezoneSource: resolution.source,
        requiresBrowserConfirmation: resolution.requiresBrowserConfirmation,
        goals: goals.map((goal): CheckinGoal => ({ ...goal, answer: answers.get(goal.id) ?? null })),
        saved: daily ? mapSaved({ ...daily, habits }, habits) : null,
      };
    },

    async save(input) {
      const safe = saveDailyCheckinInputSchema.parse(input);
      const result = await client.rpc("save_daily_checkin", {
        p_timezone: safe.timezone,
        p_craving_level: safe.cravingLevel,
        p_habits: safe.habits.map(({ goalId, state, trigger }) => ({ goal_id: goalId, state, trigger })),
      });
      const row = resultRows<SavedRow>(result, "Daily check-in could not be saved.")[0];
      if (!row) throw new Error("Check-in response was incomplete.");
      return mapSaved(row);
    },
  };
}

export function asCheckinClient(client: PactoSupabaseClient): CheckinClient {
  return client as unknown as CheckinClient;
}
