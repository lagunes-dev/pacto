import { z } from "zod";

const payloads = {
  "check-in": z.object({ habitId: z.string().min(1), completed: z.boolean() }).strict(),
  plan: z.object({ title: z.string().trim().min(1).max(160) }).strict(),
  review: z.object({ summary: z.string().trim().min(1).max(500) }).strict(),
} as const;

export type QueueKind = keyof typeof payloads;
export type QueuePayloads = { [K in QueueKind]: z.infer<(typeof payloads)[K]> };
export type QueueDraft<K extends QueueKind = QueueKind> = {
  [P in K]: { kind: P; payload: QueuePayloads[P] }
}[K];

export type QueueRecord<K extends QueueKind = QueueKind> = QueueDraft<K> & {
  operationId: string;
  actorId: string;
  createdAt: number;
  retryCount: number;
  status: "pending" | "failed";
  lastError: string | null;
};

export function parseQueueDraft(value: unknown): QueueDraft {
  if (!value || typeof value !== "object" || !("kind" in value) || !("payload" in value)) {
    throw new Error("Invalid offline queue operation.");
  }
  const kind = (value as { kind: string }).kind;
  if (!(kind in payloads)) throw new Error(`Offline queue kind '${kind}' is not supported.`);
  const typedKind = kind as QueueKind;
  return { kind: typedKind, payload: payloads[typedKind].parse((value as { payload: unknown }).payload) } as QueueDraft;
}
