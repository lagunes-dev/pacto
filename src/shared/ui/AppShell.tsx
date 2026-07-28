import type { PropsWithChildren, ReactNode } from "react";
import { NavLink, useLocation } from "react-router";

import { appConfig } from "../../app/config";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
};

const navItems: NavItem[] = [
  { to: "/habits/new", label: "Crear hábito", icon: <PlusIcon /> },
  { to: "/progress", label: "Progreso", icon: <ChartIcon /> },
  { to: "/sign-in", label: "Acceso", icon: <LockIcon /> },
];

function Navigation({ label, mobile = false }: { label: string; mobile?: boolean }) {
  return (
    <nav className={mobile ? "mobile-nav glass" : "nav"} aria-label={label}>
      {navItems.map((item) => (
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
  const title = location.pathname === "/progress" ? "Progreso personal" : "Espacio privado";
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
        <Navigation label="Navegación principal" />
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
          <span className="status-chip">Base visual</span>
        </header>
        <main id="main-content" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Navigation label="Navegación móvil" mobile />
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
