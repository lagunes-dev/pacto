// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupportRequest = {
  id: string;
  requester_id: string;
  partnership_id: string;
  status: string;
};

export type Partnership = {
  inviter_id: string;
  invitee_id: string | null;
  status: string;
};

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushFailure = Error & { statusCode?: number };

export type Dependencies = {
  authenticate(jwt: string): Promise<string | null>;
  findRequest(id: string): Promise<SupportRequest | null>;
  findPartnership(id: string): Promise<Partnership | null>;
  findSubscriptions(recipientId: string): Promise<PushSubscriptionRecord[]>;
  send(subscription: PushSubscriptionRecord, payload: string): Promise<void>;
  removeSubscription(id: string): Promise<void>;
};

class DependencyFailure extends Error {}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBearer(request: Request) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

async function parseBody(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== "support_request_id") return null;
    const id = (body as Record<string, unknown>).support_request_id;
    return typeof id === "string" && uuidPattern.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isRetryable(error: PushFailure) {
  return error.statusCode === undefined || error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
}

export function createHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const jwt = parseBearer(request);
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const requestId = await parseBody(request);
    if (!requestId) return json({ error: "Invalid request" }, 400);

    try {
      const senderId = await dependencies.authenticate(jwt);
      if (!senderId) return json({ error: "Unauthorized" }, 401);

      const supportRequest = await dependencies.findRequest(requestId);
      if (!supportRequest || supportRequest.requester_id !== senderId) {
        return json({ error: "Request unavailable" }, 403);
      }
      if (supportRequest.status !== "pending") {
        return json({ error: "Request is not eligible" }, 409);
      }

      const partnership = await dependencies.findPartnership(supportRequest.partnership_id);
      if (!partnership || partnership.status !== "active") {
        return json({ error: "Request is not eligible" }, 409);
      }

      const recipientId = partnership.inviter_id === senderId
        ? partnership.invitee_id
        : partnership.invitee_id === senderId
        ? partnership.inviter_id
        : null;
      if (!recipientId) return json({ error: "Request unavailable" }, 403);

      const subscriptions = await dependencies.findSubscriptions(recipientId);
      const payload = JSON.stringify({ v: 1, kind: "support-request", requestId });
      let providerAccepted = 0;
      let removed = 0;
      let retryableFailures = 0;
      let nonRetryableFailures = 0;

      await Promise.all(subscriptions.map(async (subscription) => {
        try {
          await dependencies.send(subscription, payload);
          providerAccepted += 1;
        } catch (caught) {
          const error = caught as PushFailure;
          if (error.statusCode === 404 || error.statusCode === 410) {
            await dependencies.removeSubscription(subscription.id);
            removed += 1;
          } else if (isRetryable(error)) {
            retryableFailures += 1;
          } else {
            nonRetryableFailures += 1;
          }
        }
      }));

      return json({
        attempted: subscriptions.length,
        providerAccepted,
        removed,
        retryableFailures,
        nonRetryableFailures,
        deliveryConfirmed: false,
      });
    } catch (error) {
      if (error instanceof DependencyFailure) return json({ error: "Service unavailable" }, 503);
      return json({ error: "Service unavailable" }, 503);
    }
  };
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createProductionDependencies(): Dependencies {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  webpush.setVapidDetails(
    requiredEnv("VAPID_SUBJECT"),
    requiredEnv("VAPID_PUBLIC_KEY"),
    requiredEnv("VAPID_PRIVATE_KEY"),
  );

  const dataOrFailure = <T>(data: T, error: unknown): T => {
    if (error) throw new DependencyFailure("Supabase operation failed");
    return data;
  };

  return {
    async authenticate(jwt) {
      const authClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await authClient.auth.getUser(jwt);
      if (error) return null;
      return data.user?.id ?? null;
    },
    async findRequest(id) {
      const { data, error } = await admin.from("support_requests")
        .select("id,requester_id,partnership_id,status").eq("id", id).maybeSingle();
      return dataOrFailure(data as SupportRequest | null, error);
    },
    async findPartnership(id) {
      const { data, error } = await admin.from("partnerships")
        .select("inviter_id,invitee_id,status").eq("id", id).maybeSingle();
      return dataOrFailure(data as Partnership | null, error);
    },
    async findSubscriptions(recipientId) {
      const { data, error } = await admin.from("push_subscriptions")
        .select("id,endpoint,p256dh,auth").eq("user_id", recipientId).is("revoked_at", null);
      return dataOrFailure((data ?? []) as PushSubscriptionRecord[], error);
    },
    async send(subscription, payload) {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 300, urgency: "normal" });
    },
    async removeSubscription(id) {
      const { error } = await admin.from("push_subscriptions").delete().eq("id", id);
      dataOrFailure(null, error);
    },
  };
}

if (import.meta.main) Deno.serve(createHandler(createProductionDependencies()));
