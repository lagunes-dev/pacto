import { Navigate, Outlet, useLocation } from "react-router";

import { useAuth } from "../queries/AuthProvider";

export function RequireSession() {
  const { session, isResolving } = useAuth();
  const location = useLocation();

  if (isResolving) return <p role="status">Comprobando sesión…</p>;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
