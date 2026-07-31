import type { RecoveryRecord } from "../../../features/recovery/model";
import type { RecoveryRepository } from "../../../features/recovery/repository";
import type { PactoSupabaseClient } from "../client";

type ErrorResult = { message?: string } | null;
type Result = { data: unknown; error: ErrorResult };
type Query = PromiseLike<Result> & {
  select(columns: string): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
};
export type RecoveryClient = {
  from(table: string): Query;
  rpc(name: string, args: Record<string, unknown>): Promise<Result>;
};
type Row = {
  id: string;
  revision: number;
  trigger: string;
  moment: string;
  need: string;
  alternative: string;
  recorded_at?: string;
  created_at?: string;
  private_notes?: { body: string }[];
};

function rows(result: Result): Row[] {
  if (result.error) throw new Error(result.error.message?.trim() || "No pudimos consultar tus planes.");
  return (Array.isArray(result.data) ? result.data : result.data ? [result.data] : []) as Row[];
}

function map(row: Row, privateNote: string | null): RecoveryRecord {
  const recordedAt = row.recorded_at ?? row.created_at;
  if (!row.id || !recordedAt) throw new Error("La respuesta del plan está incompleta.");
  return { id: row.id, revision: row.revision, trigger: row.trigger, moment: row.moment, need: row.need, alternative: row.alternative, privateNote, recordedAt };
}

export function createSupabaseRecoveryRepository(client: RecoveryClient): RecoveryRepository {
  return {
    async timeline() {
      const result = await client.from("recovery_plans")
        .select("id,revision,trigger,moment,need,alternative,created_at,private_notes(body)")
        .order("created_at", { ascending: false });
      return rows(result).map((row) => map(row, row.private_notes?.[0]?.body ?? null));
    },
    async save(input) {
      const result = await client.rpc("save_recovery_record", {
        p_operation_id: input.operationId,
        p_expected_revision: input.expectedRevision,
        p_trigger: input.trigger,
        p_moment: input.moment,
        p_need: input.need,
        p_alternative: input.alternative,
        p_private_note: input.privateNote?.trim() || null,
      });
      const row = rows(result)[0];
      if (!row) throw new Error("No se confirmó el plan.");
      return map(row, input.privateNote?.trim() || null);
    },
  };
}

export function asRecoveryClient(client: PactoSupabaseClient): RecoveryClient {
  return client as unknown as RecoveryClient;
}
