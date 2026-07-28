import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import type { AuthCredentials, RegistrationResult, Session } from "../model";
import type { AuthPort } from "../port";

type AuthState = {
  session: Session | null;
  isResolving: boolean;
  sessionError: string | null;
  register(credentials: AuthCredentials): Promise<RegistrationResult>;
  login(credentials: AuthCredentials): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ authPort, children }: PropsWithChildren<{ authPort: AuthPort }>) {
  const [session, setSession] = useState<Session | null>(null);
  const [isResolving, setResolving] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setResolving(true);
    setSessionError(null);
    authPort.getSession()
      .then((next) => active && setSession(next))
      .catch((error: unknown) => active && setSessionError(error instanceof Error ? error.message : "La autenticación no está disponible."))
      .finally(() => active && setResolving(false));
    return () => { active = false; };
  }, [authPort]);

  const value = useMemo<AuthState>(() => ({
    session,
    isResolving,
    sessionError,
    register: async (credentials) => {
      const result = await authPort.register(credentials);
      if (result.status === "authenticated") setSession(result.session);
      return result;
    },
    login: async (credentials) => setSession(await authPort.login(credentials)),
    logout: async () => { await authPort.logout(); setSession(null); },
  }), [authPort, isResolving, session, sessionError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
