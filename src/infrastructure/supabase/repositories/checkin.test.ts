import { describe, expect, it, vi } from "vitest";

import type { CheckinClient } from "./checkin";
import { createSupabaseDailyCheckinRepository } from "./checkin";

const goalId = "11111111-1111-4111-8111-111111111111";
const savedRow = {
  id: "22222222-2222-4222-8222-222222222222",
  entry_date: "2026-07-30",
  craving_level: 3,
  completed_at: "2026-07-30T18:00:00.000Z",
  habits: [{ goal_id: goalId, state: "done", trigger: null }],
};

function clientWith(rpc: CheckinClient["rpc"], user: { id: string } | null = { id: "actor" }): CheckinClient {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: vi.fn() as never,
    rpc,
  };
}

describe("Supabase daily check-in repository", () => {
  it("sends only the exact atomic RPC contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null });
    const repository = createSupabaseDailyCheckinRepository(clientWith(rpc));

    await repository.save({
      timezone: "America/Mexico_City",
      cravingLevel: 3,
      habits: [{ goalId, state: "done", trigger: null }],
    });

    expect(rpc).toHaveBeenCalledWith("save_daily_checkin", {
      p_timezone: "America/Mexico_City",
      p_craving_level: 3,
      p_habits: [{ goal_id: goalId, state: "done", trigger: null }],
    });
    const payload = JSON.stringify(rpc.mock.calls[0]);
    expect(payload).not.toMatch(/owner|user_id|entry_date|note|alert|partner|percentage/);
  });

  it("maps a confirmed RPC response", async () => {
    const repository = createSupabaseDailyCheckinRepository(clientWith(vi.fn().mockResolvedValue({ data: savedRow, error: null })));
    await expect(repository.save({
      timezone: "America/Mexico_City",
      cravingLevel: 3,
      habits: [{ goalId, state: "done", trigger: null }],
    })).resolves.toEqual({
      id: savedRow.id,
      entryDate: savedRow.entry_date,
      cravingLevel: 3,
      completedAt: savedRow.completed_at,
      habits: [{ goalId, state: "done", trigger: null }],
    });
  });

  it("surfaces authentication and RLS failures without claiming success", async () => {
    const repository = createSupabaseDailyCheckinRepository(clientWith(vi.fn().mockResolvedValue({
      data: null,
      error: { message: "new row violates row-level security policy" },
    })));
    await expect(repository.save({
      timezone: "America/Mexico_City",
      cravingLevel: 3,
      habits: [{ goalId, state: "done", trigger: null }],
    })).rejects.toThrow("row-level security");
  });

  it("allows a caller to retry the same local-day payload after a transient failure", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "network unavailable" } })
      .mockResolvedValueOnce({ data: savedRow, error: null });
    const repository = createSupabaseDailyCheckinRepository(clientWith(rpc));
    const input = { timezone: "America/Mexico_City", cravingLevel: 3 as const, habits: [{ goalId, state: "done" as const, trigger: null }] };

    await expect(repository.save(input)).rejects.toThrow("network unavailable");
    await expect(repository.save(input)).resolves.toMatchObject({ entryDate: "2026-07-30" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("rejects unbounded or private payload fields before the RPC", async () => {
    const rpc = vi.fn();
    const repository = createSupabaseDailyCheckinRepository(clientWith(rpc));
    await expect(repository.save({
      timezone: "America/Mexico_City",
      cravingLevel: 3,
      habits: [{ goalId, state: "event", trigger: "Invented trigger" }],
      privateNote: "must not cross the boundary",
    } as never)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
