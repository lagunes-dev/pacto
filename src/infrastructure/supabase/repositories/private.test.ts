import { createSupabasePrivateRepositories, type PrivateDataClient } from "./private";

type Result = { data: unknown; error: { message?: string } | null };
type Operation = { table: string; action: string; value?: unknown };

function createClient(results: Record<string, Result[]>, actorId = "actor-1") {
  const operations: Operation[] = [];
  const take = (table: string) => results[table]?.shift() ?? { data: null, error: { message: `Missing ${table} result` } };

  class Builder implements PromiseLike<Result> {
    constructor(private readonly table: string) {}
    private record(action: string, value?: unknown) { operations.push({ table: this.table, action, value }); return this; }
    select(columns: string) { return this.record("select", columns); }
    insert(value: unknown) { return this.record("insert", value); }
    update(value: unknown) { return this.record("update", value); }
    delete() { return this.record("delete"); }
    eq(column: string, value: unknown) { return this.record("eq", { column, value }); }
    order(column: string, options?: { ascending?: boolean }) { return this.record("order", { column, options }); }
    single() { this.record("single"); return Promise.resolve(take(this.table)); }
    maybeSingle() { this.record("maybeSingle"); return Promise.resolve(take(this.table)); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(take(this.table)).then(onfulfilled, onrejected);
    }
  }

  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: actorId ? { id: actorId } : null }, error: null }) },
    from: vi.fn((table: string) => new Builder(table)),
    rpc: vi.fn((name: string, value?: Record<string, unknown>) => {
      operations.push({ table: `rpc:${name}`, action: "rpc", value });
      return Promise.resolve(take(`rpc:${name}`));
    }),
  } as unknown as PrivateDataClient;
  return { client, operations };
}

const goal = {
  id: "goal-1",
  user_id: "actor-1",
  name: "Walk",
  priority: 2,
  active: true,
  created_at: "2026-07-29T10:00:00.000Z",
};

describe("Supabase private repositories", () => {
  it("derives habit ownership from the authenticated public client", async () => {
    const { client, operations } = createClient({ goals: [{ data: goal, error: null }] });
    const { habits } = createSupabasePrivateRepositories(client);

    await expect(habits.create({ name: " Walk ", priority: 2 })).resolves.toEqual({
      id: "goal-1",
      ownerId: "actor-1",
      name: "Walk",
      priority: 2,
      active: true,
      createdAt: "2026-07-29T10:00:00.000Z",
    });
    expect(operations.find((operation) => operation.action === "insert")?.value).toEqual({
      user_id: "actor-1",
      name: "Walk",
      priority: 2,
    });
    await expect(habits.create({ name: "Forged", priority: 1, ownerId: "victim" } as never)).rejects.toThrow();
  });

  it("relies on RLS rather than accepting or adding owner filters", async () => {
    const { client, operations } = createClient({
      goals: [
        { data: [goal], error: null },
        { data: { ...goal, name: "Run" }, error: null },
        { data: { id: goal.id }, error: null },
      ],
    });
    const { habits } = createSupabasePrivateRepositories(client);

    await expect(habits.listMine()).resolves.toHaveLength(1);
    await expect(habits.update(goal.id, { name: "Run" })).resolves.toMatchObject({ name: "Run" });
    await expect(habits.remove(goal.id)).resolves.toBeUndefined();

    const equalityFilters = operations.filter((operation) => operation.action === "eq").map((operation) => operation.value);
    expect(equalityFilters).toEqual([
      { column: "id", value: goal.id },
      { column: "id", value: goal.id },
    ]);
  });

  it("fails closed when RLS hides a habit mutation", async () => {
    const { client } = createClient({ goals: [{ data: null, error: null }, { data: null, error: null }] });
    const { habits } = createSupabasePrivateRepositories(client);

    await expect(habits.update("other-owner-goal", { priority: 3 })).rejects.toThrow("Habit not found");
    await expect(habits.remove("other-owner-goal")).rejects.toThrow("Habit not found");
  });

  it("builds personal progress only from RLS-scoped tables", async () => {
    const { client, operations } = createClient({
      goals: [{ data: [goal], error: null }],
      daily_entries: [{ data: [
        { entry_date: "2026-07-28", completed_at: "2026-07-28T12:00:00Z" },
        { entry_date: "2026-07-29", completed_at: null },
      ], error: null }],
      recovery_event_records: [{ data: [
        { trigger: "Stress", moment: "Night", alternative: "Tea", recorded_at: "2026-07-28T20:00:00Z" },
        { trigger: "Stress", moment: "Night", alternative: "Tea", recorded_at: "2026-07-29T20:00:00Z" },
        { trigger: "Hunger", moment: "Night", alternative: "Fruit", recorded_at: "2026-07-30T20:00:00Z" },
      ], error: null }],
      support_requests: [{ data: [{ created_at: "2026-07-30T10:00:00Z", acknowledged_at: "2026-07-30T10:15:00Z" }], error: null }],
      "rpc:get_progress_cooperation": [{ data: [{ checkins_completed: 4, support_requests_responded: 1, reviews_completed: 1 }], error: null }],
    });
    const { progress } = createSupabasePrivateRepositories(client);

    await expect(progress.getMine()).resolves.toMatchObject({
      habits: [{ id: goal.id }],
      completedEntryCount: 1,
      activeDayCount: 2,
      evidence: { personal: { frequentTrigger: { value: "Stress", occurrences: 2 }, averageSupportResponseMinutes: 15 }, cooperation: { checkinsCompleted: 4 } },
    });
    expect(operations.find((operation) => operation.table === "support_requests" && operation.action === "eq")?.value).toEqual({ column: "requester_id", value: "actor-1" });
    expect(JSON.stringify(operations)).not.toMatch(/private_notes|body/);
  });

  it("scopes profile preferences to the authenticated owner when a partner profile is visible", async () => {
    const sharing = { share_checkin_completed: true, share_general_status: true, share_habit_details: false, share_craving_level: false, share_percentages: false, updated_at: "2026-07-29T10:00:00Z" };
    const communication = { no_threats: true, ask_before_advice: true, no_comparisons: true, pause_allowed: true, preferred_support: "Pregunta primero", updated_at: sharing.updated_at };
    const updatedSharing = { ...sharing, share_percentages: true, share_general_status: false, updated_at: "2026-07-29T11:00:00Z" };
    const updatedCommunication = { ...communication, ask_before_advice: false, updated_at: updatedSharing.updated_at };
    const { client, operations } = createClient({
      sharing_preferences: [{ data: sharing, error: null }, { data: updatedSharing, error: null }, { data: updatedSharing, error: null }],
      communication_preferences: [{ data: communication, error: null }, { data: updatedCommunication, error: null }, { data: updatedCommunication, error: null }],
      profiles: [
        { data: { timezone: "America/Mexico_City" }, error: null },
        { data: { timezone: "America/Mexico_City" }, error: null },
        { data: { timezone: "America/Mexico_City" }, error: null },
      ],
    });
    const { preferences } = createSupabasePrivateRepositories(client);

    await expect(preferences.getMine()).resolves.toMatchObject({ sharePercentages: false, shareGeneralStatus: true, preferredSupport: "Pregunta primero" });
    expect(operations.find((operation) => operation.table === "profiles" && operation.action === "eq")?.value).toEqual({ column: "id", value: "actor-1" });
    await expect(preferences.updateMine({ sharePercentages: true, shareGeneralStatus: false, askBeforeAdvice: false, timezone: "America/Mexico_City" })).resolves.toMatchObject({ sharePercentages: true, shareGeneralStatus: false, askBeforeAdvice: false });
    expect(operations.find((operation) => operation.table === "sharing_preferences" && operation.action === "update")?.value).toEqual({
      share_percentages: true,
      share_general_status: false,
    });
    expect(operations.filter((operation) => operation.table === "profiles" && operation.action === "eq").map((operation) => operation.value)).toEqual([
      { column: "id", value: "actor-1" },
      { column: "id", value: "actor-1" },
      { column: "id", value: "actor-1" },
    ]);
    await expect(preferences.updateMine({ ownerId: "victim" } as never)).rejects.toThrow();
  });

  it("surfaces database denial instead of returning fixture data", async () => {
    const { client } = createClient({ goals: [{ data: null, error: { message: "row-level security violation" } }] });
    const { habits } = createSupabasePrivateRepositories(client);

    await expect(habits.listMine()).rejects.toThrow("row-level security violation");
  });

  it("completes onboarding through one actor-derived RPC", async () => {
    const sharing = { share_checkin_completed: false, share_general_status: true, share_habit_details: false, share_craving_level: false, share_percentages: false, updated_at: "2026-07-31T10:00:00Z" };
    const communication = { no_threats: true, ask_before_advice: true, no_comparisons: true, pause_allowed: true, preferred_support: "Escúchame", updated_at: sharing.updated_at };
    const { client, operations } = createClient({
      "rpc:complete_onboarding": [{ data: "goal-1", error: null }],
      sharing_preferences: [{ data: sharing, error: null }], communication_preferences: [{ data: communication, error: null }],
      profiles: [{ data: { timezone: "America/Mexico_City" }, error: null }],
    });
    const { preferences } = createSupabasePrivateRepositories(client);
    await preferences.completeSetup({
      goal: "Caminar", timezone: "America/Mexico_City", shareCheckinCompleted: false, shareGeneralStatus: true,
      shareHabitDetails: false, shareCravingLevel: false, sharePercentages: false, noThreats: true,
      askBeforeAdvice: true, noComparisons: true, pauseAllowed: true, preferredSupport: "Escúchame",
    });
    expect(operations.filter((operation) => operation.action === "rpc")).toHaveLength(1);
    expect(operations.find((operation) => operation.action === "rpc")?.value).not.toHaveProperty("ownerId");
  });

  it("requires an authenticated actor before inserts", async () => {
    const { client } = createClient({}, "");
    const { habits } = createSupabasePrivateRepositories(client);

    await expect(habits.create({ name: "Walk", priority: 1 })).rejects.toThrow("Authentication required");
  });
});
