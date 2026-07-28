import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router";

import {
  App,
  NewHabitRoute,
  ProgressRoute,
} from "./App";
import { AuthRoute } from "../features/auth/components/AuthRoute";
import { RequireSession } from "../features/auth/components/RequireSession";

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/sign-in" replace /> },
      { path: "sign-in", element: <AuthRoute mode="login" /> },
      { path: "register", element: <AuthRoute mode="register" /> },
      {
        element: <RequireSession />,
        children: [
          { path: "habits/new", element: <NewHabitRoute /> },
          { path: "progress", element: <ProgressRoute /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(appRoutes);
