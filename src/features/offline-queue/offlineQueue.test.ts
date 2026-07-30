import "fake-indexeddb/auto";

import { describe, expect, it, vi } from "vitest";

import { createIndexedDbOfflineQueue } from "../../infrastructure/indexeddb/offlineQueue";

function makeQueue(now = () => 100) {
  const databaseName = `queue-${crypto.randomUUID()}`;
  return createIndexedDbOfflineQueue({
    databaseName,
    now,
    operationId: (createdAt, ordinal) => `${createdAt}-${ordinal.toString().padStart(2, "0")}`,
  });
}

async function activateQueue(now = () => 100, actorId = "actor-a") {
  const queue = makeQueue(now);
  await queue.activateActor(actorId);
  return queue;
}

describe("actor-scoped offline queue", () => {
  it("stores a validated plan with idempotency and retry metadata", async () => {
    const queue = await activateQueue();
    const record = await queue.enqueue("actor-a", { kind: "plan", payload: { title: "Weekly plan" } });

    expect(record).toEqual({
      actorId: "actor-a", createdAt: 100, kind: "plan", lastError: null,
      operationId: "100-00", payload: { title: "Weekly plan" }, retryCount: 0, status: "pending",
    });
    expect(await queue.list("actor-a")).toEqual([record]);
  });

  it.each(["support", "partnership", "unknown"])("rejects the %s kind without writing", async (kind) => {
    const queue = await activateQueue();
    await expect(queue.enqueue("actor-a", { kind, payload: {} } as never)).rejects.toThrow("not supported");
    expect(await queue.list("actor-a")).toEqual([]);
  });

  it("validates minimal payloads before writing", async () => {
    const queue = await activateQueue();
    await expect(queue.enqueue("actor-a", { kind: "plan", payload: { title: "", token: "secret" } } as never)).rejects.toThrow();
    expect(await queue.list("actor-a")).toEqual([]);
  });

  it("lists only one actor in deterministic FIFO order, including equal timestamps", async () => {
    const clock = vi.fn().mockReturnValueOnce(200).mockReturnValueOnce(100).mockReturnValue(100);
    const queue = await activateQueue(clock);
    await queue.enqueue("actor-a", { kind: "review", payload: { summary: "third" } });
    await queue.enqueue("actor-a", { kind: "plan", payload: { title: "first" } });
    await queue.enqueue("actor-a", { kind: "check-in", payload: { habitId: "h1", completed: true } });
    expect((await queue.list("actor-a")).map((record) => record.operationId)).toEqual(["100-01", "100-02", "200-00"]);
  });

  it("rejects unauthenticated, stale, and arbitrary actors without writing", async () => {
    const queue = makeQueue();
    const draft = { kind: "plan", payload: { title: "Private" } } as const;

    await expect(queue.enqueue("actor-a", draft)).rejects.toThrow("authenticated active actor");
    await queue.activateActor("actor-a");
    await expect(queue.enqueue("actor-b", draft)).rejects.toThrow("authenticated active actor");
    await queue.activateActor("actor-b");
    await expect(queue.enqueue("actor-a", draft)).rejects.toThrow("authenticated active actor");

    expect(await queue.list("actor-a")).toEqual([]);
    expect(await queue.list("actor-b")).toEqual([]);
  });

  it("purges the departing actor on sign-out and actor change", async () => {
    const queue = makeQueue();
    await queue.activateActor("actor-a");
    await queue.enqueue("actor-a", { kind: "plan", payload: { title: "private" } });
    await queue.activateActor("actor-b");
    expect(await queue.list("actor-a")).toEqual([]);

    await queue.enqueue("actor-b", { kind: "plan", payload: { title: "also private" } });
    await queue.activateActor(null);
    expect(await queue.list("actor-b")).toEqual([]);
  });

  it("has no replay path and leaves records pending when connectivity changes", async () => {
    const queue = await activateQueue();
    const record = await queue.enqueue("actor-a", { kind: "plan", payload: { title: "Deferred" } });
    window.dispatchEvent(new Event("online"));
    expect(await queue.list("actor-a")).toEqual([record]);
    expect("dequeue" in queue || "send" in queue || "replay" in queue).toBe(false);
  });
});
