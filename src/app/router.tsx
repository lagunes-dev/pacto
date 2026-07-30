import {
  createBrowserRouter,
  Navigate,
  redirect,
  type RouteObject,
} from "react-router";

import {
  App,
  AuthLayout,
  NewHabitRoute,
  ProgressRoute,
} from "./App";
import { AuthRoute } from "../features/auth/components/AuthRoute";
import { RequireSession } from "../features/auth/components/RequireSession";
import { PartnershipRoute } from "../features/partnership/components/PartnershipRoute";
import { PreferencesRoute } from "../features/preferences/components/PreferencesRoute";
import { SupportRoute } from "../features/support/components/SupportRoute";
import { OfflineRoute } from "../features/offline/OfflineRoute";
import { HomeRoute } from "../features/home/components/HomeRoute";
import { RegisterRoute } from "../features/register/components/RegisterRoute";

export function offlinePrivateLoader() {
  return navigator.onLine ? null : redirect("/offline");
}

function UnavailableRoute() {
  return navigator.onLine ? (
    <main aria-labelledby="not-found-title">
      <h1 id="not-found-title">Ruta no disponible</h1>
      <p>Esta dirección no corresponde a una función disponible.</p>
    </main>
  ) : (
    <Navigate to="/offline" replace />
  );
}

export const appRoutes: RouteObject[] = [
  {
    element: <AuthLayout />,
    children: [
      { index: true, element: <Navigate to="/sign-in" replace /> },
      { path: "sign-in", element: <AuthRoute mode="login" /> },
      { path: "register", element: <AuthRoute mode="register" /> },
    ],
  },
  {
    path: "/",
    element: <App />,
    children: [
      { path: "offline", element: <OfflineRoute /> },
      {
        loader: offlinePrivateLoader,
        element: <RequireSession />,
        children: [
          { path: "inicio", element: <HomeRoute /> },
          { path: "registro", element: <RegisterRoute /> },
          { path: "progreso", element: <ProgressRoute /> },
          { path: "acuerdo", element: <PartnershipRoute /> },
          { path: "habits/new", element: <NewHabitRoute /> },
          { path: "progress", element: <Navigate to="/progreso" replace /> },
          { path: "partnership", element: <Navigate to="/acuerdo" replace /> },
          { path: "partnership/preferences", element: <PreferencesRoute /> },
          { path: "partnership/support", element: <SupportRoute /> },
        ],
      },
      { path: "*", element: <UnavailableRoute /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
