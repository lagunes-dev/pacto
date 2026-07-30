import type { Session as SupabaseSession } from "@supabase/supabase-js";

import { createSupabaseAuthBoundary, createSupabaseAuthPort, getAuthRedirectUrl, mapSupabaseSession } from "./auth";
import type { PactoSupabaseClient } from "./client";

const remoteSession = {
  user: { id: "user-a", email: "owner@example.com" },
} as SupabaseSession;

function clientWithAuth(auth: object) {
  return { auth } as unknown as PactoSupabaseClient;
}

describe("Supabase public Auth boundary", () => {
  it("maps only the authenticated actor fields into the domain session", () => {
    expect(mapSupabaseSession(remoteSession)).toEqual({
      user: { id: "user-a", email: "owner@example.com" },
    });
  });

  it("maps configured sessions and sends no client owner authority", async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: remoteSession }, error: null });
    const signUp = vi.fn().mockResolvedValue({ data: { session: remoteSession, user: remoteSession.user }, error: null });
    const auth = createSupabaseAuthPort(clientWithAuth({
      getSession,
      signUp,
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    }));

    expect(await auth.getSession()).toEqual({ user: { id: "user-a", email: "owner@example.com" } });
    expect(await auth.register({ email: " OWNER@example.com ", password: "private-pass" })).toEqual({
      status: "authenticated",
      session: { user: { id: "user-a", email: "owner@example.com" } },
    });
    expect(signUp).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "private-pass",
      options: { emailRedirectTo: getAuthRedirectUrl() },
    });
    expect(signUp.mock.calls[0][0].options.emailRedirectTo).toBe(`${window.location.origin}/progress`);
  });

  it("builds confirmation redirects from the current browser origin", () => {
    const redirectUrl = new URL(getAuthRedirectUrl()!);
    expect(redirectUrl.origin).toBe(window.location.origin);
    expect(redirectUrl.pathname).toBe("/progress");
  });

  it("represents sign-up that requires email confirmation", async () => {
    const auth = createSupabaseAuthPort(clientWithAuth({
      getSession: vi.fn(),
      signUp: vi.fn().mockResolvedValue({ data: { session: null, user: { id: "pending" } }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    }));

    await expect(auth.register({ email: "NEW@example.com", password: "private-pass" })).resolves.toEqual({
      status: "confirmation-required",
      email: "new@example.com",
    });
  });

  it("fails closed when either public setting is missing", async () => {
    const missingUrl = createSupabaseAuthBoundary({ url: "", publishableKey: "public-key" });
    const missingKey = createSupabaseAuthBoundary({ url: "https://example.supabase.co", publishableKey: "" });

    await expect(missingUrl.getSession()).rejects.toThrow("Falta configurar");
    await expect(missingKey.login({ email: "a@example.com", password: "private-pass" })).rejects.toThrow("Falta configurar");
  });
});
