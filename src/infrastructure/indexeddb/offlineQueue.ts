import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { parseQueueDraft, type QueueDraft, type QueueKind, type QueueRecord } from "../../features/offline-queue/model";
import type { OfflineQueuePort } from "../../features/offline-queue/port";

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
  };

  return {
    async activateActor(actorId) {
      if (activeActor && activeActor !== actorId) await purge(activeActor);
      activeActor = actorId;
    },
    async enqueue<K extends QueueKind>(actorId: string, value: QueueDraft<K>) {
      if (!actorId.trim()) throw new Error("An authenticated actor is required.");
      const draft = parseQueueDraft(value) as QueueDraft<K>;
      const createdAt = now();
      const db = await getDatabase();
      const tx = db.transaction("operations", "readwrite");
      const existing = await tx.store.count();
      const record: QueueRecord<K> = {
        ...draft,
        operationId: operationId(createdAt, existing),
        actorId,
        createdAt,
        retryCount: 0,
        status: "pending",
        lastError: null,
      };
      await tx.store.add(record as QueueRecord);
      await tx.done;
      return record;
    },
    async list(actorId) {
      const db = await getDatabase();
      return db.getAllFromIndex("operations", "by-actor-created", actorRange(actorId));
    },
    purge,
  };
}
