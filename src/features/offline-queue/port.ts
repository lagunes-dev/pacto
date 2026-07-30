import type { QueueDraft, QueueKind, QueueRecord } from "./model";

export interface OfflineQueuePort {
  activateActor(actorId: string | null): Promise<void>;
  enqueue<K extends QueueKind>(actorId: string, draft: QueueDraft<K>): Promise<QueueRecord<K>>;
  list(actorId: string): Promise<readonly QueueRecord[]>;
  purge(actorId: string): Promise<void>;
}
