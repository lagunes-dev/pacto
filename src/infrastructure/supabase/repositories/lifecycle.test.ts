import { createSupabaseLifecycleRepositories, type LifecycleClient } from "./lifecycle";

type Result = { data: unknown; error: { message?: string } | null };
type Operation = { boundary: "rpc" | "table"; name: string; action?: string; value?: unknown };

function createClient(results: Record<string, Result[]>, viewerId = "user-a") {
  const operations: Operation[] = [];
  const take = (key: string) => results[key]?.shift() ?? { data: null, error: { message: `Missing ${key} result` } };

  class Builder implements PromiseLike<Result> {
    constructor(private readonly table: string) {}
    private record(action: string, value?: unknown) {
      operations.push({ boundary: "table", name: this.table, action, value });
      return this;
    }
    select(columns: string) { return this.record("select", columns); }
    eq(column: string, value: unknown) { return this.record("eq", { column, value }); }
    order(column: string, options?: { ascending?: boolean }) { return this.record("order", { column, options }); }
    single() { this.record("single"); return Promise.resolve(take(`table:${this.table}`)); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return Promise.resolve(take(`table:${this.table}`)).then(onfulfilled, onrejected);
    }
  }

  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: viewerId ? { id: viewerId } : null }, error: null }) },
    from: vi.fn((table: string) => new Builder(table)),
    rpc: vi.fn((name: string, args?: Record<string, unknown>) => {
      operations.push({ boundary: "rpc", name, value: args });
      return Promise.resolve(take(`rpc:${name}`));
    }),
  } as unknown as LifecycleClient;
  return { client, operations };
}

const activeState = {
  partnership_id: "partnership-1",
  partnership_status: "active",
  partner_id: "user-b",
  accepted_at: "2026-07-29T10:05:00Z",
  created_at: "2026-07-29T10:00:00Z",
};

describe("Supabase partnership and support repositories", () => {
  it("maps only safe partnership fields from the state RPC and active partner profile", async () => {
    const { client, operations } = createClient({
      "rpc:get_my_partnership_state": [{ data: [activeState], error: null }],
      "table:profiles": [{ data: { id: "user-b", display_name: "Partner B", email: "private@example.test" }, error: null }],
    });
    const { partnership } = createSupabaseLifecycleRepositories(client);

    await expect(partnership.getMine()).resolves.toEqual({
      id: "partnership-1",
      status: "active",
      partner: { userId: "user-b", displayName: "Partner B" },
      createdAt: "2026-07-29T10:00:00Z",
      updatedAt: "2026-07-29T10:05:00Z",
    });
    expect(operations.filter((operation) => operation.action === "select").map((operation) => operation.value))
      .toEqual(["id,display_name"]);
  });

  it("uses only hardened RPCs for lifecycle writes", async () => {
    const paused = { ...activeState, partnership_status: "paused", accepted_at: "2026-07-29T10:05:00Z" };
    const { client, operations } = createClient({
      "rpc:create_partnership_invite": [{ data: [{ invite_code: "safe-code", partnership_status: "pending", created_at: "2026-07-29T10:00:00Z" }], error: null }],
      "rpc:pause_partnership": [{ data: [{ partnership_id: "partnership-1", partnership_status: "paused" }], error: null }],
      "rpc:get_my_partnership_state": [{ data: [paused], error: null }],
    });
    const { partnership } = createSupabaseLifecycleRepositories(client);

    await expect(partnership.createInvite(" invitee@example.test ")).resolves.toMatchObject({ code: "safe-code", status: "pending" });
    await expect(partnership.pause()).resolves.toMatchObject({ status: "paused", partner: { displayName: "Partner" } });
    expect(operations.filter((operation) => operation.boundary === "rpc").map(({ name, value }) => ({ name, value }))).toEqual([
      { name: "create_partnership_invite", value: { target_email: "invitee@example.test" } },
      { name: "pause_partnership", value: undefined },
      { name: "get_my_partnership_state", value: undefined },
    ]);
    expect(operations.some((operation) => operation.boundary === "table")).toBe(false);
  });

  it("reads support through an explicit privacy allow-list and maps requester identity locally", async () => {
    const row = {
      id: "request-1",
      requester_id: "user-b",
      support_type: "check_in",
      status: "pending",
      created_at: "2026-07-29T10:00:00Z",
      acknowledged_at: null,
      private_notes: "must not leak",
    };
    const { client, operations } = createClient({ "table:support_requests": [{ data: [row], error: null }] });
    const { support } = createSupabaseLifecycleRepositories(client);

    await expect(support.list()).resolves.toEqual([{
      id: "request-1",
      type: "check_in",
      status: "pending",
      requestedBy: "partner",
      createdAt: row.created_at,
      updatedAt: row.created_at,
    }]);
    expect(operations.find((operation) => operation.action === "select")?.value)
      .toBe("id,requester_id,support_type,status,created_at,acknowledged_at");
  });

  it("treats an RLS-empty support read as immediate revocation and never creates alerts", async () => {
    const { client, operations } = createClient({ "table:support_requests": [{ data: [], error: null }] });
    const repositories = createSupabaseLifecycleRepositories(client);

    await expect(repositories.support.list()).resolves.toEqual([]);
    expect(Object.keys(repositories.support)).toEqual(["list", "create", "acknowledge", "close"]);
    expect(operations.some((operation) => operation.name.includes("alert"))).toBe(false);
  });

  it("validates support types and surfaces inactive-member RPC denial", async () => {
    const { client, operations } = createClient({
      "rpc:create_support_request": [{ data: null, error: { message: "active partnership required" } }],
    });
    const { support } = createSupabaseLifecycleRepositories(client);

    await expect(support.create("notes" as never)).rejects.toThrow();
    expect(operations).toEqual([]);
    await expect(support.create("encouragement")).rejects.toThrow("active partnership required");
  });

  it("uses support RPC response allow-lists without private notes or automatic alerts", async () => {
    const created = {
      support_request_id: "request-1",
      support_type: "practical_help",
      support_status: "pending",
      created_at: "2026-07-29T10:00:00Z",
      acknowledged_at: null,
      private_notes: "must not leak",
    };
    const { client, operations } = createClient({ "rpc:create_support_request": [{ data: [created], error: null }] });
    const { support } = createSupabaseLifecycleRepositories(client);

    await expect(support.create("practical_help")).resolves.toEqual({
      id: "request-1",
      type: "practical_help",
      status: "pending",
      requestedBy: "me",
      createdAt: created.created_at,
      updatedAt: created.created_at,
    });
    expect(operations.filter((operation) => operation.boundary === "rpc")).toEqual([
      { boundary: "rpc", name: "create_support_request", value: { request_type: "practical_help" } },
    ]);
  });
});
