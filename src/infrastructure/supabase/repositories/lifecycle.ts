import type { InviteView, PartnershipView } from "../../../features/partnership/model";
import type { PartnershipRepository } from "../../../features/partnership/repository";
import { acknowledgeSupportRequestSchema, createSupportRequestSchema, type SupportMessage, type SupportRequestView, type SupportResponse, type SupportStatus, type SupportType } from "../../../features/support/model";
import type { SupportRepository } from "../../../features/support/repository";
import type { PactoSupabaseClient } from "../client";

type DatabaseError = { message?: string } | null;
type Result = { data: unknown; error: DatabaseError };
type Query = PromiseLike<Result> & {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  order(column: string, options?: { ascending?: boolean }): Query;
  single(): Promise<Result>;
};

export type LifecycleClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: DatabaseError }> };
  functions: { invoke(name: string, options: { body: Record<string, unknown> }): Promise<Result> };
  from(table: string): Query;
  rpc(name: string, args?: Record<string, unknown>): Promise<Result>;
};

type PartnershipStateRow = {
  partnership_id: string;
  partnership_status: PartnershipView["status"];
  partner_id: string | null;
  accepted_at: string | null;
  created_at: string;
  resume_requested_by: string | null;
};
type InviteRow = { invite_code: string; partnership_status: "pending"; expires_at: string };
type ProfileRow = { id: string; display_name: string };
type SupportTableRow = {
  id: string;
  requester_id: string;
  support_type: SupportType;
  request_message: SupportMessage | null;
  response_type: SupportResponse | null;
  status: SupportStatus;
  created_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
};
type SupportRpcRow = {
  support_request_id: string;
  requester_id: string;
  support_type: SupportType;
  request_message: SupportMessage | null;
  response_type: SupportResponse | null;
  support_status: SupportStatus;
  created_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
};

const profileColumns = "id,display_name";
const supportColumns = "id,requester_id,support_type,request_message,response_type,status,created_at,acknowledged_at,closed_at";

function failure(error: DatabaseError, fallback: string): Error {
  return new Error(error?.message?.trim() || fallback);
}

function rows<T>(result: Result, fallback: string): T[] {
  if (result.error) throw failure(result.error, fallback);
  if (result.data === null) return [];
  return (Array.isArray(result.data) ? result.data : [result.data]) as T[];
}

function first<T>(result: Result, fallback: string): T {
  const row = rows<T>(result, fallback)[0];
  if (!row) throw new Error(fallback);
  return row;
}

async function actorId(client: LifecycleClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  if (error) throw failure(error, "Authentication is unavailable.");
  if (!data.user) throw new Error("Authentication required.");
  return data.user.id;
}

function mapSupport(row: SupportTableRow | SupportRpcRow, viewerId: string, requestedBy?: "me" | "partner"): SupportRequestView {
  const rpcRow = "support_request_id" in row;
  const id = rpcRow ? row.support_request_id : row.id;
  const type = row.support_type;
  const status = rpcRow ? row.support_status : row.status;
  if (!id || !type || !status || !row.requester_id || !row.created_at) throw new Error("Support request response was incomplete.");
  return {
    id,
    type,
    status,
    requestedBy: requestedBy ?? (row.requester_id === viewerId ? "me" : "partner"),
    ...(row.request_message ? { message: row.request_message } : {}),
    ...(row.response_type ? { response: row.response_type } : {}),
    createdAt: row.created_at,
    updatedAt: row.closed_at ?? row.acknowledged_at ?? row.created_at,
  };
}

export function createSupabaseLifecycleRepositories(client: LifecycleClient): {
  partnership: PartnershipRepository;
  support: SupportRepository;
} {
  const partnership: PartnershipRepository = {
    async getMine() {
      const viewerId = await actorId(client);
      const state = rows<PartnershipStateRow>(await client.rpc("get_my_partnership_state"), "Partnership is unavailable.")[0];
      if (!state) return null;

      let displayName = "Partner";
      if (state.partnership_status === "active" && state.partner_id) {
        const profile = first<ProfileRow>(
          await client.from("profiles").select(profileColumns).eq("id", state.partner_id).single(),
          "Partner profile is unavailable.",
        );
        displayName = profile.display_name;
      }

      return {
        id: state.partnership_id,
        status: state.partnership_status,
        partner: { userId: state.partner_id ?? "", displayName },
        resumeStatus: state.resume_requested_by ? (state.resume_requested_by === viewerId ? "requested-by-me" : "awaiting-my-confirmation") : "none",
        createdAt: state.created_at,
        updatedAt: state.accepted_at ?? state.created_at,
      };
    },
    async createInvite(inviteeEmail) {
      const email = inviteeEmail.trim();
      if (!email) throw new Error("Invite email is required.");
      const row = first<InviteRow>(
        await client.rpc("create_partnership_invite", { target_email: email }),
        "Partnership invite failed.",
      );
      return {
        code: row.invite_code,
        status: row.partnership_status,
        expiresAt: row.expires_at,
      } satisfies InviteView;
    },
    async acceptInvite(code) {
      await client.rpc("accept_partnership_invite", { code: code.trim() }).then((result) => first(result, "Invite acceptance failed."));
      const state = await partnership.getMine();
      if (!state) throw new Error("Partnership is unavailable.");
      return state;
    },
    async rejectInvite(code) {
      first(await client.rpc("reject_partnership_invite", { code: code.trim() }), "Invite rejection failed.");
    },
    async cancelInvite() {
      first(await client.rpc("cancel_pending_partnership"), "Invite cancellation failed.");
    },
    async pause() {
      first(await client.rpc("pause_partnership"), "Partnership pause failed.");
      const state = await partnership.getMine();
      if (!state) throw new Error("Partnership is unavailable.");
      return state;
    },
    async requestResume() {
      first(await client.rpc("request_partnership_resume"), "Partnership resume request failed.");
      const state = await partnership.getMine();
      if (!state) throw new Error("Partnership is unavailable.");
      return state;
    },
    async confirmResume() {
      first(await client.rpc("confirm_partnership_resume"), "Partnership resume confirmation failed.");
      const state = await partnership.getMine();
      if (!state) throw new Error("Partnership is unavailable.");
      return state;
    },
    async end() {
      first(await client.rpc("end_partnership"), "Partnership end failed.");
      const state = await partnership.getMine();
      if (!state) throw new Error("Partnership is unavailable.");
      return state;
    },
  };

  const support: SupportRepository = {
    async list() {
      const viewerId = await actorId(client);
      const result = await client.from("support_requests").select(supportColumns).order("created_at", { ascending: false });
      return rows<SupportTableRow>(result, "Support requests are unavailable.").map((row) => mapSupport(row, viewerId));
    },
    async create(input) {
      const viewerId = await actorId(client);
      const safe = createSupportRequestSchema.parse(input);
      const row = first<SupportRpcRow>(
        await client.rpc("create_support_request", { request_type: safe.type, optional_message: safe.message ?? null }),
        "Support request creation failed.",
      );
      const request = mapSupport(row, viewerId, "me");
      try {
        await client.functions.invoke("send-support-push", { body: { support_request_id: request.id } });
      } catch {
        // The persisted request remains authoritative; Push is a single best-effort dispatch.
      }
      return request;
    },
    async acknowledge(id, response) {
      const viewerId = await actorId(client);
      const safe = acknowledgeSupportRequestSchema.parse({ id, response });
      const row = first<SupportRpcRow>(
        await client.rpc("acknowledge_support_request", { request_id: safe.id, selected_response: safe.response }),
        "Support request acknowledgement failed.",
      );
      return mapSupport(row, viewerId, "partner");
    },
    async close(id) {
      const viewerId = await actorId(client);
      const row = first<SupportRpcRow>(
        await client.rpc("close_support_request", { request_id: id }),
        "Support request closure failed.",
      );
      return mapSupport(row, viewerId, "partner");
    },
  };

  return { partnership, support };
}

export function asLifecycleClient(client: PactoSupabaseClient): LifecycleClient {
  return client as unknown as LifecycleClient;
}
