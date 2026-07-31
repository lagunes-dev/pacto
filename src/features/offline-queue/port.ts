import type { QueueDraft, QueueKind, QueueRecord } from "./model";

export type QueueExecutor = (record: QueueRecord, signal: AbortSignal) => Promise<unknown>;

export interface OfflineQueuePort {
  activateActor(actorId: string | null): Promise<void>;
  enqueue<K extends QueueKind>(actorId: string, draft: QueueDraft<K>): Promise<QueueRecord<K>>;
  list(actorId: string): Promise<readonly QueueRecord[]>;
  replay(actorId: string, executor: QueueExecutor): Promise<void>;
  subscribe(listener: () => void): () => void;
  purge(actorId: string): Promise<void>;
}
