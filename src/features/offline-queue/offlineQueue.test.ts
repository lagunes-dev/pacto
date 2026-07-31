import "fake-indexeddb/auto";

import { describe, expect, it, vi } from "vitest";

import { createIndexedDbOfflineQueue } from "../../infrastructure/indexeddb/offlineQueue";
import type { QueueRecord } from "./model";

const recovery = (alternative = "Tomar agua") => ({
  kind: "recovery" as const,
  payload: { expectedRevision: 1, trigger: "Antojo", moment: "Noche", need: "Pausa", alternative },
});

function makeQueue(now = () => 100) {
  return createIndexedDbOfflineQueue({
    databaseName: `queue-${crypto.randomUUID()}`,
    now,
    operationId: (createdAt, ordinal) => `${createdAt}-${ordinal.toString().padStart(2, "0")}`,
  });
}

async function activeQueue(now = () => 100) {
  const queue = makeQueue(now);
  await queue.activateActor("actor-a");
  return queue;
}

describe("recovery replay queue", () => {
  it("stores only a validated recovery plan with hash and visible pending state", async () => {
    const queue = await activeQueue();
    const record = await queue.enqueue("actor-a", recovery());

    expect(record).toMatchObject({ actorId: "actor-a", operationId: "100-00", retryCount: 0, status: "pending", nextAttemptAt: 100 });
    expect(record.requestHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await queue.list("actor-a")).toEqual([record]);
  });

  it.each(["check-in", "review", "support", "partnership", "push", "private-note"])('rejects the forbidden "%s" kind without writing', async (kind) => {
    const queue = await activeQueue();
    await expect(queue.enqueue("actor-a", { kind, payload: {} } as never)).rejects.toThrow("not supported");
    expect(await queue.list("actor-a")).toEqual([]);
  });

  it("rejects private-note fields and stale actors", async () => {
    const queue = await activeQueue();
    await expect(queue.enqueue("actor-a", { ...recovery(), payload: { ...recovery().payload, privateNote: "secret" } } as never)).rejects.toThrow();
    await expect(queue.enqueue("actor-b", recovery())).rejects.toThrow("authenticated active actor");
    expect(await queue.list("actor-a")).toEqual([]);
  });

  it("replays FIFO exactly once and removes a confirmed receipt", async () => {
    const clock = vi.fn().mockReturnValueOnce(200).mockReturnValueOnce(100).mockReturnValue(300);
    const queue = await activeQueue(clock);
    await queue.enqueue("actor-a", recovery("second"));
    await queue.enqueue("actor-a", recovery("first"));
    const executor = vi.fn(async (_record: QueueRecord) => ({ receipt: "confirmed" }));

    await queue.replay("actor-a", executor);
    await queue.replay("actor-a", executor);

    expect(executor.mock.calls.map(([record]) => record.operationId)).toEqual(["100-01", "200-00"]);
    expect(await queue.list("actor-a")).toEqual([]);
  });

  it("stops on first transient failure and retries after exponential backoff", async () => {
    let time = 100;
    const queue = await activeQueue(() => time);
    await queue.enqueue("actor-a", recovery("first"));
    await queue.enqueue("actor-a", recovery("second"));
    const executor = vi.fn().mockRejectedValueOnce(new Error("network unavailable")).mockResolvedValue({ receipt: true });

    await queue.replay("actor-a", executor);
    expect(executor).toHaveBeenCalledTimes(1);
    expect(await queue.list("actor-a")).toMatchObject([{ status: "pending", retryCount: 1, nextAttemptAt: 1100 }, { status: "pending" }]);

    time = 1100;
    await queue.replay("actor-a", executor);
    expect(executor).toHaveBeenCalledTimes(3);
    expect(await queue.list("actor-a")).toEqual([]);
  });

  it("keeps a stale revision as a visible conflict without overwriting or continuing", async () => {
    const queue = await activeQueue();
    await queue.enqueue("actor-a", recovery("first"));
    await queue.enqueue("actor-a", recovery("second"));
    const executor = vi.fn(async () => { throw new Error("revision conflict"); });

    await queue.replay("actor-a", executor);
    await queue.replay("actor-a", executor);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(await queue.list("actor-a")).toMatchObject([{ status: "conflict", lastError: "revision conflict" }, { status: "pending" }]);
  });

  it("cancels replay and purges work on sign-out", async () => {
    const queue = await activeQueue();
    await queue.enqueue("actor-a", recovery());
    let release!: () => void;
    const pending = queue.replay("actor-a", (_record, signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve(undefined));
      release = () => resolve(undefined);
    }));
    await vi.waitFor(async () => expect((await queue.list("actor-a"))[0]?.status).toBe("replaying"));

    await queue.activateActor(null);
    release();
    await pending;

    expect(await queue.list("actor-a")).toEqual([]);
  });
});
