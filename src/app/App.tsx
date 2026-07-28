import { Outlet } from "react-router";

import { AppShell } from "../shared/ui/AppShell";
import { HabitForm } from "../features/habits/components/HabitForm";
export { ProgressRoute } from "../features/progress/components/ProgressRoute";

export function App() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function NewHabitRoute() {
  return <section className="route-card"><HabitForm /></section>;
}
