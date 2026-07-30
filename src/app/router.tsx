import {
  createBrowserRouter,
  Navigate,
  redirect,
  type RouteObject,
} from "react-router";

import {
  App,
  NewHabitRoute,
  ProgressRoute,
} from "./App";
import { AuthRoute } from "../features/auth/components/AuthRoute";
import { RequireSession } from "../features/auth/components/RequireSession";
import { PartnershipRoute } from "../features/partnership/components/PartnershipRoute";
import { PreferencesRoute } from "../features/preferences/components/PreferencesRoute";
import { SupportRoute } from "../features/support/components/SupportRoute";
import { OfflineRoute } from "../features/offline/OfflineRoute";

export function offlinePrivateLoader() {
  return navigator.onLine ? null : redirect("/offline");
}

function UnavailableRoute() {
  return navigator.onLine ? (
    <main aria-labelledby="not-found-title">
      <h1 id="not-found-title">Page not found</h1>
    </main>
  ) : (
    <Navigate to="/offline" replace />
  );
}

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/sign-in" replace /> },
      { path: "sign-in", element: <AuthRoute mode="login" /> },
      { path: "register", element: <AuthRoute mode="register" /> },
      { path: "offline", element: <OfflineRoute /> },
      {
        loader: offlinePrivateLoader,
        element: <RequireSession />,
        children: [
          { path: "habits/new", element: <NewHabitRoute /> },
          { path: "progress", element: <ProgressRoute /> },
          { path: "partnership", element: <PartnershipRoute /> },
          { path: "partnership/preferences", element: <PreferencesRoute /> },
          { path: "partnership/support", element: <SupportRoute /> },
        ],
      },
      { path: "*", element: <UnavailableRoute /> },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
