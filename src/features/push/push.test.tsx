import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PushSubscriptionControls } from "../support/components/SupportRoute";
import type { PushSubscriptionPort } from "./port";
import { createSupabasePushPort } from "../../infrastructure/supabase/push";

function setup(permission: NotificationPermission = "default") {
  const events: string[] = [];
  const subscription = {
    endpoint: "https://push.example/subscription",
    toJSON: () => ({ keys: { p256dh: "public-key", auth: "auth-secret" } }),
    unsubscribe: vi.fn(async () => { events.push("browser-revoke"); return true; }),
  };
  let current: typeof subscription | null = null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => { events.push("browser-subscribe"); current = subscription; return subscription; }),
  };
  const requestPermission = vi.fn(async () => permission);
  const upsert = vi.fn(async () => { events.push("server-upsert"); return { error: null }; });
  const eq = vi.fn(async () => { events.push("server-revoke"); return { error: null }; });
  const update = vi.fn(() => ({ eq }));
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "owner-a" } }, error: null })) },
    from: vi.fn(() => ({ upsert, update })),
  };
  const browser = {
    notification: { permission, requestPermission },
    serviceWorker: { ready: Promise.resolve({ pushManager }) },
    supportsPush: true,
  };
  const port = createSupabasePushPort(client as never, "AQID", browser as never);
  return { port, requestPermission, pushManager, upsert, update, eq, subscription, events, setCurrent: () => { current = subscription; } };
}

describe("explicit push subscription lifecycle", () => {
  it("checks status on app-open without requesting permission or activating", async () => {
    const mock = setup();
    render(<PushSubscriptionControls port={mock.port} />);

    expect(await screen.findByRole("button", { name: "Activar notificaciones" })).toBeInTheDocument();
    expect(mock.requestPermission).not.toHaveBeenCalled();
    expect(mock.pushManager.subscribe).not.toHaveBeenCalled();
    expect(mock.upsert).not.toHaveBeenCalled();
  });

  it("requests permission only after deliberate activation and idempotently upserts owner data", async () => {
    const mock = setup("granted");
    const user = userEvent.setup();
    render(<PushSubscriptionControls port={mock.port} />);

    await user.click(await screen.findByRole("button", { name: "Activar notificaciones" }));
    await screen.findByRole("button", { name: "Desactivar notificaciones" });
    expect(mock.requestPermission).toHaveBeenCalledOnce();
    expect(mock.upsert).toHaveBeenCalledWith({
      user_id: "owner-a",
      endpoint: "https://push.example/subscription",
      p256dh: "public-key",
      auth: "auth-secret",
      revoked_at: null,
    }, { onConflict: "endpoint" });

    expect(await mock.port.activate()).toBe("enabled");
    expect(mock.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(mock.upsert).toHaveBeenCalledTimes(2);
  });

  it("revokes on the server before unsubscribing in the browser", async () => {
    const mock = setup("granted");
    mock.setCurrent();

    expect(await mock.port.revoke()).toBe("default");
    expect(mock.update).toHaveBeenCalledOnce();
    expect(mock.eq).toHaveBeenCalledWith("endpoint", mock.subscription.endpoint);
    expect(mock.events).toEqual(["server-revoke", "browser-revoke"]);
  });

  it("reports denied, unavailable, and unsupported states without creating a subscription", async () => {
    const denied = setup("denied");
    expect(await denied.port.activate()).toBe("denied");
    expect(denied.pushManager.subscribe).not.toHaveBeenCalled();

    const unavailable = createSupabasePushPort({} as never, "", {
      notification: { permission: "granted", requestPermission: vi.fn() },
      serviceWorker: { ready: Promise.resolve({}) },
      supportsPush: true,
    } as never);
    expect(await unavailable.status()).toBe("unavailable");

    const unsupported: PushSubscriptionPort = createSupabasePushPort({} as never, "AQID", {
      supportsPush: false,
    } as never);
    render(<PushSubscriptionControls port={unsupported} />);
    await waitFor(() => expect(screen.getByText("Este navegador no admite notificaciones.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Activar notificaciones" })).not.toBeInTheDocument();
  });
});
