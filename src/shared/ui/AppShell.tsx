import type { PropsWithChildren, ReactNode } from "react";
import { NavLink, useLocation } from "react-router";

import { appConfig } from "../../app/config";
import { useAuth } from "../../features/auth/queries/AuthProvider";
import { InstallGuidance } from "../../pwa/InstallGuidance";
import { useConnectivity } from "../../pwa/useConnectivity";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

const privateNavItems: NavItem[] = [
  { to: "/habits/new", label: "Crear hábito", icon: <PlusIcon /> },
  { to: "/progress", label: "Progreso", icon: <ChartIcon /> },
  { to: "/partnership", label: "Vínculo", icon: <PeopleIcon /> },
];

function Navigation({ label, items, mobile = false }: { label: string; items: NavItem[]; mobile?: boolean }) {
  return (
    <nav className={mobile ? "mobile-nav glass" : "nav"} aria-label={label}>
      {items.map((item) => (
        <NavLink
          key={`${label}-${item.to}`}
          to={item.to}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const { session } = useAuth();
  const isOnline = useConnectivity();
  const navItems = session ? privateNavItems : [{ to: "/sign-in", label: "Acceso", icon: <LockIcon /> }];
  const title = location.pathname.startsWith("/partnership") ? "Vínculo y consentimiento" : location.pathname === "/progress" ? "Progreso personal" : "Espacio privado";
  const today = new Intl.DateTimeFormat(appConfig.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="app-shell min-h-screen">
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside className="sidebar glass" aria-label="Barra lateral">
        <NavLink className="brand" to="/sign-in" aria-label="Pacto, inicio">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong className="brand-title">Pacto</strong>
            <span className="brand-subtitle">hábitos con autonomía</span>
          </span>
        </NavLink>
        <p className="nav-label">Espacio personal</p>
        <Navigation label="Navegación principal" items={navItems} />
        <div className="privacy-note">
          <LockIcon />
          <span>Tu información permanece privada.</span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar glass">
          <div>
            <strong>{title}</strong>
            <time dateTime={new Date().toISOString()}>{today}</time>
          </div>
          <div className="app-status">
            <InstallGuidance />
            <span
              className={`status-chip${isOnline ? "" : " status-chip-offline"}`}
              aria-label="Estado de conexión"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="status-dot" aria-hidden="true" />
              {isOnline ? "Con conexión" : "Sin conexión"}
              <span className="visually-hidden">
                {isOnline
                  ? ". La conexión está disponible."
                  : ". Las acciones privadas requieren conexión y no se guardan para enviar después."}
              </span>
            </span>
          </div>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>

       <Navigation label="Navegación móvil" items={navItems} mobile />
    </div>
  );
}

function PlusIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function ChartIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9m6 10V5m6 14v-7m4 7H2" /></svg>;
}

function LockIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function PeopleIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.5 20c.5-4 2.4-6 5.5-6s5 2 5.5 6m0-4c.8-1 1.9-1.5 3.5-1.5 2.6 0 4 1.7 4.5 4.5" /></svg>;
}
