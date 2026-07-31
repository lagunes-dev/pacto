import type { OfflineQueuePort } from "../../src/features/offline-queue/port";

export function createTestOfflineQueue(): OfflineQueuePort {
  return {
    activateActor: async () => undefined,
    enqueue: async () => { throw new Error("Offline queue is not part of this fixture test."); },
    list: async () => [],
    replay: async () => undefined,
    subscribe: () => () => undefined,
    purge: async () => undefined,
  };
}
