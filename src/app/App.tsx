import { NavLink, Outlet } from "react-router";

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

export function AuthLayout() {
  return (
    <div className="auth-layout min-h-screen">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <header className="auth-brand">
        <NavLink className="brand" to="/sign-in" aria-label="Pacto, inicio">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong className="brand-title">Pacto</strong>
            <span className="brand-subtitle">hábitos con autonomía</span>
          </span>
        </NavLink>
      </header>
      <main id="main-content" className="auth-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

export function NewHabitRoute() {
  return <section className="route-card"><HabitForm /></section>;
}
