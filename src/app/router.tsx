import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from "react-router";

import {
  App,
  NewHabitRoute,
  ProgressRoute,
  RequireSession,
  SignInRoute,
} from "./App";

export const appRoutes: RouteObject[] = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/sign-in" replace /> },
      { path: "sign-in", element: <SignInRoute /> },
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
