import { Outlet } from "react-router";

import { AppShell } from "../shared/ui/AppShell";
import { SessionActions } from "../features/auth/components/AuthRoute";

export function App() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function NewHabitRoute() {
  return <section className="route-card"><h1>Crear un hábito</h1><p className="route-lead">El contrato privado está listo; el formulario llega en la siguiente fase.</p><SessionActions /></section>;
}

export function ProgressRoute() {
  return <section className="route-card"><h1>Tu progreso personal</h1><p className="route-lead">No hay actividad persistida para mostrar.</p><SessionActions /></section>;
}
