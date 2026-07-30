import {
  createHandler,
  type Dependencies,
  type Partnership,
  type PushSubscriptionRecord,
  type SupportRequest,
} from "./index.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const senderId = "22222222-2222-4222-8222-222222222222";
const recipientId = "33333333-3333-4333-8333-333333333333";
const partnershipId = "44444444-4444-4444-8444-444444444444";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

async function responseBody(response: Response) {
  return await response.json() as Record<string, unknown>;
}

function invocation(body: unknown, token = "valid-token") {
  return new Request("http://localhost/send-support-push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fixture(overrides: Partial<{
  actor: string | null;
  supportRequest: SupportRequest | null;
  partnership: Partnership | null;
  subscriptions: PushSubscriptionRecord[];
  failureCodes: Record<string, number | undefined>;
}> = {}) {
  const sent: Array<{ subscription: PushSubscriptionRecord; payload: string }> = [];
  const removed: string[] = [];
  const supportRequest = overrides.supportRequest === undefined
    ? { id: requestId, requester_id: senderId, partnership_id: partnershipId, status: "pending" }
    : overrides.supportRequest;
  const partnership = overrides.partnership === undefined
    ? { inviter_id: senderId, invitee_id: recipientId, status: "active" }
    : overrides.partnership;
  const subscriptions = overrides.subscriptions ?? [{
    id: "subscription-1",
    endpoint: "https://push.example.test/one",
    p256dh: "public-key",
    auth: "auth-secret",
  }];

  const dependencies: Dependencies = {
    authenticate: async () => overrides.actor === undefined ? senderId : overrides.actor,
    findRequest: async () => supportRequest,
    findPartnership: async () => partnership,
    findSubscriptions: async () => subscriptions,
    send: async (subscription, payload) => {
      sent.push({ subscription, payload });
      if (subscription.id in (overrides.failureCodes ?? {})) {
        throw Object.assign(new Error("provider failure"), {
          statusCode: overrides.failureCodes?.[subscription.id],
        });
      }
    },
    removeSubscription: async (id) => {
      removed.push(id);
    },
  };
  return { handler: createHandler(dependencies), sent, removed };
}

Deno.test("rejects invalid JWT without dispatch", async () => {
  const context = fixture({ actor: null });
  const response = await context.handler(invocation({ support_request_id: requestId }, "invalid"));
  assert(response.status === 401);
  assert(context.sent.length === 0);
});

Deno.test("rejects a foreign sender without dispatch", async () => {
  const context = fixture({ actor: recipientId });
  const response = await context.handler(invocation({ support_request_id: requestId }));
  assert(response.status === 403);
  assert(context.sent.length === 0);
});

Deno.test("rejects an inactive partnership without dispatch", async () => {
  const context = fixture({ partnership: { inviter_id: senderId, invitee_id: recipientId, status: "paused" } });
  const response = await context.handler(invocation({ support_request_id: requestId }));
  assert(response.status === 409);
  assert(context.sent.length === 0);
});

Deno.test("rejects a non-pending request without dispatch", async () => {
  const context = fixture({
    supportRequest: { id: requestId, requester_id: senderId, partnership_id: partnershipId, status: "acknowledged" },
  });
  const response = await context.handler(invocation({ support_request_id: requestId }));
  assert(response.status === 409);
  assert(context.sent.length === 0);
});

Deno.test("rejects extra body fields without dispatch", async () => {
  const context = fixture();
  const response = await context.handler(invocation({ support_request_id: requestId, message: "private" }));
  assert(response.status === 400);
  assert(context.sent.length === 0);
});

Deno.test("derives the recipient and sends only the private-safe allowlist", async () => {
  const context = fixture();
  const response = await context.handler(invocation({ support_request_id: requestId }));
  const body = await responseBody(response);
  assert(response.status === 200);
  assert(context.sent.length === 1);
  assert(context.sent[0].payload === JSON.stringify({ v: 1, kind: "support-request", requestId }));
  assert(!/food|habit|note|message|recipient|sender/i.test(context.sent[0].payload));
  assert(body.providerAccepted === 1);
  assert(body.deliveryConfirmed === false);
});

Deno.test("removes only endpoints rejected with 404 or 410", async () => {
  const subscriptions = [404, 410, 503].map((statusCode) => ({
    id: `subscription-${statusCode}`,
    endpoint: `https://push.example.test/${statusCode}`,
    p256dh: "public-key",
    auth: "auth-secret",
  }));
  const context = fixture({
    subscriptions,
    failureCodes: { "subscription-404": 404, "subscription-410": 410, "subscription-503": 503 },
  });
  const response = await context.handler(invocation({ support_request_id: requestId }));
  const body = await responseBody(response);
  assert(response.status === 200);
  assert(context.removed.sort().join(",") === "subscription-404,subscription-410");
  assert(body.removed === 2);
  assert(body.retryableFailures === 1);
  assert(body.deliveryConfirmed === false);
});

Deno.test("retains and distinguishes retryable and non-retryable failures", async () => {
  const subscriptions = [400, 429].map((statusCode) => ({
    id: `subscription-${statusCode}`,
    endpoint: `https://push.example.test/${statusCode}`,
    p256dh: "public-key",
    auth: "auth-secret",
  }));
  const context = fixture({
    subscriptions,
    failureCodes: { "subscription-400": 400, "subscription-429": 429 },
  });
  const response = await context.handler(invocation({ support_request_id: requestId }));
  const body = await responseBody(response);
  assert(context.removed.length === 0);
  assert(body.retryableFailures === 1);
  assert(body.nonRetryableFailures === 1);
  assert(body.deliveryConfirmed === false);
});
