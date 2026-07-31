import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { parseQueueDraft, type QueueDraft, type QueueKind, type QueueRecord } from "../../features/offline-queue/model";
import type { OfflineQueuePort, QueueExecutor } from "../../features/offline-queue/port";

interface QueueDatabase extends DBSchema {
  operations: {
    key: string;
    value: QueueRecord;
    indexes: {
      "by-actor-created": [string, number, string];
      "by-actor-status-created": [string, QueueRecord["status"], number, string];
    };
  };
}

type QueueOptions = {
  databaseName?: string;
  now?: () => number;
  operationId?: (createdAt: number, ordinal: number) => string;
};

const MAX_RETRIES = 3;
const conflictPattern = /conflict|revision|stale/i;

async function hashDraft(draft: QueueDraft) {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

const actorRange = (actorId: string) => IDBKeyRange.bound(
  [actorId, Number.MIN_SAFE_INTEGER, ""],
  [actorId, Number.MAX_SAFE_INTEGER, "\uffff"],
);

export function createIndexedDbOfflineQueue(options: QueueOptions = {}): OfflineQueuePort {
  const databaseName = options.databaseName ?? "pacto-offline-queue";
  const now = options.now ?? Date.now;
  const operationId = options.operationId ?? ((createdAt, ordinal) =>
    `${createdAt.toString().padStart(13, "0")}-${ordinal.toString().padStart(6, "0")}-${crypto.randomUUID()}`);
  let activeActor: string | null = null;
  let replayController: AbortController | null = null;
  let replayPromise: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  let database: Promise<IDBPDatabase<QueueDatabase>> | null = null;
  const getDatabase = () => database ??= openDB<QueueDatabase>(databaseName, 1, {
    upgrade(db) {
      const store = db.createObjectStore("operations", { keyPath: "operationId" });
      store.createIndex("by-actor-created", ["actorId", "createdAt", "operationId"]);
      store.createIndex("by-actor-status-created", ["actorId", "status", "createdAt", "operationId"]);
    },
  });

  const purge = async (actorId: string) => {
    const db = await getDatabase();
    const tx = db.transaction("operations", "readwrite");
    let cursor = await tx.store.index("by-actor-created").openKeyCursor(actorRange(actorId));
    while (cursor) {
      await tx.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await tx.done;
    notify();
  };

  const update = async (record: QueueRecord) => {
    const db = await getDatabase();
    await db.put("operations", record);
    notify();
  };

  const runReplay = async (actorId: string, executor: QueueExecutor, signal: AbortSignal) => {
    const db = await getDatabase();
    const records = await db.getAllFromIndex("operations", "by-actor-created", actorRange(actorId));
    for (const current of records) {
      if (signal.aborted || activeActor !== actorId) return;
      if (current.status === "conflict" || current.status === "failed") return;
      if (current.nextAttemptAt > now()) return;
      const replaying = { ...current, status: "replaying" as const, lastError: null };
      await update(replaying);
      try {
        const receipt = await executor(replaying, signal);
        if (signal.aborted || activeActor !== actorId) return;
        if (receipt == null) throw new Error("Replay did not return a confirmed receipt.");
        await db.delete("operations", replaying.operationId);
        notify();
      } catch (error) {
        if (signal.aborted || activeActor !== actorId) return;
        const message = error instanceof Error ? error.message : "No se pudo sincronizar la operación.";
        const retryCount = replaying.retryCount + 1;
        const conflict = conflictPattern.test(message);
        await update({
          ...replaying,
          retryCount,
          status: conflict ? "conflict" : retryCount >= MAX_RETRIES ? "failed" : "pending",
          lastError: message,
          nextAttemptAt: conflict || retryCount >= MAX_RETRIES ? replaying.nextAttemptAt : now() + Math.min(60_000, 1_000 * 2 ** (retryCount - 1)),
        });
        return;
      }
    }
  };

  return {
    async activateActor(actorId) {
      replayController?.abort();
      replayController = null;
      if (activeActor && activeActor !== actorId) await purge(activeActor);
      activeActor = actorId;
    },
    async enqueue<K extends QueueKind>(actorId: string, value: QueueDraft<K>) {
      if (!actorId.trim()) throw new Error("An authenticated actor is required.");
      if (!activeActor || actorId !== activeActor) {
        throw new Error("Queue actor must match the authenticated active actor.");
      }
      const draft = parseQueueDraft(value) as QueueDraft<K>;
      const createdAt = now();
      const requestHash = await hashDraft(draft);
      const db = await getDatabase();
      const tx = db.transaction("operations", "readwrite");
      const existing = await tx.store.count();
      const record: QueueRecord<K> = {
        ...draft,
        operationId: operationId(createdAt, existing),
        actorId,
        createdAt,
        retryCount: 0,
        requestHash,
        nextAttemptAt: createdAt,
        status: "pending",
        lastError: null,
      };
      await tx.store.add(record as QueueRecord);
      await tx.done;
      notify();
      return record;
    },
    async list(actorId) {
      const db = await getDatabase();
      return db.getAllFromIndex("operations", "by-actor-created", actorRange(actorId));
    },
    async replay(actorId, executor) {
      if (!activeActor || actorId !== activeActor) throw new Error("Replay actor must match the authenticated active actor.");
      if (replayPromise) return replayPromise;
      replayController = new AbortController();
      replayPromise = runReplay(actorId, executor, replayController.signal).finally(() => {
        replayPromise = null;
        replayController = null;
      });
      return replayPromise;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    purge,
  };
}
