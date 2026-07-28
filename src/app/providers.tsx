import { useState, type PropsWithChildren } from "react";

import type { AuthPort } from "../features/auth/port";
import { AuthProvider } from "../features/auth/queries/AuthProvider";
import { createAuthPort } from "../infrastructure";

export function AppProviders({ children, authPort }: PropsWithChildren<{ authPort?: AuthPort }>) {
  const [port] = useState(() => authPort ?? createAuthPort());
  return <AuthProvider authPort={port}>{children}</AuthProvider>;
}
