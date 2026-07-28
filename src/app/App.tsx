import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AppShell } from "../shared/ui/AppShell";
import { appConfig } from "./config";

export function App() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

export function RequireSession() {
  const location = useLocation();

  if (!appConfig.foundationSession) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function SignInRoute() {
  return (
    <section className="route-card" aria-labelledby="sign-in-title">
      <p className="eyebrow">Espacio personal</p>
      <h1 id="sign-in-title">Volvé a tus decisiones.</h1>
      <p className="route-lead">
        Tus hábitos y tu progreso son privados. La autenticación real se conectará
        en una unidad posterior; esta pantalla no simula una sesión.
      </p>
      <div className="notice" role="status">
        El acceso privado todavía no está disponible en esta base visual.
      </div>
      <button className="primary-button" type="button" disabled>
        Iniciar sesión · próximamente
      </button>
    </section>
  );
}

export function NewHabitRoute() {
  return <h1>Crear un hábito</h1>;
}

export function ProgressRoute() {
  return <h1>Tu progreso personal</h1>;
}
