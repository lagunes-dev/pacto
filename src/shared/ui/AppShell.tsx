import { useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";

import { appConfig } from "../../app/config";
import { useAuth } from "../../features/auth/queries/AuthProvider";
import { InstallGuidance } from "../../pwa/InstallGuidance";
import { useConnectivity } from "../../pwa/useConnectivity";
import type { PushStatus } from "../../features/push/port";
import { SetupDialog } from "../../features/setup/components/SetupDialog";
import { useRepositories } from "../../app/providers";
import { useToast } from "./ToastProvider";
import { useOfflineSyncStatus } from "../../features/offline-queue/OfflineReplayCoordinator";

const notificationMessages: Record<PushStatus, string> = {
  unsupported: "Este navegador no admite notificaciones.",
  default: "Las notificaciones están desactivadas. El permiso solo se solicita desde la configuración correspondiente.",
  denied: "El permiso para notificaciones está bloqueado en el navegador.",
  enabled: "Las notificaciones de apoyo están activadas en este navegador.",
  unavailable: "Las notificaciones no están disponibles en este momento.",
};

type NavItem = {
  to: "/inicio" | "/registro" | "/progreso" | "/acuerdo";
  label: string;
  title: string;
  icon: ReactNode;
  matches: (path: string) => boolean;
};

export const parityRoutes: NavItem[] = [
  { to: "/inicio", label: "Inicio", title: "Tu siguiente decisión", icon: <HomeIcon />, matches: (path) => path === "/inicio" },
  { to: "/registro", label: "Registro", title: "Registro y recuperación", icon: <RegisterIcon />, matches: (path) => path === "/registro" || path === "/habits/new" },
  { to: "/progreso", label: "Progreso", title: "Aprendizajes personales", icon: <ChartIcon />, matches: (path) => path === "/progreso" || path === "/progress" },
  { to: "/acuerdo", label: "Acuerdo", title: "Acuerdo compartido", icon: <PeopleIcon />, matches: (path) => path === "/acuerdo" || path.startsWith("/partnership") },
];

function Navigation({ label, path, mobile = false }: { label: string; path: string; mobile?: boolean }) {
  return (
    <nav className={mobile ? "mobile-nav glass" : "nav"} aria-label={label}>
      {parityRoutes.map((item) => {
        const current = item.matches(path);
        return <Link
          key={`${label}-${item.to}`}
          to={item.to}
          className={`nav-item${current ? " active" : ""}`}
          aria-current={current ? "page" : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>;
      })}
    </nav>
  );
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const { session } = useAuth();
  const isOnline = useConnectivity();
  const sync = useOfflineSyncStatus();
  const activeRoute = parityRoutes.find((route) => route.matches(location.pathname));
  const title = activeRoute?.title ?? "Espacio privado";
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
        <NavLink className="brand" to={session ? "/inicio" : "/sign-in"} aria-label="Pacto, inicio">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong className="brand-title">Pacto</strong>
            <span className="brand-subtitle">hábitos con autonomía</span>
          </span>
        </NavLink>
        <p className="nav-label">Espacio personal</p>
        {session && <Navigation label="Navegación principal" path={location.pathname} />}
        <div className="privacy-note">
          <LockIcon />
          <span>Tu información permanece privada.</span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar glass safe-area-top">
          <div>
            <strong>{title}</strong>
            <time dateTime={new Date().toISOString()}>{today}</time>
          </div>
          <div className="app-status">
            <InstallGuidance />
            {session && sync.state !== "idle" && <span className={`status-chip${sync.state === "conflict" || sync.state === "failed" ? " status-chip-offline" : ""}`} role="status">
              {sync.state === "conflict" ? "Conflicto al sincronizar" : sync.state === "failed" ? "Sincronización fallida" : sync.state === "replaying" ? "Sincronizando…" : `${sync.count} en espera`}
            </span>}
            {session && <SessionTopbarControls />}
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

        <div className="safe-area-bottom">
          {session && <Navigation label="Navegación móvil" path={location.pathname} mobile />}
        </div>
    </div>
  );
}

function SessionTopbarControls() {
  const { push } = useRepositories();
  const { show } = useToast();
  const setupTriggerRef = useRef<HTMLButtonElement>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  return <>
    <button
      className="icon-button topbar-control"
      type="button"
      aria-label="Consultar notificaciones"
      onClick={() => void push.status().then((status) => show({ title: "Notificaciones", message: notificationMessages[status] }))}
    >
      <BellIcon />
    </button>
    <button ref={setupTriggerRef} className="profile-chip topbar-control" type="button" onClick={() => setSetupOpen(true)} aria-label="Abrir configuración inicial">
      <span className="avatar" aria-hidden="true">P</span>
      <span>Tu perfil</span>
    </button>
    <SetupDialog open={setupOpen} onOpenChange={setSetupOpen} triggerRef={setupTriggerRef} />
  </>;
}

function HomeIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9H4Z" /><path d="M9 20v-6h6v6" /></svg>;
}

function RegisterIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
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

function BellIcon() {
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}
