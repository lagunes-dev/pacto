import type { Session as SupabaseSession } from "@supabase/supabase-js";

import type { RegistrationResult, Session } from "../../features/auth/model";
import type { AuthPort } from "../../features/auth/port";
import { createSupabaseBrowserClient, isSupabaseConfigured, type PactoSupabaseClient, type SupabasePublicConfig } from "./client";
import { normalizeSupabaseAuthError, SupabaseConfigurationError } from "./errors";

export function getAuthRedirectUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL("/progress", window.location.origin).toString();
}

export function mapSupabaseSession(session: SupabaseSession | null): Session | null {
  if (!session) return null;
  return { user: { id: session.user.id, email: session.user.email ?? null } };
}

export function createSupabaseAuthPort(client: PactoSupabaseClient): AuthPort {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw normalizeSupabaseAuthError(error);
      return mapSupabaseSession(data.session);
    },
    async register(credentials): Promise<RegistrationResult> {
      const email = credentials.email.trim().toLowerCase();
      const { data, error } = await client.auth.signUp({
        email,
        password: credentials.password,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      if (error) throw normalizeSupabaseAuthError(error);
      const session = mapSupabaseSession(data.session);
      return session
        ? { status: "authenticated", session }
        : { status: "confirmation-required", email };
    },
    async login(credentials) {
      const { data, error } = await client.auth.signInWithPassword({
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
      });
      if (error) throw normalizeSupabaseAuthError(error);
      const session = mapSupabaseSession(data.session);
      if (!session) throw normalizeSupabaseAuthError(null);
      return session;
    },
    async logout() {
      const { error } = await client.auth.signOut();
      if (error) throw normalizeSupabaseAuthError(error);
    },
  };
}

export function createUnavailableAuthPort(error = new SupabaseConfigurationError()): AuthPort {
  const unavailable = async (): Promise<never> => { throw error; };
  return { getSession: unavailable, register: unavailable, login: unavailable, logout: unavailable };
}

export function createSupabaseAuthBoundary(config: SupabasePublicConfig): AuthPort {
  if (!isSupabaseConfigured(config)) return createUnavailableAuthPort();
  return createSupabaseAuthPort(createSupabaseBrowserClient(config));
}
